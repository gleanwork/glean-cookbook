import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

const sharedStyleUIs = [
  'recipes/company-answers/chat-api/public/index.html',
  'recipes/company-answers/web-sdk/index.html',
  'recipes/incident-copilot/public/index.html',
  'recipes/onboarding-hub/platform-chat/public/index.html',
  'recipes/onboarding-hub/web-sdk/index.html',
  'recipes/rfp-responder/public/index.html',
];

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

test('every authored web recipe uses the shared cookbook shell', () => {
  for (const file of sharedStyleUIs) {
    const html = read(file);
    assert.match(
      html,
      /<meta name="viewport"/i,
      `${file}: responsive viewport`,
    );
    assert.match(
      html,
      /href="\/glean-cookbook\.css"/,
      `${file}: shared stylesheet`,
    );
    assert.match(html, /class="mark"/, `${file}: product mark`);
    assert.match(html, /class="[^"]*layout/, `${file}: bounded layout`);
  }
});

test('assistant recipes keep the primary interaction first on mobile', () => {
  const assistantUIs = [
    'recipes/company-answers/chat-api/public/index.html',
    'recipes/company-answers/web-sdk/index.html',
    'recipes/onboarding-hub/platform-chat/public/index.html',
    'recipes/onboarding-hub/web-sdk/index.html',
  ];

  for (const file of assistantUIs) {
    assert.match(read(file), /order:\s*-1/, `${file}: mobile assistant order`);
  }
});

test('shared assistant primitives preserve an internally scrolling thread', () => {
  const css = read('styles/cookbook.css');
  assert.match(css, /\.assistant-shell\s*{/);
  assert.match(css, /\.assistant-thread\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.assistant-composer\s*{/);
});
