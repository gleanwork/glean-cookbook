import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { Project } from 'fixturify-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startValidateSkillServer } from '../helpers/validate-skill-server.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const sourceDirectory = path.join(
  repoRoot,
  'recipes',
  'validate-and-publish-skill',
);
const target = 'validate-and-publish-skill';

type Recipe = {
  steps: Array<{ command?: string; kind: string }>;
};

describe('validate-and-publish-skill recipe', () => {
  let workspace: Project;
  let recipeDirectory: string;
  let server: Awaited<ReturnType<typeof startValidateSkillServer>> | undefined;

  beforeEach(async () => {
    workspace = new Project('cookbook-recipe-test');
    await workspace.write();

    const sourceProject = Project.fromDir(sourceDirectory);
    const recipeProject = new Project({
      name: sourceProject.name,
      version: sourceProject.version,
      files: sourceProject.files,
    });
    recipeDirectory = path.join(workspace.baseDir, target);
    recipeProject.baseDir = recipeDirectory;
    await recipeProject.write();
    fs.copyFileSync(
      path.join(sourceDirectory, 'package.json'),
      path.join(recipeDirectory, 'package.json'),
    );
  });

  afterEach(async () => {
    await server?.close();
    workspace.dispose();
  });

  it('runs the documented fixture and API verification flow', async () => {
    const recipe = JSON.parse(
      fs.readFileSync(path.join(sourceDirectory, 'recipe.json'), 'utf8'),
    ) as Recipe;
    const commands = recipe.steps
      .filter((step) => step.command)
      .map((step) => step.command as string);

    expect(commands).toEqual([
      'npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/validate-and-publish-skill validate-and-publish-skill',
      'cd validate-and-publish-skill && npm install',
      'npm test',
      'npm run login -- --email "<work-email>"',
      'npm run verify -- --email "<work-email>"',
      'npm start -- --bundle "<skill-path>" --email "<work-email>" --yes',
    ]);

    expect(fs.existsSync(path.join(recipeDirectory, 'package-lock.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(recipeDirectory, 'node_modules'))).toBe(
      false,
    );

    const environment = isolatedEnvironment(workspace.baseDir);
    expect(environment.GITHUB_TOKEN).toBeUndefined();
    const install = await execa('bash', ['-c', commands[1]], {
      cwd: workspace.baseDir,
      env: environment,
      extendEnv: false,
      reject: false,
    });
    expect(install.exitCode, install.stderr).toBe(0);

    const fixtures = await execa('bash', ['-c', commands[2]], {
      cwd: recipeDirectory,
      env: environment,
      extendEnv: false,
      reject: false,
    });
    expect(fixtures.exitCode, fixtures.stderr).toBe(0);
    expect(fixtures.stdout).toMatch(/Test Files\s+6 passed/u);

    server = await startValidateSkillServer(recipeDirectory);
    const verification = await execa('npm', ['run', 'verify'], {
      cwd: recipeDirectory,
      env: {
        ...environment,
        GLEAN_API_TOKEN: 'fixture-token',
        GLEAN_SERVER_URL: server.url,
      },
      extendEnv: false,
      reject: false,
    });

    expect(verification.exitCode, verification.stderr).toBe(0);
    expect(verification.stdout).toMatch(/at version 1\.1/u);
    expect(verification.stdout).toContain('cleanup completed');
    expect(server.requests).toEqual([
      'POST /api/skills/validation',
      'POST /api/skills/validation',
      'POST /api/skills',
      'GET /api/skills?page_size=100',
      'GET /api/skills/fixture-skill-id',
      'GET /api/skills/fixture-skill-id/content',
      'DELETE /api/skills/fixture-skill-id',
    ]);
    expect(server.state()).toEqual({ created: true, deleted: true });
  }, 120_000);
});

function isolatedEnvironment(root: string): NodeJS.ProcessEnv {
  const home = path.join(root, '.home');
  fs.mkdirSync(home, { recursive: true });
  return {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TMPDIR: process.env.TMPDIR,
    SSL_CERT_FILE: process.env.SSL_CERT_FILE,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
    HOME: home,
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    npm_config_cache: path.join(home, '.cache', 'npm'),
    CI: '1',
    NO_COLOR: '1',
  };
}
