import path from 'node:path';

import fg from 'fast-glob';

import { readJsonc } from './jsonc.mjs';
import {
  LEGACY_ENV_CONFIG_TARGETS,
  LEGACY_LOGIN_WRAPPER_TARGETS,
  LEGACY_OAUTH_HELPER_TARGETS,
  MODERN_PATTERN_HINT,
} from './legacy-recipe-patterns.mjs';
import {
  legacyHelperScripts,
  oauthEntrypointKind,
} from './oauth-entrypoint.mjs';

// `npm run login`, optionally from `cd <dir> &&`, then any arguments.
const MODERN_SETUP =
  /^(?:cd\s+(?:"[^"]+"|'[^']+'|[^\s&;|]+)\s*&&\s*)?npm run login(?:\s|$)/u;

const DEFAULT_ALLOWLISTS = {
  helperTargets: LEGACY_OAUTH_HELPER_TARGETS,
  wrapperTargets: LEGACY_LOGIN_WRAPPER_TARGETS,
  envConfigTargets: LEGACY_ENV_CONFIG_TARGETS,
};

/**
 * Errors for one `oauth-with-token-fallback` auth entry whose execution runs
 * from `target`. Legacy forms are accepted only for allowlisted targets.
 */
export function oauthAuthErrors({
  repoRoot,
  target,
  auth,
  allowlists = DEFAULT_ALLOWLISTS,
}) {
  const { helperTargets, wrapperTargets, envConfigTargets } = {
    ...DEFAULT_ALLOWLISTS,
    ...allowlists,
  };
  const setup = auth.setupCommand?.trim() ?? '';
  const kind = oauthEntrypointKind(repoRoot, target, {
    helperTargets,
    wrapperTargets,
  });

  if (!kind) {
    return [
      `${target} declares OAuth but has no \`login\` script running \`glean-auth login\` from a pinned @gleanwork/auth. ${MODERN_PATTERN_HINT}`,
    ];
  }
  if (kind === 'legacy-helper') {
    return /\b(?:npm run login|glean-auth\.mjs login)\b/u.test(setup)
      ? []
      : ['OAuth auth has no shipped login command'];
  }

  const errors = [];
  if (!MODERN_SETUP.test(setup)) {
    errors.push(
      `OAuth setupCommand must be \`npm run login\` (optionally after \`cd <dir> &&\`), not ${JSON.stringify(setup)}`,
    );
  }
  if (
    (auth.configFile || auth.backendVariable) &&
    !Object.hasOwn(envConfigTargets, target)
  ) {
    errors.push(
      `OAuth auth declares the legacy .env contract (configFile/backendVariable); @gleanwork/auth keeps credentials in its own store. Declare only scopes, setupCommand, and credentialVariable. ${MODERN_PATTERN_HINT}`,
    );
  }
  return errors;
}

/** Package scripts that call the copied helper outside its allowlist. */
export function legacyHelperScriptErrors({
  repoRoot,
  helperTargets = LEGACY_OAUTH_HELPER_TARGETS,
}) {
  const errors = [];
  for (const file of fg.sync('recipes/**/package.json', {
    cwd: repoRoot,
    ignore: ['**/node_modules/**'],
  })) {
    const directory = path.posix.dirname(file);
    if (Object.hasOwn(helperTargets, directory)) continue;
    const packageJson = readJsonc(path.join(repoRoot, file));
    for (const [name, command] of legacyHelperScripts(packageJson)) {
      errors.push(
        `${directory}: package.json \`${name}\` runs the legacy copied helper (${command}). ${MODERN_PATTERN_HINT}`,
      );
    }
  }
  return errors;
}
