import { test, expect } from '@playwright/test';

test('search page loads and performs search', async ({ page }) => {
  await page.goto('/search');
  
  // Check that the search page loaded
  await expect(page.locator('h1')).toHaveText(/SEARCH RESULTS/i);

  // Perform a search
  const searchInput = page.getByPlaceholder('ENTER QUERY...');
  await searchInput.fill('welcome');
  await page.keyboard.press('Enter');

  // Check that the URL updated
  await expect(page).toHaveURL(/\/search\?q=welcome/);

  // Check that results or "no matches" are displayed
  const resultsInfo = page.locator('p:has-text("FOUND")');
  const noMatches = page.locator('text=NO MATCHES FOUND');
  
  await expect(resultsInfo.or(noMatches)).toBeVisible();
});

test('empty search state', async ({ page }) => {
  await page.goto('/search');
  
  // Check the initial message
  await expect(page.locator('main .block p:has-text("ENTER A SEARCH TERM ABOVE")')).toBeVisible();
});
