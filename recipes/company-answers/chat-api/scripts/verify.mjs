#!/usr/bin/env node
// Deterministic verify gate for the company-answers/chat-api recipe: starts the
// real server (requires GLEAN_API_TOKEN + GLEAN_INSTANCE already set, same
// as `npm start`), runs each demo query against it for real, and asserts the
// checkable behavior every recipe skill's "## Verify" section promises.
// Exits 0 only if every query passes.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

// Generated from this recipe's registry entry, so the questions asked here are
// the ones the recipe documents. They were hardcoded once and drifted: this
// script went on asking about a demo corpus long after the recipe stopped using
// one. Regenerate with `npm run build:registry` in the cookbook repo.
const QUERIES = process.env.GLEAN_DEMO_QUERY?.trim()
  ? [process.env.GLEAN_DEMO_QUERY.trim()]
  : JSON.parse(
      fs.readFileSync(
        path.join(import.meta.dirname, 'demo-queries.json'),
        'utf8',
      ),
    );

/**
 * What every query must produce. The recipe's promise is a grounded answer, so
 * an answer with no citations is a failure even though the request succeeded --
 * that distinction is the whole point of the gate.
 */
function assertAnswer(result) {
  if (result.answer.trim().length === 0) return 'answer was empty';
  if (result.citations.length === 0) {
    return 'answer had no citations — the recipe promises cited, grounded answers';
  }
  return null;
}

const CHECKS = QUERIES.map((query) => ({ query, assert: assertAnswer }));

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

function startServer() {
  const child = spawn('npm', ['start'], {
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
      // not up yet — keep polling
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
  const server = startServer();
  let failed = false;

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    for (const check of CHECKS) {
      try {
        const result = await askGlean(check.query);
        const behaviorError = check.assert(result);
        const shapeError =
          behaviorError ?? assertCitationShape(result.citations);
        if (shapeError) {
          failed = true;
          console.error(`✗ "${check.query}": ${shapeError}`);
        } else {
          console.log(
            `✓ "${check.query}" — ${result.citations.length} citation(s)`,
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
