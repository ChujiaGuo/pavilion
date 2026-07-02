import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

test('shows a generic confirmation for a registered email', async ({ page }) => {
  const email = `e2e-forgot-${randomUUID()}@example.test`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

  await page.goto('/forgot-password');
  await page.fill('#email', email);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByRole('heading', { name: 'Reset link sent' })).toBeVisible();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();

  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
});

test('shows the identical confirmation for an email with no account', async ({ page }) => {
  const email = `e2e-forgot-noaccount-${randomUUID()}@example.test`;

  await page.goto('/forgot-password');
  await page.fill('#email', email);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByRole('heading', { name: 'Reset link sent' })).toBeVisible();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
});
