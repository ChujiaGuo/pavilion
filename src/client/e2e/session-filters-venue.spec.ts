import { test, expect } from '@playwright/test';
import {
  createFixtureUser,
  deleteFixtureUser,
  createFixtureSession,
  deleteFixtureSession,
} from './helpers/session-fixtures';
import { createFixtureVenue, deleteFixtureVenue } from './helpers/venue-fixtures';

test.describe('session search by venue (More filters)', () => {
  let organizerId: string;
  let searcherEmail: string;
  let searcherPassword: string;
  let searcherId: string;
  let venueAId: string;
  let venueAName: string;
  let venueBId: string;
  let venueBName: string;
  let sessionAtVenueAId: string;
  let sessionAtVenueBId: string;

  test.beforeAll(async () => {
    ({ userId: organizerId } = await createFixtureUser());
    ({ userId: searcherId, email: searcherEmail, password: searcherPassword } = await createFixtureUser());

    ({ id: venueAId, name: venueAName } = await createFixtureVenue());
    ({ id: venueBId, name: venueBName } = await createFixtureVenue());

    ({ id: sessionAtVenueAId } = await createFixtureSession(organizerId, {
      venue_id: venueAId,
      venue_name: venueAName,
    }));
    ({ id: sessionAtVenueBId } = await createFixtureSession(organizerId, {
      venue_id: venueBId,
      venue_name: venueBName,
    }));
  });

  test.afterAll(async () => {
    await deleteFixtureSession(sessionAtVenueAId);
    await deleteFixtureSession(sessionAtVenueBId);
    await deleteFixtureVenue(venueAId);
    await deleteFixtureVenue(venueBId);
    await deleteFixtureUser(organizerId);
    await deleteFixtureUser(searcherId);
  });

  test('picking a venue in More filters narrows Browse to that venue only', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', searcherEmail);
    await page.fill('#password', searcherPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await page.goto('/sessions');
    await expect(page.getByText(venueAName)).toBeVisible();
    await expect(page.getByText(venueBName)).toBeVisible();

    await page.getByRole('button', { name: /More filters/i }).click();
    const venueInput = page.getByLabel('Venue', { exact: true });
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/venues') && res.url().includes('name=')),
      venueInput.fill(venueAName),
    ]);
    // getByRole('option', ...) rather than getByText -- venueAName also
    // already appears in the Browse list's own SessionCard at this point, so
    // a plain text match is ambiguous between the two. The click starts the
    // 400ms debounce immediately, so the waitForResponse listener must be
    // attached in the same Promise.all as the click (not after it) or the
    // response can resolve before the listener exists.
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/sessions') && res.url().includes(`venue_id=${venueAId}`),
      ),
      page.getByRole('option', { name: venueAName }).click(),
    ]);

    await expect(page.getByText(venueAName)).toBeVisible();
    await expect(page.getByText(venueBName)).not.toBeVisible();
  });
});
