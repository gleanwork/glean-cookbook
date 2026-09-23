#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileArtifacts, materializeArtifacts } from './lib/artifacts.mjs';
import {
  compileFrameworkFeatures,
  discoverFrameworkContracts,
} from './lib/framework-features.mjs';

export async function discoverContractRuns(
  repoRoot,
  { nodePath = process.execPath } = {},
) {
  const contracts = await discoverFrameworkContracts(repoRoot);
  const runs = [];
  if (contracts.typescript.length > 0) {
    runs.push({
      command: nodePath,
      args: ['--import', 'tsx', '--test', ...contracts.typescript],
    });
  }
  for (const file of contracts.python) {
    runs.push({ command: 'uv', args: ['run', '--locked', '--script', file] });
  }
  return runs;
}

function runContract(run, repoRoot) {
  console.log(`\n==> ${run.command} ${run.args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(run.command, run.args, {
      cwd: repoRoot,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${run.command} ${run.args.join(' ')}${
              signal
                ? ` exited with signal ${signal}`
                : ` exited with code ${code}`
            }`,
          ),
        );
      }
    });
  });
}

async function main() {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const args = process.argv.slice(2);
  const unsupported = args.filter((argument) => argument !== '--contracts');
  if (unsupported.length > 0) {
    throw new Error(`Unknown argument: ${unsupported.join(', ')}`);
  }

  const { artifactDefinitions, summary } = await compileFrameworkFeatures({
    repoRoot,
  });
  const plan = await compileArtifacts(artifactDefinitions, { repoRoot });
  const stale = await materializeArtifacts(plan, { check: true });
  if (stale.length > 0) {
    throw new Error(
      `Generated framework feature targets are stale:\n${stale
        .map((output) => `  ${path.relative(repoRoot, output.file)}`)
        .join('\n')}\nRun \`mise exec -- pnpm build:artifacts\`.`,
    );
  }
  console.log(
    `${summary.useCount} framework feature uses across ${summary.featureCount} features are valid.`,
  );

  if (args.includes('--contracts')) {
    const runs = await discoverContractRuns(repoRoot);
    for (const run of runs) await runContract(run, repoRoot);
    console.log(`\n${runs.length} framework feature contract runs passed.`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
