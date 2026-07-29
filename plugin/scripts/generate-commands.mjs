#!/usr/bin/env node

/**
 * Generates one plugin skill per recipe from ../../registry.json, plus the
 * recipe list embedded in the browse-cookbook skill. Regenerated on every
 * registry change so neither can drift from the single source of truth
 * (PACT-458) — same philosophy as glean-developer-site's `pnpm snippets:check`.
 *
 * Each recipe gets skills/{id}/SKILL.md. A skill folder named {id} inside a
 * plugin named "cookbook" becomes the slash command `/cookbook:{id}` —
 * Claude Code's *only* namespace layer is the plugin's own name. Do not nest
 * skill folders under an extra subdirectory (e.g. skills/cookbook/{id}); that
 * doubles the namespace to /cookbook:cookbook:{id}.
 * `disable-model-invocation: true` keeps these explicit-only (typing
 * /cookbook:{id}), since auto-triggering a multi-step app build from
 * unrelated conversation would be surprising.
 *
 * commands/ (flat markdown files) is Claude Code's older mechanism; current
 * guidance is to use skills/ for new plugins, which is also pluginpack's
 * default component for the claude/cursor/codex targets.
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
const skillsDir = path.join(pluginRoot, 'plugins', 'cookbook', 'skills');
const browseSkillFile = path.join(skillsDir, 'browse-cookbook', 'SKILL.md');

// Hand-authored skills that live alongside the generated per-recipe ones —
// never touched by the stale-id sweep in main().
const HAND_AUTHORED_SKILLS = new Set([
  'browse-cookbook',
  'cookbook-conventions',
]);

const SCAFFOLD_ACTION_WORDS = {
  sdk: 'SDK',
  mcp: 'MCP',
};

const VARIANT_LABEL_WORDS = {
  sdk: 'SDK',
  api: 'API',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
};

// Matches recipe.ts's RECIPE_AUTH_METHODS — the subsection heading each
// value maps to in the cookbook-conventions skill's Authentication section.
// 'none' and 'custom' have no entry: they don't point at that section at all.
const AUTH_METHOD_SUBSECTIONS = {
  'web-sdk-cookie': '`web-sdk-cookie`',
  'client-api-oauth-or-token': '`client-api-oauth-or-token`',
  'indexing-token': '`indexing-token`',
};

const LANGUAGE_LABELS = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
};

function humanizeScaffoldAction(action) {
  const withoutPrefix = action.replace(/^scaffold-/, '');
  const rest = withoutPrefix
    .split('-')
    .map((word) => SCAFFOLD_ACTION_WORDS[word] ?? word)
    .join(' ');
  return `Scaffold ${rest}`;
}

/** Last path segment of a codeAsset's repoPath, title-cased ("web-sdk" -> "Web SDK"). */
function humanizeVariantLabel(repoPath) {
  return repoPath
    .split('/')
    .pop()
    .split('-')
    .map(
      (word) =>
        VARIANT_LABEL_WORDS[word] ??
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function renderStepList(steps, startNum) {
  return steps
    .map((step, i) => {
      const lines = [`${startNum + i}. **${step.title}**`];
      if (step.description) lines.push(`   ${step.description}`);
      if (step.command) {
        const commandLines = step.command
          .split('\n')
          .map((line) => `   ${line}`);
        lines.push('   ```bash', ...commandLines, '   ```');
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Renders a `buildMethod: 'scaffold'` recipe's skill body from its `steps`
 * (and any variant-specific `codeAssets[].steps`) instead of a hand-written
 * `aiPrompt` — the same real, runnable commands the recipe page renders,
 * not a parallel prose description of them.
 */
function renderStepsBody(recipe) {
  const parts = [
    `Build "${recipe.title}" following https://developers.glean.com/cookbook/${recipe.id}`,
  ];

  if (recipe.steps?.length > 0) {
    parts.push(renderStepList(recipe.steps, 1));
  }

  const variantsWithSteps = (recipe.codeAssets ?? []).filter(
    (asset) => asset.steps?.length > 0,
  );
  for (const asset of variantsWithSteps) {
    parts.push(
      `### ${humanizeVariantLabel(asset.repoPath)}\n\n${asset.description}`,
    );
    parts.push(renderStepList(asset.steps, 1));
  }

  return parts.join('\n\n');
}

/** True when a recipe has real `steps` content to render from, on itself or any variant. */
function hasStepsContent(recipe) {
  return (
    recipe.steps?.length > 0 ||
    (recipe.codeAssets ?? []).some((asset) => asset.steps?.length > 0)
  );
}

/**
 * Renders the recipe's `demoQueries` as a deterministic pass/fail gate
 * instead of advisory prose — "run it and see" left the citations bug (a
 * genuinely broken build) reading as done. Each query's `expectedBehavior`
 * is what a real run against a live Glean instance must produce.
 */
function renderVerifySection(recipe) {
  if (!recipe.demoQueries || recipe.demoQueries.length === 0) return [];

  const lines =
    recipe.buildMethod === 'third-party-build'
      ? [
          "This recipe's app is built and run by a separate tool " +
            "(Lovable, Replit), not by you. Before telling me you're " +
            'done, give me the queries below to test myself in the ' +
            'running app, along with what a correct result looks like:',
          '',
        ]
      : [
          'Do not report this recipe as done until you have run it for ' +
            'real (against a live Glean instance, with real credentials) ' +
            'and confirmed every query below produces its expected ' +
            'behavior. A build that runs without errors but fails one of ' +
            'these checks is not done — fix it and re-run before ' +
            'reporting success.',
          '',
        ];
  for (const { query, expectedBehavior } of recipe.demoQueries) {
    lines.push(`- **Query:** "${query}"`);
    lines.push(`  **Expected:** ${expectedBehavior}`);
  }
  return ['', '## Verify', lines.join('\n')];
}

/** YAML double-quoted scalar — safe for values containing colons, which break unquoted plain scalars. */
function yamlQuote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function renderRecipeSkill(recipe) {
  const sections = [
    `---`,
    `name: ${recipe.id}`,
    `description: ${yamlQuote(recipe.description)}`,
    `disable-model-invocation: true`,
    `---`,
    '',
    hasStepsContent(recipe) ? renderStepsBody(recipe) : recipe.aiPrompt.trim(),
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

  const authSubsections = (recipe.authMethod ?? [])
    .map((method) => AUTH_METHOD_SUBSECTIONS[method])
    .filter(Boolean);
  if (authSubsections.length > 0) {
    const subsectionList = authSubsections.join(' or ');
    sections.push(
      '',
      '## Authentication',
      `This recipe needs ${subsectionList} auth — follow the matching subsection under ` +
        '"Authentication: follow the recipe\'s declared `authMethod`" in the `cookbook-conventions` ' +
        'skill in this plugin, rather than assuming which credential path applies.',
    );
  }

  if (recipe.languages?.length > 1) {
    const languageList = recipe.languages
      .map((lang) => LANGUAGE_LABELS[lang])
      .join(', ');
    sections.push(
      '',
      '## Language',
      `Ask me which language to build in before starting: ${languageList}.`,
    );
  }

  // Any recipe that renders a Web SDK UI shares the same brand-kit and
  // container-sizing conventions — point at skills/cookbook-conventions
  // rather than re-deriving them per recipe.
  if (recipe.surfaces?.includes('web-sdk')) {
    sections.push(
      '',
      '## House style',
      "This recipe renders a Web SDK UI — apply the cookbook's shared conventions " +
        '(see the `cookbook-conventions` skill in this plugin): the real Acme logomark ' +
        '(not a plain colored square), a 480–500px-tall container, and `initialMessage` ' +
        "set to this recipe's own first demo query so it opens into a real answer " +
        'instead of an empty landing screen.',
    );
  }

  sections.push(...renderVerifySection(recipe));

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

  // recipe id -> skills/{id}/SKILL.md path
  const desiredSkills = new Map(
    registry.map((r) => [
      path.join(skillsDir, r.id, 'SKILL.md'),
      renderRecipeSkill(r),
    ]),
  );

  const existingBrowseSkill = fs.existsSync(browseSkillFile)
    ? fs.readFileSync(browseSkillFile, 'utf8')
    : '';
  const startMarker = '<!-- pluginpack-generated:recipes:start -->';
  const endMarker = '<!-- pluginpack-generated:recipes:end -->';
  const startIdx = existingBrowseSkill.indexOf(startMarker);
  const endIdx = existingBrowseSkill.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `${path.relative(repoRoot, browseSkillFile)}: missing ${startMarker}/${endMarker} markers`,
    );
  }
  const desiredBrowseSkill =
    existingBrowseSkill.slice(0, startIdx + startMarker.length) +
    '\n' +
    renderSkillRecipeList(registry) +
    '\n' +
    existingBrowseSkill.slice(endIdx);

  // Existing recipe-skill directories today (anything under skillsDir other
  // than the hand-authored ones above) — used to detect stale ids removed
  // from the registry, and to snapshot/restore around a --check run.
  const existingRecipeIds = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !HAND_AUTHORED_SKILLS.has(e.name))
        .map((e) => e.name)
    : [];

  const snapshot = new Map();
  for (const id of existingRecipeIds) {
    const filePath = path.join(skillsDir, id, 'SKILL.md');
    if (fs.existsSync(filePath)) {
      snapshot.set(filePath, fs.readFileSync(filePath, 'utf8'));
    }
  }
  snapshot.set(browseSkillFile, existingBrowseSkill);

  const staleIds = existingRecipeIds.filter(
    (id) => !desiredSkills.has(path.join(skillsDir, id, 'SKILL.md')),
  );
  for (const id of staleIds) {
    fs.rmSync(path.join(skillsDir, id), { recursive: true, force: true });
  }

  const writtenPaths = [];
  for (const [filePath, desired] of desiredSkills) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, desired);
    writtenPaths.push(filePath);
  }
  fs.writeFileSync(browseSkillFile, desiredBrowseSkill);
  writtenPaths.push(browseSkillFile);

  formatWithPrettier(writtenPaths);

  const mismatches = staleIds.map(
    (id) => `skills/${id}: stale — no matching registry entry`,
  );
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
    for (const id of staleIds) {
      const dir = path.join(skillsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'SKILL.md'),
        snapshot.get(path.join(dir, 'SKILL.md')),
      );
    }
    for (const [filePath, content] of snapshot) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    for (const filePath of desiredSkills.keys()) {
      if (!snapshot.has(filePath)) {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true }); // newly created by this run
      }
    }

    if (mismatches.length > 0) {
      console.error(`Generated skill content is stale (${mismatches.length}):`);
      for (const m of mismatches) console.error(`  - ${m}`);
      console.error('Run `npm run generate:commands` and commit the result.');
      process.exit(1);
    }
    console.log('Generated skills are up to date.');
    return;
  }

  console.log(
    `Generated ${desiredSkills.size} recipe skill(s) and updated the browse-cookbook skill.`,
  );
}

main();
