#!/usr/bin/env node
// Verify gate for rfp-responder.
//
// Fixture mode (default) runs the whole flow with no credentials and no network:
// recorded Client Chat responses in fixtures/chat-responses.json drive the app, and
// the extra columns in fixtures/sample-security-questionnaire.csv act as a test
// oracle. That means a regression in dedup, in the confidence classifier, or in
// the refusal path fails CI instead of quietly shipping a confident wrong answer
// into a customer's questionnaire.
//
// GLEAN_USE_FIXTURE=false with real credentials verifies live. Grounding
// assertions are skipped there — a live corpus is not the fixture corpus.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  console.log('\nRecorded fixtures match the Client Chat contract');
  const recorded = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'chat-responses.json'), 'utf8'),
  );
  const ids = Object.keys(recorded);
  check('fixture file is non-empty', ids.length > 0);
  for (const id of ids) {
    const body = recorded[id];
    const problems = [];
    if (!Array.isArray(body.messages))
      problems.push('messages must be an array');
    const message = body.messages?.[0];
    if (message?.author !== 'GLEAN_AI')
      problems.push('messages[0].author must be GLEAN_AI');
    if (message?.messageType !== 'CONTENT')
      problems.push('messages[0].messageType must be CONTENT');
    if (!Array.isArray(message?.fragments))
      problems.push('messages[0].fragments must be an array');
    for (const fragment of message?.fragments ?? []) {
      if (fragment.text !== undefined && typeof fragment.text !== 'string') {
        problems.push('fragment.text must be a string');
      }
      const document = fragment.citation?.sourceDocument;
      if (document && (!document.title || !document.url)) {
        problems.push('cited sourceDocument must include title and url');
      }
    }
    check(`${id} shape`, problems.length === 0, problems.join('; '));
  }
}

function parseOracle() {
  const text = fs.readFileSync(
    path.join(root, 'fixtures', 'sample-security-questionnaire.csv'),
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
  if (useFixture) {
    assertFixtureContract();
    const scripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).scripts;
    check(
      'npm start selects fixture mode',
      scripts.start === 'GLEAN_USE_FIXTURE=true tsx server.ts',
    );
    check(
      'npm run start:live selects live mode',
      scripts['start:live'] === 'GLEAN_USE_FIXTURE=false tsx server.ts',
    );
    await checkLiveModeGate();
  }

  console.log(`\nBooting server (${useFixture ? 'fixture' : 'live'} mode)`);
  const childEnv = {
    ...process.env,
    PORT: String(PORT),
  };
  delete childEnv.GLEAN_USE_FIXTURE;
  if (useFixture) childEnv.RFP_APPROVED_SOURCE_PREFIXES = '';
  const child = spawn('npm', useFixture ? ['start'] : ['run', 'start:live'], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
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
    const config = await (await fetch(`${BASE}/api/config`)).json();
    check(
      `server reports ${useFixture ? 'fixture' : 'live'} mode`,
      config.fixtureMode === useFixture,
    );
    if (useFixture) {
      const page = await (await fetch(BASE)).text();
      check(
        'fixture walkthrough labels its recorded responses',
        page.includes('id="mode-note"') &&
          page.includes('The sample uses saved Chat responses'),
      );
    }

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
    await stopProcessGroup(child);
    fs.rmSync(path.join(root, '.answer-library.json'), { force: true });
  }

  // Pin DIRECT_OVERLAP_THRESHOLD. Every questionnaire row sits well clear of the
  // boundary, so the suite above classifies identically anywhere from about 0.30
  // to 0.39 -- moving the number would downgrade real rows with every check still
  // green. SEC-08 is the row nearest the edge and is the one that flips.
  const probe = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/threshold-probe.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GLEAN_USE_FIXTURE: 'true' },
    })
      .trim()
      .split('\n')
      .pop(),
  );

  check(
    'the term-overlap score for SEC-08 is 0.40',
    Math.abs(probe['SEC-08'].bestOverlap - 0.4) < 1e-9,
  );
  check(
    'SEC-08 is strong at the shipped threshold of 0.34',
    probe['SEC-08'].at034 === 'strong',
  );
  check(
    'raising the threshold to 0.45 downgrades SEC-08 to weak',
    probe['SEC-08'].at045 === 'weak',
  );
  // Approval is not a function of relevance: a lower bar cannot promote a source
  // that was never cleared for customer use.
  check(
    'ACC-03 stays weak even at a threshold of 0.25, because its best source is unapproved',
    probe['ACC-03'].at025 === 'weak',
  );

  // /api/chat can return 200 for a run that never finished. That is a transport
  // failure, and it must not be reported as a finding about the corpus.
  console.log('\nUnfinished Chat runs are not evidence findings');
  const shapes = JSON.parse(
    execFileSync('npx', ['tsx', 'scripts/unfinished-probe.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GLEAN_USE_FIXTURE: 'true' },
    })
      .trim()
      .split('\n')
      .pop(),
  );
  check(
    'a 200 with no text block is marked unfinished',
    shapes.unfinished.unfinished === true,
  );
  check(
    'an explicit refusal is NOT marked unfinished',
    shapes.refused.unfinished === false,
  );
  check(
    'a normal answer is NOT marked unfinished',
    shapes.answered.unfinished === false,
  );
  // The explicit flag is required because both shapes otherwise contain an empty
  // answer and no citations.
  check(
    'unfinished and refused are indistinguishable without the flag',
    shapes.unfinished.answer === shapes.refused.answer &&
      shapes.unfinished.citations === shapes.refused.citations,
  );

  if (useFixture) await checkUnfinishedRun();
}

async function checkLiveModeGate() {
  console.log('\nLive mode requires approved source prefixes');
  const port = await availablePort();
  const child = spawn('npm', ['run', 'start:live'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      RFP_APPROVED_SOURCE_PREFIXES: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const exitCode = await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 10_000)),
  ]);
  if (exitCode === 'timeout') await stopProcessGroup(child);

  check(
    'npm run start:live fails without approved source prefixes',
    typeof exitCode === 'number' && exitCode !== 0,
    `exit ${exitCode}`,
  );
  check(
    'live-mode failure names RFP_APPROVED_SOURCE_PREFIXES',
    output.includes('RFP_APPROVED_SOURCE_PREFIXES'),
  );
}

/**
 * Replays the questionnaire with SEC-08 recorded as an unfinished run, and
 * asserts the row reports a failed call rather than absent evidence. Runs
 * against a second server so the main fixture's row counts stay untouched.
 */
async function checkUnfinishedRun() {
  const port = PORT + 3;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn('npm', ['start'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      RFP_CHAT_FIXTURES: path.join(root, 'fixtures', 'chat-unfinished.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));

  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i += 1) {
      try {
        await fetch(`${base}/api/sample`);
        up = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!up) {
      failures.push('unfinished-run server start');
      console.log(`  FAIL server did not start\n${stderr}`);
      return;
    }

    const sample = await (await fetch(`${base}/api/sample`)).json();
    await fetch(`${base}/api/parse`, {
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
    });
    const runResponse = await fetch(`${base}/api/run`, { method: 'POST' });
    let rows = [];
    await readSse(runResponse, (event, data) => {
      if (event === 'done') rows = data.rows;
    });

    const sec08 = rows.find((row) => row.questionId === 'SEC-08');
    check(
      'SEC-08 reports a failed call, not needs-sme',
      sec08?.status === 'failed',
    );
    // The load-bearing one: 'none' is what renders "insufficient evidence".
    check(
      'SEC-08 records no confidence verdict at all',
      sec08?.confidence === null,
    );
    check(
      'SEC-08 keeps no answer or citations',
      sec08?.answer === '' && (sec08?.citations ?? []).length === 0,
    );
    check(
      'the reason blames the call, not the corpus',
      /did not finish/i.test(sec08?.reason ?? '') &&
        !/insufficient evidence/i.test(sec08?.reason ?? ''),
    );
    // The override has to be surgical, or the checks above prove nothing.
    const sec01 = rows.find((row) => row.questionId === 'SEC-01');
    check(
      'unrelated rows still classify normally',
      sec01?.confidence === 'strong',
    );
  } finally {
    await stopProcessGroup(child);
    fs.rmSync(path.join(root, '.answer-library.json'), { force: true });
  }
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
  await closed;
}

await main();

console.log('');
if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('All checks passed.');
