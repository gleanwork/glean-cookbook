import fs from 'node:fs/promises';
import path from 'node:path';

const PACKAGE_ROOTS = ['recipes', 'examples'];

async function packageFilesUnder(directory) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await packageFilesUnder(entryPath)));
    else if (entry.name === 'package.json') files.push(entryPath);
  }
  return files;
}

export function selectedScript(packageJson) {
  if (packageJson.scripts?.check) return 'check';
  if (packageJson.scripts?.test) return 'test';
  return undefined;
}

export async function discoverRecipePackageScripts(repoRoot) {
  const packageFiles = (
    await Promise.all(
      PACKAGE_ROOTS.map((directory) =>
        packageFilesUnder(path.join(repoRoot, directory)),
      ),
    )
  )
    .flat()
    .sort();

  const packages = [];
  for (const packageFile of packageFiles) {
    const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    const script = selectedScript(packageJson);
    if (!script) continue;

    const directory = path.dirname(packageFile);
    const lockFile = path.join(directory, 'package-lock.json');
    try {
      await fs.access(lockFile);
    } catch {
      throw new Error(
        `${path.relative(repoRoot, packageFile)} declares ${script} but has no package-lock.json.`,
      );
    }

    packages.push({
      directory,
      name: packageJson.name ?? path.relative(repoRoot, directory),
      relativeDirectory: path.relative(repoRoot, directory),
      script,
    });
  }
  return packages;
}

export async function runRecipePackageScripts({
  repoRoot,
  install = true,
  run,
}) {
  const packages = await discoverRecipePackageScripts(repoRoot);
  const results = [];

  for (const recipePackage of packages) {
    if (install) {
      await run('npm', ['ci'], recipePackage);
    }
    await run('npm', ['run', recipePackage.script], recipePackage);
    results.push(recipePackage);
  }

  return results;
}
