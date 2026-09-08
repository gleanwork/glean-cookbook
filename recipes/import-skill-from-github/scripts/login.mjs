#!/usr/bin/env node

import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isRecognizedScopeGrantFailure } from './login-policy.mjs';

const forwarded = process.argv.slice(2);
const scopeModeFile = new URL('../.glean-scope-mode', import.meta.url);

function login(scopes) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'glean-auth',
      ['login', '--scopes', scopes.join(','), ...forwarded],
      { stdio: ['inherit', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

const native = await login(['skills:read', 'skills:write']);
if (native.code === 0) {
  await fs.writeFile(scopeModeFile, 'native\n', { mode: 0o600 });
  process.exit(0);
}

if (!isRecognizedScopeGrantFailure(native.output)) {
  console.error(
    '\nNative Skills authorization failed for a reason other than scope availability. Legacy fallback was not attempted.',
  );
  process.exit(native.code);
}

console.error(
  '\nThis tenant did not grant the native Skills scopes. Retrying once with the legacy SKILLS compatibility scope.',
);
const legacy = await login(['SKILLS']);
if (legacy.code === 0) {
  await fs.writeFile(scopeModeFile, 'legacy\n', { mode: 0o600 });
}
process.exit(legacy.code);
