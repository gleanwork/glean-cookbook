#!/usr/bin/env node
// Loads .env from the package root so `npm run verify` works after
// `cp .env.example .env` without exporting vars in the shell.
// GLEAN_USE_FIXTURE=true skips credentials and uses fixtures/chat-responses.json.

import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Could not allocate a verification port.');
  return port;
}

const PORT = Number(process.env.PORT ?? (await availablePort()));
const BASE_URL = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 15_000;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_QUERIES = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'demo-queries.json'), 'utf8'),
);

const OFF_CORPUS = "Ask about a step your docs don't cover";
const useFixture = process.env.GLEAN_USE_FIXTURE === 'true';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function assertCitedAnswer(result) {
  if (result.answer.trim().length === 0) return 'answer was empty';
  if (result.citations.length === 0) {
    return 'citations were empty — expected a cited answer';
  }
  if (result.escalate) {
    return 'expected escalate=false for a cited answer';
  }
  return null;
}

const CHECKS = [
  {
    query: 'What should I do on my first day?',
    assert: assertCitedAnswer,
    retry: true,
  },
  {
    query: 'How do I set up VPN?',
    assert: assertCitedAnswer,
    retry: true,
  },
  {
    query: "What's our PTO policy?",
    assert: assertCitedAnswer,
    retry: true,
  },
  {
    query: OFF_CORPUS,
    retry: false,
    assert(result) {
      if (
        (result.answer.trim().length < 20 || result.citations.length === 0) &&
        !result.escalate
      ) {
        return 'expected escalate=true when live answer is empty/short or uncited';
      }
      return null;
    },
  },
];

function assertFixtureContract() {
  const recorded = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'chat-responses.json'), 'utf8'),
  );
  const steps = JSON.parse(
    fs.readFileSync(path.join(root, 'steps.example.json'), 'utf8'),
  );
  const required = [
    ...CHECKS.map((check) => check.query),
    ...steps.map((step) => step.askPrompt),
  ];
  const missing = required.filter((key) => !recorded[key]);
  if (missing.length > 0) {
    throw new Error(`fixtures missing keys: ${missing.join(', ')}`);
  }
  for (const [key, body] of Object.entries(recorded)) {
    const messages = body.messages ?? [];
    const content = messages.find(
      (message) =>
        message.author === 'GLEAN_AI' && message.messageType === 'CONTENT',
    );
    if (!content) {
      throw new Error(`${key}: no GLEAN_AI CONTENT message`);
    }
    const fragments = content.fragments ?? [];
    const cited = fragments.some((fragment) => fragment.citation);
    if (cited && messages[0]?.messageType !== 'UPDATE') {
      throw new Error(
        `${key}: cited fixture must start with UPDATE then CONTENT`,
      );
    }
    for (const fragment of fragments) {
      const document = fragment.citation?.sourceDocument;
      if (!document) continue;
      if (!document.title) {
        throw new Error(`${key}: citation missing title`);
      }
      if (!/^https?:\/\//u.test(document.url ?? '')) {
        throw new Error(`${key}: citation url must be http(s)`);
      }
    }
  }
}

function assertCitationShape(citations) {
  for (const citation of citations) {
    if (!citation.title || !citation.url) {
      return `citation missing title/url: ${JSON.stringify(citation)}`;
    }
  }
  const urls = citations.map((c) => c.url);
  if (new Set(urls).size !== urls.length) {
    return 'citations contain duplicate urls';
  }
  return null;
}

function startServer() {
  const child = spawn('npm', ['start'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(PORT),
      X_GLEAN_INCLUDE_EXPERIMENTAL: 'true',
    },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  return child;
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { method: 'GET' });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become ready within ${START_TIMEOUT_MS}ms`);
}

async function askGlean(question) {
  const response = await fetch(`${BASE_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`/api/ask returned ${response.status}: ${body}`);
  }
  return response.json();
}

function evaluateCheck(check, result) {
  const behaviorError = check.assert(result);
  return (
    behaviorError ??
    (result.citations?.length ? assertCitationShape(result.citations) : null)
  );
}

async function main() {
  if (useFixture) {
    if (
      !process.env.GLEAN_ONBOARDING_STEPS_JSON?.trim() &&
      !process.env.GLEAN_ONBOARDING_STEPS_FILE?.trim()
    ) {
      process.env.GLEAN_ONBOARDING_STEPS_FILE = path.join(
        root,
        'steps.example.json',
      );
    }
    assertFixtureContract();
    console.log('Running verify against recorded Client Chat fixtures');
  } else {
    requireEnv('GLEAN_API_TOKEN');
    requireEnv('GLEAN_SERVER_URL');
    if (
      !process.env.GLEAN_ONBOARDING_STEPS_JSON?.trim() &&
      !process.env.GLEAN_ONBOARDING_STEPS_FILE?.trim()
    ) {
      console.error(
        'Set GLEAN_ONBOARDING_STEPS_JSON or GLEAN_ONBOARDING_STEPS_FILE so verify can load a checklist.',
      );
      process.exit(1);
    }
    console.log('Running verify against live Client Chat');
  }

  const checkQueries = CHECKS.map((c) => c.query);
  if (JSON.stringify(checkQueries) !== JSON.stringify(DEMO_QUERIES)) {
    console.error(
      '✗ scripts/demo-queries.json must match verify CHECKS order exactly',
    );
    console.error(`  demo-queries: ${JSON.stringify(DEMO_QUERIES)}`);
    console.error(`  CHECKS:       ${JSON.stringify(checkQueries)}`);
    process.exit(1);
  }

  const server = startServer();
  let failed = false;

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    const checklistResponse = await fetch(`${BASE_URL}/api/checklist`);
    if (!checklistResponse.ok) {
      throw new Error(`/api/checklist returned ${checklistResponse.status}`);
    }
    const checklist = await checklistResponse.json();
    if (checklist.source !== 'config') {
      throw new Error(
        `expected checklist.source "config", got ${JSON.stringify(checklist.source)}`,
      );
    }
    if (!Array.isArray(checklist.steps) || checklist.steps.length < 1) {
      throw new Error('checklist.steps must be a non-empty array');
    }
    console.log(`✓ /api/checklist — ${checklist.steps.length} step(s)`);

    for (const check of CHECKS) {
      try {
        let result = await askGlean(check.query);
        let shapeError = evaluateCheck(check, result);
        if (shapeError && check.retry) {
          console.warn(`↻ "${check.query}": ${shapeError} — retrying once`);
          result = await askGlean(check.query);
          shapeError = evaluateCheck(check, result);
          if (shapeError) {
            failed = true;
            console.error(`✗ "${check.query}" (after retry): ${shapeError}`);
            continue;
          }
          console.log(
            `✓ "${check.query}" — ${result.citations?.length ?? 0} citation(s)` +
              (result.escalate ? ', escalate' : '') +
              ' (passed on retry)',
          );
          continue;
        }
        if (shapeError) {
          failed = true;
          console.error(`✗ "${check.query}": ${shapeError}`);
        } else {
          console.log(
            `✓ "${check.query}" — ${result.citations?.length ?? 0} citation(s)` +
              (result.escalate ? ', escalate' : ''),
          );
        }
      } catch (error) {
        failed = true;
        console.error(`✗ "${check.query}": ${error.message}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(`✗ server never became ready: ${error.message}`);
  } finally {
    server.kill();
  }

  if (failed) {
    console.error('\nverify failed — see above.');
    process.exit(1);
  }
  console.log('\nAll demo queries passed.');
}

main();
