#!/usr/bin/env node
// Live verify for customer-360/platform-agents. Requires credentials + agent id.
// Loads .env from the package root so `npm run verify` works after
// `cp .env.example .env` without exporting vars in the shell.

import 'dotenv/config';
import { spawn } from 'node:child_process';
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
const START_TIMEOUT_MS = 20_000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  {
    query: "What's the status of our renewal with that account?",
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'expected non-empty citations from the Account Brief agent';
      }
      return null;
    },
  },
  {
    query: 'Give me a customer summary',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'expected non-empty citations from the Account Brief agent';
      }
      return null;
    },
  },
  {
    query: 'What are the renewal risks?',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'expected non-empty citations from the Account Brief agent';
      }
      return null;
    },
  },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
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
  // Prefer local tsx binary: `npx`/`npm start` under Socket Firewall can
  // break outbound fetch from the child process.
  const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
  const child = spawn(tsx, ['server.ts'], {
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

async function main() {
  requireEnv('GLEAN_API_TOKEN');
  requireEnv('GLEAN_SERVER_URL');
  requireEnv('GLEAN_ACCOUNT_NAME');
  requireEnv('GLEAN_AGENT_ID');

  console.log('Running verify against live Platform Agents');

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
        const shapeError =
          behaviorError ?? assertCitationShape(result.citations);
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
