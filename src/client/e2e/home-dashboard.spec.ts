import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

test('direct navigation to /home while logged out redirects to /login', async ({ page }) => {
  await page.goto('/home');
  await page.waitForURL(/\/login(\?|$)/);
});

test.describe('home dashboard', () => {
  const email = `e2e-home-${randomUUID()}@example.test`;
  const password = 'password123';
  let userId: string;

  test.beforeAll(async () => {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { onboarding_completed: true },
    });
    if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);
    userId = data.user.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  test('shows the dashboard with an empty-state prompt and primary nav', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await expect(page.getByRole('heading', { name: 'Your dashboard' })).toBeVisible();
    await expect(
      page.getByText("You don't have a session lined up yet.")
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find your next session' })).toBeVisible();
    await expect(page.getByText('No sessions played yet.')).toBeVisible();
    await expect(page.getByText('Coming soon — follow players to see their activity here.')).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: /home/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /sessions/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /venues/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /profile/i })).toBeVisible();
  });
});
