import path from 'node:path';
import type { PluginSource } from './plugin-source.js';

export interface DiscoveredSkill {
  /** Skill folder relative to the plugin root; empty for the root itself. */
  dir: string;
  /** Plugin that declared the skill, when it came from a plugin. */
  plugin?: string;
  /** Files in the skill folder, relative to that folder. */
  files: string[];
}

export type Layout = 'marketplace' | 'plugin' | 'skills' | 'recursive';

export interface Discovery {
  layout: Layout;
  plugins: string[];
  skills: DiscoveredSkill[];
  notices: string[];
}

// Claude Code and Cursor read .claude-plugin/ or .cursor-plugin/; Codex reads
// .agents/plugins/ and also accepts the Claude location.
const MARKETPLACE_FILES = [
  '.claude-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
  '.cursor-plugin/marketplace.json',
];

// Portable Agent Plugins use a root plugin.json; each harness also has its own.
const PLUGIN_MANIFESTS = [
  '.claude-plugin/plugin.json',
  'plugin.json',
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
];

// Without a plugin manifest, look where `npx skills` and the agent harnesses do.
const SKILL_CONTAINERS = [
  'skills',
  '.agents/skills',
  '.claude/skills',
  '.cursor/skills',
];

// Skill containers are walked to skills/<category>/<category>/<name>/SKILL.md.
const MAX_CONTAINER_DEPTH = 3;

// Files that belong to the plugin or the machine, not to a skill bundle.
const EXCLUDED_SEGMENTS = new Set([
  '.DS_Store',
  '.claude-plugin',
  '.codex-plugin',
  '.cursor-plugin',
]);

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/** Resolve a manifest path against a base folder; undefined if it escapes. */
export function resolveInside(base: string, relative: string) {
  if (path.posix.isAbsolute(relative) || relative.includes('\\')) {
    return undefined;
  }
  const joined = path.posix
    .normalize(path.posix.join(base || '.', relative))
    .replace(/\/$/, '');
  if (joined === '..' || joined.startsWith('../')) return undefined;
  return joined === '.' ? '' : joined;
}

function within(dir: string, file: string) {
  return dir === '' || file.startsWith(`${dir}/`);
}

function relativeTo(dir: string, file: string) {
  return dir === '' ? file : file.slice(dir.length + 1);
}

function skillMd(dir: string) {
  return dir ? `${dir}/SKILL.md` : 'SKILL.md';
}

class Tree {
  constructor(private readonly source: PluginSource) {}

  has(file: string) {
    return this.source.files.has(file);
  }

  isDirectory(dir: string) {
    if (dir === '') return true;
    for (const file of this.source.files)
      if (file.startsWith(`${dir}/`)) return true;
    return false;
  }

  async json(file: string): Promise<Json> {
    const text = new TextDecoder().decode(await this.source.read(file));
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!isObject(parsed))
      throw new Error(`${file} must contain a JSON object.`);
    return parsed;
  }

  /** Skill folders in a container. A shallower SKILL.md shadows deeper ones. */
  skillDirs(container: string, maxDepth = MAX_CONTAINER_DEPTH) {
    if (this.has(skillMd(container))) return [container];
    const candidates: string[] = [];
    for (const file of this.source.files) {
      if (
        !within(container, file) ||
        path.posix.basename(file) !== 'SKILL.md'
      ) {
        continue;
      }
      const dir = path.posix.dirname(file);
      const depth = relativeTo(container, dir).split('/').length;
      if (depth <= maxDepth) candidates.push(dir);
    }
    candidates.sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
    );
    const chosen: string[] = [];
    for (const dir of candidates) {
      if (!chosen.some((parent) => within(parent, dir))) chosen.push(dir);
    }
    return chosen;
  }

  skill(dir: string, plugin?: string): DiscoveredSkill {
    const files = [...this.source.files]
      .filter((file) => within(dir, file))
      .map((file) => relativeTo(dir, file))
      .filter(
        (file) => !file.split('/').some((part) => EXCLUDED_SEGMENTS.has(part)),
      )
      .sort();
    return { dir, plugin, files };
  }

  count(dir: string, pattern: RegExp) {
    let total = 0;
    for (const file of this.source.files) {
      if (within(dir, file) && pattern.test(relativeTo(dir, file))) total += 1;
    }
    return total;
  }
}

interface PluginRef {
  name: string;
  dir: string;
  /** Skill paths a marketplace entry adds, relative to the plugin folder. */
  entrySkills: string[];
  /** True when the entry's source is the marketplace root itself. */
  atMarketplaceRoot: boolean;
}

async function marketplacePlugins(
  tree: Tree,
  file: string,
  notices: string[],
): Promise<PluginRef[]> {
  const marketplace = await tree.json(file);
  const metadata = isObject(marketplace.metadata) ? marketplace.metadata : {};
  const pluginRoot =
    typeof metadata.pluginRoot === 'string' ? metadata.pluginRoot : '';
  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const plugins: PluginRef[] = [];

  for (const entry of entries) {
    if (!isObject(entry) || typeof entry.name !== 'string') continue;
    const { name, source } = entry;
    let relative: string | undefined;
    if (typeof source === 'string') {
      // Claude Code prepends metadata.pluginRoot to bare plugin names.
      relative =
        pluginRoot && !source.startsWith('./') && source !== '.'
          ? path.posix.join(pluginRoot, source)
          : source;
    } else if (
      isObject(source) &&
      source.source === 'local' &&
      typeof source.path === 'string'
    ) {
      relative = source.path;
    } else {
      const kind = isObject(source) ? String(source.source) : 'missing';
      notices.push(
        `Plugin "${name}" in ${file} has a ${kind} source. Clone or download it, then run the importer on that folder.`,
      );
      continue;
    }

    const dir = resolveInside('', relative);
    if (dir === undefined) {
      notices.push(
        `Plugin "${name}" in ${file} points outside the marketplace (${relative}); skipped.`,
      );
      continue;
    }
    if (!tree.isDirectory(dir)) {
      notices.push(
        `Plugin "${name}" in ${file}: ${relative} was not found; skipped.`,
      );
      continue;
    }
    plugins.push({
      name,
      dir,
      entrySkills: asPaths(entry.skills),
      atMarketplaceRoot: dir === '',
    });
  }
  return plugins;
}

async function pluginSkills(tree: Tree, plugin: PluginRef, notices: string[]) {
  const declared: string[] = [];
  for (const manifest of PLUGIN_MANIFESTS) {
    const file = plugin.dir ? `${plugin.dir}/${manifest}` : manifest;
    if (tree.has(file))
      declared.push(...asPaths((await tree.json(file)).skills));
  }

  // Claude Code: an entry at the marketplace root that lists skills loads only
  // those. Otherwise manifest and entry paths add to the default skills/ scan.
  const onlyEntrySkills =
    plugin.atMarketplaceRoot && plugin.entrySkills.length > 0;
  const containers = new Set<string>();
  const defaultContainer = plugin.dir ? `${plugin.dir}/skills` : 'skills';
  if (!onlyEntrySkills && tree.isDirectory(defaultContainer)) {
    containers.add(defaultContainer);
  }
  const extra = onlyEntrySkills
    ? plugin.entrySkills
    : [...declared, ...plugin.entrySkills];
  for (const relative of extra) {
    const dir = resolveInside(plugin.dir, relative);
    if (dir === undefined) {
      notices.push(
        `Plugin "${plugin.name}" lists skills outside the plugin (${relative}); skipped.`,
      );
    } else if (!tree.isDirectory(dir)) {
      notices.push(
        `Plugin "${plugin.name}" lists ${relative}, which was not found.`,
      );
    } else {
      containers.add(dir);
    }
  }

  const dirs = new Set<string>();
  if (containers.size === 0 && tree.has(skillMd(plugin.dir))) {
    // A plugin with a root SKILL.md, no skills/, and no skills key is one skill.
    dirs.add(plugin.dir);
  }
  for (const container of containers) {
    for (const dir of tree.skillDirs(container)) dirs.add(dir);
  }

  const skipped = [
    [tree.count(plugin.dir, /^commands\/[^/]+\.md$/), 'command'],
    [tree.count(plugin.dir, /^agents\/[^/]+\.md$/), 'agent'],
    [tree.count(plugin.dir, /^hooks\/hooks\.json$/), 'hooks file'],
    [tree.count(plugin.dir, /^\.?mcp\.json$/), 'MCP server config'],
  ] as const;
  const parts = skipped
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`);
  if (parts.length > 0) {
    notices.push(
      `Plugin "${plugin.name}": not importing ${parts.join(', ')}. The Skills API stores skills only.`,
    );
  }
  return [...dirs].map((dir) => tree.skill(dir, plugin.name));
}

async function rootPlugin(tree: Tree): Promise<PluginRef | undefined> {
  for (const manifest of PLUGIN_MANIFESTS) {
    if (!tree.has(manifest)) continue;
    const name = (await tree.json(manifest)).name;
    return {
      name: typeof name === 'string' ? name : 'plugin',
      dir: '',
      entrySkills: [],
      atMarketplaceRoot: false,
    };
  }
  return undefined;
}

export async function discoverSkills(
  source: PluginSource,
  options: { plugins?: string[] } = {},
): Promise<Discovery> {
  const tree = new Tree(source);
  const notices: string[] = [];
  const wanted = new Set(options.plugins ?? []);

  let layout: Layout;
  let plugins: PluginRef[] = [];
  const marketplaces = MARKETPLACE_FILES.filter((file) => tree.has(file));
  if (marketplaces.length > 0) {
    layout = 'marketplace';
    const seen = new Set<string>();
    for (const file of marketplaces) {
      for (const plugin of await marketplacePlugins(tree, file, notices)) {
        // Marketplaces for different harnesses often list the same folder.
        const key = `${plugin.name}\0${plugin.dir}`;
        if (!seen.has(key)) plugins.push(plugin);
        seen.add(key);
      }
    }
  } else {
    const plugin = await rootPlugin(tree);
    layout = plugin ? 'plugin' : 'skills';
    if (plugin) plugins = [plugin];
  }

  if (wanted.size > 0) {
    const available = new Set(plugins.map((plugin) => plugin.name));
    const missing = [...wanted].filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error(
        `No plugin named ${missing.join(', ')}. Available: ${[...available].join(', ') || 'none'}.`,
      );
    }
    plugins = plugins.filter((plugin) => wanted.has(plugin.name));
  }

  let skills: DiscoveredSkill[] = [];
  if (layout === 'skills') {
    if (tree.has('SKILL.md')) {
      skills = [tree.skill('')];
    } else {
      const dirs = SKILL_CONTAINERS.filter((dir) =>
        tree.isDirectory(dir),
      ).flatMap((dir) => tree.skillDirs(dir));
      skills = dirs.map((dir) => tree.skill(dir));
    }
    if (skills.length === 0) {
      // Like `npx skills`, fall back to a full search when nothing is in place.
      layout = 'recursive';
      skills = tree
        .skillDirs('', Number.POSITIVE_INFINITY)
        .map((dir) => tree.skill(dir));
    }
  } else {
    for (const plugin of plugins) {
      skills.push(...(await pluginSkills(tree, plugin, notices)));
    }
  }

  // A skipped link inside a skill means that skill uploads without it.
  for (const entry of source.skipped) {
    const owner = skills.find((skill) => within(skill.dir, entry.path));
    if (owner) {
      notices.push(
        `${entry.path} (${entry.reason}) is not uploaded with ${owner.dir || 'the root skill'}.`,
      );
    }
  }

  return {
    layout,
    plugins: [...new Set(plugins.map((plugin) => plugin.name))],
    skills,
    notices: [...new Set(notices)],
  };
}
