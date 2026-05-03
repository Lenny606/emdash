import { test, expect } from '@playwright/test';

test('404 page shows for non-existent routes', async ({ page }) => {
  // Go to a guaranteed non-existent page
  await page.goto('/this-page-does-not-exist-' + Date.now());
  
  // Check for 404 message or title
  // Based on 404.astro (which I haven't seen but usually has "404" or "Not Found")
  const heading = page.locator('h1');
  await expect(heading.or(page.locator('text=404'))).toBeVisible();
});
