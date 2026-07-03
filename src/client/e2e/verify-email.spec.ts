import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { waitForEmailLink } from './helpers/mailpit';

test('signing up, confirming via the emailed link, and continuing reaches onboarding', async ({
  page,
}) => {
  const email = `e2e-verify-${randomUUID()}@example.test`;
  const signupResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'
  );

  await page.goto('/signup');
  await page.fill('#displayName', 'Verify Test User');
  await page.fill('#email', email);
  await page.fill('#city', 'Baltimore');
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  const userId: string = (await (await signupResponse).json()).id;

  await page.waitForURL(/\/verify-email\?email=/);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // This project's confirmation email is currently GoTrue's plain default
  // template, not the branded supabase/templates/confirm_signup.html — see
  // supabase/config.toml's commented-out [auth.email.template.confirmation]
  // and technical-notes.md "Auth" for why (free-tier plan restriction). The
  // default template's link goes to GoTrue's own hosted /verify endpoint,
  // which always confirms the account server-side before redirecting to
  // signup/page.tsx's emailRedirectTo (/email-confirmed) with an implicit-flow
  // #access_token=... fragment — which that page's own createClient() call
  // picks up automatically, same end state as the dormant /auth/confirm path
  // (covered separately below via a direct route hit) just reached differently.
  const confirmLink = await waitForEmailLink(email);
  await page.goto(confirmLink);
  await page.waitForURL('/email-confirmed');
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();

  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  expect(error).toBeNull();
  expect(userData.user?.email_confirmed_at).not.toBeNull();

  await page.getByRole('link', { name: 'Continue to Pavilion' }).click();
  // /home's own auth guard bounces a not-yet-onboarded user onward — same
  // pattern /reset-password's post-update redirect relies on.
  await page.waitForURL('/onboarding/quiz');

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('resending from the verify-email page confirms success', async ({ page }) => {
  const email = `e2e-verify-resend-${randomUUID()}@example.test`;
  const signupResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'
  );

  await page.goto('/signup');
  await page.fill('#displayName', 'Resend Test User');
  await page.fill('#email', email);
  await page.fill('#city', 'Baltimore');
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  const userId: string = (await (await signupResponse).json()).id;
  await page.waitForURL(/\/verify-email\?email=/);

  // supabase/config.toml's [auth.email] max_frequency (1s) counts the
  // signup's own confirmation email as "the last send" — clicking resend
  // faster than that trips GoTrue's rate limit and this becomes an error-text
  // assertion instead. A beat past that window is enough for a real user
  // clicking the button too, so this isn't testing an unrealistic pace.
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(page.getByText('Confirmation email resent.')).toBeVisible();

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('logging in before confirming redirects to the verify-email page', async ({ page }) => {
  const email = `e2e-verify-login-${randomUUID()}@example.test`;
  const password = 'password123';

  // email_confirm defaults to false when omitted, unlike every other fixture
  // in this suite (which passes email_confirm: true to skip this flow
  // entirely) — deliberate here since this test exercises the unconfirmed path.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.waitForURL(/\/verify-email\?email=/);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();

  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
});

test('an invalid confirmation link shows an error with a way to request a new one', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=not-a-real-token&type=email');
  await page.waitForURL(/\/verify-email\?error=confirmation_link_invalid/);
  await expect(
    page.getByText('That confirmation link is invalid or has expired. Request a new one below.')
  ).toBeVisible();
});
