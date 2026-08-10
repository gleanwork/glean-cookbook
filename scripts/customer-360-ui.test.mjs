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
