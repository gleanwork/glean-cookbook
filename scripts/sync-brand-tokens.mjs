#!/usr/bin/env node
/**
 * Regenerates the cookbook's design tokens from glean-developer-site.
 *
 * The dev site owns the brand. Its `--gdt-*` block is what the Cookbook pages
 * there render with, so recipes reading the same values is what makes a recipe
 * and the page describing it look like one product. This script is the only
 * thing that should ever write styles/tokens.css or brand/tokens.json.
 *
 *   node scripts/sync-brand-tokens.mjs [--site <path>] [--check]
 *
 * --check exits non-zero on drift instead of writing, for CI and for spotting
 * that the dev site moved.
 */
import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const siteFlag = args.indexOf('--site');
const sitePath = path.resolve(
  siteFlag !== -1 && args[siteFlag + 1]
    ? args[siteFlag + 1]
    : (process.env.GLEAN_DEVELOPER_SITE ??
        path.join(repoRoot, '..', 'glean-developer-site')),
);

const CUSTOM_CSS = path.join(sitePath, 'src/css/custom.css');
const BRAND_CSS = path.join(
  sitePath,
  'packages/docusaurus-theme-glean/src/css/brand.css',
);

/**
 * Dark values the dev site inherits from Infima rather than declaring, so they
 * are not in either source file. Taken from
 * infima/dist/css/default/default.css: `--ifm-background-surface-color: #242526`
 * in the dark block, `--ifm-card-background-color` aliases it, and
 * `--ifm-font-color-base` aliases `--ifm-color-content` (#d1d5db in brand.css).
 * Anything else unresolved is a hard error rather than a guess -- see resolve().
 */
const INFIMA_DARK = {
  '--ifm-background-surface-color': '#242526',
  '--ifm-card-background-color': '#242526',
  '--ifm-font-color-base': '#d1d5db',
};

/**
 * Recipes render outside Docusaurus, so nothing supplies a page background.
 * In light mode --gdt-bg-light doubles as one, but in dark it resolves to the
 * same #242526 as --gdt-card-bg, which would leave cards with no contrast
 * against the page. This is the dev site's own page background
 * (--ifm-background-color in brand.css), promoted to a token so recipes have
 * the layer Infima would otherwise give them. Cookbook-only: not synced.
 */
const PAGE_BG = { light: '#f7f8fa', dark: '#202124' };

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readSource(file, label) {
  if (!fs.existsSync(file)) {
    fail(
      `Cannot read ${label} at ${file}\n` +
        `  Point at a glean-developer-site checkout with --site <path> or GLEAN_DEVELOPER_SITE.`,
    );
  }
  return fs.readFileSync(file, 'utf8');
}

/**
 * Custom properties matching `prefixes`, across every rule whose selector list
 * matches `selector` exactly. Anchored so `[data-theme='dark']` picks up the
 * token block without also matching `[data-theme='dark'] .card` -- and so a new
 * selector in either source file cannot quietly start contributing tokens.
 */
function allBlockVars(css, selector, prefixes) {
  const vars = new Map();
  const heads = new RegExp(
    `(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`,
    'g',
  );
  for (const match of css.matchAll(heads)) {
    const open = match.index + match[0].length - 1;
    const close = css.indexOf('}', open);
    for (const [, name, value] of css
      .slice(open + 1, close)
      .matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      if (prefixes.some((p) => name.startsWith(p))) {
        vars.set(name, value.trim().replace(/\s+/g, ' '));
      }
    }
  }
  return vars;
}

const customCss = readSource(CUSTOM_CSS, 'the dev site custom.css');
const brandCss = readSource(BRAND_CSS, 'the dev site brand.css');

const gdtLight = allBlockVars(customCss, ':root', ['--gdt-']);
const gdtDarkRaw = allBlockVars(customCss, "html[data-theme='dark']", [
  '--gdt-',
]);
const scales = allBlockVars(brandCss, ':root', [
  '--glean-border-radius-',
  '--glean-shadow-',
  '--font-jetbrains-mono',
]);
// custom.css writes `html[data-theme='dark']`; brand.css writes it bare.
const ifmDark = allBlockVars(brandCss, "[data-theme='dark']", ['--ifm-']);

if (gdtLight.size === 0)
  fail('No --gdt-* properties found in any :root block of custom.css');
if (gdtDarkRaw.size === 0)
  fail("No --gdt-* properties found in custom.css's dark block");
if (scales.size === 0)
  fail('No --glean-border-radius-*/--glean-shadow-* found in brand.css');

/**
 * Dark --gdt-* values are written as var(--ifm-*) against Docusaurus. Recipes
 * have no Infima, so resolve to literals -- and fail loudly on anything neither
 * source nor INFIMA_DARK explains, rather than emitting a token that silently
 * resolves to nothing in a recipe.
 */
function resolve(name, value) {
  return value.replace(/var\((--[a-z0-9-]+)\)/gi, (_, ref) => {
    const literal = ifmDark.get(ref) ?? INFIMA_DARK[ref];
    if (!literal) {
      fail(
        `${name} references ${ref}, which is not declared in brand.css and has no ` +
          `known Infima default.\n  Add it to INFIMA_DARK in this script with a source citation.`,
      );
    }
    return literal.replace(/\s*!important$/, '');
  });
}

const gdtDark = new Map(
  [...gdtDarkRaw].map(([name, value]) => [name, resolve(name, value)]),
);

const decls = (vars, indent = '  ') =>
  [...vars].map(([n, v]) => `${indent}${n}: ${v};`).join('\n');

const tokensCss = `/**
 * GENERATED by scripts/sync-brand-tokens.mjs -- do not edit.
 *
 * Design tokens copied from glean-developer-site so a recipe and the Cookbook
 * page describing it render from one set of values. Re-run the script to pick
 * up brand changes; \`--check\` reports drift.
 *
 * Sources:
 *   --gdt-*    src/css/custom.css (Cookbook design tokens)
 *   --glean-*  packages/docusaurus-theme-glean/src/css/brand.css (radius/shadow scales)
 */

/* Same families and axes the dev site loads (custom.css lines 13 and 15). The
 * --gdt-font-* stacks below name Inter first; without these the recipe silently
 * falls back to system-ui and stops matching the docs page. Fails soft offline. */
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
${decls(gdtLight)}

  /* Page background: see PAGE_BG in scripts/sync-brand-tokens.mjs. */
  --gdt-page-bg: ${PAGE_BG.light};

${decls(scales)}
}

/**
 * Dark values resolved to literals -- the dev site writes several of these as
 * var(--ifm-*), which only exists under Docusaurus. Recipes do not opt in to
 * dark styling yet; shipping the tokens means one that does gets them for free.
 */
@media (prefers-color-scheme: dark) {
  :root {
${decls(gdtDark, '    ')}
    --gdt-page-bg: ${PAGE_BG.dark};
  }
}
`;

const tokensJson = {
  $comment:
    'GENERATED by scripts/sync-brand-tokens.mjs from glean-developer-site -- do not edit. Machine-readable mirror of styles/tokens.css, for tooling that cannot parse CSS.',
  light: Object.fromEntries([...gdtLight, ['--gdt-page-bg', PAGE_BG.light]]),
  dark: Object.fromEntries([...gdtDark, ['--gdt-page-bg', PAGE_BG.dark]]),
  scales: Object.fromEntries(scales),
};

// Formatted through prettier, like build-registry.mjs does for registry.json:
// generated files are format-checked in CI alongside authored ones.
async function formatted(source, file) {
  return prettier.format(source, {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
}

const outputs = [
  {
    file: path.join(repoRoot, 'styles/tokens.css'),
    next: await formatted(tokensCss, path.join(repoRoot, 'styles/tokens.css')),
  },
  {
    file: path.join(repoRoot, 'brand/tokens.json'),
    next: await formatted(
      JSON.stringify(tokensJson),
      path.join(repoRoot, 'brand/tokens.json'),
    ),
  },
];

let stale = 0;
for (const { file, next } of outputs) {
  const rel = path.relative(repoRoot, file);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === next) {
    console.log(`✓ ${rel} up to date`);
    continue;
  }
  stale += 1;
  if (check) {
    console.error(
      `✗ ${rel} is stale (${current === null ? 'missing' : 'differs'})`,
    );
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  console.log(`→ wrote ${rel}`);
}

console.log(
  `${gdtLight.size} light tokens, ${gdtDark.size} dark, ${scales.size} scales from ${path.relative(repoRoot, sitePath) || sitePath}`,
);

if (check && stale > 0) {
  console.error(
    `\n${stale} file(s) out of sync with the dev site. Run: npm run sync:tokens`,
  );
  process.exit(1);
}
