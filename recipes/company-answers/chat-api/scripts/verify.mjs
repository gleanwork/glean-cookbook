#!/usr/bin/env node
// Deterministic verify gate for the company-answers/chat-api recipe: starts the
// real server (requires GLEAN_API_TOKEN + GLEAN_INSTANCE already set, same
// as `npm start`), runs each demo query against it for real, and asserts the
// checkable behavior every recipe skill's "## Verify" section promises.
// Exits 0 only if every query passes.

import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 15_000;

const CHECKS = [
  {
    query: "What's our PTO policy?",
    assert(result) {
      if (result.answer.trim().length === 0) {
        return 'answer was empty';
      }
      if (result.citations.length === 0) {
        return 'citations were empty — expected the PTO policy document';
      }
      return null;
    },
  },
  {
    query: 'Who owns the payments-service catalog entry?',
    assert(result) {
      if (result.answer.trim().length === 0) {
        return 'answer was empty';
      }
      if (result.citations.length === 0) {
        return 'citations were empty — expected the payments-service catalog entry';
      }
      return null;
    },
  },
];

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
    env: process.env,
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
