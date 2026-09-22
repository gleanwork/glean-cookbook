import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import fs from 'fs-extra';

import { discoverContractRuns } from '../check-framework-features.mjs';
import { compileArtifacts, materializeArtifacts } from './artifacts.mjs';
import { compileFrameworkFeatures } from './framework-features.mjs';

const FEATURE_ID = 'fixture-feature';

async function writeJson(file, value) {
  await fs.outputFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function marker(featureId, language) {
  return `${language === 'python' ? '#' : '//'} GLEAN_FRAMEWORK_FEATURE: ${featureId}/${language}`;
}

function typescriptImplementation({
  dependencies = { renderer: '1.2.3' },
  target = 'src/runtime.ts',
} = {}) {
  return {
    source: 'runtime.ts',
    target,
    dependencies,
    consumerManifest: 'package.json',
  };
}

function pythonImplementation({
  dependencies = { renderer: '1.2.3' },
  target = 'runtime.py',
} = {}) {
  return {
    source: 'runtime.py',
    target,
    dependencies,
    consumerManifest: 'main.py',
  };
}

function directRequirements(dependencies) {
  return Object.entries(dependencies).map(
    ([name, version]) => `${name}==${version}`,
  );
}

function pep723Script(requirements, { preamble = [] } = {}) {
  return `${[
    ...preamble,
    '# /// script',
    '# dependencies = [',
    ...requirements.map((requirement) => `#   ${JSON.stringify(requirement)},`),
    '# ]',
    '# ///',
    '',
  ].join('\n')}`;
}

function lockToml(dependencies) {
  const requirements = Object.entries(dependencies)
    .map(
      ([name, version]) =>
        `{ name = ${JSON.stringify(name)}, specifier = ${JSON.stringify(`==${version}`)} }`,
    )
    .join(', ');
  return `version = 1\n\n[manifest]\nrequirements = [${requirements}]\n`;
}

async function writeFeature(repoRoot, id, implementations) {
  const directory = path.join(repoRoot, 'framework', id);
  await writeJson(path.join(directory, 'feature.json'), { implementations });
  if (implementations.typescript) {
    await Promise.all([
      fs.outputFile(
        path.join(directory, implementations.typescript.source),
        `${marker(id, 'typescript')}\nexport const fixture = true;\n`,
      ),
      fs.outputFile(path.join(directory, 'runtime.test.ts'), 'export {};\n'),
    ]);
  }
  if (implementations.python) {
    const contract = path.join(directory, 'test_runtime.py');
    await Promise.all([
      fs.outputFile(
        path.join(directory, implementations.python.source),
        `${marker(id, 'python')}\nFIXTURE = True\n`,
      ),
      fs.outputFile(
        contract,
        `${pep723Script(directRequirements(implementations.python.dependencies))}def test_fixture() -> None:\n    assert True\n`,
      ),
      fs.outputFile(
        `${contract}.lock`,
        lockToml(implementations.python.dependencies),
      ),
    ]);
  }
}

async function writeConsumer(
  repoRoot,
  directory,
  language,
  dependencies,
  lockDependencies = dependencies,
) {
  const root = path.join(repoRoot, directory);
  await fs.ensureDir(root);
  if (language === 'typescript') {
    await writeJson(path.join(root, 'package.json'), {
      name: directory.replaceAll('/', '-'),
      private: true,
      dependencies,
    });
  } else {
    await Promise.all([
      fs.outputFile(
        path.join(root, 'main.py'),
        pep723Script(directRequirements(dependencies)),
      ),
      fs.outputFile(
        path.join(root, 'main.py.lock'),
        lockToml(lockDependencies),
      ),
    ]);
  }
}

async function writeRecipe(repoRoot, id, codeAssets) {
  await writeJson(path.join(repoRoot, 'recipes', id, 'recipe.json'), {
    id,
    codeAssets,
  });
}

async function createFixture(
  t,
  { dependencies = { renderer: '1.2.3' }, language = 'typescript' } = {},
) {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'framework-features-'),
  );
  t.after(() => fs.remove(repoRoot));
  const implementation =
    language === 'typescript'
      ? typescriptImplementation({ dependencies })
      : pythonImplementation({ dependencies });
  await Promise.all([
    writeJson(path.join(repoRoot, 'package.json'), {
      name: 'fixture-root',
      private: true,
      devDependencies: language === 'typescript' ? dependencies : {},
    }),
    writeFeature(repoRoot, FEATURE_ID, { [language]: implementation }),
    writeConsumer(repoRoot, 'recipes/example/app', language, dependencies),
    writeRecipe(repoRoot, 'example', [
      {
        repoPath: 'recipes/example/app',
        language,
        frameworkFeatures: [FEATURE_ID],
      },
    ]),
  ]);
  return { implementation, repoRoot };
}

async function readFeature(repoRoot, id = FEATURE_ID) {
  return fs.readJson(path.join(repoRoot, 'framework', id, 'feature.json'));
}

async function rewriteFeature(repoRoot, feature, id = FEATURE_ID) {
  await writeJson(
    path.join(repoRoot, 'framework', id, 'feature.json'),
    feature,
  );
}

test('compiles a valid declaration into ordinary artifacts and summary counts', async (t) => {
  const { repoRoot } = await createFixture(t);
  const compiled = await compileFrameworkFeatures({ repoRoot });

  assert.deepEqual(Object.keys(compiled).sort(), [
    'artifactDefinitions',
    'summary',
  ]);
  assert.deepEqual(compiled.summary, { featureCount: 1, useCount: 1 });
  assert.deepEqual(
    compiled.artifactDefinitions.map((definition) => definition.id),
    ['framework-feature-fixture-feature-typescript'],
  );

  const plan = await compileArtifacts(compiled.artifactDefinitions, {
    repoRoot,
  });
  assert.equal((await materializeArtifacts(plan)).length, 1);
  assert.equal((await materializeArtifacts(plan, { check: true })).length, 0);
  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));
});

test('standard declaration validation rejects unknown features and languages', async (t) => {
  const { repoRoot } = await createFixture(t);
  await writeRecipe(repoRoot, 'example', [
    {
      repoPath: 'recipes/example/app',
      language: 'typescript',
      frameworkFeatures: ['missing-feature'],
    },
  ]);
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /unknown framework feature missing-feature/u,
  );

  await writeRecipe(repoRoot, 'example', [
    {
      repoPath: 'recipes/example/app',
      language: 'python',
      frameworkFeatures: [FEATURE_ID],
    },
  ]);
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /does not support language python/u,
  );
});

test('accepts scoped npm dependencies and exact prerelease or build versions', async (t) => {
  const dependencies = {
    '@scope/renderer': '1.2.3-beta.1+fixture.2',
  };
  const { repoRoot } = await createFixture(t, { dependencies });
  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));
});

test('rejects npm ranges, tags, wildcards, whitespace, and empty versions', async (t) => {
  for (const version of [
    '^1.2.3',
    '>=1.2.3',
    '1.x',
    '*',
    'latest',
    ' 1.2.3',
    '1.2.3 ',
    '',
  ]) {
    await t.test(JSON.stringify(version), async (t) => {
      const { repoRoot } = await createFixture(t);
      const feature = await readFeature(repoRoot);
      feature.implementations.typescript.dependencies.renderer = version;
      await rewriteFeature(repoRoot, feature);

      await assert.rejects(
        compileFrameworkFeatures({ repoRoot }),
        /must be an exact semantic version|fails schemas\/framework-feature\.schema\.json/u,
      );
    });
  }
});

test('accepts Python epochs, prereleases, and local version punctuation', async (t) => {
  const dependencies = {
    renderer: '1!2024.1rc1.post2+acme-2_linux',
  };
  const { repoRoot } = await createFixture(t, {
    dependencies,
    language: 'python',
  });
  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));
});

test('rejects every invalid bare Python version with one stable error', async (t) => {
  for (const version of [
    'release-2024.1',
    '>=2024.1',
    '==2024.1',
    '~=2024.1',
    '^2024.1',
    '2024.*',
    '2024.1,2025.1',
    'latest',
    ' 2024.1',
    '2024.1 ',
    '',
  ]) {
    await t.test(JSON.stringify(version), async (t) => {
      const { repoRoot } = await createFixture(t, {
        dependencies: { renderer: version },
        language: 'python',
      });

      await assert.rejects(
        compileFrameworkFeatures({ repoRoot }),
        /must be an exact bare Python version/u,
      );
    });
  }
});

test('parses PEP 723 TOML after a shebang and preserves quoted comment text', async (t) => {
  const { repoRoot } = await createFixture(t, { language: 'python' });
  await fs.outputFile(
    path.join(repoRoot, 'recipes/example/app/main.py'),
    [
      '#!/usr/bin/env -S uv run --script',
      '# An ordinary comment can precede the metadata block.',
      '# /// script',
      '# dependencies = [',
      '#   "renderer==1.2.3", # "renderer==9.9.9" is a TOML comment',
      '# ]',
      '# note = "a # inside a quoted TOML string"',
      '# ///',
      '',
    ].join('\n'),
  );

  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));
});

test('validates Python source requirements and uv lock requirements independently', async (t) => {
  await t.test('source differs from the feature and lock', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    await fs.outputFile(
      path.join(repoRoot, 'recipes/example/app/main.py'),
      pep723Script(['renderer==1.2.4']),
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /consumer manifest must declare renderer==1\.2\.3 exactly/u,
    );
  });

  await t.test('lock differs from the feature and source', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    await fs.outputFile(
      path.join(repoRoot, 'recipes/example/app/main.py.lock'),
      lockToml({ renderer: '1.2.4' }),
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /consumer manifest lock has renderer@==1\.2\.4; expected ==1\.2\.3/u,
    );
  });
});

test('rejects duplicate Python requirements and missing PEP 723 metadata', async (t) => {
  await t.test('duplicate dependency', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    await fs.outputFile(
      path.join(repoRoot, 'recipes/example/app/main.py'),
      pep723Script(['renderer==1.2.3', 'renderer==1.2.4']),
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /has duplicate dependency renderer/u,
    );
  });

  await t.test('duplicate lock dependency', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    const requirement = '{ name = "renderer", specifier = "==1.2.3" }';
    await fs.outputFile(
      path.join(repoRoot, 'recipes/example/app/main.py.lock'),
      `version = 1\n\n[manifest]\nrequirements = [${requirement}, ${requirement}]\n`,
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /consumer manifest lock has duplicate dependency renderer/u,
    );
  });

  await t.test('missing metadata', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    await fs.outputFile(
      path.join(repoRoot, 'recipes/example/app/main.py'),
      'print("no inline metadata")\n',
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /has no PEP 723 script metadata block/u,
    );
  });
});

test('requires a convention-named central contract for each implementation', async (t) => {
  const typescript = await createFixture(t);
  await fs.remove(
    path.join(typescript.repoRoot, 'framework/fixture-feature/runtime.test.ts'),
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot: typescript.repoRoot }),
    /fixture-feature\/typescript must include at least one central contract matching framework\/fixture-feature\/\*\*\/\*\.test\.ts/u,
  );

  const python = await createFixture(t, { language: 'python' });
  await fs.remove(
    path.join(python.repoRoot, 'framework/fixture-feature/test_runtime.py'),
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot: python.repoRoot }),
    /fixture-feature\/python must include at least one central contract matching framework\/fixture-feature\/\*\*\/test_\*\.py/u,
  );
});

test('validates conventional contract dependencies against each feature', async (t) => {
  const typescript = await createFixture(t);
  await writeJson(path.join(typescript.repoRoot, 'package.json'), {
    name: 'fixture-root',
    private: true,
    devDependencies: { renderer: '1.2.4' },
  });
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot: typescript.repoRoot }),
    /typescript contract manifest has renderer@1\.2\.4; expected 1\.2\.3/u,
  );

  const python = await createFixture(t, { language: 'python' });
  await fs.outputFile(
    path.join(
      python.repoRoot,
      'framework/fixture-feature/test_runtime.py.lock',
    ),
    lockToml({ renderer: '1.2.4' }),
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot: python.repoRoot }),
    /python contract manifest lock has renderer@==1\.2\.4; expected ==1\.2\.3/u,
  );

  const pythonSource = await createFixture(t, { language: 'python' });
  await fs.outputFile(
    path.join(
      pythonSource.repoRoot,
      'framework/fixture-feature/test_runtime.py',
    ),
    `${pep723Script(['renderer==1.2.4'])}def test_fixture() -> None:\n    assert True\n`,
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot: pythonSource.repoRoot }),
    /python contract manifest must declare renderer==1\.2\.3 exactly/u,
  );
});

test('refuses authored targets but accepts only the exact derived ownership marker', async (t) => {
  const { repoRoot } = await createFixture(t);
  const target = path.join(repoRoot, 'recipes/example/app/src/runtime.ts');
  await fs.outputFile(
    target,
    '// GLEAN_FRAMEWORK_FEATURE: fixture-feature/typescript; source=somewhere\n',
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /refusing to overwrite/u,
  );

  await fs.outputFile(
    target,
    `${marker(FEATURE_ID, 'typescript')}\nexport const stale = true;\n`,
  );
  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));
});

test('requires exactly one correct marker in each authored feature source', async (t) => {
  await t.test('duplicate derived marker', async (t) => {
    const { repoRoot } = await createFixture(t);
    await fs.outputFile(
      path.join(repoRoot, 'framework/fixture-feature/runtime.ts'),
      `${marker(FEATURE_ID, 'typescript')}\n${'// source\n'.repeat(15)}${marker(FEATURE_ID, 'typescript')}\n`,
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /must contain exactly one derived marker near the beginning/u,
    );
  });

  await t.test(
    'different framework marker beside the derived marker',
    async (t) => {
      const { repoRoot } = await createFixture(t);
      await fs.outputFile(
        path.join(repoRoot, 'framework/fixture-feature/runtime.ts'),
        `${marker(FEATURE_ID, 'typescript')}\n${marker('other-feature', 'typescript')}\n`,
      );

      await assert.rejects(
        compileFrameworkFeatures({ repoRoot }),
        /must contain exactly one derived marker near the beginning/u,
      );
    },
  );
});

test('rejects a symbolic-link component in a generated target path', async (t) => {
  const { repoRoot } = await createFixture(t);
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), 'framework-outside-'),
  );
  t.after(() => fs.remove(outside));
  await fs.symlink(
    outside,
    path.join(repoRoot, 'recipes/example/app/src'),
    'dir',
  );

  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /contains a symbolic link/u,
  );
});

test('rejects external symlinks for contract files, directories, and locks', async (t) => {
  await t.test('contract file', async (t) => {
    const { repoRoot } = await createFixture(t);
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), 'framework-contract-file-'),
    );
    t.after(() => fs.remove(outside));
    const externalContract = path.join(outside, 'runtime.test.ts');
    await fs.outputFile(externalContract, 'export {};\n');
    const contract = path.join(
      repoRoot,
      'framework/fixture-feature/runtime.test.ts',
    );
    await fs.remove(contract);
    await fs.symlink(externalContract, contract, 'file');

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /contains a symbolic link/u,
    );
    await assert.rejects(
      discoverContractRuns(repoRoot),
      /contains a symbolic link/u,
    );
  });

  await t.test('contract directory', async (t) => {
    const { repoRoot } = await createFixture(t);
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), 'framework-contract-directory-'),
    );
    t.after(() => fs.remove(outside));
    await fs.outputFile(path.join(outside, 'external.test.ts'), 'export {};\n');
    await fs.symlink(
      outside,
      path.join(repoRoot, 'framework/fixture-feature/external-contracts'),
      'dir',
    );

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /contains a symbolic link/u,
    );
    await assert.rejects(
      discoverContractRuns(repoRoot),
      /contains a symbolic link/u,
    );
  });

  await t.test('contract lock', async (t) => {
    const { repoRoot } = await createFixture(t, { language: 'python' });
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), 'framework-contract-lock-'),
    );
    t.after(() => fs.remove(outside));
    const externalLock = path.join(outside, 'test_runtime.py.lock');
    await fs.outputFile(externalLock, lockToml({ renderer: '1.2.3' }));
    const lock = path.join(
      repoRoot,
      'framework/fixture-feature/test_runtime.py.lock',
    );
    await fs.remove(lock);
    await fs.symlink(externalLock, lock, 'file');

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /contains a symbolic link/u,
    );
    await assert.rejects(
      discoverContractRuns(repoRoot),
      /contains a symbolic link/u,
    );
  });
});

test('rejects case-only generated target collisions on every platform', async (t) => {
  const { repoRoot } = await createFixture(t);
  await writeFeature(repoRoot, 'second-feature', {
    typescript: typescriptImplementation({ target: 'src/Runtime.ts' }),
  });
  await writeRecipe(repoRoot, 'example', [
    {
      repoPath: 'recipes/example/app',
      language: 'typescript',
      frameworkFeatures: [FEATURE_ID, 'second-feature'],
    },
  ]);

  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /collides by case/u,
  );
});

test('marker discovery ignores prose and late mentions but rejects an exact orphan marker', async (t) => {
  const { repoRoot } = await createFixture(t);
  await Promise.all([
    fs.outputFile(
      path.join(repoRoot, 'recipes/notes/README.md'),
      'GLEAN_FRAMEWORK_FEATURE: fixture-feature/typescript\n',
    ),
    fs.outputFile(
      path.join(repoRoot, 'recipes/notes/mention.ts'),
      `${'// ordinary source\n'.repeat(15)}${marker(FEATURE_ID, 'typescript')}\n`,
    ),
    fs.outputFile(
      path.join(repoRoot, 'recipes/notes/prose.ts'),
      '// This prose mentions GLEAN_FRAMEWORK_FEATURE: fixture-feature/typescript.\n',
    ),
  ]);
  await assert.doesNotReject(compileFrameworkFeatures({ repoRoot }));

  await fs.outputFile(
    path.join(repoRoot, 'recipes/notes/mention.ts'),
    `${marker(FEATURE_ID, 'typescript')}\n`,
  );
  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /orphan generated framework feature file/u,
  );
});

test('resolves one feature across Python and TypeScript asset variants', async (t) => {
  const { repoRoot } = await createFixture(t);
  const feature = await readFeature(repoRoot);
  feature.implementations.python = pythonImplementation();
  await Promise.all([
    writeFeature(repoRoot, FEATURE_ID, feature.implementations),
    writeConsumer(repoRoot, 'recipes/variants/typescript', 'typescript', {
      renderer: '1.2.3',
    }),
    writeConsumer(repoRoot, 'recipes/variants/python', 'python', {
      renderer: '1.2.3',
    }),
    fs.ensureDir(path.join(repoRoot, 'recipes/variants/plain')),
    writeRecipe(repoRoot, 'variants', [
      {
        repoPath: 'recipes/variants/typescript',
        language: 'typescript',
        frameworkFeatures: [FEATURE_ID],
      },
      {
        repoPath: 'recipes/variants/python',
        language: 'python',
        frameworkFeatures: [FEATURE_ID],
      },
      {
        repoPath: 'recipes/variants/plain',
        language: 'typescript',
      },
    ]),
    writeRecipe(repoRoot, 'example', []),
  ]);

  const compiled = await compileFrameworkFeatures({ repoRoot });
  assert.deepEqual(compiled.summary, { featureCount: 1, useCount: 2 });
  assert.deepEqual(
    await Promise.all(
      compiled.artifactDefinitions.map((definition) =>
        definition.targets({ repoRoot }),
      ),
    ),
    [
      ['recipes/variants/python/runtime.py'],
      ['recipes/variants/typescript/src/runtime.ts'],
    ],
  );
});

test('rejects removed feature descriptions and object consumer manifests', async (t) => {
  await t.test('description', async (t) => {
    const { repoRoot } = await createFixture(t);
    const feature = await readFeature(repoRoot);
    feature.description = 'No longer part of the feature manifest.';
    await rewriteFeature(repoRoot, feature);

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /fails schemas\/framework-feature\.schema\.json/u,
    );
  });

  await t.test('object consumer manifest', async (t) => {
    const { repoRoot } = await createFixture(t);
    const feature = await readFeature(repoRoot);
    feature.implementations.typescript.consumerManifest = {
      kind: 'package-json',
      path: 'package.json',
    };
    await rewriteFeature(repoRoot, feature);

    await assert.rejects(
      compileFrameworkFeatures({ repoRoot }),
      /fails schemas\/framework-feature\.schema\.json/u,
    );
  });
});

test('reports feature manifest schema errors', async (t) => {
  const { repoRoot } = await createFixture(t);
  const feature = await readFeature(repoRoot);
  feature.id = FEATURE_ID;
  await rewriteFeature(repoRoot, feature);

  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /fails schemas\/framework-feature\.schema\.json/u,
  );
});

test('reports malformed feature JSON with its authored path', async (t) => {
  const { repoRoot } = await createFixture(t);
  await fs.outputFile(
    path.join(repoRoot, 'framework', FEATURE_ID, 'feature.json'),
    '{',
  );

  await assert.rejects(
    compileFrameworkFeatures({ repoRoot }),
    /framework\/fixture-feature\/feature\.json is not valid JSON/u,
  );
});

test('discovers conventional contracts and constructs portable runner arguments', async (t) => {
  const { repoRoot } = await createFixture(t);
  const feature = await readFeature(repoRoot);
  feature.implementations.python = pythonImplementation();
  await writeFeature(repoRoot, FEATURE_ID, feature.implementations);

  assert.deepEqual(
    await discoverContractRuns(repoRoot, { nodePath: '/node' }),
    [
      {
        command: '/node',
        args: [
          '--import',
          'tsx',
          '--test',
          'framework/fixture-feature/runtime.test.ts',
        ],
      },
      {
        command: 'uv',
        args: [
          'run',
          '--locked',
          '--script',
          'framework/fixture-feature/test_runtime.py',
        ],
      },
    ],
  );
});

test('leaves exact duplicate ownership to the generic artifact planner', async (t) => {
  const { repoRoot } = await createFixture(t);
  const asset = {
    repoPath: 'recipes/example/app',
    language: 'typescript',
    frameworkFeatures: [FEATURE_ID],
  };
  await writeRecipe(repoRoot, 'example', [asset, asset]);
  const compiled = await compileFrameworkFeatures({ repoRoot });

  await assert.rejects(
    compileArtifacts(compiled.artifactDefinitions, { repoRoot }),
    /produced by both framework-feature-fixture-feature-typescript/u,
  );
});
