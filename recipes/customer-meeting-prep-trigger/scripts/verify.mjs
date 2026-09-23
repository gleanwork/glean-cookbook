#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offersOffset, resolveInputs, selectPreset } from '../lib/presets.mjs';
import {
  demoSecret,
  parseSignatureHeader,
  sign,
  verifySignature,
} from '../lib/signature.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));

const presets = json('fixtures', 'presets.json').results;
const detail = json('fixtures', 'preset-detail.json').trigger_preset;
const delivery = json('fixtures', 'delivery.json');
const setup = read('scripts', 'setup-trigger.mjs');
const api = read('lib', 'glean-api.mjs');
const envExample = read('.env.example');

assert.equal(
  selectPreset(presets, 'GCAL_1', { datasource: 'googlecalendar' }).preset_id,
  'GCAL_1',
);
assert.throws(
  () =>
    selectPreset(presets, '', {
      datasource: 'googlecalendar',
      envVar: 'GLEAN_TRIGGER_PRESET_ID',
    }),
  /Set GLEAN_TRIGGER_PRESET_ID/u,
);
assert.equal(offersOffset(detail, '1800'), true);
assert.deepEqual(
  resolveInputs(
    detail,
    { GLEAN_TRIGGER_INPUT_TITLE: 'Customer QBR' },
    { time_offset: '1800' },
  ),
  { TITLE: 'Customer QBR', time_offset: '1800' },
);
assert.match(api, /x-glean-include-experimental/u);
assert.match(api, /\/trigger-presets/u);
assert.match(setup, /\/triggers/u);
assert.match(envExample, /GLEAN_TRIGGER_INPUT_TITLE=Customer QBR/u);
assert.match(envExample, /GLEAN_WEBHOOK_URL=/u);
assert.match(envExample, /GLEAN_WEBHOOK_SIGNING_SECRET=/u);

const body = JSON.stringify(delivery);
const webhookId = 'demo-webhook-id';
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = sign(demoSecret, webhookId, timestamp, body);
assert.equal(parseSignatureHeader(`v1,${signature}`)[0], signature);
assert.equal(
  verifySignature({
    secret: demoSecret,
    webhookId,
    timestamp,
    body,
    signatures: [signature],
  }),
  true,
);
assert.equal(
  verifySignature({
    secret: demoSecret,
    webhookId,
    timestamp,
    body: `${body} `,
    signatures: [signature],
  }),
  false,
);
assert.match(body, /event_time/u);
assert.match(body, /view_url/u);

console.log(
  'fixture verification passed: Platform Trigger setup, preset selection, and signed delivery',
);
