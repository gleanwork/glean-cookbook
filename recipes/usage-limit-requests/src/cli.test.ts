import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseCommand } from './cli.js';

test('defaults the queue to pending requests', () => {
  assert.deepEqual(parseCommand(['queue']), {
    name: 'queue',
    statuses: ['PENDING'],
    pages: 1,
  });
  assert.deepEqual(parseCommand(['mine', '--status', 'approved,denied']), {
    name: 'mine',
    statuses: ['APPROVED', 'DENIED'],
    pages: 1,
  });
});

test('keeps approval and denial inputs apart', () => {
  assert.throws(() => parseCommand(['approve', 'req-1']), /needs --amount/);
  assert.throws(
    () => parseCommand(['approve', 'req-1', '--amount', '5', '--note', 'ok']),
    /cannot record a note/,
  );
  assert.throws(
    () => parseCommand(['deny', 'req-1', '--amount', '5']),
    /cannot record --amount/,
  );
  assert.throws(() => parseCommand(['deny']), /needs a request ID/);
});

test('rejects unknown commands and statuses', () => {
  assert.throws(() => parseCommand(['purge']), /Unknown command/);
  assert.throws(
    () => parseCommand(['queue', '--status', 'OPEN']),
    /--status accepts/,
  );
  assert.throws(() => parseCommand(['queue', '--pages', '11']), /--pages/);
});
