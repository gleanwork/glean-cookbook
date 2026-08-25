import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseJsonc } from './jsonc.mjs';

test('keeps strings that look like comments', () => {
  assert.deepEqual(parseJsonc('{ "url": "https://example.com/a//b" }'), {
    url: 'https://example.com/a//b',
  });
});

test('strips line comments after array items', () => {
  const text = `{
  "takeItFurther": [
    "keep me"
    // TODO: restore when company-answers is unhidden:
    // "Once your team outgrows the no-code version."
  ]
}`;
  assert.deepEqual(parseJsonc(text), {
    takeItFurther: ['keep me'],
  });
});

test('strips block comments', () => {
  assert.deepEqual(parseJsonc('{ "a": 1 /* skip */, "b": 2 }'), {
    a: 1,
    b: 2,
  });
});
