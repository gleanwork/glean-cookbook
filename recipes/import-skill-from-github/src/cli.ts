import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { missingCleanupConfirmation, printCliError } from './errors.js';
import { PINNED_SOURCE_URL } from './fixture.js';
import { importedSuccessLine, importSkillFromGithub } from './workflow.js';

const cli = meow(
  `
    Usage
      $ npm start -- [options]
      $ npm run verify -- [options]
      $ npm start -- cleanup --id <skill-id> [options]

    Options
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --source-url   GitHub skill directory URL (default: skill-creator at commit 41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f)
      --stream       Request repository scan progress as server-sent events
      --id           Exact run-owned skill ID to delete
      --yes          Confirm cleanup non-interactively

    Examples
      $ npm run verify -- --email you@example.com
      $ npm start -- --email you@example.com --yes --stream
  `,
  {
    importMeta: import.meta,
    flags: {
      email: { type: 'string' },
      serverUrl: { type: 'string' },
      sourceUrl: { type: 'string', default: PINNED_SOURCE_URL },
      stream: { type: 'boolean', default: false },
      id: { type: 'string' },
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
      'This run previews a public GitHub skill, imports it, syncs that captured ID, and permanently deletes only skills this run created.',
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
  const result = await importSkillFromGithub(client.skills, {
    sourceUrl: cli.flags.sourceUrl,
    stream: cli.flags.stream,
    cleanup: true,
    log: console.log,
  });
  console.log(importedSuccessLine(result));
}

main().catch((error: unknown) => {
  printCliError(error);
  process.exitCode = 1;
});
