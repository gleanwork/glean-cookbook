import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeCodeWalkthrough } from './code-walkthrough.mjs';

function withRecipe(run) {
  const recipeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-walkthrough-'));
  fs.mkdirSync(path.join(recipeDir, 'src'));
  fs.writeFileSync(
    path.join(recipeDir, 'src', 'example.ts'),
    'export const answer: number = 42;\n',
  );
  try {
    run(recipeDir);
  } finally {
    fs.rmSync(recipeDir, { recursive: true, force: true });
  }
}

function entry(example = {}) {
  return {
    id: 'search-example',
    codeWalkthrough: {
      intro: 'Read the implementation.',
      examples: [
        {
          title: 'Search',
          description: 'Run a typed search.',
          source: 'src/example.ts',
          language: 'typescript',
          ...example,
        },
      ],
    },
  };
}

test('materializes a declared source file without changing authored metadata', () => {
  withRecipe((recipeDir) => {
    const authored = entry();
    const materialized = materializeCodeWalkthrough(authored, recipeDir);

    assert.equal(
      materialized.codeWalkthrough.examples[0].code,
      'export const answer: number = 42;\n',
    );
    assert.equal(authored.codeWalkthrough.examples[0].code, undefined);
  });
});

test('rejects path traversal outside the recipe directory', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeCodeWalkthrough(
          entry({ source: '../secret.ts' }),
          recipeDir,
        ),
      /must stay inside/,
    );
  });
});

test('rejects hand-authored generated code', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeCodeWalkthrough(
          entry({ code: 'const duplicated = true;' }),
          recipeDir,
        ),
      /code is generated/,
    );
  });
});

test('rejects source files that do not match the declared language', () => {
  withRecipe((recipeDir) => {
    assert.throws(
      () =>
        materializeCodeWalkthrough(entry({ language: 'python' }), recipeDir),
      /does not match walkthrough language/,
    );
  });
});
