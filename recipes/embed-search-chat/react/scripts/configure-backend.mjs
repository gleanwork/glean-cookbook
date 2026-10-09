#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const DISCOVERY_URL = 'https://app.glean.com/config/search';

function fail(message) {
  throw new Error(message);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    fail(
      `${init?.method ?? 'GET'} ${url} -> ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${url} returned invalid JSON.`);
  }
}

export async function discoverBackend(email, request = requestJson) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    fail('Enter a valid work email address.');
  }

  const config = await request(DISCOVERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  });
  const queryURL = config?.search_config?.queryURL;
  if (typeof queryURL !== 'string') {
    fail('Glean tenant discovery returned no search_config.queryURL.');
  }

  let hostname;
  try {
    hostname = new URL(queryURL).hostname.toLowerCase();
  } catch {
    fail('Glean tenant discovery returned an invalid queryURL.');
  }

  // Discovery returns either the backend host already (`acme-be.glean.com`) or
  // the legacy frontend one (`acme.askscio.com`).
  const match = hostname.match(
    /^([a-z0-9-]+?)(-be)?\.(?:glean\.com|askscio\.com)$/u,
  );
  if (!match || match[1] === 'app') {
    fail(
      `No customer Glean tenant was found for ${normalized}. Check the email and try again.`,
    );
  }

  const instance = match[1];
  return { instance, backend: `https://${instance}-be.glean.com` };
}

export function updateEnvFile(file, values) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pending = new Map(Object.entries(values));
  const lines = existing.split('\n').map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/u);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  while (lines.at(-1) === '') lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function argument(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (command !== 'configure') {
    fail(
      'Usage: npm run configure -- --email "you@company.com" [--config-file .env.local] [--backend-variable VITE_GLEAN_BACKEND]',
    );
  }

  const email = argument(args, '--email');
  if (!email)
    fail('Pass --email "you@company.com" to resolve the tenant backend.');

  const configFile = argument(args, '--config-file') ?? '.env.local';
  const backendVariable =
    argument(args, '--backend-variable') ?? 'VITE_GLEAN_BACKEND';
  const { backend } = await discoverBackend(email);
  // Start from the template so the file lists every setting the next step fills in.
  if (!fs.existsSync(configFile) && fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', configFile);
  }
  updateEnvFile(configFile, { [backendVariable]: backend });
  console.log(`Configured ${configFile} for ${new URL(backend).host}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
