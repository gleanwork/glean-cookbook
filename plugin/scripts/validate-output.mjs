import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateOutput } from '@gleanwork/pluginpack';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const targets = ['claude', 'cursor', 'codex'];

for (const target of targets) {
  const manifestFile = path.join(repoRoot, '.pluginpack', `${target}.json`);
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  const stagingDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `glean-cookbook-${target}-`),
  );

  try {
    for (const relativeFile of manifest.files) {
      const source = path.join(repoRoot, relativeFile);
      const destination = path.join(stagingDir, relativeFile);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
    }

    const result = await validateOutput(target, stagingDir);
    for (const issue of result.issues) {
      const log = issue.level === 'error' ? console.error : console.warn;
      log(`${target} ${issue.level}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    else console.log(`${target} validation passed.`);
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}
