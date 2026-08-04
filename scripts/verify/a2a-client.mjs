// Three claims: the published agent card resolves, message/send returns a real
// answer (a Message or Task, not an error), and a follow-up carries the same
// context_id so multi-turn genuinely works. Plus one the recipe got wrong until
// it was run for real: the streamed turn must print its answer once, not once
// per event.
//
// The agent must be built by hand -- a published auto agent with a chat-message
// trigger -- so its id is a required fixture. The credential is the ordinary
// one; no per-agent Share-dialog token is needed.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Card fetch plus agent runs. No content written, but each run is recorded.
export const sideEffects = 'agent-run';

export const requiredEnv = [
  'GLEAN_API_TOKEN',
  'GLEAN_INSTANCE',
  'GLEAN_AGENT_ID',
];

export async function setup(context) {
  const cwd = path.join(context.repoRoot, 'recipes/a2a-client');
  // main.py drives all three turns and prints them in order, so one run covers
  // every claim; parse it rather than re-implement an A2A client here.
  const { stdout } = await execFileAsync('uv', ['run', '--locked', 'main.py'], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { output: stdout };
}

/** Longest string that appears twice back to back, i.e. a duplicated answer. */
function isDoubled(text) {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const half = trimmed.slice(0, Math.floor(trimmed.length / 2));
  return trimmed.startsWith(half + half.slice(0, 40));
}

export async function run(query, context) {
  const { output } = context;
  const turn1 = output.match(/\[turn 1\] (.*)/)?.[1]?.trim() ?? '';
  const turn2 =
    output.match(/\[turn 2, same context\] (.*)/)?.[1]?.trim() ?? '';
  const streamed =
    output.match(/\[turn 3, streaming\] ([\s\S]*)/)?.[1]?.trim() ?? '';

  if (!turn1) {
    return 'turn 1 produced no answer — message/send returned nothing usable';
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
  // Streaming events carry cumulative text; printing each whole repeats the
  // answer. That shipped undetected until a real run, so assert against it.
  if (isDoubled(streamed)) {
    return (
      'the streamed answer is printed more than once — streaming events carry ' +
      'the answer accumulated so far, so only the delta should be emitted'
    );
  }
  return null;
}
