import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { waitForEmailLink } from './helpers/mailpit';

test('resets a password end-to-end via the emailed link and signs in with the new password', async ({
  page,
}) => {
  const email = `e2e-reset-${randomUUID()}@example.test`;
  const originalPassword = 'password123';
  const newPassword = 'new-password456';

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: originalPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);
  const userId = data.user.id;

  await page.goto('/forgot-password');
  await page.fill('#email', email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Reset link sent' })).toBeVisible();

  // The emailed link points at Supabase's own verify endpoint, which redirects
  // through /auth/callback (PKCE code exchange) into /reset-password. Following
  // it in the same browser context matters: resetPasswordForEmail stashed a
  // PKCE code_verifier in this context's cookies, which the callback route
  // needs to complete the exchange.
  const verifyLink = await waitForEmailLink(email);
  await page.goto(verifyLink);
  await page.waitForURL('/reset-password');

  const newPasswordField = page.locator('#password');
  const confirmPasswordField = page.locator('#confirmPassword');
  await expect(newPasswordField).toBeVisible();

  await newPasswordField.fill(newPassword);
  await confirmPasswordField.fill('mismatched-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password/);

  await confirmPasswordField.fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  // Reset success pushes to /home, but this fixture never completed
  // onboarding, so /home's own auth guard immediately bounces it onward.
  await page.waitForURL('/onboarding/quiz');

  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', newPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  // This fixture user never completes onboarding, so login redirects to the quiz.
  await page.waitForURL('/onboarding/quiz');

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('shows an invalid-link message when there is no recovery session', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByText('This reset link is invalid or has expired.')).toBeVisible();
  await page.getByRole('link', { name: 'Request a new one' }).click();
  await page.waitForURL('/forgot-password');
});
