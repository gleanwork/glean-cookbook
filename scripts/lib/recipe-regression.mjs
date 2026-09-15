import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

import { readJsonc } from './jsonc.mjs';
import { startValidateSkillFixture } from './recipe-fixtures/validate-and-publish-skill.mjs';

const FIXTURE_STEP_KINDS = new Set(['install', 'manual', 'verify-fixture']);

function scaffoldTarget(command) {
  if (!/\btiged(?:@\S+)?\b/u.test(command)) return undefined;
  return command.trim().split(/\s+/u).at(-1);
}

function fixtureCommands(steps, scaffoldIndex) {
  const commands = [];
  for (const step of steps.slice(scaffoldIndex + 1)) {
    if (!FIXTURE_STEP_KINDS.has(step.kind)) break;
    if (step.command) commands.push(step.command);
  }
  return commands;
}

function scrubbedEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GLEAN_')),
  );
}

async function sourceDigest(directory) {
  const hash = createHash('sha256');
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.name === 'node_modules') continue;
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute);
      hash.update(relative);
      if (entry.isDirectory()) await visit(absolute);
      else hash.update(await fs.readFile(absolute));
    }
  }
  await visit(directory);
  return hash.digest('hex');
}

const behaviorFixtures = new Map([
  ['validate-and-publish-skill', startValidateSkillFixture],
]);

async function runShell(command, options) {
  return execa('bash', ['-c', `set -euo pipefail\n${command}`], {
    reject: false,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

export async function verifyRecipeFixture({
  recipeId,
  repoRoot,
  timeoutMs = 180_000,
}) {
  const recipeDirectory = path.join(repoRoot, 'recipes', recipeId);
  const recipe = readJsonc(path.join(recipeDirectory, 'recipe.json'));
  const scaffoldIndex = recipe.steps.findIndex((step) =>
    scaffoldTarget(step.command ?? ''),
  );
  if (scaffoldIndex < 0) {
    throw new Error(`${recipeId} has no scaffold command`);
  }

  const target = scaffoldTarget(recipe.steps[scaffoldIndex].command);
  const commands = fixtureCommands(recipe.steps, scaffoldIndex);
  if (!target || commands.length === 0) {
    throw new Error(`${recipeId} has no deterministic fixture command phase`);
  }

  const digest = await sourceDigest(recipeDirectory);
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), `cookbook-${recipeId}-`),
  );
  const destination = path.join(workspace, target);
  await fs.cp(recipeDirectory, destination, {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes('node_modules'),
  });

  const environment = { ...scrubbedEnvironment(), CI: '1', NO_COLOR: '1' };
  const result = await runShell(commands.join('\n'), {
    cwd: workspace,
    env: environment,
    timeout: timeoutMs,
  });

  let behavior = {
    status: result.exitCode === 0 ? 'not-configured' : 'not-run',
  };
  const startFixture = behaviorFixtures.get(recipeId);
  if (result.exitCode === 0 && startFixture) {
    const fixture = await startFixture(destination);
    try {
      const behaviorResult = await runShell(fixture.command, {
        cwd: destination,
        env: { ...environment, ...fixture.env },
        timeout: timeoutMs,
      });
      const state = fixture.state();
      behavior = {
        command: fixture.command,
        status:
          behaviorResult.exitCode === 0 && state.created && state.deleted
            ? 'passed'
            : 'failed',
        exitCode: behaviorResult.exitCode,
        stdout: behaviorResult.stdout,
        stderr: behaviorResult.stderr,
        requests: fixture.requests,
        state,
      };
    } finally {
      await fixture.close();
    }
  }

  return {
    recipeId,
    sourceDigest: digest,
    workspace,
    commands,
    status:
      result.exitCode !== 0
        ? 'failed'
        : behavior.status === 'passed'
          ? 'passed'
          : 'partial',
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    behavior,
    cleanup: () => fs.rm(workspace, { recursive: true, force: true }),
  };
}
