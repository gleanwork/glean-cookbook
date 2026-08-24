// Walk the whole delivery chain and say which link is broken.
//
// A running process is not a working path. `cloudflared` in particular stays
// alive and retrying after Cloudflare has torn its hostname down, so a process
// check reports healthy while DNS no longer resolves. Every check here proves a
// hop end to end instead of inferring it.

import { spawnSync } from 'node:child_process';

import { loadEnv } from '../lib/config.mjs';
import { listTriggers } from '../lib/glean-api.mjs';

loadEnv();

let failures = 0;
function report(ok, label, detail) {
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `\n        ${detail}` : ''}`,
  );
  if (!ok) failures += 1;
}

async function health(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, ready: body?.ready === true };
  } catch (error) {
    return { error: error.message };
  }
}

const env = process.env;
const port = env.PORT || '8787';
const webhookUrl = env.GLEAN_WEBHOOK_URL || '';
const origin = webhookUrl.replace(/\/webhook$/u, '');

console.log('configuration');
for (const key of [
  'GLEAN_SERVER_URL',
  'GLEAN_API_TOKEN',
  'GLEAN_WEBHOOK_URL',
]) {
  report(
    Boolean(env[key]),
    `${key} is set`,
    env[key] ? '' : 'run npm run login, or fill it in .env',
  );
}
report(
  Boolean(env.GLEAN_WEBHOOK_SECRETS),
  'signing secrets are stored',
  env.GLEAN_WEBHOOK_SECRETS
    ? ''
    : 'run npm run setup -- the receiver rejects every delivery without them',
);

console.log('\nreceiver');
const local = await health(`http://127.0.0.1:${port}/health`);
report(
  local.ready === true,
  `receiver answers on 127.0.0.1:${port}`,
  local.ready === true
    ? ''
    : (local.error ?? `status ${local.status}, ready=${local.ready}`) +
        ' -- start it with npm start',
);

console.log('\npublic path');
if (!origin) {
  report(
    false,
    'GLEAN_WEBHOOK_URL is usable',
    'empty, so there is nothing to reach',
  );
} else {
  const remote = await health(`${origin}/health`);
  report(
    remote.ready === true,
    `${origin} reaches the receiver`,
    remote.ready === true
      ? ''
      : (remote.error ?? `status ${remote.status}`) +
          ' -- the tunnel is down or its hostname was withdrawn; restart it, then npm run repoint',
  );
}

console.log('\ntriggers');
try {
  const ids = (env.GLEAN_TRIGGER_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  report(
    ids.length > 0,
    'this checkout owns triggers',
    ids.length ? '' : 'run npm run setup',
  );
  if (ids.length > 0) {
    const known = new Map((await listTriggers()).map((t) => [t.trigger_id, t]));
    for (const id of ids) {
      const trigger = known.get(id);
      if (!trigger) {
        report(
          false,
          `${id} still exists`,
          'it was deleted on the tenant; re-run npm run setup',
        );
        continue;
      }
      const current = trigger.delivery?.webhook_url;
      report(
        current === webhookUrl,
        `${trigger.preset_id} delivers to the current URL`,
        current === webhookUrl
          ? ''
          : `points at ${current} -- run npm run repoint`,
      );
      report(
        trigger.status === 'ENABLED',
        `${trigger.preset_id} is enabled`,
        trigger.status === 'ENABLED' ? '' : `status is ${trigger.status}`,
      );
    }
  }
} catch (error) {
  report(false, 'the Triggers API answered', error.message);
}

console.log('\ngithub cli');
// The skill reads the diff and writes the pending review through `gh`, so an
// unauthenticated CLI fails at the last step, after the event has been consumed.
const version = spawnSync('gh', ['--version'], { encoding: 'utf8' });
report(
  version.status === 0,
  'gh is installed',
  version.status === 0 ? '' : 'install it: https://cli.github.com',
);
if (version.status === 0) {
  const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  report(
    auth.status === 0,
    'gh is authenticated',
    auth.status === 0 ? '' : 'run gh auth login',
  );
}

console.log(
  failures === 0
    ? '\nEverything on the path is working.'
    : `\n${failures} check(s) failed. Fix those before expecting a delivery.`,
);
process.exit(failures === 0 ? 0 : 1);
