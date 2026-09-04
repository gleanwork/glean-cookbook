import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { missingCleanupConfirmation, printCliError } from './errors.js';
import { verifiedSuccessLine, verifyFirstPersist } from './workflow.js';

const SAMPLE_BUNDLE = 'fixtures/sample-skill/SKILL.md';

const cli = meow(
  `
    Usage
      $ npm start -- [options]
      $ npm run verify -- [options]
      $ npm start -- cleanup --id <skill-id> [options]

    Options
      --bundle       Local SKILL.md to validate and persist (npm start default: ${SAMPLE_BUNDLE})
      --id           Exact run-owned skill ID to delete
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --yes          Confirm cleanup non-interactively

    Examples
      $ npm run verify -- --email you@example.com
      $ npm start -- --email you@example.com --yes
      $ npm start -- --bundle path/to/SKILL.md --email you@example.com --yes
  `,
  {
    importMeta: import.meta,
    flags: {
      bundle: { type: 'string' },
      id: { type: 'string' },
      email: { type: 'string' },
      serverUrl: { type: 'string' },
      yes: { type: 'boolean', default: false },
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

async function main() {
  const command = cli.input[0];
  if (command && command !== 'cleanup') {
    throw new Error(`Unexpected argument: ${command}`);
  }
  if (cli.input.length > 1) {
    throw new Error(`Unexpected argument: ${cli.input[1]}`);
  }

  if (command === 'cleanup') {
    const id = required(cli.flags.id, '--id');
    const approved =
      cli.flags.yes ||
      (await confirm(
        `Permanently delete skill ${id}? Only continue for an ID created by this run.`,
      ));
    if (!approved) throw new Error(missingCleanupConfirmation(stdin.isTTY));
    const client = await createGleanClient(
      {
        email: cli.flags.email?.trim(),
        serverUrl: cli.flags.serverUrl?.trim(),
      },
      console.log,
    );
    await client.skills.delete(id);
    console.log(`Deleted skill ${id}.`);
    return;
  }

  const cleanupApproved =
    cli.flags.yes ||
    (await confirm(
      'This run creates one skill, downloads its latest content, and permanently deletes that run-owned skill.',
    ));
  if (!cleanupApproved) {
    throw new Error(missingCleanupConfirmation(stdin.isTTY));
  }

  const client = await createGleanClient(
    {
      email: cli.flags.email?.trim(),
      serverUrl: cli.flags.serverUrl?.trim(),
    },
    console.log,
  );
  const result = await verifyFirstPersist(client.skills, {
    workDir: path.resolve('.cookbook-runs'),
    cleanup: true,
    bundlePath: cli.flags.bundle?.trim(),
    log: console.log,
  });
  console.log(verifiedSuccessLine(result));
}

main().catch((error: unknown) => {
  printCliError(error);
  process.exitCode = 1;
});
