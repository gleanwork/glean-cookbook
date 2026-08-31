import path from 'node:path';

import fs from 'fs-extra';

import { readJsonc } from './jsonc.mjs';

export function hasRecipeOwnedOAuth(repoRoot, target) {
  const packageFile = path.join(repoRoot, target, 'package.json');
  if (!fs.existsSync(packageFile)) return false;

  const packageJson = readJsonc(packageFile);
  const login = packageJson.scripts?.login;
  if (typeof login !== 'string' || login.includes('glean-auth.mjs')) {
    return false;
  }

  if (/(?:^|\s)glean-auth\s+login(?:\s|$)/u.test(login)) {
    return typeof packageJson.dependencies?.['@gleanwork/auth'] === 'string';
  }

  const entrypoint = login
    .split(/\s+/u)
    .find((argument) => /\.(?:[cm]?[jt]s|py)$/u.test(argument));
  return Boolean(
    entrypoint && fs.existsSync(path.join(repoRoot, target, entrypoint)),
  );
}
