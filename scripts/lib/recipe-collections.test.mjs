import assert from 'node:assert/strict';
import test from 'node:test';

import { checkRecipeCollections } from './recipe-collections.mjs';

const recipes = [
  { id: 'first' },
  { id: 'second', visibility: 'preview' },
  { id: 'secret', hidden: true },
];

function config(...collections) {
  return { collections };
}

test('accepts every listed recipe in exactly one collection', () => {
  assert.deepEqual(
    checkRecipeCollections(
      config({ id: 'a', recipes: ['first'] }, { id: 'b', recipes: ['second'] }),
      recipes,
    ),
    [],
  );
});

test('rejects a listed recipe that is in no collection, including previews', () => {
  const errors = checkRecipeCollections(
    config({ id: 'a', recipes: ['first'] }),
    recipes,
  );
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /"second" is listed on the site but is in no collection/u,
  );
});

test('rejects a recipe in two collections', () => {
  const errors = checkRecipeCollections(
    config(
      { id: 'a', recipes: ['first', 'second'] },
      { id: 'b', recipes: ['second'] },
    ),
    recipes,
  );
  assert.deepEqual(errors, [
    'recipe "second" is in both "a" and "b"; a recipe belongs to one collection',
  ]);
});

test('rejects unknown and hidden recipe ids', () => {
  const errors = checkRecipeCollections(
    config({ id: 'a', recipes: ['first', 'second', 'secret', 'missing'] }),
    recipes,
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /lists hidden recipe "secret"/u);
  assert.match(errors[1], /lists unknown recipe "missing"/u);
});

test('rejects duplicate collection ids', () => {
  const errors = checkRecipeCollections(
    config({ id: 'a', recipes: ['first'] }, { id: 'a', recipes: ['second'] }),
    recipes,
  );
  assert.deepEqual(errors, ['collection id "a" is used more than once']);
});
