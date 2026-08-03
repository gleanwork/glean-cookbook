#!/usr/bin/env node
// Verify gate for rfp-responder.
//
// Fixture mode (default) runs the whole flow with no credentials and no network:
// recorded /api/chat responses in fixtures/chat-responses.json drive the app, and
// the extra columns in fixtures/globex-security-questionnaire.csv act as a test
// oracle. That means a regression in dedup, in the confidence classifier, or in
// the refusal path fails CI instead of quietly shipping a confident wrong answer
// into a customer's questionnaire.
//
// GLEAN_USE_FIXTURE=false with real credentials verifies live. Grounding
// assertions are skipped there — a live corpus is not the fixture corpus.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
const useFixture = process.env.GLEAN_USE_FIXTURE !== 'false';

const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
};

function assertFixtureContract() {
  console.log('\nRecorded /api/chat fixtures match the Platform Chat contract');
  const recorded = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'chat-responses.json'), 'utf8'),
  );
  const ids = Object.keys(recorded);
  check('fixture file is non-empty', ids.length > 0);
  for (const id of ids) {
    const body = recorded[id];
    const problems = [];
    for (const key of [
      'id',
      'object',
      'created_at',
      'status',
      'output',
      'store',
      'request_id',
    ]) {
      if (!(key in body)) problems.push(`missing ${key}`);
    }
    if (body.object !== 'response') problems.push('object must be "response"');
    if (body.status !== 'completed')
      problems.push('status must be "completed"');
    if (!/^resp_[0-9a-f-]{36}$/u.test(body.id ?? ''))
      problems.push('id must be resp_<uuid>');
    if (Number.isNaN(Date.parse(body.created_at ?? '')))
      problems.push('created_at must be RFC 3339');
    const block = body.output?.[0]?.content?.[0];
    if (body.output?.[0]?.type !== 'message')
      problems.push('output[0].type must be "message"');
    if (body.output?.[0]?.role !== 'assistant')
      problems.push('output[0].role must be "assistant"');
    if (block?.type !== 'output_text')
      problems.push('content[0].type must be "output_text"');
    if (typeof block?.text !== 'string')
      problems.push('content[0].text must be a string');
    if (!Array.isArray(block?.annotations))
      problems.push('content[0].annotations must be an array');
    check(`${id} shape`, problems.length === 0, problems.join('; '));
  }
}

function parseOracle() {
  const text = fs.readFileSync(
    path.join(root, 'fixtures', 'globex-security-questionnaire.csv'),
    'utf8',
  );
  const lines = [];
  let field = '';
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      if (record.some((v) => v.trim())) lines.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  record.push(field);
  if (record.some((v) => v.trim())) lines.push(record);
  const [header, ...body] = lines;
  return body.map((values) =>
    Object.fromEntries(
      header.map((key, index) => [key.trim(), (values[index] ?? '').trim()]),
    ),
  );
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/sample`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const event = /event: (.*)/u.exec(chunk)?.[1];
      const data = JSON.parse(/data: (.*)/su.exec(chunk)?.[1] ?? '{}');
      onEvent(event, data);
    }
  }
}

async function main() {
  if (useFixture) assertFixtureContract();

  console.log(`\nBooting server (${useFixture ? 'fixture' : 'live'} mode)`);
  const child = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      GLEAN_USE_FIXTURE: String(useFixture),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));

  try {
    if (!(await waitForServer())) {
      console.log(`  FAIL server did not start\n${stderr}`);
      failures.push('server start');
      return;
    }
    check('server started', true);

    // ---- Step 1 + 2: parse, map, dedup -------------------------------------
    console.log('\nParse and dedup');
    const sample = await (await fetch(`${BASE}/api/sample`)).json();
    check(
      'sample questionnaire served',
      typeof sample.csv === 'string' && sample.csv.length > 0,
    );

    const parsed = await (
      await fetch(`${BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: sample.csv,
          mapping: {
            tab: 'tab',
            questionId: 'question_id',
            question: 'question',
          },
        }),
      })
    ).json();

    const oracle = parseOracle();
    const byRowId = new Map(oracle.map((row) => [Number(row.row_id), row]));
    const expectedDuplicates = oracle.filter((row) => row.dedup_of);

    check('all 20 rows parsed', parsed.parsed === 20, `got ${parsed.parsed}`);
    check(
      '4 tabs enumerated',
      parsed.tabs.length === 4,
      `got ${parsed.tabs.length}`,
    );

    // Exact duplicates merge automatically; near-duplicates must NOT.
    const exactPairs = expectedDuplicates.filter((row) => {
      const other = byRowId.get(Number(row.dedup_of));
      return (
        other && row.question.toLowerCase() === other.question.toLowerCase()
      );
    });
    check(
      `only exact duplicates auto-merged (${exactPairs.length})`,
      parsed.autoMerged === exactPairs.length,
      `merged ${parsed.autoMerged}, expected ${exactPairs.length}`,
    );

    // The dangerous pair must never be merged: at-rest vs in-transit encryption.
    const atRest = oracle.find((row) => row.question_id === 'SEC-02');
    const inTransit = oracle.find((row) => row.question_id === 'SEC-03');
    const transitRow = parsed.rows.find((row) => row.questionId === 'SEC-03');
    check(
      'at-rest and in-transit encryption were NOT merged',
      transitRow && transitRow.inheritedFrom === undefined,
      'merging these would misstate a security control to the customer',
    );
    check(
      'that pair is still surfaced to the reviewer for a manual call',
      parsed.mergeCandidates.some(
        (candidate) =>
          candidate.rowId === Number(inTransit.row_id) &&
          candidate.candidateRowId === Number(atRest.row_id),
      ),
    );

    // Every oracle duplicate must be surfaced somewhere — merged or proposed.
    for (const duplicate of expectedDuplicates) {
      const rowId = Number(duplicate.row_id);
      const target = Number(duplicate.dedup_of);
      const surfaced =
        parsed.rows.find((row) => row.rowId === rowId)?.inheritedFrom ===
          target ||
        parsed.mergeCandidates.some(
          (candidate) =>
            candidate.rowId === rowId && candidate.candidateRowId === target,
        );
      check(
        `duplicate ${duplicate.question_id} -> row ${target} surfaced`,
        surfaced,
      );
    }

    // ---- Step 3: batched run ----------------------------------------------
    console.log('\nDraft answers');
    const events = [];
    const runResponse = await fetch(`${BASE}/api/run`, { method: 'POST' });
    let finalRows = [];
    await readSse(runResponse, (event, data) => {
      events.push(event);
      if (event === 'done') finalRows = data.rows;
    });
    check(
      'progress events streamed',
      events.filter((e) => e === 'progress').length > 0,
    );
    check('run completed', events.includes('done'));
    check(
      'every row accounted for',
      finalRows.length === 20,
      `got ${finalRows.length}`,
    );

    // ---- Step 4: the classifier matches what the corpus can support --------
    if (useFixture) {
      console.log('\nConfidence classification vs corpus oracle');
      let mismatches = 0;
      for (const row of finalRows) {
        const expected = byRowId.get(row.rowId)?.expected_grounding;
        if (!expected) continue;
        if (row.confidence !== expected) {
          mismatches += 1;
          console.log(
            `       ${row.questionId}: expected ${expected}, got ${row.confidence}`,
          );
        }
      }
      check(
        'all 20 rows classified as the corpus supports',
        mismatches === 0,
        `${mismatches} mismatched`,
      );

      const strong = finalRows.filter(
        (row) => row.confidence === 'strong',
      ).length;
      const weak = finalRows.filter((row) => row.confidence === 'weak').length;
      const none = finalRows.filter((row) => row.confidence === 'none').length;
      check(
        'demo shows all three states',
        strong > 0 && weak > 0 && none > 0,
        `${strong}/${weak}/${none}`,
      );
    }

    // ---- The failure contract ---------------------------------------------
    console.log('\nFailure contract');
    const ungrounded = finalRows.filter((row) => row.confidence === 'none');
    check(
      'no ungrounded row carries a draft answer',
      ungrounded.every((row) => row.answer === ''),
      'a fluent answer with no evidence is the worst output this app can produce',
    );
    check(
      'every ungrounded row routes to an SME',
      ungrounded.every((row) => row.status === 'needs-sme'),
    );
    check(
      'no ungrounded row carries citations',
      ungrounded.every((row) => row.citations.length === 0),
    );
    check(
      'every answered row carries at least one citation',
      finalRows
        .filter((row) => row.answer !== '')
        .every((row) => row.citations.length > 0),
    );
    const evidenceRequest = finalRows.find(
      (row) => row.questionId === 'RES-02',
    );
    check(
      'an attachment request is never answered in prose',
      evidenceRequest?.confidence === 'none' && evidenceRequest?.answer === '',
    );

    // Accepting an ungrounded row must be refused.
    const refused = await fetch(`${BASE}/api/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowId: ungrounded[0].rowId }),
    });
    check(
      'accepting an ungrounded row is rejected',
      refused.status === 400,
      `got ${refused.status}`,
    );

    // ---- Step 5 + 7: approval, inheritance, answer library ----------------
    console.log('\nApproval, inheritance, audit');
    const sec05 = finalRows.find((row) => row.questionId === 'SEC-05');
    const accepted = await (
      await fetch(`${BASE}/api/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: sec05.rowId, answer: sec05.answer }),
      })
    ).json();
    const acc01 = accepted.rows.find((row) => row.questionId === 'ACC-01');
    check(
      'accepted row is marked accepted',
      accepted.rows.find((r) => r.questionId === 'SEC-05').status ===
        'accepted',
    );
    check(
      'identical question inherited the accepted answer',
      acc01.answer === sec05.answer && acc01.status === 'accepted',
    );
    check(
      'approval log recorded the accept',
      accepted.approvals.some((entry) => entry.action === 'accept'),
    );

    const audit = await (await fetch(`${BASE}/api/audit`)).json();
    check(
      'audit log is readable and attributed',
      audit.length > 0 && Boolean(audit[0].actor),
    );

    // ---- Step 6: export is gated -------------------------------------------
    console.log('\nExport gate');
    const unconfirmed = await fetch(`${BASE}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    check(
      'export without confirmation is blocked',
      unconfirmed.status === 409,
      `got ${unconfirmed.status}`,
    );
    const confirmed = await fetch(`${BASE}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    });
    const csvOut = await confirmed.text();
    check(
      'confirmed export returns CSV',
      confirmed.status === 200 && csvOut.startsWith('row_id,'),
    );
    check(
      'export preserves all 20 rows in order',
      csvOut.trim().split('\n').length === 21,
    );
    const unacceptedExported = csvOut
      .trim()
      .split('\n')
      .slice(1)
      .filter((line) => !line.includes(',"accepted",'));
    check(
      'unaccepted rows export blank rather than shipping a draft',
      unacceptedExported.every((line) => /,"",/u.test(line)),
    );
  } finally {
    child.kill();
    fs.rmSync(path.join(root, '.answer-library.json'), { force: true });
  }
}

await main();

console.log('');
if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('All checks passed.');
