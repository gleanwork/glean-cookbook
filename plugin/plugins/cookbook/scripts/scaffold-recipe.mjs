#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'gleanwork/glean-cookbook';
const TIGED_VERSION = 'tiged@2.12.8';

function usage() {
  console.error(
    'Usage: scaffold-recipe.mjs <recipe-id> [--variant <name>] <target-dir>',
  );
  process.exit(1);
}

function parseArgs(argv) {
  let variant;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--variant') {
      variant = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  const [recipeId, targetDir] = positional;
  if (!recipeId || !targetDir) usage();
  return { recipeId, variant, targetDir };
}

function listEnvKeys(targetDir) {
  const envExample = path.join(targetDir, '.env.example');
  if (!fs.existsSync(envExample)) return [];
  return fs
    .readFileSync(envExample, 'utf8')
    .split('\n')
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);
}

function install(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'package.json'))) {
    console.log(`\nInstalling dependencies: npm install`);
    execFileSync('npm', ['install'], { cwd: targetDir, stdio: 'inherit' });
    return true;
  }
  if (fs.existsSync(path.join(targetDir, 'requirements.txt'))) {
    console.log(`\nInstalling dependencies: pip install -r requirements.txt`);
    execFileSync('pip', ['install', '-r', 'requirements.txt'], {
      cwd: targetDir,
      stdio: 'inherit',
    });
    return true;
  }
  return false;
}

function main() {
  const { recipeId, variant, targetDir } = parseArgs(process.argv.slice(2));
  const subPath = variant ? `recipes/${recipeId}/${variant}` : `recipes/${recipeId}`;
  const source = `${REPO}/${subPath}`;

  console.log(`Scaffolding ${source} -> ${targetDir}`);
  execFileSync('npx', ['-y', TIGED_VERSION, '--mode=git', source, targetDir], {
    stdio: 'inherit',
  });

  const envKeys = listEnvKeys(targetDir);
  if (envKeys.length > 0) {
    console.log(
      `\nThis recipe needs these environment variables (see .env.example):`,
    );
    for (const key of envKeys) console.log(`  - ${key}`);
    console.log(`Write them to ${path.join(targetDir, '.env')} before running.`);
  }

  install(targetDir);

  console.log('\nScaffold complete.');
}

main();
