// The secret-question rule is a heuristic over prose. These cases pin both
// directions so a loosened pattern fails here rather than in CI output.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allQuestions,
  asksForSecretValue,
  checkRecipe,
} from './check-recipe-questions.mjs';

test('asking for a credential value is caught however it is phrased', () => {
  for (const prompt of [
    'What is your Cursor API key?',
    'Which API token should the automation use? Paste it here.',
    'Where is your webhook secret? Paste the value.',
    'Paste your Cursor bearer token.',
    'Enter the client secret from the app settings.',
    'What password protects the endpoint?',
  ]) {
    assert.equal(asksForSecretValue(prompt), true, prompt);
  }
});

test('asking about a credential’s shape stays allowed', () => {
  for (const prompt of [
    'Which header does the webhook expect to carry the token?',
    'Which scopes should the API token carry?',
    'What kind of credential does your tenant issue?',
    'What is your work email? It is used once to discover your Glean tenant.',
    'Which Slack channel id should the heads-up go to?',
  ]) {
    assert.equal(asksForSecretValue(prompt), false, prompt);
  }
});

test('questions declared under a codeAsset are checked too', () => {
  const recipe = {
    id: 'example',
    execution: {
      questions: [{ id: 'email', prompt: 'What is your work email?' }],
    },
    codeAssets: [
      {
        repoPath: 'recipes/example',
        execution: {
          questions: [{ id: 'token', prompt: 'What is your API token?' }],
        },
      },
    ],
  };
  assert.deepEqual(
    allQuestions(recipe).map(([where]) => where),
    ['execution', 'codeAssets[0].execution'],
  );
  const errors = checkRecipe(recipe);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /codeAssets\[0\]\.execution question "token"/u);
});

test('a command interpolating a placeholder no question supplies is caught', () => {
  const errors = checkRecipe({
    id: 'example',
    execution: { questions: [{ id: 'email', prompt: 'Your work email?' }] },
    steps: [
      { title: 'Log in', command: 'npm run login -- --repo "<repository>"' },
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /interpolates <repository>/u);
});

test('<secret> in a command is no longer waved through as computed', () => {
  const errors = checkRecipe({
    id: 'example',
    execution: { questions: [] },
    steps: [
      { title: 'Register', command: 'npm run setup -- --secret "<secret>"' },
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /interpolates <secret>/u);
});
