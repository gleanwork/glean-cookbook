import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { verifyFirstPersist } from './workflow.js';

const cli = meow(
  `
    Usage
      $ npm start -- [options]
      $ npm run verify -- [options]

    Options
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --yes          Confirm cleanup non-interactively

    Examples
      $ npm run verify -- --email you@example.com
      $ npm start -- --email you@example.com
  `,
  {
    importMeta: import.meta,
    flags: {
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

async function main() {
  if (cli.input.length > 0) {
    throw new Error(`Unexpected argument: ${cli.input[0]}`);
  }

  const cleanupApproved =
    cli.flags.yes ||
    (await confirm(
      'This run creates one uniquely named skill, downloads its latest content, and permanently deletes that run-owned skill.',
    ));
  if (!cleanupApproved) {
    throw new Error('Verification requires explicit cleanup confirmation.');
  }

  const client = await createGleanClient({
    email: cli.flags.email?.trim(),
    serverUrl: cli.flags.serverUrl?.trim(),
  });
  const result = await verifyFirstPersist(client.skills, {
    workDir: path.resolve('.cookbook-runs'),
    cleanup: true,
    log: console.log,
  });
  console.log(
    `Verified ${result.displayName} (${result.id}) at version ${result.version}.${result.minorVersion}; downloaded ${result.contentBytes} byte(s); cleanup completed.`,
  );
}

main().catch((error: unknown) => {
  const statusCode =
    typeof error === 'object' && error && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (statusCode === 404) {
    console.error(
      'This client already opts into experimental APIs. A 404 can mean Skills APIs are not enabled for this tenant, or the exact skill ID is wrong.',
    );
  }
  process.exitCode = 1;
});
