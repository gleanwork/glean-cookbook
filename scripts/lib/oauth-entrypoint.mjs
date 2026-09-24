import path from 'node:path';

import fs from 'fs-extra';

import { readJsonc } from './jsonc.mjs';
import {
  LEGACY_LOGIN_WRAPPER_TARGETS,
  LEGACY_OAUTH_HELPER_TARGETS,
} from './legacy-recipe-patterns.mjs';

const OFFICIAL_LOGIN = /^glean-auth\s+login(?:\s|$)/u;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function packageJsonAt(repoRoot, target) {
  const packageFile = path.join(repoRoot, target, 'package.json');
  return fs.existsSync(packageFile) ? readJsonc(packageFile) : undefined;
}

/** A package script that still invokes the copied helper. */
export function legacyHelperScripts(packageJson) {
  return Object.entries(packageJson?.scripts ?? {}).filter(
    ([name, command]) =>
      ['login', 'configure'].includes(name) &&
      typeof command === 'string' &&
      command.includes('glean-auth.mjs'),
  );
}

/**
 * Official recipe-owned OAuth: the `login` script is the `glean-auth login`
 * CLI from an exact-pinned @gleanwork/auth dependency.
 */
export function hasOfficialOAuthLogin(repoRoot, target) {
  const packageJson = packageJsonAt(repoRoot, target);
  const login = packageJson?.scripts?.login;
  return (
    typeof login === 'string' &&
    OFFICIAL_LOGIN.test(login.trim()) &&
    EXACT_VERSION.test(packageJson.dependencies?.['@gleanwork/auth'] ?? '')
  );
}

/**
 * Recipe-owned OAuth: the official CLI, or a recipe-local login entry point
 * that exists and is on the shrinking legacy wrapper allowlist.
 */
export function hasRecipeOwnedOAuth(
  repoRoot,
  target,
  wrapperTargets = LEGACY_LOGIN_WRAPPER_TARGETS,
) {
  if (hasOfficialOAuthLogin(repoRoot, target)) return true;
  if (!Object.hasOwn(wrapperTargets, target)) return false;

  const login = packageJsonAt(repoRoot, target)?.scripts?.login;
  if (typeof login !== 'string' || login.includes('glean-auth.mjs')) {
    return false;
  }
  const entrypoint = login
    .split(/\s+/u)
    .find((argument) => /\.(?:[cm]?[jt]s|py)$/u.test(argument));
  return Boolean(
    entrypoint && fs.existsSync(path.join(repoRoot, target, entrypoint)),
  );
}

/** How an OAuth execution target signs in, or `undefined` if it is invalid. */
export function oauthEntrypointKind(
  repoRoot,
  target,
  {
    helperTargets = LEGACY_OAUTH_HELPER_TARGETS,
    wrapperTargets = LEGACY_LOGIN_WRAPPER_TARGETS,
  } = {},
) {
  if (hasOfficialOAuthLogin(repoRoot, target)) return 'official';
  if (Object.hasOwn(helperTargets, target)) return 'legacy-helper';
  if (hasRecipeOwnedOAuth(repoRoot, target, wrapperTargets)) {
    return 'legacy-wrapper';
  }
  return undefined;
}
