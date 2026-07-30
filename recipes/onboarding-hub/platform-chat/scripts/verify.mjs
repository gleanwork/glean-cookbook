#!/usr/bin/env node
// Verify gate for onboarding-hub/platform-chat. Runs in fixture mode by default
// (GLEAN_USE_FIXTURE=true) so CI can validate the OpenAPI response parser without
// a live /api/chat handler. Set GLEAN_USE_FIXTURE=false with real credentials for
// live verification against your instance.

import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 15_000;
const useFixture = process.env.GLEAN_USE_FIXTURE !== 'false';

const CHECKS = [
  {
    query: 'What should Alex do on day one?',
    assert(result) {
      if (result.answer.trim().length === 0) return 'answer was empty';
      if (useFixture && result.citations.length === 0) {
        return 'fixture response missing citations';
      }
      return null;
    },
  },
  {
    query: "What's our PTO policy?",
    assert(result) {
      if (!useFixture) {
        if (result.answer.trim().length === 0) return 'answer was empty';
        if (result.citations.length === 0) {
          return 'citations were empty — expected hr-pto-policy';
        }
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
    return 'citations contain duplicate urls';
  }
  return null;
}

function startServer() {
  const child = spawn('npm', ['start'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      GLEAN_USE_FIXTURE: useFixture ? 'true' : 'false',
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

async function main() {
  console.log(
    useFixture
      ? 'Running verify in fixture mode (GLEAN_USE_FIXTURE=true)'
      : 'Running verify against live POST /api/chat',
  );

  const server = startServer();
  let failed = false;

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    for (const check of CHECKS) {
      if (!useFixture && check.query.includes('PTO')) {
        // live-only check
      }
      try {
        const result = await askGlean(check.query);
        const behaviorError = check.assert(result);
        const shapeError =
          behaviorError ??
          (result.citations?.length
            ? assertCitationShape(result.citations)
            : null);
        if (shapeError) {
          failed = true;
          console.error(`✗ "${check.query}": ${shapeError}`);
        } else {
          console.log(
            `✓ "${check.query}" — ${result.citations?.length ?? 0} citation(s)`,
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
