#!/usr/bin/env node

import 'dotenv/config';
import http from 'node:http';
import { loadEnv } from '../lib/config.mjs';
import { parseSignatureHeader, verifySignature } from '../lib/signature.mjs';

loadEnv();
const port = Number(process.env.PORT || 8787);
const bearer = process.env.GLEAN_WEBHOOK_BEARER_TOKEN?.trim();
const signingSecret = process.env.GLEAN_WEBHOOK_SIGNING_SECRET?.trim();
const acceptedTitle = process.env.GLEAN_TRIGGER_INPUT_TITLE?.trim();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isFresh(timestamp) {
  const seconds = Number(timestamp);
  return (
    Number.isFinite(seconds) && Math.abs(Date.now() / 1000 - seconds) <= 300
  );
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, receiver: 'customer-meeting-prep-trigger' });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    json(res, 404, { error: 'not_found' });
    return;
  }

  try {
    const body = await readBody(req);
    const authorization = req.headers.authorization || '';
    if (!bearer || authorization !== `Bearer ${bearer}`) {
      json(res, 401, { error: 'invalid_delivery_auth' });
      return;
    }

    const webhookId = req.headers['webhook-id'];
    const timestamp = req.headers['webhook-timestamp'];
    const signatures = parseSignatureHeader(
      req.headers['webhook-signature'] || '',
    );
    if (
      !signingSecret ||
      typeof webhookId !== 'string' ||
      typeof timestamp !== 'string' ||
      !isFresh(timestamp) ||
      !verifySignature({
        secret: signingSecret,
        webhookId,
        timestamp,
        body,
        signatures,
      })
    ) {
      json(res, 401, { error: 'invalid_webhook_signature' });
      return;
    }

    const event = JSON.parse(body);
    const title = String(event.title || '');
    const matches =
      !acceptedTitle ||
      title.toLocaleLowerCase().includes(acceptedTitle.toLocaleLowerCase());
    if (!matches) {
      console.log(`Ignored non-matching meeting: ${title || '(untitled)'}`);
      json(res, 202, { accepted: true, matched: false });
      return;
    }

    console.log('\nCustomer meeting prep request');
    console.log(`  title: ${title || '(untitled)'}`);
    console.log(`  starts: ${event.event_time || '(unknown)'}`);
    console.log(`  event:  ${event.view_url || '(no calendar URL)'}`);
    console.log(
      '  next:   run the Account Brief Agent with this meeting context',
    );
    json(res, 202, { accepted: true, matched: true, event_id: webhookId });
  } catch (error) {
    console.error(`Webhook handling failed: ${error.message}`);
    json(res, 400, { error: 'invalid_delivery' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `Customer meeting prep receiver listening on http://127.0.0.1:${port}`,
  );
  console.log(
    'Expose /webhook through a public HTTPS tunnel before registering the trigger.',
  );
});
