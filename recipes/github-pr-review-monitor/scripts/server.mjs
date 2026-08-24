import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv, readEnv, stateDir } from '../lib/config.mjs';
import {
  demoSecret,
  parseSignatureHeader,
  verifySignature,
} from '../lib/signature.mjs';

const inheritedWebhookSecrets = process.env.GLEAN_WEBHOOK_SECRETS;
loadEnv();

export function secretValues({ inherited, persisted, demo = false }) {
  const configured = inherited === undefined ? persisted || '' : inherited;
  const values = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length > 0) return values;
  return demo ? [demoSecret] : [];
}

function secrets() {
  return secretValues({
    inherited: inheritedWebhookSecrets,
    persisted: readEnv().GLEAN_WEBHOOK_SECRETS,
    demo: process.env.GLEAN_COOKBOOK_DEMO === 'true',
  });
}

function readSeen(file) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean));
}

export function createReceiver({ now = () => Date.now() } = {}) {
  const directory = stateDir();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const eventsFile = path.join(directory, 'events.ndjson');
  const seenFile = path.join(directory, 'seen-ids');
  const seen = readSeen(seenFile);

  return http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      const ready = secrets().length > 0;
      response.writeHead(ready ? 200 : 503, {
        'content-type': 'application/json',
      });
      response.end(JSON.stringify({ ready }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/webhook') {
      response.writeHead(404).end();
      return;
    }

    const chunks = [];
    let bodyBytes = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > 1024 * 1024) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        response.writeHead(413).end('payload too large');
        return;
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const webhookId = request.headers['webhook-id'];
      const timestamp = request.headers['webhook-timestamp'];
      const signatures = parseSignatureHeader(
        request.headers['webhook-signature'],
      );
      const timestampMs = Number(timestamp) * 1000;
      const validTimestamp =
        typeof timestamp === 'string' &&
        /^\d+$/u.test(timestamp) &&
        Number.isFinite(timestampMs) &&
        Math.abs(now() - timestampMs) <= 5 * 60_000;
      const valid =
        typeof webhookId === 'string' &&
        typeof timestamp === 'string' &&
        validTimestamp &&
        secrets().some((secret) =>
          verifySignature({ secret, webhookId, timestamp, body, signatures }),
        );

      if (!valid) {
        response.writeHead(401).end('invalid webhook signature');
        return;
      }
      if (seen.has(webhookId)) {
        response.writeHead(200).end('duplicate ignored');
        return;
      }

      let event;
      try {
        event = JSON.parse(body);
      } catch {
        response.writeHead(400).end('invalid json');
        return;
      }

      const queued = {
        webhookId,
        receivedAt: new Date(now()).toISOString(),
        event,
      };
      fs.appendFileSync(eventsFile, `${JSON.stringify(queued)}\n`, {
        mode: 0o600,
      });
      fs.appendFileSync(seenFile, `${webhookId}\n`, { mode: 0o600 });
      seen.add(webhookId);
      response.writeHead(202).end('queued');
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createReceiver().listen(port, '127.0.0.1', () => {
    console.log(`Glean review receiver: http://127.0.0.1:${port}/webhook`);
    if (secrets().length === 0) {
      console.log('Waiting for npm run setup to save webhook signing secrets.');
    }
    // demoSecret is in the repository, so anyone can sign an event with it. It
    // only applies before setup saves real secrets — but that window is exactly
    // where the recipe tells you to open a public tunnel, and an event here
    // wakes Claude Code. Loopback is not the boundary once a tunnel is up.
    if (secrets().includes(demoSecret)) {
      console.warn(
        'GLEAN_COOKBOOK_DEMO=true: accepting the fixture signing secret, which is public.\n' +
          '  Set it to false before exposing this receiver over a tunnel.',
      );
    }
  });
}
