import assert from 'node:assert/strict';
import test from 'node:test';

import { stripFrameworkCompilerMetadata } from './registry-metadata.mjs';

test('strips frameworkFeatures from emitted registry assets without mutating authoring data', () => {
  const authored = {
    id: 'example',
    codeAssets: [
      {
        repoPath: 'recipes/example',
        language: 'typescript',
        frameworkFeatures: ['terminal-markdown'],
      },
      { repoPath: 'recipes/example/python', language: 'python' },
    ],
  };

  const emitted = stripFrameworkCompilerMetadata(authored);
  assert.deepEqual(emitted, {
    id: 'example',
    codeAssets: [
      { repoPath: 'recipes/example', language: 'typescript' },
      { repoPath: 'recipes/example/python', language: 'python' },
    ],
  });
  assert.deepEqual(authored.codeAssets[0].frameworkFeatures, [
    'terminal-markdown',
  ]);
});
