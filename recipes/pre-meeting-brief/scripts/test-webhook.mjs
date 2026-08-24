// Sends one delivery to the receiver, the way Glean will — a webhook trigger is
// a private endpoint with no test button. The default delivery is deliberately
// non-matching. Pass --write only after approving one tracker update.

import fs from 'node:fs';
import path from 'node:path';

import { loadEnv, recipeRoot } from '../lib/config.mjs';

loadEnv();

const argv = process.argv.slice(2);
const arg = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const flag = (name) => argv.includes(`--${name}`);

const url = process.env.CURSOR_WEBHOOK_URL;
const bearer = (process.env.CURSOR_WEBHOOK_BEARER_TOKEN || '')
  .replace(/^\s*Authorization\s*:\s*/iu, '')
  .replace(/^\s*Bearer\s+/iu, '')
  .trim();

if (!url || !bearer) {
  console.error(
    'Set CURSOR_WEBHOOK_URL and CURSOR_WEBHOOK_BEARER_TOKEN in .env first.',
  );
  process.exit(1);
}

/**
 * The accepted-title pattern, read out of the prompt you configured, so the test
 * matches whatever the automation was told to accept without a second source.
 */
function configuredPattern() {
  const prompt = fs.readFileSync(
    path.join(recipeRoot, 'automation-prompt.md'),
    'utf8',
  );
  const line = prompt.match(/the meeting titles you accept:\s*`([^`]+)`/u);
  // Unfilled, drifted, and configured are three different fixes.
  if (!line) return { reason: 'unrecognised' };
  const value = line[1].trim();
  if (value.startsWith('REPLACE_WITH')) return { reason: 'placeholder' };
  return { value };
}

const NON_MATCHING = 'ZZ unmatched — receiver test';
const { value: pattern, reason } = configuredPattern();
const explicit = arg('title');
const write = flag('write');
let title;
let expectation;

if (write) {
  if (!explicit && !pattern) {
    throw new Error(
      'The prompt has no configured title pattern. Fill it in before using --write.',
    );
  }
  title = explicit || `${pattern} — receiver test`;
  expectation = 'a full run, including the update it writes';
} else {
  if (explicit) {
    throw new Error(
      '--title may match the automation and write an update. Add --write after approving that write.',
    );
  }
  title = NON_MATCHING;
  expectation = 'a run that reads every field and writes nothing';
}

if (!write && !pattern) {
  console.warn(
    reason === 'placeholder'
      ? 'automation-prompt.md still has its title placeholder, so there is no\n' +
          'pattern to match. Sending the safe non-matching test.\n'
      : 'Could not find the accepted-title line in automation-prompt.md, so\n' +
          'there is no pattern to match. If you edited the prompt, keep the line\n' +
          'reading "the meeting titles you accept: `...`". Sending a\n' +
          'non-matching title.\n',
  );
}

// The same fixture the offline gate runs on, so both talk about one payload.
const delivery = JSON.parse(
  fs.readFileSync(path.join(recipeRoot, 'fixtures', 'delivery.json'), 'utf8'),
);
const minutes = Number(arg('in') ?? 45);
const body = {
  ...delivery,
  title,
  event_time: new Date(Date.now() + minutes * 60_000).toISOString(),
};

// The webhook URL is the whole access control on a Cursor Automation, so print
// only enough to confirm the endpoint.
const target = new URL(url);
console.log(`POST ${target.origin}/…${url.slice(-4)}`);
console.log(`  title      ${body.title}`);
console.log(`  event_time ${body.event_time}  (${minutes} minutes out)`);
console.log(`  expecting  ${expectation}`);
if (write) {
  console.log(
    `\nThis title matches your filter, so the run will write to the configured\n` +
      `target. This command generates a new event_time each time, so repeating it\n` +
      `can create another project update. Run it once and inspect the result.`,
  );
}

const response = await fetch(url, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${bearer}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});
const text = await response.text();

console.log(`\n${response.status} ${response.statusText}`);
if (text) console.log(text.slice(0, 600));

if (response.status === 401 || response.status === 403) {
  console.error(
    '\nThe receiver rejected the token. Copy only the token, not the whole Authorization header.',
  );
  process.exit(1);
}
if (!response.ok) {
  console.error('\nThe receiver did not accept the delivery.');
  process.exit(1);
}
console.log(`\nDelivered. Open the run and confirm ${expectation}.`);
