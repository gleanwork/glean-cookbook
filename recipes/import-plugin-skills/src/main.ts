import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { printCliError } from './errors.js';
import { openPluginSource } from './plugin-source.js';
import {
  applyImport,
  formatPlan,
  importable,
  planImport,
  summarize,
  verifyImport,
} from './workflow.js';

const cli = meow(
  `
    Usage
      $ npm start -- <plugin-path> [options]
      $ npm run verify -- [options]
      $ npm start -- cleanup --id <skill-id> [options]

    <plugin-path> is a plugin or marketplace folder, or a .zip of one.

    Options
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --dry-run      Validate and print the plan without publishing
      --yes          Publish without the confirmation prompt
      --plugin       Only import this marketplace plugin (repeatable)
      --skill        Only import this skill name (repeatable)
      --id           Exact verify-run skill ID to delete (cleanup only)

    Examples
      $ npm start -- ~/src/team-plugins --email you@example.com --dry-run
      $ npm start -- ~/src/team-plugins --email you@example.com --yes
      $ npm start -- ~/Downloads/team-plugins-main.zip --email you@example.com --plugin core
  `,
  {
    importMeta: import.meta,
    flags: {
      email: { type: 'string' },
      serverUrl: { type: 'string' },
      dryRun: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      plugin: { type: 'string', isMultiple: true },
      skill: { type: 'string', isMultiple: true },
      id: { type: 'string' },
    },
  },
);

async function confirm(message: string) {
  if (!stdin.isTTY) return false;
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (
      (await terminal.question(`${message} [y/N] `)).trim().toLowerCase() ===
      'y'
    );
  } finally {
    terminal.close();
  }
}

function authFlags() {
  return {
    email: cli.flags.email?.trim(),
    serverUrl: cli.flags.serverUrl?.trim(),
  };
}

async function cleanup() {
  const id = cli.flags.id?.trim();
  if (!id) throw new Error('--id is required and must not be blank.');
  const approved =
    cli.flags.yes ||
    (await confirm(
      `Permanently delete skill ${id}? Only continue for an ID a verify run created.`,
    ));
  if (!approved) throw new Error('Pass --yes to confirm the deletion.');
  const client = await createGleanClient(authFlags(), console.log);
  await client.skills.delete(id);
  console.log(`Deleted skill ${id}.`);
}

async function verify() {
  const approved =
    cli.flags.yes ||
    (await confirm(
      'This run publishes two generated test skills, downloads them, and permanently deletes them afterward.',
    ));
  if (!approved) throw new Error('Pass --yes to confirm the test run.');
  const client = await createGleanClient(authFlags(), console.log);
  console.log(
    await verifyImport(client.skills, {
      workDir: path.resolve('.cookbook-runs'),
      auth: authFlags(),
      log: console.log,
    }),
  );
}

async function importPlugin(input: string) {
  // Read the plugin before signing in so a wrong path fails immediately.
  const source = await openPluginSource(input);
  const client = await createGleanClient(authFlags(), console.log);
  const plan = await planImport(client.skills, source, {
    plugins: cli.flags.plugin,
    skills: cli.flags.skill,
    log: console.log,
  });
  console.log(`\n${formatPlan(plan)}\n`);

  const ready = importable(plan);
  const rejected = plan.skills.filter(
    (entry) => entry.action === 'invalid' || entry.action === 'conflict',
  ).length;
  if (cli.flags.dryRun) {
    console.log(
      `Dry run: nothing was published. ${ready.length} skill(s) ready to publish, ${rejected} invalid or conflicting.`,
    );
    if (rejected > 0) process.exitCode = 1;
    return;
  }
  if (ready.length === 0) {
    if (rejected > 0 || plan.skills.length === 0) {
      throw new Error('No skills are ready to publish.');
    }
    console.log(
      'Every skill matches its published version. Nothing to publish.',
    );
    return;
  }
  const approved =
    cli.flags.yes ||
    (await confirm(`Publish ${ready.length} skill(s) to Glean as yourself?`));
  if (!approved) {
    throw new Error(
      stdin.isTTY
        ? 'Nothing was published.'
        : 'Nothing was published. Pass --yes to publish when the terminal is not interactive.',
    );
  }

  const results = await applyImport(client.skills, plan, console.log);
  const summary = summarize(plan, results);
  console.log(`\n${summary.text}`);
  if (!summary.complete) process.exitCode = 1;
}

async function main() {
  const [command, extra] = cli.input;
  if (extra !== undefined) throw new Error(`Unexpected argument: ${extra}`);
  if (command === 'cleanup') return cleanup();
  if (command === 'verify') return verify();
  if (!command) {
    throw new Error(
      'Pass the plugin folder or zip to import. Run npm start -- --help for usage.',
    );
  }
  return importPlugin(command);
}

main().catch((error: unknown) => {
  printCliError(error);
  process.exitCode = 1;
});
