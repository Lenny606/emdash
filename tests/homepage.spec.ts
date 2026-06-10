import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  
  // Check that the title is correct
  // Based on index.astro, the title is siteTitle (from seed settings)
  await expect(page).toHaveTitle(/AI Dev Pulse/i);

  // Check that the main heading is present
  const heading = page.locator('h1');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(/NEJNOVĚJŠÍ ČLÁNKY/i);

  // Check that the post list is present (if there are posts)
  const postList = page.locator('.post-list');
  const noPosts = page.locator('text=Zatím žádné články');
  
  await expect(postList.or(noPosts)).toBeVisible();
});

test('navigation works', async ({ page }) => {
  await page.goto('/');
  
  // Find the first post link if it exists
  const firstPost = page.locator('.post-card a').first();
  if (await firstPost.count() > 0) {
    const postTitle = await firstPost.locator('h2').textContent();
    await firstPost.click();
    
    // Should navigate to a post page
    await expect(page.url()).toContain('/posts/');
    await expect(page.locator('h1')).toHaveText(postTitle || '');
  }
});
