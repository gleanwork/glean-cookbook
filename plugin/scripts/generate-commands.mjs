#!/usr/bin/env node

/**
 * Generates one plugin skill per recipe from ../../registry.json, plus the two
 * places that embed a list of every recipe: the browse-cookbook skill and the
 * repo README's recipe table. Regenerated on every registry change so none of
 * them can drift from the single source of truth (PACT-458) — same philosophy
 * as glean-developer-site's `pnpm snippets:check`.
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
const readmeFile = path.join(repoRoot, 'README.md');

// Both the browse-cookbook skill and the README carry a generated list of every
// recipe, in different shapes, fenced by the same marker pair.
const START_MARKER = '<!-- pluginpack-generated:recipes:start -->';
const END_MARKER = '<!-- pluginpack-generated:recipes:end -->';

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

const VARIANT_LABELS = {
  'platform-chat': 'Client Chat',
};

// Matches recipe.ts's RECIPE_AUTH_METHODS — the partial under plugin/partials/
// each value inlines. 'none' and 'custom' have no entry: they need no shared
// credential guidance at all.
const AUTH_METHOD_PARTIALS = {
  'web-sdk-cookie': 'auth-web-sdk-cookie',
  'client-api-oauth-or-token': 'auth-client-api',
  'indexing-token': 'auth-indexing-token',
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
  const slug = repoPath.split('/').pop();
  if (VARIANT_LABELS[slug]) return VARIANT_LABELS[slug];
  return slug
    .split('-')
    .map(
      (word) =>
        VARIANT_LABEL_WORDS[word] ??
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function renderStepList(steps, startNum, execution) {
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
      if (step.kind === 'run') {
        for (const line of renderRunHandoffLines(execution)) {
          lines.push(line ? `   ${line}` : '');
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function renderExecutionIntro(execution) {
  if (!execution) return '';
  const lines = [];
  if (execution.questions?.length > 0) {
    // One question per turn, not a list in a single message. Setup answers are
    // mostly free text — an email, a checklist — and a reader answering several
    // at once has to structure the reply themselves, which is where they drop
    // one or guess at the format.
    //
    // Bulleted, not numbered: the build steps below are a numbered list, and a
    // second one directly above it reads as part of the same sequence.
    lines.push(
      'Ask these before running commands. Ask one at a time, waiting for each',
      'answer before asking the next — do not put them all in one message:',
      '',
    );
    for (const question of execution.questions)
      lines.push(`- ${question.prompt}`);
  }
  if (
    execution.auth.some((auth) => auth.kind === 'oauth-with-token-fallback')
  ) {
    if (lines.length > 0) lines.push('');
    lines.push(
      "Use the scaffold's shipped login command. Never implement or modify OAuth during setup.",
    );
  }
  if (execution.auth.some((auth) => auth.kind === 'browser-cookie')) {
    if (lines.length > 0) lines.push('');
    lines.push(
      "Cookie SSO requires the user's normal signed-in browser. Never open or automate the app yourself.",
    );
  }
  return lines.join('\n');
}

function hasFixtureDemo(steps) {
  return steps?.some((step) => step.kind === 'verify-fixture') ?? false;
}

/**
 * Fixture-backed recipes expose a polished demo only when the host process was
 * deliberately launched with the cookbook-wide flag. The skill checks the flag
 * without echoing the environment, so ordinary users are never offered a demo
 * path that they did not opt into.
 */
function renderDemoModePolicy(steps) {
  if (!hasFixtureDemo(steps)) return '';
  return '{{> demo-mode}}';
}

/**
 * The execution contract, rather than recipe-authored prose, owns the final
 * handoff. This keeps every runnable recipe consistent while preserving the one
 * material browser distinction: Web SDK cookie SSO must be opened by the user
 * in their normal signed-in browser.
 */
function renderRunHandoffLines(execution) {
  const run = execution?.run;
  if (execution?.type === 'cli') {
    return ['{{> run-cli}}'];
  }
  if (execution?.type === 'host-configuration') {
    return ['{{> run-host-configuration}}'];
  }
  if (execution?.type === 'hybrid-service') {
    return ['{{> run-hybrid-service}}'];
  }
  if (execution?.type === 'existing-app') {
    return ['{{> run-existing-app}}'];
  }
  if (!run) return [];

  const browserCookie = execution.auth.some(
    (auth) => auth.kind === 'browser-cookie',
  );
  return [browserCookie ? '{{> run-local-web-cookie}}' : '{{> run-local-web}}'];
}

function renderRunHandoff(execution, heading = '###') {
  const lines = renderRunHandoffLines(execution);
  if (lines.length === 0) return '';
  return [`${heading} Open the running recipe`, '', ...lines].join('\n');
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

  const recipeExecutionIntro = renderExecutionIntro(recipe.execution);
  const recipeDemoPolicy = renderDemoModePolicy(recipe.steps);
  if (recipeDemoPolicy) parts.push(recipeDemoPolicy);
  if (recipeExecutionIntro) parts.push(recipeExecutionIntro);

  if (recipe.steps?.length > 0) {
    parts.push(renderStepList(recipe.steps, 1, recipe.execution));
  }

  const variantsWithSteps = (recipe.codeAssets ?? []).filter(
    (asset) => asset.steps?.length > 0,
  );

  // With more than one variant the reader has to choose before anything else is
  // relevant, and the questions under each variant only apply once they have.
  // Saying so keeps the choice from being bundled into the same message as the
  // variant's own questions.
  if (variantsWithSteps.length > 1) {
    parts.push(
      'Ask which variant to build first, on its own, and wait for the answer.' +
        ' Then follow only that variant below, asking its questions one at a time.',
    );
  }

  for (const asset of variantsWithSteps) {
    parts.push(
      `### ${humanizeVariantLabel(asset.repoPath)}\n\n${asset.description}`,
    );
    const executionIntro = renderExecutionIntro(asset.execution);
    const demoPolicy = renderDemoModePolicy(asset.steps);
    if (demoPolicy) parts.push(demoPolicy);
    if (executionIntro) parts.push(executionIntro);
    parts.push(renderStepList(asset.steps, 1, asset.execution));
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

function hasExecutionContracts(recipe) {
  return Boolean(
    recipe.execution ||
    (recipe.codeAssets ?? []).some((asset) => asset.execution),
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

  const lines = [];
  if (recipe.buildMethod === 'third-party-build') {
    lines.push('{{> verify-gate-third-party}}', '');
  } else {
    if (recipe.surfaces?.includes('web-sdk')) {
      lines.push('{{> verify-gate-web-sdk}}', '');
    }
    lines.push('{{> verify-gate}}', '');
  }
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
  ];

  const executionContracts = hasExecutionContracts(recipe);
  const structuredScaffold = executionContracts && hasStepsContent(recipe);
  if (recipe.prerequisites?.length > 0 || recipe.requiredScopes?.length > 0) {
    sections.push('', '## Before you start');
    if (!structuredScaffold && recipe.requiredScopes?.length > 0) {
      sections.push(
        `- Required API scopes (for paths that use API credentials): ${recipe.requiredScopes.map((scope) => `\`${scope}\``).join(', ')}`,
      );
    }
    for (const prerequisite of recipe.prerequisites ?? []) {
      sections.push(`- ${prerequisite}`);
    }
  }

  const body = hasStepsContent(recipe)
    ? renderStepsBody(recipe)
    : [renderExecutionIntro(recipe.execution), recipe.aiPrompt.trim()]
        .filter(Boolean)
        .join('\n\n');
  sections.push('', body);

  if (!hasStepsContent(recipe)) {
    const handoff = renderRunHandoff(recipe.execution, '##');
    if (handoff) sections.push('', handoff);
  }

  if (recipe.scaffoldActions?.length > 0) {
    sections.push('', '## Setup');
    for (const action of recipe.scaffoldActions) {
      sections.push(`- ${humanizeScaffoldAction(action)}`);
    }
  }

  if (recipe.llmContext && !hasStepsContent(recipe)) {
    sections.push('', '## Reference', recipe.llmContext.trim());
  }

  // Auth guidance is inlined from a partial per declared authMethod, not
  // pointed at another skill. A cross-skill pointer costs the model a hop it
  // may not take, and the pointer sentence itself was prose living in this
  // script. The partials under plugin/partials/ are the single source; the
  // cookbook-conventions skill renders the same ones for browsing.
  const authPartials = structuredScaffold
    ? []
    : (recipe.authMethod ?? [])
        .filter((method) => AUTH_METHOD_PARTIALS[method])
        .map((method) => [method, AUTH_METHOD_PARTIALS[method]]);
  if (authPartials.length > 0) {
    sections.push('', '## Authentication');
    if (authPartials.length === 1) {
      sections.push(`{{> ${authPartials[0][1]}}}`);
    } else {
      // Multiple declared methods means the recipe offers a path choice, so
      // each block needs its method name as a heading — an unlabelled run of
      // two auth flows can't be matched to the path the user picked.
      sections.push(
        'This recipe offers a path choice. Apply the block matching the path the user picks:',
      );
      for (const [method, partial] of authPartials) {
        sections.push('', `### \`${method}\``, '', `{{> ${partial}}}`);
      }
    }
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

  // Web SDK recipes share brand-kit and container-sizing conventions; inline
  // the same partials cookbook-conventions renders rather than pointing at it.
  if (recipe.surfaces?.includes('web-sdk') && !hasStepsContent(recipe)) {
    sections.push(
      '',
      '## House style',
      '{{> web-sdk-house-style}}',
      '',
      '{{> brand-kit}}',
      '',
      '{{> web-sdk-sizing}}',
    );
  }

  if (!structuredScaffold) sections.push(...renderVerifySection(recipe));

  return `${sections.join('\n')}\n`;
}

function renderSkillRecipeList(registry) {
  return registry
    .map((r) => `- **${r.title}** (\`/cookbook:${r.id}\`) — ${r.description}`)
    .join('\n');
}

/** Escapes a Markdown table cell — a bare `|` would start a new column. */
function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

/**
 * The README's recipe table. `title` carries the tagline already (they read as
 * "Company Answers: a cited Q&A page on your own content"), so the row shows it
 * rather than `description` — descriptions run to 240 characters and make the
 * table unscannable. Full write-ups are a click away on the dev site.
 */
function renderReadmeRecipeTable(registry) {
  return [
    '| Recipe | Level | Time | Build it |',
    '| --- | --- | --- | --- |',
    ...registry.map((r) =>
      [
        '',
        `**${escapeCell(r.title)}**`,
        escapeCell(r.level),
        escapeCell(r.timeEstimate),
        `\`/cookbook:${r.id}\``,
        '',
      ].join(' | '),
    ),
  ].join('\n');
}

/**
 * Replaces the content between the generated-block markers, leaving everything
 * outside them untouched, so each file's hand-written prose survives a
 * regeneration.
 */
function spliceMarkedBlock(existing, relPath, rendered) {
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `${relPath}: missing ${START_MARKER}/${END_MARKER} markers`,
    );
  }
  return (
    existing.slice(0, startIdx + START_MARKER.length) +
    '\n' +
    rendered +
    '\n' +
    existing.slice(endIdx)
  );
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

  // Files that embed a generated recipe list inside marker fences, as
  // path -> desired full content. Their prose outside the markers is
  // hand-written and preserved.
  const markerFiles = new Map(
    [
      [browseSkillFile, renderSkillRecipeList(registry)],
      [readmeFile, renderReadmeRecipeTable(registry)],
    ].map(([filePath, rendered]) => {
      const existing = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8')
        : '';
      return [
        filePath,
        spliceMarkedBlock(
          existing,
          path.relative(repoRoot, filePath),
          rendered,
        ),
      ];
    }),
  );

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
  // Read before any writes below, so this is the pre-run state.
  for (const filePath of markerFiles.keys()) {
    snapshot.set(
      filePath,
      fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '',
    );
  }

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
  for (const [filePath, desired] of markerFiles) {
    fs.writeFileSync(filePath, desired);
    writtenPaths.push(filePath);
  }

  formatWithPrettier(writtenPaths);

  const mismatches = staleIds.map(
    (id) => `skills/${id}: stale — no matching registry entry`,
  );
  for (const filePath of writtenPaths) {
    const before = snapshot.get(filePath);
    const after = fs.readFileSync(filePath, 'utf8');
    if (before !== after) {
      mismatches.push(`${path.relative(repoRoot, filePath)}: out of date`);
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
      console.error(`Generated content is stale (${mismatches.length}):`);
      for (const m of mismatches) console.error(`  - ${m}`);
      console.error(
        'Run `npm run build` from the repo root and commit the result.',
      );
      process.exit(1);
    }
    console.log('Generated skills and recipe lists are up to date.');
    return;
  }

  console.log(
    `Generated ${desiredSkills.size} recipe skill(s), and refreshed the recipe list in the browse-cookbook skill and README.`,
  );
}

main();
