import fs from 'node:fs';
import { expect, test } from 'vitest';
import { SCOPES } from './client.js';

const read = (name: string) =>
  fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const recipe = JSON.parse(read('recipe.json')) as {
  requiredScopes: string[];
  execution: { auth: { scopes: string[] }[]; run: { command: string } };
  steps: { description?: string; command?: string }[];
};
const readme = read('README.md');
// Fenced text blocks, with any list indentation removed.
const textBlocks = (source: string) =>
  [...source.matchAll(/^( *)```text\n([\s\S]*?)\n *```/gm)].map(
    ([, indent = '', block = '']) =>
      block.replace(new RegExp(`^ {0,${indent.length}}`, 'gm'), ''),
  );

test('the page and README give the same agent instructions', () => {
  const pageInstructions = recipe.steps
    .flatMap((step) => textBlocks(step.description ?? ''))
    .filter((block) =>
      block.startsWith('You send the user a Slack direct message.'),
    );
  const readmeInstructions = textBlocks(readme).filter((block) =>
    block.startsWith('You send the user a Slack direct message.'),
  );
  expect(pageInstructions).toHaveLength(1);
  expect(readmeInstructions).toEqual(pageInstructions);
});

test('every declared scope matches the scope the client requests', () => {
  expect(recipe.requiredScopes).toEqual(SCOPES);
  expect(recipe.execution.auth[0]?.scopes).toEqual(SCOPES);
  expect(JSON.stringify(recipe) + readme).not.toMatch(
    /agents\.(run|write|read)/,
  );
});

test('the run command on the page is the one in the README', () => {
  expect(readme).toContain(recipe.execution.run.command);
});
