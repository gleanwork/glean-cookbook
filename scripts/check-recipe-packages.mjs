#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRecipePackageScripts } from './lib/recipe-package-scripts.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const install = !process.argv.includes('--skip-install');

function run(command, args, recipePackage) {
  console.log(
    `\n==> ${recipePackage.relativeDirectory}: ${command} ${args.join(' ')}`,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: recipePackage.directory,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${recipePackage.relativeDirectory} failed ${command} ${args.join(' ')}${
              signal ? ` with signal ${signal}` : ` with exit code ${code}`
            }.`,
          ),
        );
      }
    });
  });
}

try {
  const packages = await runRecipePackageScripts({ repoRoot, install, run });
  console.log(
    `\nRecipe package checks passed for ${packages.length} package(s):\n${packages
      .map(
        (recipePackage) =>
          `- ${recipePackage.relativeDirectory}: ${recipePackage.script}`,
      )
      .join('\n')}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
