import { expect, test, type Page } from '@playwright/test';
import { snapshot, runId } from '../fixtures.js';
import type { Snapshot } from '../../public/model.js';

async function mock(page: Page, initial = snapshot()) {
  let current = initial;
  let responseStatus = 200;
  let rejectNext = false;
  const posts: { path: string; body: unknown }[] = [];
  await page.route('**/api/runs**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (request.method() === 'POST') {
      posts.push({ path, body });
      if (path.endsWith('/responses')) {
        if (rejectNext) {
          rejectNext = false;
          await route.abort('failed');
          return;
        }
        status = responseStatus;
        if (status === 200) current = snapshot('RUNNING');
      } else if (path.endsWith('/cancellations'))
        current = snapshot('CANCELLED');
      else {
        status = 201;
        current = snapshot('RUNNING');
      }
    }
    await route.fulfill({
      json: {
        method: request.method(),
        path: path.replace('/api/runs', '/api/agents/agent_fixture/runs'),
        request: body,
        status,
        body: status === 409 ? { detail: 'Stale batch' } : current,
      },
    });
  });
  await page.goto('/');
  await page.locator('#attach-id').fill(runId);
  await page.locator('#attach').click();
  await expect(page.locator('#state')).toHaveText(initial.run.state);
  return {
    posts,
    set: (value: Snapshot) => {
      current = value;
    },
    conflict: () => {
      responseStatus = 409;
    },
    loseResponse: () => {
      rejectNext = true;
    },
  };
}
test('review a whole batch, continue the same run, then require new decisions at a second pause', async ({
  page,
}) => {
  const api = await mock(page, snapshot('REQUIRES_INPUT', ['first', 'second']));
  const submit = page.locator('#submit-decisions');
  await expect(submit).toBeDisabled();
  await page.locator('input[name="first"][value="APPROVE"]').check();
  await expect(submit).toBeDisabled();
  await page.locator('input[name="second"][value="REJECT"]').check();
  await submit.click();
  await expect(page.locator('#state')).toHaveText('RUNNING');
  expect(api.posts).toEqual([
    {
      path: `/api/runs/${runId}/responses`,
      body: {
        responses: [
          { interaction_id: 'first', decision: 'APPROVE' },
          { interaction_id: 'second', decision: 'REJECT' },
        ],
      },
    },
  ]);
  api.set(snapshot('REQUIRES_INPUT', ['third']));
  await page.locator('#refresh').click();
  await expect(page.locator('#state')).toHaveText('REQUIRES_INPUT');
  await expect(submit).toBeDisabled();
  await expect(page.locator('#retry')).toBeHidden();
  await expect(page.locator('#run-id')).toHaveValue(runId);
  await expect(page.locator('input[name="third"]:checked')).toHaveCount(0);
});
test('a conflict refreshes the actual batch and clears old choices', async ({
  page,
}) => {
  const api = await mock(page);
  await page.getByLabel('Approve invocation').check();
  api.conflict();
  api.set(snapshot('REQUIRES_INPUT', ['new_interaction']));
  await page.locator('#submit-decisions').click();
  await expect(page.locator('#notice')).toContainText('HTTP 409');
  await expect(page.locator('input[name="new_interaction"]')).toHaveCount(2);
  await expect(page.locator('#submit-decisions')).toBeDisabled();
  expect(api.posts).toHaveLength(1);
});
test('lost approval response offers only an explicit identical retry', async ({
  page,
}) => {
  const api = await mock(page);
  await page.getByLabel('Approve invocation').check();
  api.loseResponse();
  await page.locator('#submit-decisions').click();
  await expect(page.locator('#notice')).toContainText('identical');
  expect(api.posts).toHaveLength(1);
  await page.locator('#retry').click();
  await expect(page.locator('#state')).toHaveText('RUNNING');
  expect(api.posts[0]).toEqual(api.posts[1]);
});
test('reconnect only remembers IDs and makes no creation POST', async ({
  page,
}) => {
  const api = await mock(page);
  await page.reload();
  await expect(page.locator('#attach-id')).toHaveValue(runId);
  await expect(page.locator('#state')).toHaveText('NOT STARTED');
  await page.locator('#attach').click();
  await expect(page.locator('#state')).toHaveText('REQUIRES_INPUT');
  const stored = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  expect(stored).toEqual({
    'glean-hitl-run': JSON.stringify({ agentId: 'agent_fixture', runId }),
  });
  expect(api.posts).toHaveLength(0);
});
test('paused cancellation is explicit and a FAILED run is not an HTTP failure', async ({
  page,
}) => {
  const api = await mock(page);
  await page.getByText('Cancel this run', { exact: true }).click();
  await expect(page.locator('#cancel')).toBeDisabled();
  await page.locator('#authorize-cancel').check();
  await page.locator('#cancel').click();
  await expect(page.locator('#state')).toHaveText('CANCELLED');
  expect(api.posts[0]!.path).toContain('/cancellations');
  api.set(snapshot('FAILED'));
  await page.locator('#refresh').click();
  await expect(page.locator('#state')).toHaveText('FAILED');
  await expect(page.locator('#output')).toContainText('execution_failed');
  await expect(page.locator('#state-help')).toContainText('HTTP 200');
});
test('untrusted tool arguments render as text and curl never contains a credential', async ({
  page,
}) => {
  const data = snapshot();
  data.run.pending_interactions[0]!.arguments.text =
    '<img src=x onerror="window.pwned=1">';
  await mock(page, data);
  await expect(page.locator('#interactions pre')).toContainText('<img src=x');
  await expect(page.locator('#interactions img')).toHaveCount(0);
  await expect(page.locator('#exchanges')).toContainText('$GLEAN_API_TOKEN');
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
});
test('mobile layout has no page-level horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('capture the illustrative preview with its fixture label', async ({
  page,
}) => {
  test.skip(
    !process.env.HITL_PREVIEW_PNG,
    'Optional local asset capture, not live evidence.',
  );
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mock(page);
  await page.evaluate(() => {
    document.querySelector('.identity .pill')!.textContent =
      'ILLUSTRATIVE FIXTURE · NOT A LIVE RUN';
    (document.querySelector('.launch') as HTMLElement).hidden = true;
    (document.querySelector('.setup') as HTMLElement).hidden = true;
  });
  await page.screenshot({
    path: process.env.HITL_PREVIEW_PNG!,
    fullPage: true,
  });
});
