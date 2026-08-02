// Three claims: the published agent card resolves, message/send returns a real
// answer (a Message or Task, not an error), and a follow-up carries the same
// context_id so multi-turn genuinely works. The card URL and per-agent bearer
// token come from the agent's Share -> A2A dialog and can't be scripted, so
// they're required environment -- a one-time Admin Console fixture.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const requiredEnv = ['GLEAN_A2A_CARD_URL', 'GLEAN_A2A_TOKEN'];

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/a2a-client');
  // main.py drives all three turns itself and prints them in order, so one run
  // covers every claim; parse rather than re-implement the A2A client here.
  const { stdout } = await execFileAsync('uv', ['run', '--locked', 'main.py'], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { output: stdout };
}

export async function run(query, context) {
  const { output } = context;
  const turn1 = output.match(/\[turn 1\] (.*)/)?.[1]?.trim() ?? '';
  const turn2 =
    output.match(/\[turn 2, same context\] (.*)/)?.[1]?.trim() ?? '';
  const streamed =
    output.match(/\[turn 3, streaming\] (.*)/s)?.[1]?.trim() ?? '';

  if (!turn1) {
    return 'turn 1 produced no answer — message/send returned nothing usable';
  }
  // The recipe's demo query asks who owns the payments service; a real answer
  // names someone rather than refusing.
  if (/don't (have|know)|no information|unable/i.test(turn1)) {
    return `turn 1 refused instead of answering: ${turn1.slice(0, 160)}`;
  }
  if (!turn2) {
    return (
      'turn 2 produced no answer — the follow-up reusing context_id failed, ' +
      'so multi-turn is not working'
    );
  }
  if (!streamed) {
    return 'turn 3 produced no streamed output — message/stream is not working';
  }
  return null;
}
