import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads a file that a recipe's metadata names by a path relative to its own
 * directory. The path, and whatever it resolves to through symlinks, must stay
 * inside that directory, and the file must be non-empty text within the size
 * limit. `label` names the field in error messages, such as "code walkthrough".
 */
export function readRecipeSource(
  entry,
  recipeDir,
  source,
  { label, maxBytes },
) {
  const fail = (message) => {
    throw new Error(`${entry.id}: ${message}`);
  };
  const recipeRoot = fs.realpathSync(recipeDir);
  const outside = (relative) =>
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

  const candidate = path.resolve(recipeRoot, source);
  const relative = path.relative(recipeRoot, candidate);
  if (relative === '' || outside(relative)) {
    fail(`${label} source must stay inside recipes/${entry.id}: ${source}`);
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    fail(`${label} source does not exist: ${source}`);
  }

  const sourceFile = fs.realpathSync(candidate);
  if (outside(path.relative(recipeRoot, sourceFile))) {
    fail(`${label} source resolves outside recipes/${entry.id}: ${source}`);
  }

  const buffer = fs.readFileSync(sourceFile);
  if (buffer.length === 0) fail(`${label} source is empty: ${source}`);
  if (buffer.length > maxBytes) {
    fail(`${label} source exceeds ${maxBytes} bytes: ${source}`);
  }
  if (buffer.includes(0)) fail(`${label} source must be text: ${source}`);

  return { sourceFile, text: buffer.toString('utf8') };
}
