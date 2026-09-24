import fs from 'node:fs/promises';
import { expect, test } from 'vitest';

test('web Agent Builder setup preserves the prompts and approval configuration', async () => {
  const directory = new URL('../', import.meta.url);
  const recipe = JSON.parse(
    await fs.readFile(new URL('recipe.json', directory), 'utf8'),
  ) as { steps: { description: string }[] };
  const guide = await fs.readFile(new URL('agent-setup.md', directory), 'utf8');
  const readme = await fs.readFile(new URL('README.md', directory), 'utf8');
  const descriptions = recipe.steps.map((step) => step.description).join('\n');
  const prompts = [...guide.matchAll(/```text\n([\s\S]*?)\n```/g)];

  expect(
    prompts,
    'include both the builder prompt and agent instructions',
  ).toHaveLength(2);
  for (const [, prompt = ''] of prompts) {
    expect(
      descriptions,
      'the page and copied guide must use the same prompt',
    ).toContain(prompt);
    expect(prompt).toMatch(/Search Slack Channel Doc Ids/);
    expect(prompt).toMatch(/Send Slack message to a channel/);
  }
  expect(prompts[1]?.[1]).toMatch(/canSendMessage.*true/);
  expect(prompts[1]?.[1]).toMatch(/channelDocId/);
  expect(readme).toMatch(/Search Slack Channel Doc Ids/);
  expect([JSON.stringify(recipe), guide, readme].join('\n')).not.toMatch(
    /TEST_CHANNEL_ID|single-tool|exactly one Slack tool invocation/i,
  );
  expect(descriptions).toMatch(/Run without confirmation.*unchecked/s);
  expect(descriptions).toMatch(/Manual run with Chat message/);
  expect(descriptions).toMatch(/click Save to publish/);
  expect(guide).toMatch(/`skipConfirmation: false`/);
  expect(guide).toMatch(/`REQUIRES_INPUT`.*`TOOL_APPROVAL`/s);
  expect(guide).toMatch(/Confirm both tools appear in the selected tools list/);
  expect(guide).toMatch(/Draft autosave alone does not publish your changes/);
  expect([JSON.stringify(recipe), guide, readme].join('\n')).not.toMatch(
    /headless|\/glean_run|\$glean_run|spec\.yaml|\.glean\/agents\//i,
  );
});
