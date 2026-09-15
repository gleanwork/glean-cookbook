#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'registry.json'), 'utf8'),
);

function fencedCommands(markdown) {
  return [
    ...markdown.matchAll(/^[ \t]*```bash\r?\n([\s\S]*?)^[ \t]*```/gmu),
  ].map(([, block]) => {
    const lines = block.replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n');
    const indents = lines
      .filter((line) => line.trim())
      .map((line) => /^ */u.exec(line)?.[0].length ?? 0);
    const indent = Math.min(...indents);
    return lines.map((line) => line.slice(indent)).join('\n');
  });
}

const failures = [];
for (const recipe of registry) {
  if (recipe.hidden || recipe.visibility === 'preview' || !recipe.steps)
    continue;
  const expected = [
    ...(recipe.steps ?? []),
    ...(recipe.codeAssets ?? []).flatMap((asset) => asset.steps ?? []),
  ]
    .filter((step) => step.command)
    .map((step) => step.command);
  const file = path.join(
    repoRoot,
    'plugin/shared/cookbook/skills',
    recipe.id,
    'SKILL.md',
  );
  const actual = fencedCommands(fs.readFileSync(file, 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push({ id: recipe.id, expected, actual });
  }
}

if (failures.length) {
  console.error('Generated recipe skill commands differ from authored steps:');
  for (const failure of failures) {
    console.error(`\n${failure.id}`);
    console.error(`expected: ${JSON.stringify(failure.expected)}`);
    console.error(`actual:   ${JSON.stringify(failure.actual)}`);
  }
  process.exit(1);
}

console.log('Generated public recipe skill commands match authored steps.');
