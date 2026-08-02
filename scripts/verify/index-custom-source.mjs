// This recipe is the corpus every other recipe's demo queries resolve against,
// so verifying it is a precondition for verifying anything else. Two claims to
// prove: the connector's own documents become searchable (not just the natively
// seeded ones), and per-document permissions actually bite.
//
// Search runs through the Platform API rather than the recipe's own code
// because the recipe writes; reading back via a separate path is what shows the
// write landed and is ACL-filtered.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const requiredEnv = [
  'GLEAN_INDEXING_API_TOKEN',
  'GLEAN_SERVER_URL',
  // Reading back needs a Client API credential; the indexing token can't search.
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'VERIFY_USER_WITH_ACCESS',
  'VERIFY_USER_WITHOUT_ACCESS',
];

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/index-custom-source');
  // Indexing is asynchronous: documents are accepted here but not necessarily
  // searchable yet, which is why search below retries rather than asserting
  // immediately.
  await execFileAsync('uv', ['run', '--locked', 'seed.py'], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { seeded: true };
}

async function search(query, actAs) {
  const response = await fetch(
    `https://${process.env.GLEAN_INSTANCE}-be.glean.com/api/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GLEAN_API_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Glean-Include-Experimental': 'true',
        ...(actAs ? { 'X-Glean-Act-As': actAs } : {}),
      },
      body: JSON.stringify({ query, page_size: 10 }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `search returned ${response.status}: ${await response.text()}`,
    );
  }
  const body = await response.json();
  return body.results ?? [];
}

/** Indexing is eventually consistent; poll rather than assume it's immediate. */
async function searchUntilFound(query, actAs, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let results = [];
  while (Date.now() < deadline) {
    results = await search(query, actAs);
    if (results.some((r) => r.datasource === 'acme_corpus')) return results;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return results;
}

export async function run(query, context) {
  const allowed = await searchUntilFound(
    query,
    process.env.VERIFY_USER_WITH_ACCESS,
  );
  const fromConnector = allowed.filter((r) => r.datasource === 'acme_corpus');
  if (fromConnector.length === 0) {
    return (
      'no acme_corpus results — the connector-indexed documents are not ' +
      'searchable, so indexing either failed or has not converged'
    );
  }

  // Restricted-document check: whatever the permitted user can see from
  // acme_corpus, a user outside the owning group must not see all of it.
  const denied = await search(query, process.env.VERIFY_USER_WITHOUT_ACCESS);
  const deniedUrls = new Set(
    denied.filter((r) => r.datasource === 'acme_corpus').map((r) => r.url),
  );
  const restricted = fromConnector.filter((r) =>
    /hr|compensation/i.test(r.url),
  );
  const leaked = restricted.filter((r) => deniedUrls.has(r.url));
  if (leaked.length > 0) {
    return (
      `${process.env.VERIFY_USER_WITHOUT_ACCESS} can see ${leaked.length} ` +
      `HR-restricted document(s): ${leaked.map((r) => r.url).join(', ')}`
    );
  }
  return null;
}
