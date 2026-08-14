import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(
  repoRoot,
  'recipes/customer-360/shared/index.html',
);
const targetPaths = [
  'recipes/customer-360/platform-search-chat/public/index.html',
  'recipes/customer-360/platform-agents/public/index.html',
].map((target) => path.join(repoRoot, target));

test('both Customer 360 variants use the canonical frontend', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const targetPath of targetPaths) {
    assert.equal(
      fs.readFileSync(targetPath, 'utf8'),
      source,
      `${path.relative(repoRoot, targetPath)} drifted from the shared UI`,
    );
  }
});

test('the Customer 360 frontend stacks workspace above evidence beside chat', () => {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const workspace = /\.workspace\s*{[^}]*}/s.exec(html)?.[0];
  const main = /\.main\s*{[^}]*}/s.exec(html)?.[0];
  assert.ok(workspace, 'expected .workspace rules');
  assert.ok(main, 'expected .main rules');
  assert.match(
    workspace,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(350px,\s*410px\)/u,
  );
  assert.match(workspace, /align-items:\s*stretch/u);
  assert.match(main, /flex-direction:\s*column/u);
  assert.match(main, /gap:\s*24px/u);
  assert.match(html, /\.evidence\s*{[^}]*flex:\s*1/s);
  assert.doesNotMatch(html, /grid-template-areas/u);

  const evidenceGrid = /\.evidence-grid\s*{[^}]*}/s.exec(html)?.[0];
  assert.ok(evidenceGrid, 'expected .evidence-grid rules');
  assert.match(evidenceGrid, /grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
  assert.match(evidenceGrid, /grid-auto-rows:\s*1fr/u);
  assert.match(evidenceGrid, /flex:\s*1/u);
  assert.doesNotMatch(
    html,
    /\.evidence-grid\s*{[^}]*repeat\(3/s,
    'evidence tiles stack, not three columns',
  );

  const overview = html.indexOf('class="card overview"');
  const evidence = html.indexOf('class="card evidence"');
  const assistant = html.indexOf('class="card assistant"');
  assert.ok(overview >= 0 && evidence > overview && assistant > evidence);

  assert.match(
    html,
    /\.source p\s*{[^}]*-webkit-line-clamp:\s*3/s,
    'evidence snippets stay at 3 lines',
  );
});

test('the Customer 360 frontend keeps its assistant contract', () => {
  const html = fs.readFileSync(sourcePath, 'utf8');
  assert.match(html, /class="card assistant"/u);
  assert.match(html, /class="thread"[\s\S]*role="log"/u);
  assert.match(html, /fetch\('\/api\/ask'/u);
  assert.match(html, /function renderMarkdown/u);
  assert.match(html, /function scrollToLatest/u);
  assert.doesNotMatch(html, /id="journey-answer"|id="chat-answer"/u);

  const script = /<script>([\s\S]*)<\/script>/u.exec(html)?.[1];
  assert.ok(script, 'expected an inline application script');
  assert.doesNotThrow(() => new Function(script), 'inline script must parse');
});

test('both servers expose the shared ask endpoint', () => {
  for (const variant of ['platform-search-chat', 'platform-agents']) {
    const server = fs.readFileSync(
      path.join(repoRoot, 'recipes/customer-360', variant, 'server.ts'),
      'utf8',
    );
    assert.match(server, /req\.url === '\/api\/ask'/u);
  }
});
