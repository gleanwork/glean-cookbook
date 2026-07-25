import { defineConfig } from '@gleanwork/pluginpack';

// claude/cursor/antigravity/copilot omit the `commands` component by default
// (they increasingly expose skills as slash commands instead) — opt it back
// in explicitly since PACT-458 wants real /cookbook:{recipe-id} slash
// commands, not just an auto-triggering skill.
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
        cookbook: { from: ['cookbook'], components: ['skills', 'commands'] },
      },
    },
    cursor: {
      outDir: 'dist/cursor',
      plugins: {
        cookbook: { from: ['cookbook'], components: ['skills', 'commands'] },
      },
    },
    codex: {
      outDir: 'dist/codex',
      plugins: {
        cookbook: { from: ['cookbook'], components: ['skills', 'commands'] },
      },
    },
  },
});
