// Verify gate for github-pr-review-monitor.
//
// Runs the whole local path with no credentials and no network: signature
// verification, the replay window, the receiver, deduplication that survives a
// restart, the monitor stream's one-line-per-event contract, preset selection
// including the two ways it must refuse, and the absence of any submit path.
//
// Everything a live run adds is credentials and a tunnel. Everything that can
// be wrong without them is checked here.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.env.GLEAN_COOKBOOK_DEMO = 'true';
process.env.GLEAN_REVIEW_STATE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'glean-pr-review-monitor-'),
);

const { recipeRoot, stateDir } = await import('../lib/config.mjs');
const { demoSecret, sign } = await import('../lib/signature.mjs');
const { resolveInputs, selectPresets } = await import('../lib/presets.mjs');
const { createReceiver } = await import('./server.mjs');

const failures = [];
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function refuses(label, fn) {
  try {
    fn();
    check(label, false, 'it returned instead of throwing');
  } catch {
    check(label, true);
  }
}

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(recipeRoot, 'fixtures', name), 'utf8'));
const body = fs.readFileSync(
  path.join(recipeRoot, 'fixtures', 'github-review-requested.json'),
  'utf8',
);

// ---- Preset selection, no network -----------------------------------------
console.log('\npreset selection');
{
  const served = fixture('presets.json').results;
  const empty = fixture('presets-empty.json').results;

  const ids = (presets) => presets.map((preset) => preset.preset_id);

  check(
    'configured presets resolve in the order given',
    JSON.stringify(
      ids(selectPresets(served, ['GITHUB_3', 'GITHUB_1'], 'github')),
    ) === JSON.stringify(['GITHUB_3', 'GITHUB_1']),
  );
  refuses('it refuses when no preset is configured, rather than guessing', () =>
    selectPresets(served, [], 'github'),
  );
  refuses('it refuses a preset the deployment does not serve', () =>
    selectPresets(served, ['GITHUB_1', 'GITHUB_404'], 'github'),
  );
  refuses('it refuses when the catalog serves none of the datasource', () =>
    selectPresets(empty, ['GITHUB_1'], 'github'),
  );
  // The bridge is datasource-agnostic; only .env and the skill are not.
  check(
    'the same selection works for another datasource',
    JSON.stringify(
      ids(
        selectPresets(
          [
            {
              preset_id: 'GONG_2',
              datasource: 'gong',
              display_name: 'New call',
            },
          ],
          ['GONG_2'],
          'gong',
        ),
      ),
    ) === JSON.stringify(['GONG_2']),
  );
  // The datasource-agnostic claim is only true if required inputs are carried.
  // The GitHub presets require none, so posting a flat {} passed here while
  // every preset family the .env comment names would have been rejected.
  const slack = {
    preset_id: 'SLACK_1',
    datasource: 'slack',
    display_name: 'New message in a channel',
    inputs: [{ field: 'channel', is_required: true, type: 'PICKLIST' }],
  };
  check(
    'a preset requiring no inputs resolves to an empty set',
    JSON.stringify(resolveInputs(served[0], {})) === '{}',
  );
  refuses('a preset with a required input refuses when it is unset', () =>
    resolveInputs(slack, {}),
  );
  check(
    'and takes it from GLEAN_TRIGGER_INPUT_<FIELD>',
    resolveInputs(slack, { GLEAN_TRIGGER_INPUT_CHANNEL: 'C0123' }).channel ===
      'C0123',
  );
  refuses('a value the preset does not advertise is refused', () =>
    resolveInputs(
      {
        ...slack,
        inputs: [
          {
            field: 'channel',
            is_required: true,
            values: [{ value: 'C0ALLOWED' }],
          },
        ],
      },
      { GLEAN_TRIGGER_INPUT_CHANNEL: 'C0OTHER' },
    ),
  );
}

// ---- No submit path --------------------------------------------------------
console.log('\nno submit path');
{
  const source = fs.readFileSync(
    path.join(recipeRoot, 'scripts', 'draft-review.mjs'),
    'utf8',
  );
  // One optional field is the whole difference between drafting a review and
  // approving a pull request, so it is pinned by a test rather than by memory.
  check(
    'the review payload carries only a body',
    /JSON\.stringify\(\{\s*body:/u.test(source),
  );
  check('it never sends an `event` field', !/\bevent\b/u.test(source));
  check(
    'it never names a submit state',
    !/APPROVE|REQUEST_CHANGES|DISMISS/u.test(source),
  );
}

// ---- Receiver --------------------------------------------------------------
console.log('\nreceiver');
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function deliver(
  port,
  { id, timestamp, signature, payload = body, signed = true },
) {
  const ts = timestamp ?? String(nowSeconds());
  const headers = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
  };
  if (signed) {
    headers['webhook-signature'] =
      `v1,${signature ?? sign(demoSecret, id, ts, payload)}`;
  }
  return fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers,
    body: payload,
  });
}

async function withReceiver(fn) {
  const server = createReceiver();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await withReceiver(async (port) => {
  check(
    'a correctly signed delivery is queued',
    (await deliver(port, { id: 'd1' })).status === 202,
  );
  check(
    'a redelivery is acknowledged but not queued twice',
    (await deliver(port, { id: 'd1' })).status === 200,
  );
  check(
    'a wrongly signed delivery is refused',
    (await deliver(port, { id: 'd2', signature: 'bad' })).status === 401,
  );
  check(
    'an unsigned delivery is refused',
    (await deliver(port, { id: 'd3', signed: false })).status === 401,
  );
  check(
    'a delivery outside the replay window is refused',
    (await deliver(port, { id: 'd4', timestamp: String(nowSeconds() - 600) }))
      .status === 401,
  );
  check(
    'an oversized body is refused',
    (await deliver(port, { id: 'd5', payload: 'x'.repeat(1024 * 1024 + 1) }))
      .status === 413,
  );
});

// A restart must not re-admit retries Glean is still holding. The dedupe set is
// rebuilt from disk on boot, and this is the only check that proves it.
await withReceiver(async (port) => {
  check(
    'deduplication survives a receiver restart',
    (await deliver(port, { id: 'd1' })).status === 200,
  );
});

const queued = fs
  .readFileSync(path.join(stateDir(), 'events.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean);
check(
  'exactly one event was queued',
  queued.length === 1,
  `queued ${queued.length}`,
);
check(
  'the queued envelope carries the event',
  JSON.parse(queued[0]).event?.reason === 'REVIEW_REQUESTED',
);

// ---- Payload contract ------------------------------------------------------
console.log('\npayload contract');
{
  // The documented delivery payload is snake_case. A camelCase fixture reads
  // fine and agrees with camelCase parsing code, so the pair can be wrong
  // together and still pass — which is exactly what happened here once.
  const event = JSON.parse(body);
  const required = [
    'version',
    'trigger_id',
    'event_type',
    'datasource',
    'reason',
    'doc_type',
    'doc_id',
    'view_url',
    'title',
  ];
  const missing = required.filter((key) => !(key in event));
  check(
    'the fixture carries every documented field',
    missing.length === 0,
    missing.join(', '),
  );

  const camel = Object.keys(event).filter((key) => /[a-z][A-Z]/.test(key));
  check(
    'no camelCase field names in the delivery payload',
    camel.length === 0,
    camel.join(', '),
  );

  const skill = fs.readFileSync(
    path.join(recipeRoot, 'skills', 'review-trigger', 'SKILL.md'),
    'utf8',
  );
  check(
    'the skill reads the payload in snake_case too',
    /\bdoc_type\b/u.test(skill) &&
      /\bview_url\b/u.test(skill) &&
      !/\b(docType|viewUrl)\b/u.test(skill),
  );
}

// ---- Monitor stream --------------------------------------------------------
console.log('\nmonitor stream');
{
  // Claude Code's Monitor turns one stdout LINE into one transcript message, so
  // a buffered or pretty-printed write arrives as nothing, or as fragments.
  const child = spawn(
    process.execPath,
    [path.join(recipeRoot, 'scripts', 'stream.mjs')],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  child.kill();

  const lines = out.split('\n').filter((line) => line.trim() !== '');
  check('the stream emitted output', lines.length > 0);
  check(
    'every line is one complete JSON object',
    lines.every((line) => {
      try {
        JSON.parse(line);
        return true;
      } catch {
        return false;
      }
    }),
    lines.find((line) => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    }),
  );
}

fs.rmSync(stateDir(), { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\nFAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
