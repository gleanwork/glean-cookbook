import fs from 'node:fs/promises';
import path from 'node:path';

// The embedded widgets require a user-controlled browser session. This module
// checks the shipped integration contract, then records the live browser work
// as skipped instead of pretending a server-side Chat API call verifies it.
export const sideEffects = 'read-only';
export const requiredEnv = [];

const REQUIRED_SOURCE_MARKERS = [
  "authMethod: 'sso'",
  'renderSearchBox',
  'renderSearchResults',
  'renderChat',
];

export async function setup({ repoRoot }) {
  const sourcePaths = ['main.tsx'].map((file) =>
    path.join(repoRoot, 'recipes', 'embed-search-chat', 'react', 'src', file),
  );
  const source = (
    await Promise.all(sourcePaths.map((file) => fs.readFile(file, 'utf8')))
  ).join('\n');
  const missing = REQUIRED_SOURCE_MARKERS.filter(
    (marker) => !source.includes(marker),
  );
  if (missing.length > 0) {
    throw new Error(
      `React Web SDK example is missing required integration markers: ${missing.join(', ')}`,
    );
  }
  return { sourcePaths };
}

export async function run(query) {
  return {
    skip:
      `The shipped Search and Chat widgets require a live signed-in Glean browser session for “${query}”. ` +
      'Run the React example in SSO mode, verify citations, and repeat with a second authorized user to confirm the per-user boundary. The local package check validates lint, types, and the production bundle; it cannot substitute for those live checks.',
  };
}
