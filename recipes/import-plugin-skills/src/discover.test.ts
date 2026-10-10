import { afterEach, expect, test } from 'vitest';
import { discoverSkills, resolveInside } from './discover.js';
import { openPluginSource } from './plugin-source.js';
import { removeTrees, skillMd, writeTree } from './test-helpers.js';

afterEach(removeTrees);

async function discover(files: Record<string, string | object>) {
  return discoverSkills(await openPluginSource(await writeTree(files)));
}

function dirs(discovery: Awaited<ReturnType<typeof discover>>) {
  return discovery.skills.map((skill) => skill.dir).sort();
}

test('reads a Claude Code marketplace, its plugin manifests, and skips non-skill components', async () => {
  const discovery = await discover({
    '.claude-plugin/marketplace.json': {
      name: 'team',
      owner: { name: 'Team' },
      plugins: [
        { name: 'core', source: './plugins/core' },
        { name: 'remote', source: { source: 'github', repo: 'org/remote' } },
        { name: 'escape', source: './../outside' },
      ],
    },
    'plugins/core/.claude-plugin/plugin.json': {
      name: 'core',
      skills: ['./extra-skills/'],
    },
    'plugins/core/skills/review/SKILL.md': skillMd('review'),
    'plugins/core/skills/review/references/checklist.md': '# Checklist\n',
    'plugins/core/extra-skills/deploy/SKILL.md': skillMd('deploy'),
    'plugins/core/commands/status.md': 'Status.\n',
    'plugins/core/agents/reviewer.md': 'Reviewer.\n',
    'plugins/core/hooks/hooks.json': '{}',
    'plugins/core/.mcp.json': '{}',
  });

  expect(discovery.layout).toBe('marketplace');
  expect(discovery.plugins).toEqual(['core']);
  expect(dirs(discovery)).toEqual([
    'plugins/core/extra-skills/deploy',
    'plugins/core/skills/review',
  ]);
  expect(
    discovery.skills.find((skill) => skill.dir.endsWith('review'))?.files,
  ).toEqual(['SKILL.md', 'references/checklist.md']);
  expect(discovery.notices).toEqual([
    'Plugin "remote" in .claude-plugin/marketplace.json has a github source. Clone or download it, then run the importer on that folder.',
    'Plugin "escape" in .claude-plugin/marketplace.json points outside the marketplace (./../outside); skipped.',
    'Plugin "core": not importing 1 command, 1 agent, 1 hooks file, 1 MCP server config. The Skills API stores skills only.',
  ]);
});

test('reads a Codex marketplace with local sources and a .codex-plugin manifest', async () => {
  const discovery = await discover({
    '.agents/plugins/marketplace.json': {
      name: 'local-repo',
      plugins: [
        {
          name: 'helper',
          source: { source: 'local', path: './plugins/helper' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    'plugins/helper/.codex-plugin/plugin.json': {
      name: 'helper',
      skills: './skills/',
    },
    'plugins/helper/skills/summarize/SKILL.md': skillMd('summarize'),
  });
  expect(discovery.plugins).toEqual(['helper']);
  expect(dirs(discovery)).toEqual(['plugins/helper/skills/summarize']);
});

test('loads only the listed skills for a marketplace entry at the marketplace root', async () => {
  const discovery = await discover({
    '.claude-plugin/marketplace.json': {
      name: 'examples',
      owner: { name: 'Team' },
      plugins: [
        {
          name: 'documents',
          source: './',
          strict: false,
          skills: ['./skills/pdf', './skills/docx'],
        },
      ],
    },
    'skills/pdf/SKILL.md': skillMd('pdf'),
    'skills/docx/SKILL.md': skillMd('docx'),
    'skills/unlisted/SKILL.md': skillMd('unlisted'),
  });
  expect(dirs(discovery)).toEqual(['skills/docx', 'skills/pdf']);
});

test('prepends metadata.pluginRoot to bare plugin names', async () => {
  const discovery = await discover({
    '.claude-plugin/marketplace.json': {
      name: 'team',
      owner: { name: 'Team' },
      metadata: { pluginRoot: './plugins' },
      plugins: [{ name: 'formatter', source: 'formatter' }],
    },
    'plugins/formatter/skills/format/SKILL.md': skillMd('format'),
  });
  expect(dirs(discovery)).toEqual(['plugins/formatter/skills/format']);
});

test('lists the same plugin folder once when several harness marketplaces name it', async () => {
  const entry = { name: 'core', source: './core' };
  const discovery = await discover({
    '.claude-plugin/marketplace.json': {
      name: 'm',
      owner: { name: 'o' },
      plugins: [entry],
    },
    '.agents/plugins/marketplace.json': { name: 'm', plugins: [entry] },
    'core/plugin.json': { name: 'core' },
    'core/skills/a/SKILL.md': skillMd('a'),
  });
  expect(dirs(discovery)).toEqual(['core/skills/a']);
});

test('treats a plugin with a root SKILL.md and no skills folder as one skill', async () => {
  const discovery = await discover({
    '.claude-plugin/plugin.json': { name: 'solo' },
    'SKILL.md': skillMd('solo'),
    'scripts/run.sh': 'echo hi\n',
  });
  expect(discovery.layout).toBe('plugin');
  expect(discovery.skills).toEqual([
    { dir: '', plugin: 'solo', files: ['SKILL.md', 'scripts/run.sh'] },
  ]);
});

test('walks skills folders to category depth and lets a shallower SKILL.md shadow nested ones', async () => {
  const discovery = await discover({
    'skills/writing/blog/SKILL.md': skillMd('blog'),
    'skills/writing/blog/examples/SKILL.md': skillMd('nested-example'),
    'skills/a/b/c/SKILL.md': skillMd('three-levels'),
    'skills/a/b/c/d/SKILL.md': skillMd('too-deep'),
    '.claude/skills/local/SKILL.md': skillMd('local'),
  });
  expect(discovery.layout).toBe('skills');
  expect(dirs(discovery)).toEqual([
    '.claude/skills/local',
    'skills/a/b/c',
    'skills/writing/blog',
  ]);
});

test('falls back to searching the whole tree when no standard folder has skills', async () => {
  const discovery = await discover({
    'tools/lint/SKILL.md': skillMd('lint'),
    'README.md': '# Tools\n',
  });
  expect(discovery.layout).toBe('recursive');
  expect(dirs(discovery)).toEqual(['tools/lint']);
});

test('fails on a manifest that is not valid JSON', async () => {
  await expect(
    discover({
      '.claude-plugin/plugin.json': '{ nope',
      'SKILL.md': skillMd('x'),
    }),
  ).rejects.toThrow(/\.claude-plugin\/plugin\.json is not valid JSON/);
});

test('resolveInside keeps manifest paths inside their base folder', () => {
  expect(resolveInside('', './')).toBe('');
  expect(resolveInside('', '.')).toBe('');
  expect(resolveInside('plugins/a', './skills/')).toBe('plugins/a/skills');
  expect(resolveInside('plugins/a', '../b')).toBe('plugins/b');
  expect(resolveInside('', '../outside')).toBeUndefined();
  expect(resolveInside('', '/etc')).toBeUndefined();
});
