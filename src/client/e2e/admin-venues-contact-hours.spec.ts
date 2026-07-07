import { test, expect } from '@playwright/test';
import { createFixtureUser, deleteFixtureUser } from './helpers/session-fixtures';
import { createFixtureVenue, deleteFixtureVenue } from './helpers/venue-fixtures';
import { grantAdminRole } from './helpers/admin-fixtures';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/home');
}

// Covers the admin-venues-panel.tsx contact-details/hours fields added to
// bring the admin edit form up to par with what venues/[id]/page.tsx already
// displays -- the flow only matters if an admin-entered value actually shows
// up on the public venue page afterward, so this checks both ends.
test.describe('admin venues panel — contact details and hours', () => {
  let userId: string;
  let email: string;
  let password: string;
  let venueId: string;
  let venueName: string;

  test.beforeAll(async () => {
    ({ userId, email, password } = await createFixtureUser());
    await grantAdminRole(userId, 'venue_verifier');
    const venue = await createFixtureVenue({});
    venueId = venue.id;
    venueName = venue.name;
  });

  test.afterAll(async () => {
    await deleteFixtureVenue(venueId);
    await deleteFixtureUser(userId);
  });

  test('editing contact details and hours in the admin panel shows up on the venue detail page', async ({
    page,
  }) => {
    await login(page, email, password);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Venues' }).click();
    await page.getByText(venueName).click();

    await page.getByLabel('Contact phone').fill('555-123-4567');
    await page.getByLabel('Contact website').fill('https://example.test');
    await page.getByLabel('Booking URL').fill('https://example.test/book');

    // Turn Tuesday on with explicit hours; leave every other day closed.
    // Each open/close control is a popover trigger (TimeOfDayPicker, styled
    // after starts-at-picker.tsx's quick-tap time pills) -- open it, then
    // tap the matching preset pill, scoped to that specific popup via its
    // data-testid so it can't match the trigger's own (currently identical)
    // label text.
    await page.getByLabel('Tuesday', { exact: true }).check();
    await page.getByLabel('Tuesday open time').click();
    await page.getByTestId('Tuesday open time-popup').getByRole('button', { name: '9 AM', exact: true }).click();
    await page.getByLabel('Tuesday close time').click();
    await page.getByTestId('Tuesday close time-popup').getByRole('button', { name: '9 PM', exact: true }).click();

    await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/venues/${venueId}`) && res.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save changes' }).click(),
    ]);

    // Re-open the edit form to confirm the save round-tripped correctly.
    await page.getByText(venueName).click();
    await expect(page.getByLabel('Contact phone')).toHaveValue('555-123-4567');
    await expect(page.getByLabel('Contact website')).toHaveValue('https://example.test');
    await expect(page.getByLabel('Booking URL')).toHaveValue('https://example.test/book');
    await expect(page.getByLabel('Tuesday', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Tuesday open time')).toHaveText('9 AM');
    await expect(page.getByLabel('Tuesday close time')).toHaveText('9 PM');

    // The actual point of the feature: what an admin enters here must appear
    // on the page a real user sees.
    await page.goto(`/venues/${venueId}`);
    await expect(page.getByText('555-123-4567')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://example.test');
    await expect(page.getByRole('link', { name: 'Book directly with the venue' })).toHaveAttribute(
      'href',
      'https://example.test/book',
    );
    await expect(page.getByText('Tuesday')).toBeVisible();
    await expect(page.getByText('9:00 AM – 9:00 PM')).toBeVisible();
  });
});
