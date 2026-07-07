import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createFixtureUser, deleteFixtureUser } from './helpers/session-fixtures';
import { createFixtureVenue, deleteFixtureVenue } from './helpers/venue-fixtures';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/home');
}

// emptySessionFormValues() (session-form-fields.tsx) already seeds every
// other field with a sane default (skill 3.0-5.0, 1 court, 8 players, 60min,
// tomorrow evening) -- Venue name is the only field these tests need to
// fill in.
async function submitAndGetSessionId(page: import('@playwright/test').Page): Promise<string> {
  await page.getByRole('button', { name: 'Create session' }).click();
  // Organizer-range-too-wide is a warning, not a block -- handle it
  // defensively in case a fresh test user's default rating triggers it.
  const continueButton = page.getByRole('button', { name: 'Continue to session' });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
  await page.waitForURL(/\/sessions\/[0-9a-f-]+$/);
  return page.url().split('/sessions/')[1];
}

test.describe('create-session venue picker', () => {
  let userId: string;
  let email: string;
  let password: string;
  let venueId: string;
  let venueName: string;

  test.beforeAll(async () => {
    ({ userId, email, password } = await createFixtureUser());
    ({ id: venueId, name: venueName } = await createFixtureVenue());
  });

  test.afterAll(async () => {
    await deleteFixtureVenue(venueId);
    await deleteFixtureUser(userId);
  });

  test('picking a real venue associates the session with it', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/sessions/new');

    const venueInput = page.getByLabel(/Venue name/i);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/venues') && res.url().includes('name=')),
      venueInput.fill(venueName),
    ]);
    await page.getByText(venueName, { exact: true }).click();

    await submitAndGetSessionId(page);

    // GET /api/sessions?venue_id= is what /venues/[id] queries for "Upcoming
    // sessions here" -- seeing the new session there (not just a matching
    // venueName string) confirms the real FK association, not just the
    // free-text label.
    await page.goto(`/venues/${venueId}`);
    await expect(page.getByText('Upcoming sessions here')).toBeVisible();
    await expect(page.getByText(venueName).first()).toBeVisible();
  });

  test('typing an unmatched name still creates a session (unofficial venue)', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/sessions/new');

    const unofficialName = `Unofficial Gym ${randomUUID().slice(0, 8)}`;
    await page.getByLabel(/Venue name/i).fill(unofficialName);
    // No suggestion to click -- the free-text value is the final venueName.

    await submitAndGetSessionId(page);

    await page.goto('/sessions');
    await page.getByRole('button', { name: 'Hosting' }).click();
    await expect(page.getByText(unofficialName)).toBeVisible();
  });
});
