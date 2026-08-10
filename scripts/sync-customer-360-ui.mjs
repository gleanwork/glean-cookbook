#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(
  repoRoot,
  'recipes/customer-360/shared/index.html',
);
const targetPaths = [
  'recipes/customer-360/platform-search-chat/public/index.html',
  'recipes/customer-360/platform-agents/public/index.html',
].map((target) => path.join(repoRoot, target));

const source = fs.readFileSync(sourcePath, 'utf8');
const check = process.argv.includes('--check');
let stale = false;

for (const targetPath of targetPaths) {
  const current = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, 'utf8')
    : '';
  if (current === source) continue;
  if (check) {
    stale = true;
    console.error(
      `${path.relative(repoRoot, targetPath)} is not generated from the shared Customer 360 UI.`,
    );
    continue;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, source);
  console.log(`Synced ${path.relative(repoRoot, targetPath)}`);
}

if (stale) {
  console.error(
    'Run npm run customer-360-ui:sync and commit the generated files.',
  );
  process.exit(1);
}

if (check) console.log('Customer 360 variants share the canonical frontend.');
