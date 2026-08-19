// The monitor stream: queued events out, one per line.
//
// Claude Code's Monitor tool turns one stdout LINE into one transcript message,
// so every write here is a single compact JSON object terminated by a newline.
// `fs.writeSync(1, ...)` rather than console.log, because a buffered write makes
// a working monitor look dead.
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

function poll() {
  if (fs.existsSync(eventsFile)) {
    const size = fs.statSync(eventsFile).size;
    if (size < offset) offset = 0;
    if (size > offset) {
      const length = size - offset;
      const buffer = Buffer.alloc(length);
      const descriptor = fs.openSync(eventsFile, 'r');
      fs.readSync(descriptor, buffer, 0, length, offset);
      fs.closeSync(descriptor);

      const chunk = buffer.toString('utf8');
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline !== -1) {
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
    }
  }

  // Silence is ambiguous: a quiet repository and a dead receiver produce
  // identical output, which is none. The heartbeat is what makes the
  // difference observable from inside the transcript.
  if (Date.now() - lastActivity >= HEARTBEAT_MS) {
    emit({ heartbeat: true, at: new Date().toISOString() });
  }
}

poll();
setInterval(poll, 750);
