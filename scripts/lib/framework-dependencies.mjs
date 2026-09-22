import fs from 'fs-extra';
import { parse as parseSemver } from 'semver';
import { parse as parseToml } from 'smol-toml';

import { readJsonc } from './jsonc.mjs';

const PEP_723_SCRIPT_START = '# /// script';
const PEP_723_BLOCK_END = '# ///';
const EXACT_BARE_PYTHON_VERSION = /^\d[A-Za-z0-9.!+_-]*$/u;
const PYTHON_VERSION_ERROR = 'must be an exact bare Python version';

function fail(message) {
  throw new Error(`Framework feature validation failed: ${message}`);
}

function normalizedPythonName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/gu, '-');
}

function parseTomlDocument(source, label) {
  try {
    return parseToml(source);
  } catch (error) {
    fail(
      `${label} contains invalid TOML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function extractPep723ScriptToml(source, label) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const starts = lines
    .map((line, index) => (line === PEP_723_SCRIPT_START ? index : -1))
    .filter((index) => index !== -1);
  if (starts.length === 0) {
    fail(`${label} has no PEP 723 script metadata block`);
  }
  if (starts.length !== 1) {
    fail(`${label} has more than one PEP 723 script metadata block`);
  }

  const content = [];
  for (let index = starts[0] + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === PEP_723_BLOCK_END) return content.join('\n');
    if (line === '#') {
      content.push('');
      continue;
    }
    if (line.startsWith('# ')) {
      content.push(line.slice(2));
      continue;
    }
    fail(`${label} has an invalid PEP 723 script metadata line`);
  }
  fail(`${label} has an unterminated PEP 723 script metadata block`);
}

export function validateDependencyVersions(dependencies, manifestKind, label) {
  for (const [name, version] of Object.entries(dependencies)) {
    if (manifestKind === 'package-json') {
      const parsed = parseSemver(version);
      if (
        !parsed ||
        parsed.raw !== version ||
        !/^\d/u.test(version) ||
        /\s/u.test(version)
      ) {
        fail(`${label}.${name} must be an exact semantic version`);
      }
      continue;
    }
    if (manifestKind === 'uv-script') {
      // uv owns full PEP 440 validation. This layer accepts version punctuation
      // but rejects selectors, ranges, wildcards, tags, and whitespace.
      if (!EXACT_BARE_PYTHON_VERSION.test(version)) {
        fail(`${label}.${name} ${PYTHON_VERSION_ERROR}`);
      }
      continue;
    }
    fail(`${label} uses unsupported consumer manifest kind ${manifestKind}`);
  }
}

function assertPackageDependencies(expected, actual, label) {
  for (const [name, version] of Object.entries(expected)) {
    const found = actual[name];
    if (found === undefined) {
      fail(`${label} is missing dependency ${name}@${version}`);
    }
    if (found !== version) {
      fail(`${label} has ${name}@${found}; expected ${version}`);
    }
  }
}

function assertUvLockDependencies(expected, requirements, label) {
  const actual = new Map();
  for (const requirement of requirements) {
    if (
      !requirement ||
      typeof requirement !== 'object' ||
      typeof requirement.name !== 'string' ||
      typeof requirement.specifier !== 'string'
    ) {
      fail(`${label} has an invalid [manifest].requirements entry`);
    }
    const key = normalizedPythonName(requirement.name);
    if (actual.has(key)) {
      fail(`${label} has duplicate dependency ${requirement.name}`);
    }
    actual.set(key, requirement.specifier);
  }

  for (const [name, version] of Object.entries(expected)) {
    const wanted = `==${version}`;
    const found = actual.get(normalizedPythonName(name));
    if (found === undefined) {
      fail(`${label} is missing dependency ${name}@${wanted}`);
    }
    if (found !== wanted) {
      fail(`${label} has ${name}@${found}; expected ${wanted}`);
    }
  }
}

export function validatePackageDependencies(file, field, expected, label) {
  assertPackageDependencies(expected, readJsonc(file)[field] ?? {}, label);
}

export async function validateUvScriptDependencies(file, expected, label) {
  const source = await fs.readFile(file, 'utf8');
  const metadata = parseTomlDocument(
    extractPep723ScriptToml(source, label),
    `${label} PEP 723 script metadata`,
  );
  if (!Array.isArray(metadata.dependencies)) {
    fail(`${label} PEP 723 script metadata has no dependencies array`);
  }

  const requirements = new Set();
  const names = new Set();
  for (const requirement of metadata.dependencies) {
    if (typeof requirement !== 'string') {
      fail(`${label} PEP 723 dependencies must be strings`);
    }
    const name = /^[A-Za-z0-9][A-Za-z0-9._-]*/u.exec(requirement)?.[0];
    const key = name ? normalizedPythonName(name) : undefined;
    if (requirements.has(requirement) || (key && names.has(key))) {
      fail(`${label} has duplicate dependency ${name ?? requirement}`);
    }
    requirements.add(requirement);
    if (key) names.add(key);
  }
  for (const [name, version] of Object.entries(expected)) {
    const requirement = `${name}==${version}`;
    if (!requirements.has(requirement)) {
      fail(`${label} must declare ${requirement} exactly`);
    }
  }
}

export async function validateUvLockDependencies(lockFile, expected, label) {
  const lock = parseTomlDocument(
    await fs.readFile(lockFile, 'utf8'),
    `${label} lock`,
  );
  const requirements = lock.manifest?.requirements;
  if (!Array.isArray(requirements)) {
    fail(`${label} lock has no [manifest].requirements array`);
  }
  assertUvLockDependencies(expected, requirements, `${label} lock`);
}
