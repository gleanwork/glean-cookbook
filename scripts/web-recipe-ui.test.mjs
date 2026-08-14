import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

const sharedStyleUIs = [
  'recipes/company-answers/chat-api/public/index.html',
  'recipes/company-answers/web-sdk/index.html',
  'recipes/oncall-copilot/public/index.html',
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

const onboardingUIs = [
  'recipes/onboarding-hub/platform-chat/public/index.html',
  'recipes/onboarding-hub/web-sdk/index.html',
];

test('onboarding hub checklists use shared button styles, not custom mark/ask classes', () => {
  for (const file of onboardingUIs) {
    const html = read(file);
    assert.doesNotMatch(html, /ask-btn/, `${file}: no ask-btn`);
    assert.doesNotMatch(html, /mark-btn/, `${file}: no mark-btn`);
  }

  const platformChat = read(
    'recipes/onboarding-hub/platform-chat/public/index.html',
  );
  assert.match(platformChat, /btn-primary/, 'platform-chat: primary button');
  assert.match(
    platformChat,
    /btn-secondary/,
    'platform-chat: secondary button',
  );

  const webSdkStepRow = read('recipes/onboarding-hub/web-sdk/src/main.ts');
  assert.match(webSdkStepRow, /btn-primary/, 'web-sdk stepRow: primary button');
  assert.match(
    webSdkStepRow,
    /btn-secondary/,
    'web-sdk stepRow: secondary button',
  );
  assert.doesNotMatch(webSdkStepRow, /ask-btn/, 'web-sdk stepRow: no ask-btn');
  assert.doesNotMatch(
    webSdkStepRow,
    /mark-btn/,
    'web-sdk stepRow: no mark-btn',
  );
});

test('onboarding hub Ask Glean titles use the shared assistant header', () => {
  for (const file of onboardingUIs) {
    const html = read(file);
    assert.match(html, /assistant-header/, `${file}: assistant-header`);
    assert.doesNotMatch(
      html,
      /#chat-panel\s*>\s*h2::before/,
      `${file}: no h2::before avatar`,
    );
  }
});

test('onboarding hub platform-chat owns a grey user bubble and Ask anything placeholder', () => {
  const html = read('recipes/onboarding-hub/platform-chat/public/index.html');
  assert.match(html, /placeholder="Ask anything/, 'placeholder');
  assert.match(html, /msg-user/, 'user bubble class');
});

test('rfp parse section spaces KPI cards from the banner and confirm button', () => {
  const html = read('recipes/rfp-responder/public/index.html');
  assert.match(
    html,
    /#parse-section\s*{[^}]*gap:\s*16px/s,
    'parse-section 16px gap',
  );
});
