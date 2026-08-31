#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import fs from 'fs-extra';

import { installScriptPolicyErrors } from './lib/install-script-policy.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const lockfiles = await fg(
  ['recipes/**/package-lock.json', 'examples/**/package-lock.json'],
  { cwd: repoRoot, onlyFiles: true },
);
const failures = [];

for (const relativeLockfile of lockfiles.sort()) {
  const directory = path.dirname(relativeLockfile);
  const packageFile = path.join(repoRoot, directory, 'package.json');
  if (!(await fs.pathExists(packageFile))) {
    failures.push(`${relativeLockfile}: matching package.json is missing.`);
    continue;
  }

  const [packageJson, lockfile] = await Promise.all([
    fs.readJson(packageFile),
    fs.readJson(path.join(repoRoot, relativeLockfile)),
  ]);
  for (const error of installScriptPolicyErrors(packageJson, lockfile)) {
    failures.push(`${path.relative(repoRoot, packageFile)}: ${error}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error(
    '\nReview pending dependencies with npm approve-scripts --allow-scripts-pending, then explicitly approve or deny each one.',
  );
  process.exitCode = 1;
} else {
  console.log(
    `Install-script policies cover every dependency in ${lockfiles.length} npm lockfile(s).`,
  );
}
