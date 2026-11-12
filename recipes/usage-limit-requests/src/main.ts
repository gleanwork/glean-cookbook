import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseCommand } from './cli.js';
import { connect, directoryLookup } from './client.js';
import { run } from './commands.js';
import { formatError } from './errors.js';

async function main() {
  const command = parseCommand();
  const { glean, requests } = connect();
  const terminal = stdin.isTTY
    ? readline.createInterface({ input: stdin, output: stdout })
    : undefined;

  try {
    await run(command, {
      requests,
      log: console.log,
      confirm: terminal
        ? async (question) =>
            /^y(es)?$/iu.test((await terminal.question(question)).trim())
        : undefined,
      lookupUser: directoryLookup(glean),
    });
  } finally {
    terminal?.close();
  }
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
