import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Badminton, organized.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get Started' }).first()).toBeVisible();
});
