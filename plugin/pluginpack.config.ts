import { defineConfig } from '@gleanwork/pluginpack';

// Skills (not commands/) are the current recommendation for both Claude
// Code and pluginpack itself — and a skill folder named {id} inside a
// plugin named "cookbook" already produces /cookbook:{id}, so no
// `components` override is needed to get slash-command-style invocation.

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
// plugin/plugins/ and the three emitted copies; regenerate with `npm run build`
// rather than editing anything under build/ directly.
//
// Claude, Cursor, and Codex each write a different marketplace path, so those
// don't collide at the shared root — but claude and codex both default to
// `plugins/<name>` for content, hence the explicit per-target paths below.

// Fields the host reads off the marketplace entry. Without `version` it falls
// back to the git commit SHA, which would make every recipe edit — this repo's
// most common change — register as a new plugin version.
const ENTRY_METADATA = {
  version: '0.1.0',
  author: { name: 'Glean' },
  homepage: 'https://developers.glean.com/cookbook',
  repository: 'https://github.com/gleanwork/glean-cookbook',
  license: 'MIT',
};

const entry = { ...ENTRY_METADATA };

export default defineConfig({
  name: 'glean-cookbook',
  version: '0.1.0',
  metadata: {
    description:
      'Build Glean cookbook recipes hands-free from Claude Code, Cursor, or Codex.',
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
        cookbook: { from: ['cookbook'], entry },
      },
    },
    cursor: {
      outDir: '..',
      marketplaceDir: '.cursor-plugin',
      plugins: {
        cookbook: { from: ['cookbook'], path: 'build/cursor/cookbook', entry },
      },
    },
    codex: {
      outDir: '..',
      marketplaceDir: '.agents/plugins',
      plugins: {
        cookbook: { from: ['cookbook'], path: 'build/codex/cookbook', entry },
      },
    },
  },
});
