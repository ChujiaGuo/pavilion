import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('login', () => {
  const email = `e2e-login-${randomUUID()}@example.test`;
  const password = 'password123';
  let userId: string;

  test.beforeAll(async () => {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);
    userId = data.user.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  test('logs in with valid credentials and redirects to the onboarding quiz when not yet completed', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/onboarding/quiz');
  });

  test('logs in and redirects home when onboarding is already completed', async ({ page }) => {
    // Own fixture user (not the shared one above) so this doesn't depend on
    // test execution order against a mutated shared fixture.
    const completedEmail = `e2e-login-completed-${randomUUID()}@example.test`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: completedEmail,
      password,
      email_confirm: true,
      app_metadata: { onboarding_completed: true },
    });
    if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

    await page.goto('/login');
    await page.fill('#email', completedEmail);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
  });

  test('shows a generic error for an invalid password without navigating away', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.locator('p.text-destructive')).toHaveText('Invalid login credentials');
    await expect(page).toHaveURL(/\/login/);
  });
});
