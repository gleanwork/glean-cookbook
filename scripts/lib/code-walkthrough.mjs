import fs from 'node:fs';
import path from 'node:path';

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

  const recipeRoot = fs.realpathSync(recipeDir);
  const examples = entry.codeWalkthrough.examples.map((example) => {
    if (example.code !== undefined) {
      fail(
        entry,
        'codeWalkthrough.examples[].code is generated; set source instead',
      );
    }

    const candidate = path.resolve(recipeRoot, example.source);
    const relative = path.relative(recipeRoot, candidate);
    if (
      relative === '' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      fail(
        entry,
        `code walkthrough source must stay inside recipes/${entry.id}: ${example.source}`,
      );
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      fail(entry, `code walkthrough source does not exist: ${example.source}`);
    }

    const sourceFile = fs.realpathSync(candidate);
    const realRelative = path.relative(recipeRoot, sourceFile);
    if (
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      fail(
        entry,
        `code walkthrough source resolves outside recipes/${entry.id}: ${example.source}`,
      );
    }

    const allowedExtensions = LANGUAGE_EXTENSIONS[example.language];
    const extension = path.extname(sourceFile).toLowerCase();
    if (!allowedExtensions?.has(extension)) {
      fail(
        entry,
        `${example.source} does not match walkthrough language ${example.language}`,
      );
    }

    const buffer = fs.readFileSync(sourceFile);
    if (buffer.length === 0) {
      fail(entry, `code walkthrough source is empty: ${example.source}`);
    }
    if (buffer.length > MAX_WALKTHROUGH_CODE_BYTES) {
      fail(
        entry,
        `code walkthrough source exceeds ${MAX_WALKTHROUGH_CODE_BYTES} bytes: ${example.source}`,
      );
    }
    if (buffer.includes(0)) {
      fail(entry, `code walkthrough source must be text: ${example.source}`);
    }

    return { ...example, code: buffer.toString('utf8') };
  });

  return {
    ...entry,
    codeWalkthrough: { ...entry.codeWalkthrough, examples },
  };
}
