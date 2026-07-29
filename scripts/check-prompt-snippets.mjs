#!/usr/bin/env node
// Verifies embedded code samples in the no-code prompt templates against
// their checked, typechecked source files.
//
// markdown-code can't do this job here: both prompt templates wrap their
// entire body in one outer ````text fence (so the whole thing pastes as a
// single literal block into Lovable/Replit), and CommonMark treats content
// inside a fence as opaque — the nested ```ts blocks are invisible to any
// fence-aware markdown parser, markdown-code's included. This script does a
// narrower, direct comparison instead: extract each labeled ```ts block by
// text position, dedent it, and diff it against the matching line range of
// the recipe's own example-snippet.ts.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  {
    mdFile: 'recipes/no-code-it-helpdesk-lovable/lovable-prompt.md',
    sourceFile: 'recipes/no-code-it-helpdesk-lovable/example-snippet.ts',
    blocks: [
      { startLine: 1, endLine: 6 },
      { startLine: 8, endLine: 30 },
    ],
  },
  {
    mdFile: 'recipes/no-code-pto-lookup-replit/replit-agent-prompt.md',
    sourceFile: 'recipes/no-code-pto-lookup-replit/example-snippet.ts',
    blocks: [
      { startLine: 1, endLine: 6 },
      { startLine: 8, endLine: 30 },
    ],
  },
];

function extractTsBlocks(markdown) {
  const blockRegex = /^([ \t]*)```ts\n([\s\S]*?)\n\1```$/gm;
  const blocks = [];
  for (const match of markdown.matchAll(blockRegex)) {
    const [, indent, rawContent] = match;
    const dedented = rawContent
      .split('\n')
      .map((line) =>
        line.startsWith(indent) ? line.slice(indent.length) : line,
      )
      .join('\n');
    blocks.push(dedented);
  }
  return blocks;
}

function extractSourceLines(source, startLine, endLine) {
  return source
    .split('\n')
    .slice(startLine - 1, endLine)
    .join('\n');
}

let failed = false;

for (const check of CHECKS) {
  const markdown = await readFile(resolve(repoRoot, check.mdFile), 'utf8');
  const source = await readFile(resolve(repoRoot, check.sourceFile), 'utf8');
  const tsBlocks = extractTsBlocks(markdown);

  if (tsBlocks.length !== check.blocks.length) {
    failed = true;
    console.error(
      `${check.mdFile}: expected ${check.blocks.length} \`\`\`ts block(s), found ${tsBlocks.length}`,
    );
    continue;
  }

  check.blocks.forEach(({ startLine, endLine }, i) => {
    const expected = extractSourceLines(source, startLine, endLine);
    const actual = tsBlocks[i];
    if (actual !== expected) {
      failed = true;
      console.error(
        `${check.mdFile}: block ${i + 1} is out of sync with ${check.sourceFile}#L${startLine}-L${endLine}`,
      );
      console.error('--- expected (from source file) ---');
      console.error(expected);
      console.error('--- actual (in markdown) ---');
      console.error(actual);
    }
  });
}

if (failed) {
  console.error('\nprompt snippets out of sync — see above.');
  process.exit(1);
}

console.log('Prompt template snippets match their source files.');
