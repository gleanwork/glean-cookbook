import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('fixture walkthrough and optional live auth keep separate contracts', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const recipe = fs.readFileSync(path.join(root, 'recipe.json'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.equal(pkg.dependencies?.['@gleanwork/auth'], '1.0.0');
  assert.equal(pkg.scripts?.login, 'glean-auth login --scopes CHAT');
  assert.match(recipe, /"requiredScopes": \[\]/u);
  assert.match(recipe, /"authMethod": \["none"\]/u);
  assert.equal(recipe.match(/cd rfp-responder &&/gu)?.length, 1);
  assert.match(readme, /dynamic client registration/u);
  assert.equal(fs.existsSync(path.join(root, 'scripts/glean-auth.mjs')), false);
});
