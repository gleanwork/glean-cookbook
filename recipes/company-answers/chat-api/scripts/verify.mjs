#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
const useFixture = process.env.GLEAN_USE_FIXTURE === 'true';

const QUERIES = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'demo-queries.json'), 'utf8'),
);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function assertAnswer(result) {
  if (!result.answer?.trim()) return 'answer was empty';
  if (!result.citations?.length) {
    return 'answer had no citations — the recipe promises cited, grounded answers';
  }
  return null;
}

function assertCitationShape(citations) {
  for (const citation of citations) {
    if (!citation.title || !citation.url) {
      return `citation missing title/url: ${JSON.stringify(citation)}`;
    }
  }
  const urls = citations.map((c) => c.url);
  if (new Set(urls).size !== urls.length) {
    return 'citations contain duplicate urls — expected deduped by url';
  }
  return null;
}

function assertFixtureContract() {
  const recorded = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'chat-responses.json'), 'utf8'),
  );
  const missing = QUERIES.filter((query) => !recorded[query]);
  if (missing.length > 0) {
    throw new Error(`fixtures missing keys: ${missing.join(', ')}`);
  }
  for (const [key, body] of Object.entries(recorded)) {
    if (body.object !== 'RESPONSE' || body.status !== 'COMPLETED') {
      throw new Error(`${key}: expected a completed Chat API response`);
    }
    if (body.store !== false) {
      throw new Error(`${key}: store must be false`);
    }
    const contents = (body.output ?? [])
      .filter(
        (message) => message.type === 'MESSAGE' && message.role === 'ASSISTANT',
      )
      .flatMap((message) => message.content ?? [])
      .filter((content) => content.type === 'OUTPUT_TEXT');
    if (contents.length === 0) {
      throw new Error(`${key}: no ASSISTANT OUTPUT_TEXT content`);
    }
    const sources = contents.flatMap((content) =>
      (content.annotations ?? [])
        .filter((annotation) => annotation.type === 'CITATION')
        .flatMap((annotation) => annotation.sources ?? []),
    );
    if (sources.length === 0) {
      throw new Error(`${key}: expected at least one citation source`);
    }
    for (const source of sources) {
      if (!source.title && !source.name) {
        throw new Error(`${key}: citation missing title`);
      }
      if (source.url && !/^https?:\/\//u.test(source.url)) {
        throw new Error(`${key}: citation url must be http(s)`);
      }
    }
  }
}

function startServer() {
  const child = spawn('npm', ['start'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PORT: String(PORT) },
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

async function main() {
  if (useFixture) {
    assertFixtureContract();
    console.log('Running verify against recorded Chat API fixtures');
  } else {
    requireEnv('GLEAN_API_TOKEN');
    requireEnv('GLEAN_SERVER_URL');
    requireEnv('GLEAN_DEMO_QUERY');
    console.log('Running verify against live Chat API');
  }

  const server = startServer();
  let failed = false;
  const queries = useFixture ? QUERIES : [process.env.GLEAN_DEMO_QUERY.trim()];

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    for (const query of queries) {
      try {
        const result = await askGlean(query);
        const behaviorError = assertAnswer(result);
        const shapeError =
          behaviorError ?? assertCitationShape(result.citations);
        if (shapeError) {
          failed = true;
          console.error(`✗ "${query}": ${shapeError}`);
        } else {
          console.log(`✓ "${query}" — ${result.citations.length} citation(s)`);
        }
      } catch (error) {
        failed = true;
        console.error(`✗ "${query}": ${error.message}`);
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
