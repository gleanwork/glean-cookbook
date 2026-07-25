#!/usr/bin/env node

/**
 * Generates one plugin slash command per recipe from ../../registry.json,
 * plus the recipe list embedded in the browse-cookbook skill. Regenerated on
 * every registry change so neither can drift from the single source of
 * truth (PACT-458) — same philosophy as glean-developer-site's
 * `pnpm snippets:check`.
 *
 * A command file at commands/cookbook/{id}.md becomes the slash command
 * `/cookbook:{id}` once pluginpack compiles it for the claude target
 * (directory-nested commands are namespaced by Claude Code).
 *
 * Output is always passed through the repo's own Prettier config before
 * comparison/writing, so this generator and `npm run format:check` at the
 * repo root can never disagree about the canonical form of a generated file.
 *
 * Usage:
 *   node scripts/generate-commands.mjs          # write
 *   node scripts/generate-commands.mjs --check  # fail if output is stale (CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const pluginRoot = path.resolve(import.meta.dirname, '..');
const registryFile = path.join(repoRoot, 'registry.json');
const commandsDir = path.join(
  pluginRoot,
  'plugins',
  'cookbook',
  'commands',
  'cookbook',
);
const skillFile = path.join(
  pluginRoot,
  'plugins',
  'cookbook',
  'skills',
  'browse-cookbook',
  'SKILL.md',
);

const SCAFFOLD_ACTION_WORDS = {
  sdk: 'SDK',
  mcp: 'MCP',
};

function humanizeScaffoldAction(action) {
  const withoutPrefix = action.replace(/^scaffold-/, '');
  const rest = withoutPrefix
    .split('-')
    .map((word) => SCAFFOLD_ACTION_WORDS[word] ?? word)
    .join(' ');
  return `Scaffold ${rest}`;
}

/** YAML double-quoted scalar — safe for values containing colons, which break unquoted plain scalars. */
function yamlQuote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderCommand(recipe) {
  const sections = [
    `---`,
    `name: ${recipe.id}`,
    `description: ${yamlQuote(recipe.description)}`,
    `---`,
    '',
    recipe.aiPrompt.trim(),
  ];

  if (recipe.scaffoldActions?.length > 0) {
    sections.push('', '## Setup');
    for (const action of recipe.scaffoldActions) {
      sections.push(`- ${humanizeScaffoldAction(action)}`);
    }
  }

  if (recipe.llmContext) {
    sections.push('', '## Reference', recipe.llmContext.trim());
  }

  return `${sections.join('\n')}\n`;
}

function renderSkillRecipeList(registry) {
  return registry
    .map((r) => `- **${r.title}** (\`/cookbook:${r.id}\`) — ${r.description}`)
    .join('\n');
}

function loadRegistry() {
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  if (!Array.isArray(registry)) {
    throw new Error('registry.json must be a JSON array of recipe entries.');
  }
  return registry;
}

function formatWithPrettier(filePaths) {
  if (filePaths.length === 0) return;
  execFileSync('npx', ['prettier', '--write', ...filePaths], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
}

function main() {
  const check = process.argv.includes('--check');
  const registry = loadRegistry();

  const desiredCommands = new Map(
    registry.map((r) => [`${r.id}.md`, renderCommand(r)]),
  );

  const existingSkill = fs.existsSync(skillFile)
    ? fs.readFileSync(skillFile, 'utf8')
    : '';
  const startMarker = '<!-- pluginpack-generated:recipes:start -->';
  const endMarker = '<!-- pluginpack-generated:recipes:end -->';
  const startIdx = existingSkill.indexOf(startMarker);
  const endIdx = existingSkill.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `${path.relative(repoRoot, skillFile)}: missing ${startMarker}/${endMarker} markers`,
    );
  }
  const desiredSkill =
    existingSkill.slice(0, startIdx + startMarker.length) +
    '\n' +
    renderSkillRecipeList(registry) +
    '\n' +
    existingSkill.slice(endIdx);

  // Snapshot what's on disk today so a --check run can restore it exactly,
  // even though we write through real target paths (simplest way to
  // guarantee the same Prettier pass check-mode compares against is the
  // one write-mode actually commits).
  const existingCommandFiles = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
    : [];
  const snapshot = new Map();
  for (const fileName of existingCommandFiles) {
    snapshot.set(
      path.join(commandsDir, fileName),
      fs.readFileSync(path.join(commandsDir, fileName), 'utf8'),
    );
  }
  snapshot.set(skillFile, existingSkill);

  fs.mkdirSync(commandsDir, { recursive: true });
  for (const fileName of existingCommandFiles) {
    if (!desiredCommands.has(fileName)) {
      fs.unlinkSync(path.join(commandsDir, fileName));
    }
  }
  const writtenPaths = [];
  for (const [fileName, desired] of desiredCommands) {
    const filePath = path.join(commandsDir, fileName);
    fs.writeFileSync(filePath, desired);
    writtenPaths.push(filePath);
  }
  fs.writeFileSync(skillFile, desiredSkill);
  writtenPaths.push(skillFile);

  formatWithPrettier(writtenPaths);

  const mismatches = [];
  for (const fileName of existingCommandFiles) {
    if (!desiredCommands.has(fileName)) {
      mismatches.push(
        `${path.join('commands/cookbook', fileName)}: stale — no matching registry entry`,
      );
    }
  }
  for (const filePath of writtenPaths) {
    const before = snapshot.get(filePath);
    const after = fs.readFileSync(filePath, 'utf8');
    if (before !== after) {
      mismatches.push(`${path.relative(pluginRoot, filePath)}: out of date`);
    }
  }

  if (check) {
    // Restore exactly what was on disk before this run — --check must be a
    // read-only operation from the caller's point of view.
    for (const [filePath, content] of snapshot) {
      fs.writeFileSync(filePath, content);
    }
    for (const fileName of Array.from(desiredCommands.keys())) {
      const filePath = path.join(commandsDir, fileName);
      if (!snapshot.has(filePath)) fs.unlinkSync(filePath); // was newly created by this run
    }

    if (mismatches.length > 0) {
      console.error(
        `Generated command/skill content is stale (${mismatches.length}):`,
      );
      for (const m of mismatches) console.error(`  - ${m}`);
      console.error('Run `npm run generate:commands` and commit the result.');
      process.exit(1);
    }
    console.log('Generated commands and skill are up to date.');
    return;
  }

  console.log(
    `Generated ${desiredCommands.size} command(s) and updated the browse-cookbook skill.`,
  );
}

main();
