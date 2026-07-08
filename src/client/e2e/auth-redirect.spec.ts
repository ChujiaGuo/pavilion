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

test.describe('session expiring while already on a gated page', () => {
  test('a stale/invalid access token redirects to login on the next navigation instead of a dead "couldn\'t load" page', async ({
    page,
    context,
  }) => {
    const { userId, email, password } = await createFixtureUser();

    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    // Simulate the session expiring/being revoked while the user is already
    // on a logged-in page: corrupt the auth cookie's access_token. The
    // Supabase client only auto-refreshes based on the stored `expires_at`
    // timestamp, so this looks locally valid — the next API call is what
    // surfaces it, via a real 401 from the server.
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === 'sb-127-auth-token');
    if (!authCookie) throw new Error('Supabase auth cookie not found');
    const decoded = JSON.parse(
      Buffer.from(authCookie.value.replace(/^base64-/, ''), 'base64').toString(),
    );
    decoded.access_token = 'corrupted.' + decoded.access_token.split('.').slice(1).join('.');
    await context.addCookies([
      { ...authCookie, value: 'base64-' + Buffer.from(JSON.stringify(decoded)).toString('base64') },
    ]);

    // Client-side nav to another gated page, same as a user clicking a nav
    // link after their session went stale.
    await page.locator('a[href="/profile"]:visible').click();

    await page.waitForURL(/\/login\?next=%2Fprofile/);

    await deleteFixtureUser(userId);
  });
});
