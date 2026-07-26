#!/usr/bin/env node

/**
 * Reports which recipes are due for re-verification. "Verified" means someone
 * actually ran the recipe end-to-end via the cookbook plugin and confirmed
 * the result works — not that the docs still look right on a read-through.
 * Informational only: never fails CI, since an unverified recipe isn't
 * necessarily wrong, just due for a look.
 */

import fs from 'node:fs';
import path from 'node:path';

const STALE_AFTER_DAYS = 90;

const repoRoot = path.resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'registry.json'), 'utf8'),
);

const now = new Date();
const unverified = [];
const stale = [];

for (const recipe of registry) {
  if (!recipe.lastVerified) {
    unverified.push(recipe.id);
    continue;
  }
  const ageDays = (now - new Date(recipe.lastVerified)) / (1000 * 60 * 60 * 24);
  if (ageDays > STALE_AFTER_DAYS) {
    stale.push({
      id: recipe.id,
      lastVerified: recipe.lastVerified,
      ageDays: Math.floor(ageDays),
    });
  }
}

if (unverified.length === 0 && stale.length === 0) {
  console.log(
    `All ${registry.length} recipes verified within the last ${STALE_AFTER_DAYS} days.`,
  );
  process.exit(0);
}

if (unverified.length > 0) {
  console.log(`Never verified via the plugin (${unverified.length}):`);
  for (const id of unverified) console.log(`  - ${id}`);
}

if (stale.length > 0) {
  console.log(
    `Verified more than ${STALE_AFTER_DAYS} days ago (${stale.length}):`,
  );
  for (const { id, lastVerified, ageDays } of stale) {
    console.log(
      `  - ${id}: last verified ${lastVerified} (${ageDays} days ago)`,
    );
  }
}

console.log(
  '\nThis is informational, not a CI failure. Re-run a recipe via the plugin ' +
    '(/cookbook:{id} or the equivalent for your host), confirm the result actually ' +
    'works, then set lastVerified to today in registry.json.',
);
