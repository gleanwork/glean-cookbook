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

test('the page and README both point at the shipped agent instructions', () => {
  expect(read('agent-instructions.txt')).toMatch(
    /^You send the user a Slack direct message\./,
  );
  const print = 'cat agent-instructions.txt';
  expect(recipe.steps.map((step) => step.command)).toContain(print);
  expect(readme).toContain(print);
});

test('step descriptions stay inline text the page can render', () => {
  // The page renders a step description as one paragraph, so a fenced block
  // shows up as stray backticks. Put copyable text in a command or a file.
  for (const step of recipe.steps) {
    expect(step.description ?? '').not.toContain('```');
  }
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
