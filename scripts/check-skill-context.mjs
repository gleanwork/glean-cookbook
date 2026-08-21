#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const recipesDir = path.resolve(import.meta.dirname, '..', 'recipes');
const historicalNarration = [
  /\bearlier\b/iu,
  /\bpreviously\b/iu,
  /\bused to\b/iu,
  /\bswap back\b/iu,
  /\btransport reality\b/iu,
  /\bverified live\b/iu,
  /\bfirst implementation\b/iu,
  /\bolder\b/iu,
  /\bas[- ]of\b/iu,
  /\blive[- ]test\b/iu,
];
// Reject contracts that do not match the current Platform Chat API.
const staleChatContract = [
  /\bPOST\s+\/rest\/api\/v1\/chat\b/iu,
  /\bsaveChat\b/iu,
  /\bsourceDocument\b/iu,
  /\boutput_text\b/iu,
  /\bstore\s*:\s*true\b/iu,
];
const fieldLimits = { aiPrompt: 320, llmContext: 120 };
const failures = [];

for (const entry of fs.readdirSync(recipesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(recipesDir, entry.name, 'recipe.json');
  if (!fs.existsSync(file)) continue;
  const recipe = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [field, maxWords] of Object.entries(fieldLimits)) {
    const value = recipe[field] ?? '';
    const words = value.trim().split(/\s+/u).filter(Boolean).length;
    if (words > maxWords) {
      failures.push(
        `${recipe.id}: ${field} is ${words} words (max ${maxWords})`,
      );
    }
    for (const pattern of historicalNarration) {
      if (pattern.test(value)) {
        failures.push(
          `${recipe.id}: ${field} contains historical narration (${pattern.source})`,
        );
      }
    }
    for (const pattern of staleChatContract) {
      if (pattern.test(value)) {
        failures.push(
          `${recipe.id}: ${field} contains the stale Platform Chat contract (${pattern.source})`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Recipe skill prompts are concise, present-tense, and current.');
