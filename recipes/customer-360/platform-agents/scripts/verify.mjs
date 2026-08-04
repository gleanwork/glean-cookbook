#!/usr/bin/env node
// Fixture-first verify for customer-360/platform-agents.

import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;
const START_TIMEOUT_MS = 20_000;
const useFixture = process.env.GLEAN_USE_FIXTURE !== 'false';

const CHECKS = [
  {
    query: "What's the status of our renewal with that account?",
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (useFixture && !result.citations?.length) {
        return 'fixture response missing citations';
      }
      if (
        useFixture &&
        !result.citations.some((c) => c.url.includes('renewal'))
      ) {
        return 'expected renewal citation';
      }
      return null;
    },
  },
  {
    query: 'Give me a customer summary',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (useFixture && result.citations.length < 1) {
        return 'expected at least one citation';
      }
      return null;
    },
  },
  {
    query: 'What are the renewal risks?',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (useFixture && !/low|DPA|procurement/i.test(result.answer)) {
        return 'expected risk facts from renewal doc';
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

async function main() {
  console.log(
    useFixture
      ? 'Running verify in fixture mode (GLEAN_USE_FIXTURE=true)'
      : 'Running verify against live Platform Agents',
  );

  const server = startServer();
  let failed = false;

  try {
    await waitForServer(Date.now() + START_TIMEOUT_MS);

    const accountRes = await fetch(`${BASE_URL}/api/account`);
    const account = await accountRes.json();
    if (!accountRes.ok) {
      throw new Error(`/api/account failed: ${account.error}`);
    }
    if (!account.account?.name || account.tiles?.length !== 3) {
      failed = true;
      console.error('✗ /api/account: expected an account name and 3 tiles');
    } else {
      console.log(
        `✓ /api/account — ${account.account.name}, ${account.tiles.length} tiles`,
      );
    }

    for (const check of CHECKS) {
      try {
        const response = await fetch(`${BASE_URL}/api/brief`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: check.query }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || response.statusText);
        }
        const behaviorError = check.assert(result);
        let shapeError = behaviorError;
        if (!shapeError) {
          if (!result.citations?.length) {
            shapeError = 'expected non-empty citations';
          } else {
            shapeError = assertCitationShape(result.citations);
          }
        }
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
  console.log('\nAll checks passed.');
}

main();
