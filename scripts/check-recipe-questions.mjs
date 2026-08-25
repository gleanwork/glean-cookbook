#!/usr/bin/env node

// Every <placeholder> a command interpolates must come from a declared question
// or be resolved by the harness. The reverse (a question nobody consumes) is
// deliberately not flagged: most are consumed by prose, not substitution.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readJsonc } from './lib/jsonc.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const recipesRoot = path.join(repoRoot, 'recipes');

// Question id -> the placeholder spelling recipes use for it.
const ID_ALIASES = { email: ['work-email'] };

// Values the harness resolves rather than asks for. Deliberately narrow:
// exempting <secret> or <id> would wave through what this gate exists to catch.
const COMPUTED = new Set([
  'resolved-backend',
  'cookbook-plugin-root',
  'origin',
  'random',
]);

// A setup question may ask a credential's shape, never its value: anything
// pasted into the conversation lands in the transcript. SHAPE lists what is
// asked *about*, not the interrogative -- `what`/`which` here would disarm the
// check from anywhere in the sentence.
const SECRET = /\b(?:token|secret|api[- ]?key|password|credential|bearer)\b/iu;
const SHAPE = /\b(?:header|scopes?|shape|name of|type of|kind of)\b/iu;
// A shape word does not excuse asking for the value anyway -- "which header
// carries your API key? paste it here" names a shape and still wants the secret.
const VALUE = /\b(?:paste|enter|provide|copy|type|give me)\b|\bvalue\b/iu;

/** True when a prompt asks for a credential's value rather than its shape. */
export function asksForSecretValue(prompt) {
  if (!SECRET.test(prompt)) return false;
  return VALUE.test(prompt) || !SHAPE.test(prompt);
}

/** Every question a recipe asks, including those under `codeAssets`. */
export function allQuestions(recipe) {
  return [
    ...(recipe.execution?.questions ?? []).map((q) => ['execution', q]),
    ...(recipe.codeAssets ?? []).flatMap((asset, i) =>
      (asset.execution?.questions ?? []).map((q) => [
        `codeAssets[${i}].execution`,
        q,
      ]),
    ),
  ];
}

function placeholdersIn(text) {
  return new Set(
    [...String(text).matchAll(/<([a-z0-9][a-z0-9._-]*)>/g)].map((m) => m[1]),
  );
}

function questionIds(execution) {
  const ids = new Set();
  for (const q of execution?.questions ?? []) {
    ids.add(q.id);
    for (const alias of ID_ALIASES[q.id] ?? []) ids.add(alias);
  }
  return ids;
}

/** Each command paired with the questions in scope for it. */
function commandsOf(recipe) {
  const top = questionIds(recipe.execution);
  const out = [];

  for (const step of recipe.steps ?? []) {
    if (step.command) out.push([`steps["${step.title}"]`, step.command, top]);
  }
  for (const [i, auth] of (recipe.execution?.auth ?? []).entries()) {
    if (auth.setupCommand)
      out.push([`execution.auth[${i}].setupCommand`, auth.setupCommand, top]);
  }
  if (recipe.execution?.run?.command)
    out.push(['execution.run.command', recipe.execution.run.command, top]);

  for (const [i, asset] of (recipe.codeAssets ?? []).entries()) {
    const scope = new Set([...top, ...questionIds(asset.execution)]);
    for (const step of asset.steps ?? []) {
      if (step.command)
        out.push([`codeAssets[${i}]["${step.title}"]`, step.command, scope]);
    }
    if (asset.execution?.run?.command)
      out.push([
        `codeAssets[${i}].execution.run.command`,
        asset.execution.run.command,
        scope,
      ]);
    for (const [j, auth] of (asset.execution?.auth ?? []).entries()) {
      if (auth.setupCommand)
        out.push([
          `codeAssets[${i}].execution.auth[${j}].setupCommand`,
          auth.setupCommand,
          scope,
        ]);
    }
  }
  return out;
}

/** Everything wrong with one recipe, as reader-facing lines. */
export function checkRecipe(recipe) {
  const found = [];

  for (const [where, command, supplied] of commandsOf(recipe)) {
    for (const ph of placeholdersIn(command)) {
      if (supplied.has(ph) || COMPUTED.has(ph)) continue;
      found.push(
        `${recipe.id} ${where} interpolates <${ph}>, which no question supplies`,
      );
    }
  }

  for (const [where, question] of allQuestions(recipe)) {
    if (asksForSecretValue(question.prompt)) {
      found.push(
        `${recipe.id}: ${where} question "${question.id}" asks for a credential value; have the user write it to .env instead`,
      );
    }
  }
  return found;
}

function main() {
  const errors = [];
  let checked = 0;
  for (const entry of fs.readdirSync(recipesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(recipesRoot, entry.name, 'recipe.json');
    if (!fs.existsSync(file)) continue;
    checked += 1;
    errors.push(...checkRecipe(readJsonc(file)));
  }

  if (errors.length > 0) {
    console.error('Recipe setup questions:\n');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `Recipe setup questions supply every placeholder and ask for no secrets (${checked} recipes).`,
  );
}

// Guarded so the predicates can be imported by the test without the scan running.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
