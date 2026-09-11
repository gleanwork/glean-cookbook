import assert from 'node:assert/strict';
import test from 'node:test';
import { humanizeStepCommands } from '../plugin/scripts/step-commands.mjs';

test('sequential steps enter the recipe directory once without mutating source', () => {
  const source = [
    { command: 'npx -y tiged@2.12.8 owner/repo/recipe demo' },
    { command: 'cd demo && npm install' },
    { title: 'Read the prerequisites' },
    { command: 'cd demo && npm run login' },
    { command: 'cd demo && npm start' },
  ];
  const original = structuredClone(source);
  assert.deepEqual(
    humanizeStepCommands(source).map((step) => step.command),
    [
      'npx -y tiged@2.12.8 owner/repo/recipe demo',
      'cd demo && npm install',
      undefined,
      'npm run login',
      'npm start',
    ],
  );
  assert.deepEqual(source, original);
});

test('each variant starts in its own directory', () => {
  const steps = [{ command: 'cd demo && npm install' }];
  assert.deepEqual(humanizeStepCommands(steps), steps);
  assert.deepEqual(humanizeStepCommands(steps), steps);
});

test('preserves different directories, quoted names, and subshells', () => {
  const steps = [
    { command: 'cd "my demo" && npm install' },
    { command: 'cd "my demo" && npm start' },
    { command: 'cd other && npm install' },
    { command: '(cd other && npm test)' },
  ];
  assert.deepEqual(
    humanizeStepCommands(steps).map((step) => step.command),
    [
      'cd "my demo" && npm install',
      'npm start',
      'cd other && npm install',
      '(cd other && npm test)',
    ],
  );
});
