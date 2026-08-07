#!/usr/bin/env node

// Credential-free contract check for the custom Client Chat path. A local fake
// backend records the exact requests so this can prove two properties that a
// response-shape fixture cannot: unfinished output is retried, and a follow-up
// carries the bounded transcript while saveChat remains off.

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const requests = [];

const answer = (text) => ({
  messages: [
    {
      author: 'GLEAN_AI',
      messageType: 'CONTENT',
      fragments: [
        { text },
        {
          citation: {
            sourceDocument: {
              title: 'Onboarding guide',
              url: 'https://example.test/onboarding',
            },
          },
        },
      ],
    },
  ],
});

const fakeGlean = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    requests.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // First call is the known unfinished shape. The recipe must retry it.
    const body =
      requests.length === 1
        ? {
            messages: [
              {
                author: 'GLEAN_AI',
                messageType: 'CONTENT',
                fragments: [{ text: '' }],
              },
            ],
          }
        : answer(
            requests.length === 2
              ? 'Install the VPN client from the onboarding portal.'
              : 'That portal is linked from the first-day checklist.',
          );
    res.end(JSON.stringify(body));
  });
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer(base) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('recipe server did not start');
}

async function post(base, body) {
  const response = await fetch(`${base}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}

const gleanPort = await listen(fakeGlean);
const probe = http.createServer();
const recipePort = await listen(probe);
await new Promise((resolve) => probe.close(resolve));

const child = spawn(
  path.join(root, 'node_modules', '.bin', 'tsx'),
  ['server.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(recipePort),
      GLEAN_SERVER_URL: `http://127.0.0.1:${gleanPort}`,
      GLEAN_API_TOKEN: 'fixture-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let stderr = '';
child.stderr.on('data', (chunk) => (stderr += chunk));

try {
  const base = `http://127.0.0.1:${recipePort}`;
  await waitForServer(base);
  const firstQuestion = 'How do I install VPN?';
  const first = await post(base, { question: firstQuestion, history: [] });
  if (!first.answer.includes('VPN client'))
    throw new Error('retry did not answer');
  if (requests.length !== 2)
    throw new Error('empty response was not retried once');

  const followUp = 'Where is that portal?';
  const olderTurns = Array.from({ length: 10 }, (_, index) => ({
    author: index % 2 === 0 ? 'USER' : 'GLEAN_AI',
    text: `older turn ${index}`,
  }));
  await post(base, {
    question: followUp,
    history: [
      ...olderTurns,
      { author: 'USER', text: firstQuestion },
      { author: 'GLEAN_AI', text: first.answer },
    ],
  });

  const sent = requests.at(-1);
  if (sent.saveChat !== false) throw new Error('saveChat must remain false');
  const turns = sent.messages.map((message) => ({
    author: message.author,
    text: message.fragments?.[0]?.text,
  }));
  const expected = [
    ...olderTurns.slice(2),
    { author: 'USER', text: firstQuestion },
    { author: 'GLEAN_AI', text: first.answer },
    { author: 'USER', text: followUp },
  ];
  if (JSON.stringify(turns) !== JSON.stringify(expected)) {
    throw new Error(`follow-up lost context: ${JSON.stringify(turns)}`);
  }
  console.log(
    'ok retry preserves the request and follow-up carries bounded context',
  );
} catch (error) {
  throw new Error(
    `${error.message}${stderr ? `\nserver stderr:\n${stderr}` : ''}`,
  );
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => fakeGlean.close(resolve));
}
