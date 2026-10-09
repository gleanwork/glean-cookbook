import assert from 'node:assert/strict';
import test from 'node:test';

import { executionCommandErrors } from './execution-commands.mjs';

const steps = [
  { command: 'npx -y tiged@2.12.8 owner/repo/recipe demo' },
  { command: 'cd demo && npm install' },
  { command: 'npm run login -- --email "<work-email>"' },
  { command: 'npm start' },
];

test('accepts execution commands that are step commands', () => {
  assert.deepEqual(
    executionCommandErrors(
      {
        auth: [{ setupCommand: 'npm run login -- --email "<work-email>"' }],
        run: { command: 'npm start' },
      },
      steps,
    ),
    [],
  );
});

test('rejects an execution command that re-enters the project', () => {
  assert.deepEqual(
    executionCommandErrors(
      {
        auth: [
          {
            setupCommand: 'cd demo && npm run login -- --email "<work-email>"',
          },
        ],
        verification: { command: 'cd demo && npm start' },
      },
      steps,
    ),
    [
      'auth[0].setupCommand must be the exact command of one of its steps: cd demo && npm run login -- --email "<work-email>"',
      'verification.command must be the exact command of one of its steps: cd demo && npm start',
    ],
  );
});

test('ignores step lists that do not download a project', () => {
  assert.deepEqual(
    executionCommandErrors({ auth: [{ setupCommand: '/plugin install x' }] }, [
      { command: 'claude plugin install x' },
    ]),
    [],
  );
});
