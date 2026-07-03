import { test, expect } from '@playwright/test';
import {
  createFixtureUser,
  deleteFixtureUser,
  createFixtureSession,
  deleteFixtureSession,
} from './helpers/session-fixtures';

test.describe('post-login redirect to the originally-requested page', () => {
  let organizerId: string;
  let sessionId: string;
  let venueName: string;

  test.beforeAll(async () => {
    ({ userId: organizerId } = await createFixtureUser());
    ({ id: sessionId, venue_name: venueName } = await createFixtureSession(organizerId, {
      visibility: 'public',
    }));
  });

  test.afterAll(async () => {
    await deleteFixtureSession(sessionId);
    await deleteFixtureUser(organizerId);
  });

  test('clicking a shared session link while logged out lands back on that session after login', async ({
    page,
  }) => {
    const { userId, email, password } = await createFixtureUser();

    await page.goto(`/sessions/${sessionId}`);
    await page.waitForURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe(`/sessions/${sessionId}`);

    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForURL(`/sessions/${sessionId}`);
    await expect(page.getByRole('heading', { name: venueName })).toBeVisible();

    await deleteFixtureUser(userId);
  });

  test('an unsafe next value is ignored and falls back to /home', async ({ page }) => {
    const { userId, email, password } = await createFixtureUser();

    await page.goto('/login?next=https://evil.example.com');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForURL('/home');
    await expect(page).toHaveURL(/\/home/);

    await deleteFixtureUser(userId);
  });

  test('a first-time user still completes onboarding before returning, dropping the original link', async ({
    page,
  }) => {
    const { userId, email, password } = await createFixtureUser({ onboardingCompleted: false });

    await page.goto(`/sessions/${sessionId}`);
    await page.waitForURL(/\/login\?next=/);

    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/onboarding/quiz');

    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.waitForURL('/home');
    await expect(page).toHaveURL(/\/home/);

    await deleteFixtureUser(userId);
  });
});
