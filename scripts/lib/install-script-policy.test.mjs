import assert from 'node:assert/strict';
import test from 'node:test';

import {
  installScriptDependencies,
  installScriptPolicyErrors,
} from './install-script-policy.mjs';

const lockfile = {
  packages: {
    '': { name: 'example', version: '0.0.0' },
    'node_modules/esbuild': {
      version: '0.28.2',
      hasInstallScript: true,
    },
    'node_modules/chokidar/node_modules/fsevents': {
      version: '2.3.3',
      hasInstallScript: true,
    },
    'node_modules/typescript': { version: '6.0.3' },
  },
};

test('finds direct and nested dependencies with install scripts', () => {
  assert.deepEqual(installScriptDependencies(lockfile), [
    { name: 'esbuild', version: '0.28.2' },
    { name: 'fsevents', version: '2.3.3' },
  ]);
});

test('accepts pinned approvals and explicit denials', () => {
  assert.deepEqual(
    installScriptPolicyErrors(
      {
        allowScripts: {
          'esbuild@0.28.2': true,
          fsevents: false,
        },
      },
      lockfile,
    ),
    [],
  );
});

test('reports pending scripts and unpinned approvals', () => {
  assert.deepEqual(
    installScriptPolicyErrors({ allowScripts: { esbuild: true } }, lockfile),
    [
      'allowScripts.esbuild is not a pinned approval for an installed dependency.',
      'fsevents@2.3.3 has an install script but is not approved or denied in allowScripts.',
    ],
  );
});
