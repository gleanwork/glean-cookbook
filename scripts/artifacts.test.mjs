import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { compileArtifacts, materializeArtifacts } from './lib/artifacts.mjs';

test('one artifact definition can materialize identical standalone outputs', async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-'));
  t.after(() => fs.remove(repoRoot));
  const outputs = await compileArtifacts(
    [
      {
        id: 'shared-runtime',
        content: async () => 'shared\n',
        targets: async () => ['a/runtime.ts', 'b/runtime.ts'],
      },
    ],
    { repoRoot },
  );

  assert.equal((await materializeArtifacts(outputs)).length, 2);
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'a/runtime.ts'), 'utf8'),
    'shared\n',
  );
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'b/runtime.ts'), 'utf8'),
    'shared\n',
  );
  assert.equal(
    (await materializeArtifacts(outputs, { check: true })).length,
    0,
  );
});

test('check reports drift without changing the file', async (t) => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-'));
  t.after(() => fs.remove(repoRoot));
  await fs.outputFile(path.join(repoRoot, 'output.txt'), 'old\n');
  const outputs = await compileArtifacts(
    [
      {
        id: 'example',
        content: async () => 'new\n',
        targets: async () => ['output.txt'],
      },
    ],
    { repoRoot },
  );

  assert.equal(
    (await materializeArtifacts(outputs, { check: true })).length,
    1,
  );
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'output.txt'), 'utf8'),
    'old\n',
  );
});

test('duplicate artifact ownership fails before writing', async () => {
  await assert.rejects(
    compileArtifacts(
      [
        { id: 'one', content: async () => '1', targets: async () => ['x'] },
        { id: 'two', content: async () => '2', targets: async () => ['x'] },
      ],
      { repoRoot: '/tmp/artifacts' },
    ),
    /produced by both one and two/,
  );
});
