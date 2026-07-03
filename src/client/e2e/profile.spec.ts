import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

test('direct navigation to /profile while logged out redirects to /login', async ({ page }) => {
  await page.goto('/profile');
  await page.waitForURL(/\/login(\?|$)/);
});

test.describe('profile page', () => {
  const email = `e2e-profile-${randomUUID()}@example.test`;
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
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
  });

  test('shows account details reachable from the primary nav', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }).click();
    await page.waitForURL('/profile');

    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    await expect(page.getByText(email.split('@')[0])).toBeVisible();
    await expect(page.getByText('Grade 3')).toBeVisible();
    await expect(page.getByText('Provisional')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });

  test('logging out clears the session and blocks direct nav back to /home', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL('/');

    await page.goto('/home');
    await page.waitForURL(/\/login(\?|$)/);
  });
});

test('editing the profile saves display name, location, format, play style, and privacy', async ({
  page,
}) => {
  // Own fixture user — this test mutates profile fields, so it can't share
  // the `profile page` describe block's fixture under fullyParallel (see
  // login.spec.ts's "logs in and redirects home..." test for the same reasoning).
  const email = `e2e-profile-edit-${randomUUID()}@example.test`;
  const password = 'password123';
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { onboarding_completed: true },
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/home');

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit profile' }).click();

  // Pre-filled from the current (default) values.
  await expect(page.locator('#displayName')).toHaveValue(email.split('@')[0]);
  await expect(page.locator('#firstName')).toHaveValue('');
  await expect(page.locator('#lastName')).toHaveValue('');
  await expect(page.locator('#city')).toHaveValue('');
  await expect(page.locator('#region')).toHaveValue('');
  await expect(page.getByRole('radio', { name: 'Social' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Private' })).toBeChecked();

  await page.locator('#displayName').fill('Updated Name');
  await page.locator('#firstName').fill('Jane');
  await page.locator('#lastName').fill('Doe');
  await page.locator('#city').fill('Rockville');
  await page.locator('#region').fill('Maryland');
  await page.getByRole('option', { name: 'Maryland' }).click();
  await page.getByRole('checkbox', { name: 'Doubles', exact: true }).check();
  await page.getByRole('radio', { name: 'Competitive' }).click();
  await page.getByRole('radio', { name: 'Public' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByText('Updated Name', { exact: true })).toBeVisible();
  await expect(page.getByText('Jane Doe', { exact: true })).toBeVisible();
  await expect(page.getByText('Rockville, MD')).toBeVisible();
  await expect(page.getByText('Doubles', { exact: true })).toBeVisible();
  await expect(page.getByText('Competitive', { exact: true })).toBeVisible();
  await expect(page.getByText('Public', { exact: true })).toBeVisible();

  // Reload to confirm the change round-tripped through the API, not just local state.
  await page.reload();
  await expect(page.getByText('Updated Name', { exact: true })).toBeVisible();
  await expect(page.getByText('Jane Doe', { exact: true })).toBeVisible();
  await expect(page.getByText('Rockville, MD')).toBeVisible();

  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
});

test('a verified user cannot edit their name, but can still edit other fields', async ({ page }) => {
  const email = `e2e-profile-verified-${randomUUID()}@example.test`;
  const password = 'password123';
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { onboarding_completed: true },
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);

  // Set name + verified_tier together in one UPDATE so profiles_verified_requires_name
  // (both must be present once verified_tier is set) is satisfied.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ first_name: 'Jane', last_name: 'Doe', verified_tier: 8 })
    .eq('id', data.user.id);
  if (profileError) throw new Error(`profile fixture setup failed: ${profileError.message}`);

  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/home');

  await page.goto('/profile');
  await expect(page.getByText('Jane Doe', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.locator('#firstName')).toBeDisabled();
  await expect(page.locator('#lastName')).toBeDisabled();
  await expect(page.locator('#firstName')).toHaveValue('Jane');
  await expect(page.locator('#lastName')).toHaveValue('Doe');

  // Editing an unrelated field should still work while the name is locked.
  await page.locator('#city').fill('Rockville');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByText('Jane Doe', { exact: true })).toBeVisible();
  await expect(page.getByText('Rockville', { exact: true })).toBeVisible();

  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
});
