import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import fg from 'fast-glob';
import fs from 'fs-extra';

import {
  validateDependencyVersions,
  validatePackageDependencies,
  validateUvLockDependencies,
  validateUvScriptDependencies,
} from './framework-dependencies.mjs';
import { readJsonc } from './jsonc.mjs';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const MARKER_PATTERN =
  /^(?:#|\/\/) GLEAN_FRAMEWORK_FEATURE: ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/u;
const MARKER_SCAN_LINES = 12;
const LANGUAGES = {
  python: { comment: '#', manifestKind: 'uv-script' },
  typescript: { comment: '//', manifestKind: 'package-json' },
};

const schema = JSON.parse(
  fs.readFileSync(
    new URL('../../schemas/framework-feature.schema.json', import.meta.url),
    'utf8',
  ),
);
const validateFeature = new Ajv2020({ allErrors: true }).compile(schema);

function fail(message) {
  throw new Error(`Framework feature validation failed: ${message}`);
}

function repoPath(repoRoot, absolute) {
  return path.relative(repoRoot, absolute).split(path.sep).join('/');
}

async function createContext(repoRoot) {
  repoRoot = path.resolve(repoRoot);
  return { repoRoot, realRoot: await fs.realpath(repoRoot) };
}

function relativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.includes('\\') ||
    value.endsWith('/') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === '.' ||
    value.startsWith('../')
  ) {
    fail(`${label} must be a normalized relative path`);
  }
  return value;
}

function isInside(base, candidate) {
  return candidate === base || candidate.startsWith(`${base}${path.sep}`);
}

async function safeRepoPath(context, relative, label) {
  relativePath(relative, label);
  const absolute = path.resolve(context.repoRoot, ...relative.split('/'));
  if (!isInside(context.repoRoot, absolute)) {
    fail(`${label} escapes the repository`);
  }
  let cursor = context.repoRoot;
  let existing = cursor;
  for (const component of relative.split('/')) {
    cursor = path.join(cursor, component);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) {
        fail(`${label} contains a symbolic link`);
      }
      existing = cursor;
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  if (!isInside(context.realRoot, await fs.realpath(existing))) {
    fail(`${label} escapes the repository`);
  }
  return absolute;
}

async function requirePath(context, relative, label, directory = false) {
  const absolute = await safeRepoPath(context, relative, label);
  if (!(await fs.pathExists(absolute))) fail(`${label} does not exist`);
  const stat = await fs.lstat(absolute);
  if (directory ? !stat.isDirectory() : !stat.isFile()) {
    fail(`${label} is not a ${directory ? 'directory' : 'file'}`);
  }
  return absolute;
}

async function rejectFrameworkSymlinks(context) {
  const relativeRoot = 'framework';
  const root = await safeRepoPath(context, relativeRoot, 'framework directory');
  if (!(await fs.pathExists(root))) return;
  const stat = await fs.lstat(root);
  if (!stat.isDirectory()) fail('framework is not a directory');

  async function visit(directory, relativeDirectory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      const entryStat = await fs.lstat(absolute);
      if (entryStat.isSymbolicLink()) {
        fail(`${relative} contains a symbolic link`);
      }
      if (entryStat.isDirectory()) await visit(absolute, relative);
    }
  }

  await visit(root, relativeRoot);
}

function markerFor(featureId, language) {
  return `${LANGUAGES[language].comment} GLEAN_FRAMEWORK_FEATURE: ${featureId}/${language}`;
}

function frameworkMarkerLines(source) {
  return source
    .toString('utf8')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line, index) => ({ index, line }))
    .filter(({ line }) => MARKER_PATTERN.test(line));
}

function markerLinesNearBeginning(source) {
  return frameworkMarkerLines(source)
    .filter(({ index }) => index < MARKER_SCAN_LINES)
    .map(({ line }) => line);
}

async function validateConsumer(context, assetPath, implementation, label) {
  const manifestPath = path.posix.join(
    assetPath,
    implementation.consumerManifest,
  );
  const manifestLabel = `${label} consumer manifest`;
  const file = await requirePath(context, manifestPath, manifestLabel);
  if (implementation.manifestKind === 'package-json') {
    validatePackageDependencies(
      file,
      'dependencies',
      implementation.dependencies,
      label,
    );
    return;
  }
  await validateUvScriptDependencies(
    file,
    implementation.dependencies,
    manifestLabel,
  );
  const lock = await requirePath(
    context,
    `${manifestPath}.lock`,
    `${manifestLabel} lock`,
  );
  await validateUvLockDependencies(
    lock,
    implementation.dependencies,
    manifestLabel,
  );
}

async function readFeature(context, featureFile) {
  const featurePath = repoPath(context.repoRoot, featureFile);
  const id = path.basename(path.dirname(featureFile));
  if (!ID_PATTERN.test(id)) {
    fail(`${featurePath} directory must be a lower-kebab feature id`);
  }

  let definition;
  try {
    definition = readJsonc(featureFile);
  } catch (error) {
    fail(
      `${featurePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!validateFeature(definition)) {
    const error = validateFeature.errors?.[0];
    fail(
      `${featurePath} fails schemas/framework-feature.schema.json: ${error?.instancePath || '(root)'} ${error?.message}`,
    );
  }

  const implementations = new Map();
  for (const [language, authored] of Object.entries(
    definition.implementations,
  ).sort()) {
    const languageConfig = LANGUAGES[language];
    const label = `${featurePath}.implementations.${language}`;
    if (!languageConfig) {
      fail(`${label} uses unsupported language ${language}`);
    }
    relativePath(authored.source, `${label}.source`);
    relativePath(authored.target, `${label}.target`);
    relativePath(authored.consumerManifest, `${label}.consumerManifest`);
    validateDependencyVersions(
      authored.dependencies,
      languageConfig.manifestKind,
      `${label}.dependencies`,
    );

    const sourcePath = `framework/${id}/${authored.source}`;
    const sourceFile = await requirePath(
      context,
      sourcePath,
      `${label}.source`,
    );
    const source = await fs.readFile(sourceFile);
    const marker = markerFor(id, language);
    const markers = frameworkMarkerLines(source);
    if (
      markers.length !== 1 ||
      markers[0].line !== marker ||
      markers[0].index >= MARKER_SCAN_LINES
    ) {
      fail(
        `${sourcePath} must contain exactly one derived marker near the beginning`,
      );
    }
    implementations.set(language, {
      ...authored,
      manifestKind: languageConfig.manifestKind,
      marker,
      source,
      targets: [],
    });
  }
  return { id, implementations };
}

async function discoverContractPaths(context, pattern, label) {
  const matches = await fg(pattern, {
    cwd: context.repoRoot,
    followSymbolicLinks: false,
    onlyFiles: false,
  });
  const contracts = [];
  for (const relative of matches.sort()) {
    contracts.push({
      file: await requirePath(context, relative, `${label} ${relative}`),
      relative,
    });
  }
  return contracts;
}

async function requireContracts(context, featureId, language, pattern) {
  const contractPattern = `framework/${featureId}/**/${pattern}`;
  const contracts = await discoverContractPaths(
    context,
    contractPattern,
    `${featureId}/${language} contract`,
  );
  if (contracts.length === 0) {
    fail(
      `${featureId}/${language} must include at least one central contract matching ${contractPattern}`,
    );
  }
  return contracts;
}

export async function discoverFrameworkContracts(repoRoot) {
  const context = await createContext(repoRoot);
  await rejectFrameworkSymlinks(context);
  const [typescriptContracts, pythonContracts] = await Promise.all([
    discoverContractPaths(
      context,
      'framework/**/*.test.ts',
      'TypeScript contract',
    ),
    discoverContractPaths(context, 'framework/**/test_*.py', 'Python contract'),
  ]);
  for (const contract of pythonContracts) {
    await requirePath(
      context,
      `${contract.relative}.lock`,
      `${contract.relative} lock`,
    );
  }
  return {
    python: pythonContracts.map(({ relative }) => relative),
    typescript: typescriptContracts.map(({ relative }) => relative),
  };
}

export async function resolveFrameworkFeatureImplementations({
  repoRoot,
  featureIds,
  language,
}) {
  const context = await createContext(repoRoot);
  await rejectFrameworkSymlinks(context);
  if (!LANGUAGES[language]) fail(`unsupported language ${language}`);
  if (new Set(featureIds).size !== featureIds.length) {
    fail('feature selection contains duplicate ids');
  }

  const implementations = [];
  for (const featureId of [...featureIds].sort()) {
    if (!ID_PATTERN.test(featureId)) fail(`invalid feature id ${featureId}`);
    const featureFile = await requirePath(
      context,
      `framework/${featureId}/feature.json`,
      `framework feature ${featureId}`,
    );
    const feature = await readFeature(context, featureFile);
    const implementation = feature.implementations.get(language);
    if (!implementation) {
      fail(`${featureId} does not support language ${language}`);
    }
    implementations.push({
      featureId,
      source: implementation.source,
      target: implementation.target,
      dependencies: { ...implementation.dependencies },
      consumerManifest: implementation.consumerManifest,
      manifestKind: implementation.manifestKind,
    });
  }
  return implementations;
}

async function validateContracts(context, features) {
  const rootPackage = await requirePath(
    context,
    'package.json',
    'TypeScript contract manifest',
  );
  for (const feature of features.values()) {
    const typescript = feature.implementations.get('typescript');
    if (typescript) {
      await requireContracts(context, feature.id, 'typescript', '*.test.ts');
      validatePackageDependencies(
        rootPackage,
        'devDependencies',
        typescript.dependencies,
        `${feature.id}/typescript contract manifest`,
      );
    }
    const python = feature.implementations.get('python');
    if (!python) continue;
    const contracts = await requireContracts(
      context,
      feature.id,
      'python',
      'test_*.py',
    );
    const manifestLabel = `${feature.id}/python contract manifest`;
    for (const contract of contracts) {
      const lock = await requirePath(
        context,
        `${contract.relative}.lock`,
        `${contract.relative} lock`,
      );
      await validateUvScriptDependencies(
        contract.file,
        python.dependencies,
        manifestLabel,
      );
      await validateUvLockDependencies(
        lock,
        python.dependencies,
        manifestLabel,
      );
    }
  }
}

async function preflightTarget(context, targetPath, implementation) {
  const target = await safeRepoPath(
    context,
    targetPath,
    `${targetPath} generated target`,
  );
  const current = await fs.readFile(target).catch((error) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!current || current.equals(implementation.source)) return;
  const markers = frameworkMarkerLines(current);
  if (
    markers.length !== 1 ||
    markers[0].line !== implementation.marker ||
    markers[0].index >= MARKER_SCAN_LINES
  ) {
    fail(
      `${targetPath} is authored or owned by another feature; refusing to overwrite it`,
    );
  }
}

async function validateOrphanMarkers(
  context,
  declaredMarkers,
  expectedTargets,
) {
  const candidates = await fg(
    ['recipes/**/*.{py,ts,tsx,mts,cts}', 'examples/**/*.{py,ts,tsx,mts,cts}'],
    {
      cwd: context.repoRoot,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**', '**/.venv/**', '**/dist/**'],
    },
  );
  for (const candidate of candidates.sort()) {
    for (const marker of markerLinesNearBeginning(
      await fs.readFile(candidate),
    )) {
      const candidatePath = repoPath(context.repoRoot, candidate);
      if (!declaredMarkers.has(marker)) {
        fail(
          `${candidatePath} contains an undeclared framework feature marker: ${marker}`,
        );
      }
      if (expectedTargets.get(path.resolve(candidate)) !== marker) {
        fail(`${candidatePath} is an orphan generated framework feature file`);
      }
    }
  }
}

export async function compileFrameworkFeatures({ repoRoot }) {
  const context = await createContext(repoRoot);
  repoRoot = context.repoRoot;
  await rejectFrameworkSymlinks(context);
  const featureFiles = (
    await fg('framework/*/feature.json', {
      cwd: repoRoot,
      absolute: true,
      followSymbolicLinks: false,
    })
  ).sort();
  const features = new Map();
  const declaredMarkers = new Set();
  for (const featureFile of featureFiles) {
    const feature = await readFeature(context, featureFile);
    features.set(feature.id, feature);
    for (const implementation of feature.implementations.values()) {
      declaredMarkers.add(implementation.marker);
    }
  }
  await validateContracts(context, features);

  const expectedTargets = new Map();
  const caseFoldedTargets = new Map();
  let useCount = 0;
  const recipeFiles = (
    await fg('recipes/*/recipe.json', {
      cwd: repoRoot,
      absolute: true,
      followSymbolicLinks: false,
    })
  ).sort();
  for (const recipeFile of recipeFiles) {
    const recipeFilePath = repoPath(repoRoot, recipeFile);
    const recipe = readJsonc(recipeFile);
    for (const [index, asset] of (recipe.codeAssets ?? []).entries()) {
      if (!asset.frameworkFeatures?.length) continue;
      const label = `${recipeFilePath}.codeAssets[${index}]`;
      const assetPath = relativePath(asset.repoPath, `${label}.repoPath`);
      await requirePath(context, assetPath, `${label}.repoPath`, true);
      for (const featureId of asset.frameworkFeatures) {
        const feature = features.get(featureId);
        if (!feature) {
          fail(`${label} declares unknown framework feature ${featureId}`);
        }
        const implementation = feature.implementations.get(asset.language);
        if (!implementation) {
          fail(
            `${label} uses ${featureId}, which does not support language ${asset.language}`,
          );
        }
        const targetPath = path.posix.join(assetPath, implementation.target);
        const folded = targetPath.toLowerCase();
        const previous = caseFoldedTargets.get(folded);
        if (previous && previous !== targetPath) {
          fail(`${targetPath} collides by case with ${previous}`);
        }
        caseFoldedTargets.set(folded, targetPath);
        await validateConsumer(
          context,
          assetPath,
          implementation,
          `${label} ${featureId}`,
        );
        await preflightTarget(context, targetPath, implementation);
        implementation.targets.push(targetPath);
        const target = path.resolve(repoRoot, ...targetPath.split('/'));
        expectedTargets.set(target, implementation.marker);
        useCount += 1;
      }
    }
  }
  await validateOrphanMarkers(context, declaredMarkers, expectedTargets);

  const artifactDefinitions = [];
  for (const feature of features.values()) {
    for (const [language, implementation] of feature.implementations) {
      artifactDefinitions.push({
        id: `framework-feature-${feature.id}-${language}`,
        content: async () => implementation.source,
        targets: async () => [...implementation.targets],
      });
    }
  }
  return {
    artifactDefinitions,
    summary: { featureCount: features.size, useCount },
  };
}
