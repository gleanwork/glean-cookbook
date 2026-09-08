import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { readBundle } from './bundle.js';
import { missingCleanupConfirmation, printCliError } from './errors.js';
import {
  cleanupCommand,
  findSkillByName,
  publishAndStage,
  verifiedSuccessLine,
  verifyPublishingLifecycle,
} from './workflow.js';

const SAMPLE_BUNDLE = 'fixtures/sample-skill/SKILL.md';

const cli = meow(
  `
    Usage
      $ npm start -- publish [options]
      $ npm start -- verify [options]
      $ npm start -- cleanup --id <skill-id> [options]

    Options
      --bundle       SKILL.md, .zip, or .skill (publish default: ${SAMPLE_BUNDLE})
      --id           Exact run-owned skill ID to delete
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --yes          Confirm supersession or cleanup non-interactively
      --stage-dir    Sandbox for downloaded content (default: staged)

    Examples
      $ npm start -- publish --email you@example.com
      $ npm start -- publish --bundle path/to/SKILL.md --email you@example.com
      $ npm run verify -- --email you@example.com
  `,
  {
    importMeta: import.meta,
    flags: {
      bundle: { type: 'string' },
      id: { type: 'string' },
      email: { type: 'string' },
      serverUrl: { type: 'string' },
      yes: { type: 'boolean', default: false },
      stageDir: { type: 'string', default: 'staged' },
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

function required(value: string | undefined, flag: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${flag} is required and must not be blank.`);
  return trimmed;
}

function authFlags() {
  return {
    email: cli.flags.email?.trim(),
    serverUrl: cli.flags.serverUrl?.trim(),
  };
}

async function main() {
  const command = cli.input[0];
  if (!command || !['publish', 'verify', 'cleanup'].includes(command)) {
    throw new Error('Choose one command: publish, verify, or cleanup.');
  }
  if (cli.input.length > 1) {
    throw new Error(`Unexpected argument: ${cli.input[1]}`);
  }

  if (command === 'verify') {
    const cleanupApproved =
      cli.flags.yes ||
      (await confirm(
        'This run creates one uniquely named skill, publishes a second version, stages that zip in a sandbox, and permanently deletes that run-owned skill.',
      ));
    if (!cleanupApproved) {
      throw new Error(missingCleanupConfirmation(stdin.isTTY));
    }
    const client = await createGleanClient(authFlags(), console.log);
    const result = await verifyPublishingLifecycle(client.skills, {
      workDir: path.resolve('.cookbook-runs'),
      cleanup: true,
      auth: authFlags(),
      log: console.log,
    });
    console.log(verifiedSuccessLine(result));
    return;
  }

  if (command === 'cleanup') {
    const id = required(cli.flags.id, '--id');
    const approved =
      cli.flags.yes ||
      (await confirm(
        `Permanently delete skill ${id} and every version? Only continue for an ID created by this run.`,
      ));
    if (!approved) throw new Error(missingCleanupConfirmation(stdin.isTTY));
    const client = await createGleanClient(authFlags(), console.log);
    await client.skills.delete(id);
    console.log(`Deleted skill ${id}.`);
    return;
  }

  const bundlePath = cli.flags.bundle?.trim() || SAMPLE_BUNDLE;
  const client = await createGleanClient(authFlags(), console.log);
  const bundle = await readBundle(bundlePath);
  const validation = await client.skills.validate({ file: bundle });
  const existingId = await findSkillByName(
    client.skills,
    validation.metadata.display_name,
  );
  if (existingId) {
    const approved =
      cli.flags.yes ||
      (await confirm(
        `A skill named "${validation.metadata.display_name}" already exists as ${existingId}. Publishing will add a version to that skill.`,
      ));
    if (!approved) throw new Error('Publish cancelled before supersession.');
  }

  const { result, files, destination } = await publishAndStage(client.skills, {
    bundlePath,
    stageDir: cli.flags.stageDir,
    log: console.log,
  });
  console.log(`Staged ${files.length} untrusted file(s) in ${destination}.`);
  console.log(
    `Review the staged files. Nothing was executed. To remove this skill, run:\n  ${cleanupCommand(result.id, authFlags())}`,
  );
}

main().catch((error: unknown) => {
  printCliError(error);
  process.exitCode = 1;
});
