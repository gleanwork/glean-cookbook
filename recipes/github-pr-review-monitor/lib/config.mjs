import fs from 'node:fs';
import path from 'node:path';

export const recipeRoot = path.resolve(import.meta.dirname, '..');

const ASSIGNMENT = /^([A-Z][A-Z0-9_]*)=(.*)$/u;

/**
 * One `KEY=value` line, or null for anything else. Surrounding quotes are
 * stripped: every dotenv strips them, so people write them, and keeping them
 * turns a token into one with literal quotes and a confusing 401.
 */
function parseLine(line) {
  const match = line.match(ASSIGNMENT);
  if (!match) return null;
  const [, key, raw] = match;
  const trimmed = raw.trim();
  const quoted = /^(["'])(.*)\1$/su.exec(trimmed);
  return { key, value: quoted ? quoted[2] : trimmed };
}

function lines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/u);
}

export function readEnv(file = path.join(recipeRoot, '.env')) {
  const values = {};
  for (const line of lines(file)) {
    const entry = parseLine(line);
    if (entry) values[entry.key] = entry.value;
  }
  return values;
}

/**
 * Loads `.env` without clobbering the environment. Precedence stays; the silence
 * does not — a stale exported token otherwise surfaces as a 401 about a value
 * you never chose. An empty `.env` value shadows nothing, so it never warns.
 */
export function loadEnv(file = path.join(recipeRoot, '.env')) {
  const shadowed = [];
  for (const [key, value] of Object.entries(readEnv(file))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    } else if (value !== '' && process.env[key] !== value) {
      shadowed.push(key);
    }
  }
  if (shadowed.length > 0) {
    console.warn(
      `Using the environment, not .env, for: ${shadowed.join(', ')}.\n` +
        `  Unset them to use .env — e.g. env -u ${shadowed[0]} npm run setup`,
    );
  }
}

export function stateDir() {
  const configured = process.env.GLEAN_REVIEW_STATE_DIR || '.data';
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(recipeRoot, configured);
}

export function withoutTrigger(target, idsValue = '', secretsValue = '') {
  const ids = idsValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const secrets = secretsValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const index = ids.indexOf(target);
  if (index === -1) return null;
  ids.splice(index, 1);
  secrets.splice(index, 1);
  return {
    GLEAN_TRIGGER_IDS: ids.join(','),
    GLEAN_WEBHOOK_SECRETS: secrets.join(','),
  };
}

/**
 * Updates keys in place and appends the rest, leaving every other line alone —
 * rebuilding from parsed pairs would delete the comments people copied in from
 * `.env.example`.
 */
export function writeEnv(updates, file = path.join(recipeRoot, '.env')) {
  const pending = new Map(Object.entries(updates));
  const out = lines(file).map((line) => {
    const entry = parseLine(line);
    if (!entry || !pending.has(entry.key)) return line;
    const value = pending.get(entry.key);
    pending.delete(entry.key);
    return `${entry.key}=${value}`;
  });
  // Drop the trailing blank so new keys don't land after it.
  while (out.length > 0 && out.at(-1) === '') out.pop();
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  fs.writeFileSync(file, `${out.join('\n')}\n`, { mode: 0o600 });
}
