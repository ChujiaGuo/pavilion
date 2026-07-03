import { test, expect } from '@playwright/test';
import {
  createFixtureUser,
  deleteFixtureUser,
  createFixtureSession,
  deleteFixtureSession,
} from './helpers/session-fixtures';

test.describe('session share button', () => {
  let userId: string;
  let email: string;
  let password: string;
  let sessionId: string;

  test.beforeAll(async () => {
    ({ userId, email, password } = await createFixtureUser());
    ({ id: sessionId } = await createFixtureSession(userId));
  });

  test.afterAll(async () => {
    await deleteFixtureSession(sessionId);
    await deleteFixtureUser(userId);
  });

  test('copies the current session URL to the clipboard', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await page.goto(`/sessions/${sessionId}`);
    const shareButton = page.getByRole('button', { name: 'Share' });
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    await expect(page.getByRole('status').filter({ hasText: 'Copied!' })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(`${baseURL}/sessions/${sessionId}`);

    // The confirmation is transient (~1s) — it should disappear on its own.
    await expect(page.getByRole('status').filter({ hasText: 'Copied!' })).not.toBeVisible({ timeout: 3000 });
  });
});
