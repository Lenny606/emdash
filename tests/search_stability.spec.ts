import { test, expect } from '@playwright/test';

test('search results do not crash the page', async ({ page }) => {
  // Try searching for "About" which is in the seed
  await page.goto('/search?q=About');
  await expect(page.locator('h1')).toBeVisible();
  
  // Try searching for "Welcome" which is also in the seed
  await page.goto('/search?q=Welcome');
  await expect(page.locator('h1')).toBeVisible();

  // Try a query that might return multiple types of content
  await page.goto('/search?q=a');
  await expect(page.locator('h1')).toBeVisible();
});
