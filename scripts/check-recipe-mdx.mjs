#!/usr/bin/env node

// Recipe prose is rendered into MDX on the dev site, where a bare `<word>` is an
// unclosed JSX tag and fails the build. Backticks make it inline code instead.
// Only prose fields are checked: `steps[].command` renders inside a fence, where
// nothing is parsed as a tag.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readJsonc } from './lib/jsonc.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');

// Rendered as prose by the site's recipe page.
const PROSE_FIELDS = ['description', 'content', 'combines', 'architecture'];

const TAG_LIKE = /<([A-Za-z][A-Za-z0-9._-]*)>/g;

/** Prose with inline-code spans removed — what MDX will try to parse as markup. */
function outsideCode(text) {
  return text.replace(/`[^`]*`/gu, '');
}

function* stringsIn(value, trail) {
  if (typeof value === 'string') yield [trail, value];
  else if (Array.isArray(value)) {
    for (const [i, item] of value.entries())
      yield* stringsIn(item, `${trail}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value))
      yield* stringsIn(item, `${trail}.${key}`);
  }
}

export function mdxProblems(recipe) {
  const found = [];
  for (const field of PROSE_FIELDS) {
    if (!(field in recipe)) continue;
    for (const [where, text] of stringsIn(recipe[field], field)) {
      for (const [tag] of outsideCode(text).matchAll(TAG_LIKE)) {
        found.push(
          `${recipe.id} ${where}: ${tag} is bare in prose, so MDX reads it as an ` +
            `unclosed JSX tag and the site build fails. Wrap it in backticks.`,
        );
      }
    }
  }
  return found;
}

function main() {
  const errors = [];
  let checked = 0;
  for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(recipesRoot, entry.name, 'recipe.json');
    if (!fs.existsSync(file)) continue;
    checked += 1;
    errors.push(...mdxProblems(readJsonc(file)));
  }

  if (errors.length > 0) {
    console.error('Recipe prose that will not compile as MDX:\n');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Recipe prose renders as MDX (${checked} recipes).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
