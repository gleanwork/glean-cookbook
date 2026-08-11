import { readFileSync } from 'node:fs';

import { defineConfig } from '@gleanwork/pluginpack';

// Skills (not commands/) are the current recommendation for both Claude
// Code and pluginpack itself — and a skill folder named {id} inside a
// plugin named "cookbook" already produces /cookbook:{id}, so no
// `include` override is needed to get slash-command-style invocation.

// Every host reads its marketplace manifest at the root of the repo it is
// pointed at, and none of them accept an `owner/repo/subpath` form — so the
// manifests have to land at the repo root for `gleanwork/glean-cookbook` to be
// installable directly. `outDir: '..'` puts them there; `marketplaceDir`
// rejects '..' segments, so the escape has to happen via outDir.
//
// The emitted plugin content under build/ is committed rather than ignored:
// each manifest's `source` points at it, so it has to exist in a fresh clone —
// that clone is exactly what `/plugin marketplace add gleanwork/glean-cookbook`
// gets. Same arrangement as gleanwork/claude-plugins, which is also committed
// generated output. Editing a skill therefore changes its source copy under
// plugin/shared/ and the three emitted copies; regenerate with `npm run build`
// rather than editing anything under build/ directly.
//
// Claude, Cursor, and Codex each write a different marketplace path, so those
// don't collide at the shared root — but claude and codex both default to
// `plugins/<name>` for content, hence the explicit per-target paths below.

// Fields the host reads off the marketplace entry. Without `version` it falls
// back to the git commit SHA, which would make every recipe edit — this repo's
// most common change — register as a new plugin version.
const { version } = JSON.parse(
  readFileSync(new URL('package.json', import.meta.url), 'utf8'),
) as { version: string };

const ENTRY_METADATA = {
  version,
  author: { name: 'Glean' },
  homepage: 'https://developers.glean.com/cookbook',
  repository: 'https://github.com/gleanwork/glean-cookbook',
  license: 'MIT',
};

const entry = { ...ENTRY_METADATA };

// Codex requires these on the marketplace entry and pluginpack can't derive
// them. Values match what OpenAI's own published marketplaces use.
// `ON_USE` rather than `ON_INSTALL`: installing the plugin collects no
// credential — recipes ask for a Glean token or walk OAuth when you run one.
const codexEntry = {
  ...ENTRY_METADATA,
  policy: { installation: 'AVAILABLE', authentication: 'ON_USE' },
  category: 'Developer Tools',
};

export default defineConfig({
  source: { partials: 'partials' },
  name: 'glean-cookbook',
  version,
  metadata: {
    description:
      'Build Glean cookbook recipes with guided setup and verification in Claude Code, Cursor, or Codex.',
    author: { name: 'Glean' },
    homepage: 'https://developers.glean.com/cookbook',
    repository: 'https://github.com/gleanwork/glean-cookbook',
    license: 'MIT',
  },
  targets: {
    claude: {
      outDir: '..',
      marketplaceDir: '.claude-plugin',
      pluginRoot: 'build/claude',
      plugins: {
        cookbook: { source: 'shared/cookbook', entry },
      },
    },
    cursor: {
      outDir: '..',
      marketplaceDir: '.cursor-plugin',
      plugins: {
        cookbook: {
          source: 'shared/cookbook',
          path: 'build/cursor/cookbook',
          entry,
        },
      },
    },
    codex: {
      outDir: '..',
      marketplaceDir: '.agents/plugins',
      plugins: {
        cookbook: {
          source: 'shared/cookbook',
          path: 'build/codex/cookbook',
          entry: codexEntry,
        },
      },
    },
  },
});
