import path from 'node:path';

import { readRecipeSource } from './recipe-source.mjs';

export const MAX_WALKTHROUGH_CODE_BYTES = 30_000;

const LANGUAGE_EXTENSIONS = {
  typescript: new Set(['.ts', '.tsx', '.mts', '.cts']),
  javascript: new Set(['.js', '.jsx', '.mjs', '.cjs']),
  python: new Set(['.py']),
  go: new Set(['.go']),
  java: new Set(['.java']),
};

function fail(entry, message) {
  throw new Error(`${entry.id}: ${message}`);
}

/**
 * Materializes source-backed examples into the generated registry. The recipe
 * JSON owns only paths and explanatory metadata; displayed code always comes
 * from a real file inside that recipe's directory.
 */
export function materializeCodeWalkthrough(entry, recipeDir) {
  if (!entry.codeWalkthrough) return entry;

  const examples = entry.codeWalkthrough.examples.map((example) => {
    if (example.code !== undefined) {
      fail(
        entry,
        'codeWalkthrough.examples[].code is generated; set source instead',
      );
    }

    const { sourceFile, text } = readRecipeSource(
      entry,
      recipeDir,
      example.source,
      { label: 'code walkthrough', maxBytes: MAX_WALKTHROUGH_CODE_BYTES },
    );

    const allowedExtensions = LANGUAGE_EXTENSIONS[example.language];
    const extension = path.extname(sourceFile).toLowerCase();
    if (!allowedExtensions?.has(extension)) {
      fail(
        entry,
        `${example.source} does not match walkthrough language ${example.language}`,
      );
    }

    return { ...example, code: text };
  });

  return {
    ...entry,
    codeWalkthrough: { ...entry.codeWalkthrough, examples },
  };
}
