// Legacy recipe code that predates the reference pattern in CONTRIBUTING.md
// ("Reference recipes"). Every check that rejects a legacy pattern reads its
// exceptions from this one module.
//
// These lists only shrink. Remove an entry in the same PR that migrates the
// recipe (tracked on the Cookbook legacy-migration work); a stale entry is an
// error. Do not add entries: a new recipe follows the reference pattern, and
// an existing recipe must not regress into a pattern it does not already use.
// Each value is the one-line reason the directory is still allowed.

export const MODERN_PATTERN_HINT =
  'Use the modern pattern in CONTRIBUTING.md ("Reference recipes"): a `login` script running `glean-auth login` from pinned @gleanwork/auth, `createGleanTokenProvider` for SDK requests, GLEAN_API_TOKEN only as a non-interactive fallback, and Vitest + MSW tests.';

/**
 * Directories that still ship the copied `scripts/glean-auth.mjs` helper
 * generated from scripts/recipe-auth.mjs. `pnpm build:artifacts` keeps these
 * copies in sync and never adds new ones.
 */
export const LEGACY_OAUTH_HELPER_TARGETS = Object.freeze({
  'plugin/shared/cookbook':
    'resolve-backend.mjs imports its discovery; the plugin needs it without an installed recipe.',
  'recipes/a2a-client':
    'Python OAuth has no supported package path yet; setup runs the copied helper.',
  'recipes/company-answers/chat-api':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/company-answers/web-sdk':
    'configure script uses the copied helper to write VITE_GLEAN_BACKEND.',
  'recipes/customer-360/platform-agents':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/customer-360/platform-search-chat':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/github-pr-review-monitor':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/gong-call-follow-up-n8n':
    'resolve-backend.mjs imports the copied helper for backend discovery.',
  'recipes/multi-step-agent/invoke-agent':
    'Python OAuth has no supported package path yet; setup runs the copied helper.',
  'recipes/oncall-copilot':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/onboarding-hub/platform-chat':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/onboarding-hub/web-sdk':
    'configure script uses the copied helper to write VITE_GLEAN_BACKEND.',
  'recipes/permissions-aware-retrieval/python':
    'Python OAuth has no supported package path yet; setup runs the copied helper.',
  'recipes/permissions-aware-retrieval/typescript':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/pre-meeting-brief':
    'login script runs the copied helper and writes a static token to .env.',
  'recipes/rfp-responder':
    'login script runs the copied helper and writes a static token to .env.',
});

/**
 * Package directories whose `login` script is a recipe-owned wrapper around
 * the official CLI instead of `glean-auth login` itself.
 */
export const LEGACY_LOGIN_WRAPPER_TARGETS = Object.freeze({
  'recipes/import-skill-from-github':
    'scripts/login.mjs retries scopes for grant casing that @gleanwork/auth 1.0.0 fixed.',
  'recipes/skill-publishing-pipeline':
    'scripts/login.mjs retries scopes for grant casing that @gleanwork/auth 1.0.0 fixed.',
});

/**
 * OAuth execution targets that use the official CLI but still declare the
 * legacy `.env` contract (`configFile`/`backendVariable`) in recipe.json.
 */
export const LEGACY_ENV_CONFIG_TARGETS = Object.freeze({
  'recipes/customer-meeting-prep-trigger':
    'official CLI login, but setup and the trigger scripts still read GLEAN_SERVER_URL from .env via dotenv.',
  'recipes/triage-support-issue':
    'official CLI login, but the scripts still read GLEAN_SERVER_URL from .env via dotenv.',
});

/**
 * Code-pattern exceptions, keyed by rule id (see check-recipe-code-patterns).
 * The OAuth helper rule reads LEGACY_OAUTH_HELPER_TARGETS instead.
 */
const STATIC_TOKEN =
  'SDK receives the static token the copied helper wrote to .env.';
const DOTENV = 'loads the legacy .env contract with dotenv.';
const NODE_TEST = 'TypeScript tests run with node --import tsx --test.';
const NO_VITEST_NODE_TEST = 'tests run with node --test instead of Vitest.';

export const LEGACY_CODE_PATTERN_TARGETS = Object.freeze({
  'static-api-token': Object.freeze({
    'recipes/company-answers/chat-api': STATIC_TOKEN,
    'recipes/customer-360/platform-agents': STATIC_TOKEN,
    'recipes/customer-360/platform-search-chat': STATIC_TOKEN,
    'recipes/onboarding-hub/platform-chat': STATIC_TOKEN,
    'recipes/oncall-copilot': STATIC_TOKEN,
    'recipes/permissions-aware-retrieval/typescript': STATIC_TOKEN,
    'recipes/rfp-responder': STATIC_TOKEN,
  }),
  'env-file-parsing': Object.freeze({
    'recipes/company-answers/chat-api': DOTENV,
    'recipes/customer-360/platform-agents': DOTENV,
    'recipes/customer-360/platform-search-chat': DOTENV,
    'recipes/customer-meeting-prep-trigger': DOTENV,
    'recipes/github-pr-review-monitor':
      'lib/config.mjs parses the legacy .env contract by hand.',
    'recipes/import-skill-from-github':
      'src/client.ts parses .env by hand instead of loadEnvFile.',
    'recipes/onboarding-hub/platform-chat': DOTENV,
    'recipes/oncall-copilot': DOTENV,
    'recipes/permissions-aware-retrieval/typescript': DOTENV,
    'recipes/pre-meeting-brief':
      'lib/config.mjs parses the legacy .env contract by hand.',
    'recipes/rfp-responder': DOTENV,
    'recipes/skill-publishing-pipeline':
      'src/client.ts parses .env by hand instead of loadEnvFile.',
    'recipes/triage-support-issue': DOTENV,
  }),
  'node-test-runner': Object.freeze({
    'recipes/company-answers/chat-api': NODE_TEST,
    'recipes/customer-360/platform-search-chat': NODE_TEST,
    'recipes/onboarding-hub/platform-chat': NODE_TEST,
    'recipes/oncall-copilot': NODE_TEST,
    'recipes/rfp-responder': NODE_TEST,
  }),
  'missing-vitest': Object.freeze({
    'recipes/company-answers/chat-api': NO_VITEST_NODE_TEST,
    'recipes/company-answers/web-sdk':
      'browser UI package with typecheck/build only; no test script.',
    'recipes/customer-360/platform-agents': 'no test script.',
    'recipes/customer-360/platform-search-chat': NO_VITEST_NODE_TEST,
    'recipes/onboarding-hub/platform-chat': NO_VITEST_NODE_TEST,
    'recipes/onboarding-hub/web-sdk':
      'browser UI package with typecheck/build only; no test script.',
    'recipes/oncall-copilot': NO_VITEST_NODE_TEST,
    'recipes/permissions-aware-retrieval/typescript':
      'check runs lint and typecheck only; no test script.',
    'recipes/rfp-responder': NO_VITEST_NODE_TEST,
  }),
});

/**
 * Files that look like recipe code but are not a runnable package: the
 * pattern checks skip them entirely.
 */
export const NON_CODE_EXAMPLE_FILES = Object.freeze({
  'recipes/no-code-it-helpdesk-lovable/example-snippet.ts':
    'Illustrative server-side snippet for a hosted builder; not a runnable recipe package.',
  'recipes/no-code-pto-lookup-replit/example-snippet.ts':
    'Illustrative server-side snippet for a hosted builder; not a runnable recipe package.',
});

export function isAllowlisted(list, directory) {
  return Object.hasOwn(list, directory);
}
