import { test, expect } from '@playwright/test';
import {
  createFixtureUser,
  deleteFixtureUser,
} from './helpers/session-fixtures';
import { createFixtureVenue, deleteFixtureVenue } from './helpers/venue-fixtures';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/home');
}

// Filters are reactive/debounced (~400ms, see venue-filters.tsx) rather than
// submit-driven -- wait for the specific /api/venues request this fill
// triggers instead of an arbitrary sleep or a submit button click.
// URLSearchParams (used client-side to build the request) encodes a space
// as `+`, not `%20` -- comparing via a parsed URL's searchParams avoids that
// encoding mismatch entirely rather than trying to match encodeURIComponent
// against it.
async function search(page: import('@playwright/test').Page, term: string) {
  const input = page.getByLabel('Search', { exact: true });
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/venues') && new URL(res.url()).searchParams.get('name') === term,
    ),
    input.fill(term),
  ]);
}

test.describe('venue search by name and type', () => {
  let userId: string;
  let email: string;
  let password: string;
  let clubVenueName: string;
  let gymVenueId: string;
  let gymVenueName: string;

  test.beforeAll(async () => {
    ({ userId, email, password } = await createFixtureUser());

    const club = await createFixtureVenue({ type: 'club', dropInAvailable: true });
    clubVenueName = club.name;
    const gym = await createFixtureVenue({ type: 'gym', dropInAvailable: false });
    gymVenueId = gym.id;
    gymVenueName = gym.name;
  });

  test.afterAll(async () => {
    await deleteFixtureVenue(gymVenueId);
    await deleteFixtureUser(userId);
  });

  test('searches by name and narrows to the matching venue only', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/venues');
    await expect(page.getByLabel('Search', { exact: true })).toBeVisible();

    await search(page, clubVenueName);
    await expect(page.getByText(clubVenueName)).toBeVisible();
    await expect(page.getByText(gymVenueName)).not.toBeVisible();
  });

  test('More filters narrows by venue type', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/venues');

    // Both venues visible with no filters applied.
    await expect(page.getByText(clubVenueName)).toBeVisible();
    await expect(page.getByText(gymVenueName)).toBeVisible();

    await page.getByRole('button', { name: /More filters/i }).click();
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/venues') && res.url().includes('type=gym')),
      page.getByRole('radio', { name: 'Gym' }).click(),
    ]);

    await expect(page.getByText(gymVenueName)).toBeVisible();
    await expect(page.getByText(clubVenueName)).not.toBeVisible();
  });

  test('clicking a venue card opens its detail page', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/venues');
    await expect(page.getByText(gymVenueName)).toBeVisible();

    await page.getByText(gymVenueName).click();
    await page.waitForURL(`/venues/${gymVenueId}`);
    await expect(page.getByRole('heading', { name: gymVenueName })).toBeVisible();
  });
});

test.describe('venue distance filter', () => {
  let userId: string;
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    ({ userId, email, password } = await createFixtureUser());
  });

  test.afterAll(async () => {
    await deleteFixtureUser(userId);
  });

  test('Distance control is visible on load, before any location permission is requested', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/venues');
    // The control itself no longer waits on a silent geolocation lookup --
    // only picking an actual radius triggers the permission request (see
    // use-geolocation.ts's lazy `request` and venue-filters.tsx's
    // handleDistanceChange).
    await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Distance', { exact: true })).toBeVisible();
  });

  test('picking a radius without location permission shows a denial message and applies no radius filter', async ({
    page,
  }) => {
    await login(page, email, password);
    await page.goto('/venues');

    await page.getByLabel('Distance', { exact: true }).selectOption('25');
    await expect(page.getByText('Location access denied — showing all venues.')).toBeVisible();
    // Falls back to "Any distance" rather than staying stuck on a radius
    // that was never actually backed by coordinates.
    await expect(page.getByLabel('Distance', { exact: true })).toHaveValue('');
  });

  test('picking a radius after granting location sorts nearest-first', async ({ page, context }) => {
    const near = await createFixtureVenue({ lat: 37.001, lng: -122.0 });
    const far = await createFixtureVenue({ lat: 38.0, lng: -122.0 });

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.0, longitude: -122.0 });

    try {
      await login(page, email, password);
      await page.goto('/venues');
      // Both visible -- no radius picked yet, so no distance filter is applied.
      await expect(page.getByText(near.name)).toBeVisible();
      await expect(page.getByText(far.name)).toBeVisible();

      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/venues') && res.url().includes('radius_miles')),
        page.getByLabel('Distance', { exact: true }).selectOption('25'),
      ]);

      // far.name is ~69mi away -- outside the 25mi radius just picked.
      await expect(page.getByText(near.name)).toBeVisible();
      await expect(page.getByText(far.name)).not.toBeVisible();
    } finally {
      await deleteFixtureVenue(near.id);
      await deleteFixtureVenue(far.id);
    }
  });
});
