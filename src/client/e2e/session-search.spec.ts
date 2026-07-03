import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  createFixtureUser,
  deleteFixtureUser,
  createFixtureSession,
  deleteFixtureSession,
} from './helpers/session-fixtures';

test.describe('session search by name or id', () => {
  let organizerId: string;
  let searcherEmail: string;
  let searcherPassword: string;
  let searcherId: string;
  let publicSessionId: string;
  let publicVenueName: string;
  let privateSessionId: string;
  let privateVenueName: string;

  test.beforeAll(async () => {
    ({ userId: organizerId } = await createFixtureUser());
    ({ userId: searcherId, email: searcherEmail, password: searcherPassword } = await createFixtureUser());

    publicVenueName = `E2E-Public-${randomUUID().slice(0, 8)}`;
    privateVenueName = `E2E-Private-${randomUUID().slice(0, 8)}`;

    ({ id: publicSessionId } = await createFixtureSession(organizerId, {
      venue_name: publicVenueName,
      visibility: 'public',
    }));
    ({ id: privateSessionId } = await createFixtureSession(organizerId, {
      venue_name: privateVenueName,
      visibility: 'invite_only',
    }));
  });

  test.afterAll(async () => {
    await deleteFixtureSession(publicSessionId);
    await deleteFixtureSession(privateSessionId);
    await deleteFixtureUser(organizerId);
    await deleteFixtureUser(searcherId);
  });

  // Filters are reactive/debounced (~400ms, see session-filters.tsx) rather
  // than submit-driven — wait for the specific /api/sessions request this
  // fill triggers instead of an arbitrary sleep or a submit button click.
  async function search(page: import('@playwright/test').Page, term: string) {
    const input = page.getByLabel('Search', { exact: true });
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/sessions') && res.url().includes(term)),
      input.fill(term),
    ]);
  }

  test('searches by venue name, and an exact session id reveals an otherwise-private session', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#email', searcherEmail);
    await page.fill('#password', searcherPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('/home');

    await page.goto('/sessions');
    await expect(page.getByLabel('Search', { exact: true })).toBeVisible();

    // Name search matches the public session...
    await search(page, publicVenueName);
    await expect(page.getByText(publicVenueName)).toBeVisible();
    await expect(page.getByText(privateVenueName)).not.toBeVisible();

    // ...but a name search never surfaces the invite_only session, even
    // when the text matches its venue name exactly — only an id match does.
    await search(page, privateVenueName);
    await expect(page.getByText(privateVenueName)).not.toBeVisible();

    // Exact id match bypasses the public-only filter for a non-participant.
    await search(page, privateSessionId);
    await expect(page.getByText(privateVenueName)).toBeVisible();
  });
});
