import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

test('creates an account, sets display name/first name/last name/city, and redirects home', async ({
  page,
}) => {
  const email = `e2e-signup-${randomUUID()}@example.test`;
  const signupResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'
  );

  await page.goto('/signup');
  await page.fill('#displayName', 'E2E Test User');
  await page.fill('#firstName', 'Test');
  await page.fill('#lastName', 'User');
  await page.fill('#email', email);
  await page.fill('#city', 'Baltimore');
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  const res = await signupResponse;
  expect(res.status()).toBe(200);
  const userId: string = (await res.json()).user.id;

  await page.waitForURL('/onboarding/quiz');

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('display_name, first_name, last_name, city')
    .eq('id', userId)
    .single();

  expect(error).toBeNull();
  expect(profile?.display_name).toBe('E2E Test User');
  expect(profile?.first_name).toBe('Test');
  expect(profile?.last_name).toBe('User');
  expect(profile?.city).toBe('Baltimore');

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('creates an account when first/last name are left blank', async ({ page }) => {
  const email = `e2e-signup-noname-${randomUUID()}@example.test`;
  const signupResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/signup') && res.request().method() === 'POST'
  );

  await page.goto('/signup');
  await page.fill('#displayName', 'No Name User');
  await page.fill('#email', email);
  await page.fill('#city', 'Baltimore');
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  const res = await signupResponse;
  expect(res.status()).toBe(200);
  const userId: string = (await res.json()).user.id;

  await page.waitForURL('/onboarding/quiz');

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();

  expect(error).toBeNull();
  expect(profile?.first_name).toBeNull();
  expect(profile?.last_name).toBeNull();

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('shows an inline error when signing up with an already-registered email', async ({ page }) => {
  const email = `e2e-dup-${randomUUID()}@example.test`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

  await page.goto('/signup');
  await page.fill('#displayName', 'Duplicate Test');
  await page.fill('#email', email);
  await page.fill('#city', 'Baltimore');
  await page.fill('#password', 'password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('p.text-destructive')).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);

  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
});
