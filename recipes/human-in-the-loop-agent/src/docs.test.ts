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

test('each step description is short enough to scan as one paragraph', () => {
  // The page has no lists inside a step, so a long step becomes a wall of
  // text. Split it into more steps instead.
  const visible = (text: string) => text.replace(/\*\*|`/g, '');
  for (const step of recipe.steps) {
    expect(visible(step.description ?? '').length).toBeLessThanOrEqual(450);
  }
});

test('bold marks in step descriptions come in pairs', () => {
  // An unpaired ** renders as literal asterisks on the page.
  for (const step of recipe.steps) {
    const outsideCode = (step.description ?? '').replace(/`[^`]+`/g, '');
    expect((outsideCode.match(/\*\*/g) ?? []).length % 2).toBe(0);
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
