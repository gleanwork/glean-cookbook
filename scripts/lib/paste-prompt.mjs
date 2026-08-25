/**
 * The paste a docs reader puts into Lovable or Replit lives in a four-backtick
 * `text` fence so inner ```ts / ```svg samples can sit inside it. recipe.json
 * names that file; the registry inlines the fence body as `pastePrompt`.
 */

const FENCE_OPEN = `${'`'.repeat(4)}text`;
const FENCE_CLOSE = '`'.repeat(4);

export function extractPastePrompt(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === FENCE_OPEN);
  if (start === -1) return null;
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === FENCE_CLOSE,
  );
  if (end === -1) return null;
  return lines.slice(start + 1, end).join('\n');
}
