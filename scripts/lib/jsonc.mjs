import fs from 'node:fs';

/**
 * JSON.parse that ignores // and block comments. recipe.json stays JSON;
 * line comments hold restore-later notes that must not reach registry.json
 * or the docs site.
 */
export function parseJsonc(text) {
  return JSON.parse(stripJsonComments(text));
}

export function readJsonc(file) {
  return parseJsonc(fs.readFileSync(file, 'utf8'));
}

function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      i += 1;
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i += 1;
      }
      i += 1;
      continue;
    }
    out += char;
  }
  return out;
}
