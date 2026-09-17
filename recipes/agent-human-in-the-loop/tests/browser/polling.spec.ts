import { expect, test } from '@playwright/test';
import { agentId, runId, snapshot } from '../fixtures.js';

const path = `/api/agents/${agentId}/runs/${runId}`;
test('starting a run requires explicit consent and sends one creation request', async ({
  page,
}) => {
  const posts: unknown[] = [];
  await page.route('**/api/runs', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        method: 'POST',
        path: `/api/agents/${agentId}/runs`,
        status: 201,
        body: snapshot('RUNNING'),
      },
    });
  });
  await page.goto('/');
  await page.locator('#message').fill('Post my authorized test message.');
  await page.locator('#start').click();
  expect(posts).toHaveLength(0);
  await page.locator('#authorize-start').check();
  await page.locator('#start').click();
  await expect(page.locator('#state')).toHaveText('RUNNING');
  expect(posts).toEqual([{ message: 'Post my authorized test message.' }]);
});

test('a rate limit beyond the waiting budget stops polling without retrying early', async ({
  page,
}) => {
  await page.clock.install();
  let gets = 0;
  await page.route(`**/api/runs/${runId}`, async (route) => {
    gets++;
    await route.fulfill({
      json:
        gets === 1
          ? { method: 'GET', path, status: 200, body: snapshot('RUNNING') }
          : {
              method: 'GET',
              path,
              status: 429,
              retryAfterSeconds: 180,
              body: { detail: 'Rate limited' },
            },
    });
  });
  await page.goto('/');
  await page.locator('#attach-id').fill(runId);
  await page.locator('#attach').click();
  await expect(page.locator('#state')).toHaveText('RUNNING');
  await page.clock.fastForward(2100);
  await expect(page.locator('#notice')).toContainText('polling budget ended');
  await page.clock.fastForward(30_000);
  expect(gets).toBe(2);
  await expect(page.locator('#state')).toHaveText('RUNNING');
});

test('retrieving a different run ID never replaces the reviewed execution', async ({
  page,
}) => {
  let mismatch = false;
  await page.route(`**/api/runs/${runId}`, async (route) => {
    const body = snapshot();
    if (mismatch) body.run.run_id = 'other_run';
    await route.fulfill({ json: { method: 'GET', path, status: 200, body } });
  });
  await page.goto('/');
  await page.locator('#attach-id').fill(runId);
  await page.locator('#attach').click();
  await expect(page.locator('#run-id')).toHaveValue(runId);
  mismatch = true;
  await page.locator('#refresh').click();
  await expect(page.locator('#notice')).toContainText('different run ID');
  await expect(page.locator('#run-id')).toHaveValue(runId);
});

test('active cancellation does not invent a terminal state', async ({
  page,
}) => {
  await page.route(`**/api/runs/${runId}`, async (route) => {
    await route.fulfill({
      json: { method: 'GET', path, status: 200, body: snapshot('RUNNING') },
    });
  });
  await page.route('**/cancellations', async (route) => {
    await route.fulfill({
      json: {
        method: 'POST',
        path: `${path}/cancellations`,
        status: 200,
        body: snapshot('RUNNING'),
      },
    });
  });
  await page.goto('/');
  await page.locator('#attach-id').fill(runId);
  await page.locator('#attach').click();
  await expect(page.locator('#state')).toHaveText('RUNNING');
  await page.getByText('Cancel this run', { exact: true }).click();
  await page.locator('#authorize-cancel').check();
  await page.locator('#cancel').click();
  await expect(page.locator('#notice')).toContainText('Cancellation requested');
  await expect(page.locator('#state')).toHaveText('RUNNING');
  await expect(page.locator('#timeline')).not.toContainText('CANCELLED');
});
