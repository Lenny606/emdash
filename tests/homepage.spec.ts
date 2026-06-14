import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  
  // Check that the title is correct
  await expect(page).toHaveTitle(/Galerie v Praze/i);

  // Check that the main heading is present
  const heading = page.locator('h1');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(/GALERIE V PRAZE/i);

  // Check that the gallery list is present
  const galleryList = page.locator('.post-list');
  const noGalleries = page.locator('text=Zatím žádné galerie');
  
  await expect(galleryList.or(noGalleries)).toBeVisible();
});

test('navigation works', async ({ page }) => {
  await page.goto('/');
  
  // Find the first gallery link if it exists
  const firstGallery = page.locator('.gallery-card a').first();
  if (await firstGallery.count() > 0) {
    const galleryTitle = await firstGallery.locator('h2').textContent();
    await firstGallery.click();
    
    // Should navigate to a gallery page
    await expect(page.url()).toContain('/galerie/');
    await expect(page.locator('h1')).toHaveText(galleryTitle || '');
  }
});
