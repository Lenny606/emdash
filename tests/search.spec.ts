import { test, expect } from '@playwright/test';

test('search page loads and performs search', async ({ page }) => {
  await page.goto('/search');
  
  // Check that the search page loaded
  await expect(page.locator('h1')).toHaveText(/VÝSLEDKY HLEDÁNÍ/i);

  // Perform a search
  const searchInput = page.getByPlaceholder('ZADEJTE DOTAZ...');
  await searchInput.fill('Praha');
  await page.keyboard.press('Enter');

  // Check that the URL updated
  await expect(page).toHaveURL(/\/search\?q=Praha/);

  // Check that the result count line is displayed for the query
  const resultsInfo = page.locator('p.result-count:has-text("NALEZENO")');
  await expect(resultsInfo).toBeVisible();
});

test('empty search state', async ({ page }) => {
  await page.goto('/search');
  
  // Check the initial message
  await expect(page.locator('main .block p:has-text("Zadejte hledaný výraz")')).toBeVisible();
});
