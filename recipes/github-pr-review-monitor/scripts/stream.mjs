// The monitor stream: queued events out, one per line.
//
// Claude Code's Monitor tool turns one stdout LINE into one transcript message,
// so every write here is a single compact JSON object terminated by a newline.
// `fs.writeSync(1, ...)` rather than console.log, because a buffered write makes
// a working monitor look dead.
//
// This is event-driven, not a poll loop. `fs.watch` sits on the state directory
// (not the journal file, which is truncated and recreated by resets) and drains
// on the filesystem's own change notification -- FSEvents on macOS, inotify on
// Linux. The only timer is the heartbeat, which exists to prove liveness rather
// than to look for work; it drains too, so a change notification that a network
// or virtualised filesystem failed to deliver still surfaces within one beat
// instead of being lost.
//
// Nothing here knows what a pull request is. It ships whatever the receiver
// queued, from whichever datasource the configured presets came from.

import fs from 'node:fs';
import path from 'node:path';

import { loadEnv, stateDir } from '../lib/config.mjs';

loadEnv();

const HEARTBEAT_MS = Number(process.env.GLEAN_MONITOR_HEARTBEAT_MS || 60_000);

const directory = stateDir();
const eventsFile = path.join(directory, 'events.ndjson');
const cursorFile = path.join(directory, 'monitor-offset');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

let offset = fs.existsSync(cursorFile)
  ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0
  : 0;
let lastActivity = Date.now();

function emit(object) {
  fs.writeSync(1, `${JSON.stringify(object)}\n`);
  lastActivity = Date.now();
}

emit({
  monitor: 'glean-trigger-events',
  journal: eventsFile,
  startedFrom: offset,
  note: 'One line per delivered event. A heartbeat line means the stream is alive and nothing arrived.',
});

function drain() {
  if (!fs.existsSync(eventsFile)) return;
  const size = fs.statSync(eventsFile).size;
  // A reset truncates the journal and rewinds the cursor with it, so a smaller
  // file than the recorded offset means start over rather than read backwards.
  if (size < offset) offset = 0;
  if (size <= offset) return;

  const length = size - offset;
  const buffer = Buffer.alloc(length);
  const descriptor = fs.openSync(eventsFile, 'r');
  fs.readSync(descriptor, buffer, 0, length, offset);
  fs.closeSync(descriptor);

  const chunk = buffer.toString('utf8');
  // Only whole lines are shipped; a half-written record stays behind the cursor
  // until its newline arrives.
  const lastNewline = chunk.lastIndexOf('\n');
  if (lastNewline === -1) return;

  for (const line of chunk.slice(0, lastNewline).split('\n')) {
    // Already one JSON object per line; passed through unchanged so the
    // transcript shows exactly what was queued.
    if (line) {
      fs.writeSync(1, `${line}\n`);
      lastActivity = Date.now();
    }
  }
  offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1));
  fs.writeFileSync(cursorFile, String(offset), { mode: 0o600 });
}

drain();

// Watch the directory: the journal is replaced wholesale by a reset, and a
// watcher bound to the old inode would go deaf at exactly that moment.
const watcher = fs.watch(directory, (_kind, filename) => {
  if (!filename || filename === 'events.ndjson') drain();
});
watcher.on('error', (error) => {
  // A dead watcher must not look like a quiet repository.
  emit({ watchError: error.message, note: 'falling back to heartbeat drains' });
});

// Silence is ambiguous: a quiet repository and a dead receiver produce
// identical output, which is none. The heartbeat is what makes the
// difference observable from inside the transcript.
setInterval(() => {
  drain();
  if (Date.now() - lastActivity >= HEARTBEAT_MS) {
    emit({ heartbeat: true, at: new Date().toISOString() });
  }
}, HEARTBEAT_MS);
