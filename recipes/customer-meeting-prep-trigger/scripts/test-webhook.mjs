#!/usr/bin/env node

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/config.mjs';
import { sign } from '../lib/signature.mjs';

loadEnv();
const url = process.env.GLEAN_WEBHOOK_URL?.trim();
const bearer = process.env.GLEAN_WEBHOOK_BEARER_TOKEN?.trim();
const secret = process.env.GLEAN_WEBHOOK_SIGNING_SECRET?.trim();
if (!url || !bearer || !secret) {
  throw new Error(
    'Set GLEAN_WEBHOOK_URL, GLEAN_WEBHOOK_BEARER_TOKEN, and GLEAN_WEBHOOK_SIGNING_SECRET first.',
  );
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const event = JSON.parse(
  fs.readFileSync(path.join(root, 'fixtures', 'delivery.json'), 'utf8'),
);
event.title = process.env.GLEAN_TRIGGER_INPUT_TITLE || event.title;
event.event_time = new Date(Date.now() + 45 * 60_000).toISOString();
const body = JSON.stringify(event);
const webhookId = `demo-${Date.now()}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = sign(secret, webhookId, timestamp, body);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${bearer}`,
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  },
  body,
});
const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
if (text) console.log(text);
if (!response.ok) process.exit(1);
