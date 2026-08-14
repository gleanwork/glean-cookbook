#!/usr/bin/env node
// Loads .env from the package root so `npm run verify` works after
// `cp .env.example .env` without exporting vars in the shell.
// GLEAN_USE_FIXTURE=true skips credentials and uses fixtures/*.json.

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
const START_TIMEOUT_MS = 20_000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const useFixture = process.env.GLEAN_USE_FIXTURE === 'true';

const CHAT_CHECKS = [
  {
    query: "What's the status of our renewal with that account?",
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'answer had no citations — the recipe promises cited answers';
      }
      return null;
    },
  },
  {
    query: 'Give me a customer summary',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'answer had no citations — the recipe promises cited answers';
      }
      return null;
    },
  },
  {
    query: 'What are the renewal risks?',
    assert(result) {
      if (!result.answer?.trim()) return 'answer was empty';
      if (!result.citations?.length) {
        return 'answer had no citations — the recipe promises cited answers';
      }
      return null;
    },
  },
];

function tileQueries(account) {
  return [
    `${account} account notes ARR seats contacts`,
    `${account} renewal status`,
    `${account} security questionnaire`,
  ];
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function assertFixtureContract() {
  const search = JSON.parse(
    fs.readFileSync(
      path.join(root, 'fixtures', 'search-responses.json'),
      'utf8',
    ),
  );
  const chat = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'chat-responses.json'), 'utf8'),
  );
  const account = process.env.GLEAN_ACCOUNT_NAME;
  const missingSearch = tileQueries(account).filter((key) => !search[key]);
  if (missingSearch.length > 0) {
    throw new Error(
      `search fixtures missing keys: ${missingSearch.join(', ')}`,
    );
  }
  for (const [key, body] of Object.entries(search)) {
    if (!Array.isArray(body.results)) {
      throw new Error(`${key}: results must be an array`);
    }
    if (typeof body.has_more !== 'boolean') {
      throw new Error(`${key}: has_more must be a boolean`);
    }
    if (!('next_cursor' in body)) {
      throw new Error(`${key}: next_cursor is required`);
    }
    if (!body.request_id) {
      throw new Error(`${key}: request_id is required`);
    }
    if (!Array.isArray(body.warnings)) {
      throw new Error(`${key}: warnings must be an array`);
    }
    for (const result of body.results) {
      if (!result.title || !result.url || !result.datasource) {
        throw new Error(`${key}: result missing title, url, or datasource`);
      }
      if (
        result.snippets &&
        !result.snippets.every((snippet) => typeof snippet === 'string')
      ) {
        throw new Error(`${key}: snippets must be strings`);
      }
    }
  }
  const missingChat = CHAT_CHECKS.map((check) => check.query).filter(
    (key) => !chat[key],
  );
  if (missingChat.length > 0) {
    throw new Error(`chat fixtures missing keys: ${missingChat.join(', ')}`);
  }
  for (const [key, body] of Object.entries(chat)) {
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

async function main() {
  if (useFixture) {
    if (!process.env.GLEAN_ACCOUNT_NAME?.trim()) {
      process.env.GLEAN_ACCOUNT_NAME = 'Globex';
    }
    assertFixtureContract();
    console.log(
      'Running verify against recorded Platform Search + Chat fixtures',
    );
  } else {
    requireEnv('GLEAN_API_TOKEN');
    requireEnv('GLEAN_SERVER_URL');
    requireEnv('GLEAN_ACCOUNT_NAME');
    console.log('Running verify against live Platform Search + Chat');
  }

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

    if (useFixture && Array.isArray(account.tiles)) {
      const search = JSON.parse(
        fs.readFileSync(
          path.join(root, 'fixtures', 'search-responses.json'),
          'utf8',
        ),
      );
      for (const tile of account.tiles) {
        const recorded = search[tile.query];
        if (!recorded) {
          failed = true;
          console.error(`✗ tile "${tile.id}": no fixture for ${tile.query}`);
          continue;
        }
        if (tile.results.length !== recorded.results.length) {
          failed = true;
          console.error(
            `✗ tile "${tile.id}": ${tile.results.length} results, fixture has ${recorded.results.length}`,
          );
        } else if (tile.results.length === 0) {
          failed = true;
          console.error(
            `✗ tile "${tile.id}": expected a non-empty Globex tile`,
          );
        } else {
          console.log(`✓ tile "${tile.id}" — ${tile.results.length} result(s)`);
        }
      }
    }

    for (const check of CHAT_CHECKS) {
      try {
        const response = await fetch(`${BASE_URL}/api/ask`, {
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
