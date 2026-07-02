import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';

async function createFixtureUser() {
  const email = `e2e-onboarding-${randomUUID()}@example.test`;
  const password = 'password123';
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture user creation failed: ${error?.message}`);
  return { userId: data.user.id, email, password };
}

async function loginAndReachQuiz(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/onboarding/quiz');
}

test('skipping the quiz sets the default score and redirects home', async ({ page }) => {
  const { userId, email, password } = await createFixtureUser();

  await loginAndReachQuiz(page, email, password);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL('/');

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('internal_score, onboarding_completed_at')
    .eq('id', userId)
    .single();

  expect(error).toBeNull();
  expect(Number(profile?.internal_score)).toBe(2.75);
  expect(profile?.onboarding_completed_at).not.toBeNull();

  await supabaseAdmin.auth.admin.deleteUser(userId);
});

test('completing all quiz steps computes a score and redirects home', async ({ page }) => {
  const { userId, email, password } = await createFixtureUser();

  await loginAndReachQuiz(page, email, password);

  // club_league, competitive_club, regional_sanctioned, weekly -> avg 3.8125 -> 3.81
  // Base UI renders a visible role="radio" span alongside a visually-hidden
  // native input for form semantics — target the accessible radio role, not
  // the hidden input or the <label> (which resolves to both).
  const choiceLabels = [
    'Regular club or league play',
    'Competitive club players',
    'Regional sanctioned tournaments',
    'About once a week',
  ];
  for (let i = 0; i < choiceLabels.length; i++) {
    await page.getByRole('radio', { name: choiceLabels[i] }).click();
    const isLastStep = i === choiceLabels.length - 1;
    // exact: true avoids matching the Next.js dev-mode "Open Next.js Dev Tools" button.
    await page.getByRole('button', { name: isLastStep ? 'Finish' : 'Next', exact: true }).click();
  }

  await page.waitForURL('/');

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('internal_score, onboarding_completed_at')
    .eq('id', userId)
    .single();

  expect(error).toBeNull();
  expect(Number(profile?.internal_score)).toBe(3.81);
  expect(profile?.onboarding_completed_at).not.toBeNull();

  await supabaseAdmin.auth.admin.deleteUser(userId);
});
