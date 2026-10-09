// Run a recipe's authored step commands, unmodified, in a real shell.
//
// A reader pastes numbered commands into one terminal, so a `cd` in one step
// carries into the next. Modelling that with patterns has failed before (a
// checker accepted `cd <project> && ...` on every step), so this runs the
// actual commands in /bin/bash and lets the shell decide. Every external
// program is replaced by a stub that records its working directory; the
// scaffold stub recreates the recipe's real directory tree, so a `cd` succeeds
// only where it would for the reader. Nothing touches the network.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SHELL = '/bin/bash';
const COOKBOOK_SOURCE = 'gleanwork/glean-cookbook/';
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.venv',
  '__pycache__',
  'dist',
  'node_modules',
]);
// Shell keywords and builtins run for real; everything else is stubbed.
const BUILTINS = new Set([
  '.',
  ':',
  '[',
  'builtin',
  'cd',
  'echo',
  'eval',
  'exit',
  'export',
  'false',
  'printf',
  'pwd',
  'set',
  'source',
  'test',
  'true',
  'unset',
]);

export function scaffoldOf(command) {
  const words = command.trim().split(/\s+/u);
  const tiged = words.findIndex((word) => /^tiged(?:@\S+)?$/u.test(word));
  if (tiged === -1) return undefined;
  const source = words
    .slice(tiged + 1)
    .find((word) => !word.startsWith('-') && word.includes('/'));
  return { source, target: words.at(-1) };
}

// First word of each simple command, so each one can be given a stub.
function programNames(command) {
  const names = new Set();
  for (const segment of command.split(/&&|\|\||[;|\n()]/u)) {
    const word = segment
      .trim()
      .split(/\s+/u)
      .find((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token));
    if (word && !BUILTINS.has(word) && /^[\w@./+-]+$/u.test(word)) {
      names.add(word);
    }
  }
  return names;
}

function directoriesIn(root, relative = '') {
  const directories = [];
  for (const entry of fs.readdirSync(path.join(root, relative), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const child = path.posix.join(relative, entry.name);
    directories.push(child, ...directoriesIn(root, child));
  }
  return directories;
}

// Stub scripts are written once per process: macOS scans each new executable
// on its first run, which costs more than the whole check. Every program name
// is a symlink to `stub`, which logs the name it was called by. `npx` also
// creates the directories listed for its last argument (the scaffold target)
// in the plain-text $STEP_SCAFFOLDS file.
let stubs;
function stubScripts() {
  if (stubs) return stubs;
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-step-stubs-')),
  );
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  const log = `printf 'CALL\\t%s\\t%s\\n' "\${0##*/}" "$PWD" >> "$STEP_LOG"`;
  const write = (name, lines) =>
    fs.writeFileSync(
      path.join(dir, name),
      ['#!/bin/sh', ...lines, ''].join('\n'),
      {
        mode: 0o755,
      },
    );
  write('stub', [log]);
  write('npx', [
    log,
    'for last; do :; done',
    'while IFS= read -r directory; do',
    '  case "$directory" in "$last"|"$last"/*) /bin/mkdir -p "$directory" ;; esac',
    'done < "$STEP_SCAFFOLDS"',
  ]);
  stubs = { stub: path.join(dir, 'stub'), npx: path.join(dir, 'npx') };
  return stubs;
}

// The directory tree each scaffold download would create.
function scaffoldDirectories(repoRoot, scaffolds) {
  return scaffolds.flatMap(({ source, target }) => {
    const repoPath = source?.startsWith(COOKBOOK_SOURCE)
      ? source.slice(COOKBOOK_SOURCE.length)
      : undefined;
    const tree =
      repoPath && fs.existsSync(path.join(repoRoot, repoPath))
        ? directoriesIn(path.join(repoRoot, repoPath))
        : [];
    return [target, ...tree.map((dir) => `${target}/${dir}`)];
  });
}

function shellScript(entries) {
  return [
    // `cd` inside `a && b` does not trip `set -e`, so record every failure.
    'cd() { builtin cd "$@" 2>/dev/null || { printf \'CDFAIL\\t%s\\t%s\\n\' "$PWD" "$*" >> "$STEP_LOG"; exit 96; }; }',
    'set -e',
    'builtin cd "$STEP_START"',
    ...entries.flatMap(({ index, command }) => [
      `printf 'STEP\\t%s\\n' ${index} >> "$STEP_LOG"`,
      command,
    ]),
    '',
  ].join('\n');
}

/**
 * Execute one ordered step list.
 *
 * Returns `{ calls, failure }`: every stubbed program call with the step and
 * directory it ran in (relative to the starting directory), and the first
 * shell failure, if any.
 */
export function runStepSequence({ repoRoot, steps }) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-steps-')),
  );
  try {
    const start = path.join(root, 'start');
    const bin = path.join(root, 'bin');
    const log = path.join(root, 'log');
    fs.mkdirSync(start);
    fs.mkdirSync(bin);
    fs.writeFileSync(log, '');

    const commands = steps
      .map((step, index) => ({ ...step, index }))
      .filter((step) => step.command);
    const scaffolds = commands
      .map((step) => scaffoldOf(step.command))
      .filter(Boolean);
    const names = new Set(
      commands.flatMap((step) => [...programNames(step.command)]),
    );
    names.delete('npx');
    const { stub, npx } = stubScripts();
    for (const name of names) fs.symlinkSync(stub, path.join(bin, name));
    fs.symlinkSync(npx, path.join(bin, 'npx'));
    const scaffoldFile = path.join(root, 'scaffolds');
    fs.writeFileSync(
      scaffoldFile,
      scaffoldDirectories(repoRoot, scaffolds).join('\n') + '\n',
    );

    // Each terminal is one shell. A `newTerminal` step opens another one in the
    // starting directory; later steps continue in that newest terminal.
    const terminals = [];
    for (const step of commands) {
      if (step.newTerminal || terminals.length === 0) terminals.push([]);
      terminals.at(-1).push(step);
    }

    let failure;
    for (const entries of terminals) {
      const result = spawnSync(SHELL, ['-c', shellScript(entries)], {
        encoding: 'utf8',
        env: {
          PATH: bin,
          HOME: root,
          STEP_LOG: log,
          STEP_SCAFFOLDS: scaffoldFile,
          STEP_START: start,
        },
      });
      if (result.status !== 0) {
        failure = { status: result.status, stderr: result.stderr.trim() };
        break;
      }
    }

    const relative = (directory) =>
      path.relative(start, fs.realpathSync(directory)) || '.';
    const calls = [];
    let step;
    for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
      const [kind, first, second] = line.split('\t');
      if (kind === 'STEP') step = Number(first);
      if (kind === 'CALL')
        calls.push({ step, program: first, cwd: relative(second) });
      // A failed `cd` inside a subshell exits only that subshell, so the
      // record, not the exit status, is what proves it failed.
      if (kind === 'CDFAIL' && !failure?.cd) {
        failure = {
          ...failure,
          step,
          cd: { from: relative(first), to: second },
        };
      }
    }
    if (failure && failure.step === undefined) failure.step = step;
    return { calls, failure };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
