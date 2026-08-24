#!/usr/bin/env node
// Verify gate for pre-meeting-brief. No credentials, no network.
//
// Preset selection is this recipe's own code, so it runs as behaviour. The
// Cursor prompt is prose, so it is checked as text — anchored to fixtures
// captured from the live API rather than to a hand-written sample.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertOffset,
  offersOffset,
  presetsFor,
  resolveInputs,
  selectPreset,
} from '../lib/presets.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const fixture = (name) => JSON.parse(read('fixtures', name));

const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
};
const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.message;
  }
};

const promptRaw = read('automation-prompt.md');
// The prompt is hard-wrapped, so match across line breaks.
const prompt = promptRaw.replace(/\s+/gu, ' ');
const setup = read('scripts', 'setup-trigger.mjs');
const preview = read('scripts', 'preview-events.mjs');
const api = read('lib', 'glean-api.mjs');
const presets = fixture('presets.json').results;
const presetDetail = fixture('preset-detail.json').trigger_preset;
const events = fixture('calendar-events.json').results;
const delivery = fixture('delivery.json');

// ---- The payload contract, anchored to the live API ------------------------
console.log('\nThe payload contract matches what the API sends');
const liveFields = Object.keys(events[0]);
check(
  'the captured events are snake_case',
  liveFields.every((f) => !/[A-Z]/u.test(f)),
  liveFields.join(', '),
);
for (const field of ['doc_id', 'event_time', 'view_url', 'title']) {
  check(`the prompt documents ${field}`, prompt.includes(field));
}
// The failure this gate exists to catch. camelCase reads undefined in Cursor.
for (const wrong of ['docId', 'eventTime', 'viewUrl', 'timeOffsetSeconds']) {
  check(`the prompt does not use ${wrong}`, !prompt.includes(wrong));
}
// Checked across the whole recipe, since demo-queries.json is generated from
// recipe.json and would carry a camelCase name straight through a rebuild.
{
  const shipped = ['automation-prompt.md', 'README.md', 'recipe.json'].map(
    (f) => read(f),
  );
  check(
    'no shipped file reintroduces a camelCase field name',
    !shipped.some((text) =>
      /\b(?:docId|eventTime|viewUrl|timeOffsetSeconds|triggerId)\b/u.test(text),
    ),
  );
}
check(
  'the scheduled delivery adds time_offset_seconds',
  delivery.time_offset_seconds === 1800 &&
    prompt.includes('time_offset_seconds=1800'),
);

// Peers link the third-party entry point rather than naming it in prose.
{
  const readme = read('README.md');
  check(
    'the README links where a Cursor Automation is created',
    /https:\/\/cursor\.com\/automations/u.test(readme),
  );
  check(
    'and the prompt says where it is pasted',
    /https:\/\/cursor\.com\/(?:docs\/)?automations/u.test(prompt),
  );
  // Asserted on both surfaces that ship: the skill renders recipe.json's
  // prerequisites, and the dev site page renders its aiPrompt.
  for (const [label, text] of [
    ['the README', readme],
    ['recipe.json', read('recipe.json')],
  ]) {
    check(
      `${label} names the tracker, discovered over MCP, as the source`,
      /tracker/iu.test(text) && /\bMCP\b/u.test(text),
    );
  }
}

// House pattern: a short header for the human, then the agent's instructions
// in a fenced block, so there is no ambiguity about what to copy.
{
  const fences = promptRaw.split('\n').filter((l) => l.startsWith('````'));
  check('the prompt marks exactly what to paste', fences.length === 2);
  const [head, body] = [
    promptRaw.slice(0, promptRaw.indexOf('````')),
    promptRaw.slice(promptRaw.indexOf('````')),
  ];
  check(
    'the header tells the reader to paste the block and fill it in',
    /paste the whole fenced block/iu.test(head) && /REPLACE_WITH/u.test(head),
  );
  // Which MCP servers to connect is a job for the person configuring Cursor.
  // Inside the block it is just tokens the agent cannot act on.
  check(
    'tool setup is addressed to the reader, not pasted into the agent',
    /Memories off/u.test(head) && !/Memories off/u.test(body),
  );
  // Cursor enables both by default and the delivery is untrusted, so the prompt
  // has to turn them off explicitly.
  check(
    'the pasted block carries no markdown headings',
    !/^#{1,6} /mu.test(body.replace(/^````.*$/mu, '')),
  );
  check(
    'and is hard-wrapped like the other shipped prompts',
    body.split('\n').every((line) => line.length <= 82),
    `longest line ${Math.max(...body.split('\n').map((l) => l.length))}`,
  );
  check(
    'the reader is told to disable the default-on tools',
    /Memories off/u.test(head) &&
      /Computer use off/u.test(head) &&
      /repository\s+scope to \*\*none\*\*/iu.test(head),
  );
}

// ---- Rules merged in from the deleted recipe -------------------------------
// Each is asserted separately so losing one fails loudly rather than quietly.
console.log('\nThe automation cannot write the wrong thing');
for (const [label, needle] of [
  ['the occurrence is doc_id plus event_time', 'doc_id` plus `event_time'],
  ['and it says why doc_id alone is not enough', 'once and never again'],
  ['a meeting that already started is skipped', 'already started'],
  ['because delivery is at-least-once', 'at-least-once'],
  // The window comes from the marker left by the previous run, so the brief
  // covers "since we last met" rather than an arbitrary seven days.
  ['the window starts at the last brief', 'glean-calendar-event:<doc_id>:'],
  [
    'a first run says it is using a default lookback',
    'first run over a default lookback',
  ],
  ['a fixed cadence is not assumed', 'Do not assume a fixed cadence'],
  ['items are named, not merely counted', 'Name the items'],
  ['each figure names the tool call behind it', 'name the tool call'],
  [
    'a tool that cannot be exact is not approximated',
    'rather than approximating',
  ],
  // The distinction that matters in a quiet week.
  ['no movement is published as an answer', 'no movement since'],
  [
    'but an unreadable source publishes nothing',
    'publish nothing and report the failure',
  ],
  ['the marker feeds the next run', 'what the next run reads'],
  // A URL is what people have; the id is buried in it. The slug beside it is a
  // stale copy of a name, so matching on that is the display-name trap again.
  ['a target URL is accepted, not only a bare id', 'take the id out of it'],
  ['but the slug in that URL identifies nothing', 'identifies nothing'],
  [
    'the resolved name is confirmed before writing',
    'confirm the resolved name',
  ],
  // Asking a human for `completedAt` is asking them to do the agent's job: it
  // holds the connection to the tracker and can look.
  [
    'the common case needs no schema from the reader',
    'say so and nothing else',
  ],
  [
    'the agent discovers fields rather than being told them',
    'discover the fields',
  ],
  [
    'and names what it could not find rather than guessing',
    'instead of guessing at a column name',
  ],
  // Glean is what separates a briefing from a changelog, so it gets specific
  // work rather than "look up some context".
  [
    'Glean looks up the reason behind the largest changes',
    'the reason behind them',
  ],
  [
    'and what the group agreed at the previous meeting',
    'agreed at the previous meeting',
  ],
  [
    'because no tracker knows work was promised',
    'no tracker knows it was promised',
  ],
  [
    'a missing Glean is disclosed, not silently narrowed',
    'silently shipping a changelog',
  ],
  ['placeholders block every write', 'Stop without any write'],
]) {
  check(label, prompt.includes(needle), needle);
}
const PLACEHOLDERS = [
  'REPLACE_WITH_REVIEWED_PATTERN',
  'REPLACE_WITH_TARGET',
  'REPLACE_WITH_WORK_SOURCE',
];
const remaining = PLACEHOLDERS.filter((name) => prompt.includes(name));
check(
  'the prompt is either untouched or fully configured, never half',
  remaining.length === 0 || remaining.length === PLACEHOLDERS.length,
  remaining.length ? `${remaining.length} of ${PLACEHOLDERS.length} left` : '',
);
console.log(
  remaining.length
    ? '       (unconfigured — fill these in before enabling the automation)'
    : '       (configured — every placeholder resolved)',
);
if (fs.existsSync(path.join(root, '..', '..', 'registry.json'))) {
  check(
    'the shipped recipe still ships every placeholder',
    remaining.length === PLACEHOLDERS.length,
  );
}

// The URL and key exist only after saving, so "save" must come before the step
// that posts a delivery.
console.log('\nThe setup order is followable');
{
  const recipe = JSON.parse(read('recipe.json'));
  // Match on the command, not prose: descriptions mention each other's steps.
  const steps = recipe.steps.map(
    (step) => `${step.title} ${step.description ?? ''}`,
  );
  // Matched by pattern so the check survives either command style: the npm
  // script name or the script file it runs.
  const commandAt = (pattern) =>
    recipe.steps.findIndex((step) => pattern.test(step.command ?? ''));
  const saveAt = steps.findIndex((t) => /\bSave the automation\b/u.test(t));
  const testAt = commandAt(/test[:-]webhook|test-webhook\.mjs/u);
  const enableAt = steps.findIndex((t) => /\bEnable the\b/u.test(t));
  check('a step says to save the automation', saveAt !== -1);
  check(
    'and where the URL and token go',
    /ignored \.env/u.test(steps[saveAt] ?? ''),
  );
  check(
    'saving comes before the receiver test',
    saveAt !== -1 && saveAt < testAt,
  );
  // A disabled automation may take no action, so enabling precedes the receiver
  // test; registering the trigger, last, is what puts it in production.
  check(
    'enabling comes before the receiver test',
    enableAt !== -1 && enableAt < testAt,
  );
  const registerAt = commandAt(/run setup\b|setup-trigger\.mjs/u);
  check('and registering the trigger comes after both', registerAt > testAt);
  check(
    'the step says why it is enabled this early',
    /receiver test would prove nothing/u.test(steps[enableAt] ?? ''),
  );
  check(
    'and distinguishes enabling from going into production',
    /puts it in production/u.test(steps[enableAt] ?? ''),
  );
}

// ---- Preset selection, as behaviour ----------------------------------------
console.log('\nThe calendar preset is chosen, never guessed');
// The library takes datasource and offset as arguments, so the same code
// registers a different schedule elsewhere.
const CAL = {
  datasource: 'googlecalendar',
  envVar: 'GLEAN_CALENDAR_PRESET_ID',
};
// The catalog answers in two shapes and the difference is load-bearing, so the
// gate holds them apart. Blur them and the code reads `inputs` off a list entry,
// finds none, and refuses every preset the deployment serves.
check(
  'the list response carries identity without inputs',
  presets.every((preset) => preset.inputs === undefined),
  Object.keys(presets[0]).join(', '),
);
check(
  'the per-preset read is what advertises a 1,800-second offset',
  offersOffset(presetDetail, '1800'),
);
check(
  'so a list entry alone cannot satisfy the offset check',
  !offersOffset(presets[0], '1800'),
);
// Removing the default from the code achieves nothing if config hands it back.
check(
  'the shipped .env.example ships no preset id',
  /^GLEAN_CALENDAR_PRESET_ID=\s*$/mu.test(read('.env.example')),
);
check(
  'the library is not hardwired to calendars or to 1,800 seconds',
  !/googlecalendar|1800/u.test(read('lib', 'presets.mjs')),
);
check(
  'filtering by datasource finds it',
  presetsFor(presets, 'googlecalendar').length === 1,
);
check(
  'an explicitly configured preset resolves',
  selectPreset(presets, 'GCAL_1', CAL).preset_id === 'GCAL_1',
);
// A default id is the failure mode: the caller cannot know another tenant's
// catalog, so guessing registers the wrong events or none.
check(
  'no configured preset halts and lists what is served',
  /Set GLEAN_CALENDAR_PRESET_ID/u.test(
    throws(() => selectPreset(presets, '', CAL)) ?? '',
  ),
);
check(
  'a preset this deployment does not serve halts',
  /not in this deployment/u.test(
    throws(() => selectPreset(presets, 'GCAL_9', CAL)) ?? '',
  ),
);
check(
  'a preset that cannot fire 30 minutes early halts',
  /cannot fire that far ahead/u.test(
    throws(() => assertOffset({ ...presetDetail, inputs: [] }, '1800')) ?? '',
  ),
);
check(
  'and names the offsets it does advertise',
  /It offers: 1800, 3600, 5400, 7200/u.test(
    throws(() => assertOffset(presetDetail, '900')) ?? '',
  ),
);
for (const [label, src] of [
  ['setup', setup],
  ['preview', preview],
]) {
  check(
    `${label} reads the preset before reasoning about its inputs`,
    /readPreset\(/u.test(src),
  );
  // An unset preset is the default first-run state, so it must read as an
  // instruction rather than a crash.
  check(
    `${label} reports a preset misconfiguration without a stack trace`,
    /catch \(error\) \{\s*console\.error\(error\.message\);\s*process\.exit\(1\);/u.test(
      src,
    ),
  );
  check(`${label} defaults to no preset`, !/'GCAL_1'/u.test(src));
  // Printing the display name is useful; selecting on it is the trap. Only
  // flag it in a boolean context.
  check(
    `${label} does not match presets by display name`,
    !src
      .split('\n')
      .some(
        (line) =>
          line.includes('display_name') &&
          /\.(?:test|match|includes)\(|===|!==/u.test(line),
      ),
  );
}

// A stale value exported in the shell silently beats .env and surfaces as an
// authentication error about a token the recipe never sent. Warn instead.
check(
  'a shadowed .env value is reported, not silently preferred',
  /Using the environment, not \.env/u.test(read('lib', 'config.mjs')),
);

// Required inputs differ per preset, and the API rejects a trigger that omits
// one, so setup reads what the preset advertises.
console.log('\nAny preset, not just this one');
const slack = {
  preset_id: 'SLACK_1',
  inputs: [{ field: 'channel', is_required: true, display_name: 'Channel' }],
};
check(
  "this recipe's own input resolves from a default",
  resolveInputs(presetDetail, {}, { time_offset: '1800' }).time_offset ===
    '1800',
);
// How a preset's own filters get registered without this code knowing their
// names — the same path a title filter arrives on.
check(
  'an optional filter the environment supplies is registered',
  resolveInputs(
    presetDetail,
    { GLEAN_TRIGGER_INPUT_TYPE: 'meeting' },
    { time_offset: '1800' },
  ).type === 'meeting',
);
check(
  'an optional input nobody supplies is left out',
  resolveInputs(presetDetail, {}, { time_offset: '1800' }).type === undefined,
);
// The title filter is the one this recipe configures by default. Its field is
// spelled TITLE in upper case, unlike every other input on the same preset, and
// the value is registered under the preset's own spelling rather than a
// normalised one -- an input the preset does not recognise is not rejected, it
// matches nothing, so the trigger registers, reports healthy and never fires.
check(
  'the preset advertises a TITLE input',
  (presetDetail.inputs || []).some((input) => input.field === 'TITLE'),
);
check(
  "the title filter registers under the preset's own upper-case spelling",
  resolveInputs(
    presetDetail,
    { GLEAN_TRIGGER_INPUT_TITLE: 'Platform weekly' },
    { time_offset: '1800' },
  ).TITLE === 'Platform weekly',
);
check(
  'and is omitted entirely when no pattern is configured',
  resolveInputs(presetDetail, {}, { time_offset: '1800' }).TITLE === undefined,
);
check(
  'the title input is free text, not a picklist',
  ((presetDetail.inputs || []).find((input) => input.field === 'TITLE') || {})
    .type === 'TEXT',
);
check(
  'the recipe tells the reader it is a mid-word case-insensitive substring',
  /case-insensitive substring/u.test(read('README.md')) &&
    /mid-word/u.test(read('README.md')),
);
check(
  'and warns that an unrecognised input silently never fires',
  /never fires/u.test(read('.env.example')),
);
// A truncated picklist advertises some of its values, not all, so refusing what
// it does not list would reject a legitimate one.
check(
  'a value outside a truncated picklist is still accepted',
  resolveInputs(
    {
      preset_id: 'GCAL_1',
      inputs: [
        {
          field: 'organizer',
          is_required: false,
          is_truncated: true,
          values: [{ value: 'dana.reyes@example.com' }],
        },
      ],
    },
    { GLEAN_TRIGGER_INPUT_ORGANIZER: 'someone.else@example.com' },
    {},
  ).organizer === 'someone.else@example.com',
);
check(
  'a preset needing a different field resolves from the environment',
  resolveInputs(slack, { GLEAN_TRIGGER_INPUT_CHANNEL: 'C0ABC' }, {}).channel ===
    'C0ABC',
);
check(
  'a missing required input names the variable that supplies it',
  /GLEAN_TRIGGER_INPUT_CHANNEL/u.test(
    throws(() => resolveInputs(slack, {}, {})) ?? '',
  ),
);
check(
  'a value the preset does not accept is refused with the allowed list',
  /Allowed: 1800, 3600, 5400, 7200/u.test(
    throws(() => resolveInputs(presetDetail, {}, { time_offset: '9999' })) ??
      '',
  ),
);
check(
  'setup asks the preset what it needs rather than hardcoding a field',
  /resolveInputs\(/u.test(setup) && !/inputs: \{ time_offset/u.test(setup),
);

console.log('\nThe receiver test is safe by default');
{
  const t = read('scripts', 'test-webhook.mjs');
  check(
    'the title comes from the configured prompt',
    /the meeting titles you accept:/u.test(t),
  );
  check(
    'the non-matching path is the default',
    /const write = flag\('write'\)/u.test(t) &&
      /else \{[\s\S]{0,220}title = NON_MATCHING/u.test(t),
  );
  check(
    'an unconfigured prompt is reported, not silently non-matching',
    /still has its title placeholder/u.test(t),
  );
  // An edited prompt and an unfilled one are different problems; reporting the
  // wrong one sends the reader to fix the wrong thing.
  check(
    'and an edited prompt is reported differently',
    /Could not find the accepted-title line/u.test(t),
  );
  check(
    'and a run that will write needs an explicit flag',
    /if \(write\)[\s\S]*will write to the configured/u.test(t),
  );
  check(
    'and warns that every write is a new occurrence',
    /generates a new event_time each time/u.test(t),
  );
}

// ---- Delivery registration --------------------------------------------------
console.log('\nRegistration');
check('the 1,800-second offset is what gets registered', /'1800'/u.test(setup));
check('Cursor is authenticated with a Bearer token', /BEARER/u.test(setup));
// Cursor displays the credential as a full header line, so that is what people
// paste. Glean rejects it as not RFC 6750 with an error that does not say why.
check(
  'a pasted Authorization header is accepted, not just the bare token',
  /Authorization\\s\*:/u.test(setup) && /Bearer\\s\+/u.test(setup),
);
check(
  'and an unusable secret is refused before the API round trip',
  /not a valid bearer token \(RFC 6750\)/u.test(setup),
);
// The Triggers surface is experimental: without this header the API answers 401
// `Not allowed`, which reads like a credential fault and sends you debugging the
// token instead of the request. One client owns it so no caller can forget it.
check(
  'the shared client sends x-glean-include-experimental',
  /x-glean-include-experimental/u.test(api),
);
check(
  'no script builds its own Triggers request headers',
  !/authorization:\s*`Bearer/u.test(setup) &&
    !/authorization:\s*`Bearer/u.test(preview),
);
check(
  'the per-preset read unwraps trigger_preset and keeps the resolved id',
  /trigger_preset/u.test(api) && /preset_id: presetId/u.test(api),
);
check(
  'a second trigger is refused rather than duplicated',
  /refusing to create a duplicate trigger/u.test(setup),
);

if (failures.length > 0) {
  console.log(`\nFAILED — ${failures.length} check(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
