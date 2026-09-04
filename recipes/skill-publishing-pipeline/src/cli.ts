import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import meow from 'meow';
import { createGleanClient } from './client.js';
import { readBundle, readStream, stageDownloadedBundle } from './bundle.js';
import {
  findSkillByName,
  publishBundle,
  verifyPublishingLifecycle,
} from './workflow.js';

const cli = meow(
  `
    Usage
      $ npm start -- publish --bundle <path> [options]
      $ npm start -- verify [options]
      $ npm start -- cleanup --id <skill-id> [options]

    Options
      --bundle       SKILL.md, .zip, or .skill to validate and publish
      --id           Exact run-owned skill ID to delete
      --email        Work email used to discover the Glean backend
      --server-url   Complete Glean backend origin; overrides --email
      --yes          Confirm supersession or cleanup non-interactively
      --stage-dir    Sandbox for downloaded content (default: staged)

    Examples
      $ npm start -- publish --bundle fixtures/sample-skill/SKILL.md --email you@example.com
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

async function main() {
  const command = cli.input[0];
  if (!command || !['publish', 'verify', 'cleanup'].includes(command)) {
    throw new Error('Choose one command: publish, verify, or cleanup.');
  }
  if (cli.input.length > 1) {
    throw new Error(`Unexpected argument: ${cli.input[1]}`);
  }

  const client = await createGleanClient({
    email: cli.flags.email?.trim(),
    serverUrl: cli.flags.serverUrl?.trim(),
  });

  if (command === 'verify') {
    const cleanupApproved =
      cli.flags.yes ||
      (await confirm(
        'Verification creates one uniquely named skill, publishes a second version, stages that zip in a sandbox, and permanently deletes that run-owned skill.',
      ));
    if (!cleanupApproved) {
      throw new Error('Verification requires explicit cleanup confirmation.');
    }
    const result = await verifyPublishingLifecycle(client.skills, {
      workDir: path.resolve('.cookbook-runs'),
      cleanup: true,
      log: console.log,
    });
    console.log(
      `Verified ${result.displayName} (${result.id}) at version ${result.version}.${result.minorVersion}; cleanup completed.`,
    );
    return;
  }

  if (command === 'cleanup') {
    const id = required(cli.flags.id, '--id');
    const approved =
      cli.flags.yes ||
      (await confirm(
        `Permanently delete skill ${id} and every version? Only continue for an ID created by this run.`,
      ));
    if (!approved) throw new Error('Cleanup cancelled.');
    await client.skills.delete(id);
    console.log(`Deleted skill ${id}.`);
    return;
  }

  const bundlePath = required(cli.flags.bundle, '--bundle');
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

  const result = await publishBundle(client.skills, bundlePath);
  const response = await client.skills.retrieveContent(result.id);
  const destination = path.resolve(cli.flags.stageDir, result.id);
  const files = await stageDownloadedBundle(
    await readStream(response.result),
    destination,
  );
  console.log(
    `Published ${result.displayName} (${result.id}) at version ${result.version}.${result.minorVersion}.`,
  );
  console.log(`Staged ${files.length} untrusted file(s) in ${destination}.`);
  console.log(
    `Review the staged files. Nothing was executed. To remove this skill, run:\n  npm start -- cleanup --id ${result.id}`,
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
      'This client already opts into experimental APIs. For create or validate, a 404 can mean Skills APIs are not enabled for this tenant; for retrieve or delete, confirm the exact skill ID.',
    );
  }
  process.exitCode = 1;
});
