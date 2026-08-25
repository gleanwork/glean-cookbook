import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { extractPastePrompt } from './paste-prompt.mjs';

test('extracts the four-backtick text fence and ignores inner samples', () => {
  const markdown = [
    '# Title',
    '',
    '````text',
    'Paste me',
    '',
    '```ts',
    'const x = 1;',
    '```',
    '',
    'still in the paste',
    '````',
    '',
    'not copied',
    '',
  ].join('\n');

  assert.equal(
    extractPastePrompt(markdown),
    [
      'Paste me',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      'still in the paste',
    ].join('\n'),
  );
});

test('reads the shipped Lovable and Replit prompts', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..');
  for (const rel of [
    'recipes/no-code-it-helpdesk-lovable/lovable-prompt.md',
    'recipes/no-code-pto-lookup-replit/replit-agent-prompt.md',
  ]) {
    const body = extractPastePrompt(
      fs.readFileSync(path.join(repoRoot, rel), 'utf8'),
    );
    assert.ok(body, `${rel} is missing its text fence`);
    assert.match(body, /<your-glean-instance>/);
    assert.doesNotMatch(body, /^# /m);
  }
});
