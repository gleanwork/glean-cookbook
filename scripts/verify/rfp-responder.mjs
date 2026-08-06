// Live verification for rfp-responder.
//
// Division of labour with the recipe's own fixture gate
// (recipes/rfp-responder/scripts/verify.mjs): that one replays recorded
// responses and asserts exact classifications against the corpus oracle, because
// it controls both sides. This one runs against a real instance, where the corpus
// is whatever the reader actually has indexed, so asserting "SEC-02 must be
// strong" would be asserting a fact about someone else's documents.
//
// What is checkable live is the failure contract, and it is the part that matters:
// no row carries an answer without a citation, no ungrounded row is answerable,
// and the API refuses to accept one. Those hold on any corpus. A recipe that
// passed live only because its content happened to line up would be verifying
// nothing.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Platform Chat calls with store:false semantics for verification; nothing is
// written to the instance and no content is indexed.
export const sideEffects = 'read-only';

export const requiredEnv = ['GLEAN_API_TOKEN', 'GLEAN_SERVER_URL'];

const PORT = 3287;
const BASE = `http://localhost:${PORT}`;

const MAPPING = { tab: 'tab', questionId: 'question_id', question: 'question' };

async function waitForServer(deadlineMs = 20_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/sample`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/rfp-responder');
  const child = spawn('npx', ['tsx', 'server.ts'], {
    cwd,
    env: { ...process.env, PORT: String(PORT), GLEAN_USE_FIXTURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  if (!(await waitForServer())) {
    child.kill();
    throw new Error(`server did not start:\n${stderr}`);
  }
  return { child };
}

export async function teardown(context) {
  context.child?.kill();
}

/** Parses the questionnaire and streams a full drafting run. Cached per process. */
let runOnce;
async function draftAll() {
  runOnce ??= (async () => {
    const { csv } = await (await fetch(`${BASE}/api/sample`)).json();
    const parsed = await (
      await fetch(`${BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mapping: MAPPING }),
      })
    ).json();

    const response = await fetch(`${BASE}/api/run`, { method: 'POST' });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rows = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        if (/event: done/u.test(chunk)) {
          rows = JSON.parse(/data: (.*)/su.exec(chunk)[1]).rows;
        }
      }
    }
    return { parsed, rows };
  })();
  return runOnce;
}

function findRow(rows, questionFragment) {
  return rows.find((row) =>
    row.question.toLowerCase().includes(questionFragment.toLowerCase()),
  );
}

/** Invariants that must hold on any corpus. */
function checkFailureContract(rows) {
  const ungrounded = rows.filter((row) => row.confidence === 'none');
  for (const row of ungrounded) {
    if (row.answer !== '') {
      return `${row.questionId} has no supporting evidence but still carries answer text: ${JSON.stringify(row.answer.slice(0, 120))}`;
    }
    if (row.citations.length > 0) {
      return `${row.questionId} is classified 'none' but still shows citations`;
    }
    if (row.status !== 'needs-sme') {
      return `${row.questionId} has no evidence but status is ${row.status}, not needs-sme`;
    }
  }
  const answered = rows.filter((row) => row.answer !== '');
  const uncited = answered.find((row) => row.citations.length === 0);
  if (uncited) {
    return `${uncited.questionId} carries an answer with no citation — the exact failure this recipe exists to prevent`;
  }
  return null;
}

// Scenario dispatch by position in demoQueries, not by matching its prose.
//
// These branches used to switch on fragments of the query text ('penetration
// testing', 'credential reset'). recipe.json was later reworded to stop naming
// documents from the sample catalog, and two of the four fragments then matched
// nothing -- so those scenarios fell through to the "no assertion implemented"
// return, which a green run reports as a pass. Silently verifying nothing is
// worse than failing.
//
// recipe.json owns the wording; this file owns the order. Rewording is free, and
// adding or removing a query fails loudly here instead of skipping an assertion.
const SCENARIOS = ['draft-all', 'unsupported', 'adjacent', 'narrower-access'];

const RECIPE = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../recipes/rfp-responder/recipe.json',
    ),
    'utf8',
  ),
);

function scenarioFor(query) {
  const queries = RECIPE.demoQueries ?? [];
  if (queries.length !== SCENARIOS.length) {
    throw new Error(
      `recipe.json declares ${queries.length} demo queries but this harness has ` +
        `${SCENARIOS.length} scenarios (${SCENARIOS.join(', ')}). Add or remove an ` +
        `assertion to match, rather than leaving a query unverified.`,
    );
  }
  const index = queries.findIndex((entry) => entry.query === query);
  if (index === -1) {
    throw new Error(
      `"${query}" is not in recipes/rfp-responder/recipe.json demoQueries`,
    );
  }
  return SCENARIOS[index];
}

export async function run(query, _context) {
  const scenario = scenarioFor(query);
  const { parsed, rows } = await draftAll();

  if (scenario === 'draft-all') {
    if (parsed.parsed !== 20)
      return `expected 20 parsed rows, got ${parsed.parsed}`;
    if (parsed.tabs.length !== 4)
      return `expected 4 tabs, got ${parsed.tabs.length}`;
    if (parsed.autoMerged !== 1) {
      return `expected exactly 1 exact-duplicate merge, got ${parsed.autoMerged}`;
    }
    // The unsafe pair must survive as two distinct questions.
    const transit = findRow(rows, 'encrypted in transit');
    if (!transit || transit.inheritedFrom !== undefined) {
      return 'in-transit encryption was merged into another row; that misstates a security control';
    }
    const contract = checkFailureContract(rows);
    if (contract) return contract;
    if (!rows.some((row) => row.confidence === 'strong')) {
      return 'no row reached strong grounding — check that the questionnaire corpus is indexed and your token has the CHAT scope';
    }
    return null;
  }

  if (scenario === 'unsupported') {
    const row = findRow(rows, 'penetration testing');
    if (!row) return 'penetration-testing row missing from the run';
    if (row.answer !== '') {
      return `answered a question the corpus does not support: ${JSON.stringify(row.answer.slice(0, 160))}`;
    }
    if (row.status !== 'needs-sme')
      return `status was ${row.status}, expected needs-sme`;
    // Accepting it must be refused, not merely discouraged.
    const refused = await fetch(`${BASE}/api/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowId: row.rowId }),
    });
    if (refused.status !== 400) {
      return `accepting an ungrounded row returned ${refused.status}, expected 400`;
    }
    return null;
  }

  if (scenario === 'adjacent') {
    const row = findRow(rows, 'credential reset');
    if (!row) return 'credential-reset row missing from the run';
    // Whether this lands strong or weak depends on what the reader has indexed and
    // on their approved-source list, so assert the property instead: any drafted
    // answer is cited, and the reason explains the classification.
    if (row.answer !== '' && row.citations.length === 0) {
      return 'drafted an answer with no citation';
    }
    if (!row.reason) return 'no reason string was produced for the reviewer';
    return null;
  }

  if (scenario === 'narrower-access') {
    // A single credential cannot demonstrate "user A sees it, user B doesn't".
    // What it can demonstrate is the property that protects people: where
    // retrieval came back empty, the app refused instead of inventing. If your
    // token cannot read the restricted questionnaire summary, the security rows
    // will be exactly those refusals.
    const contract = checkFailureContract(rows);
    if (contract) return contract;
    const refusals = rows.filter((row) => row.confidence === 'none').length;
    if (refusals === 0) {
      return {
        skip: 'every row was answerable by this account, so the narrower-access refusal path went unexercised — it needs a second user without access to the restricted questionnaire summary',
      };
    }
    return null;
  }

  // Unreachable: scenarioFor throws on an unknown query and every scenario above
  // returns. Kept so a new SCENARIOS entry without a branch fails loudly.
  return `no assertion implemented for scenario: ${scenario}`;
}
