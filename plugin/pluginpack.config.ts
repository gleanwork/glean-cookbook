import { defineConfig } from '@gleanwork/pluginpack';

// Skills (not commands/) are the current recommendation for both Claude
// Code and pluginpack itself — and a skill folder named {id} inside a
// plugin named "cookbook" already produces /cookbook:{id}, so no
// `components` override is needed to get slash-command-style invocation.
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
      outDir: 'dist/claude',
      plugins: {
        cookbook: { from: ['cookbook'] },
      },
    },
    cursor: {
      outDir: 'dist/cursor',
      plugins: {
        cookbook: { from: ['cookbook'] },
      },
    },
    codex: {
      outDir: 'dist/codex',
      plugins: {
        cookbook: { from: ['cookbook'] },
      },
    },
  },
});
