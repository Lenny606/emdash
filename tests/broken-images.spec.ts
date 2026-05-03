import { test, expect } from '@playwright/test';

/**
 * Helper to check all <img> elements on the page for broken links.
 * It checks if the image has a naturalWidth > 0, which confirms it loaded successfully.
 */
async function checkImagesOnPage(page: import('@playwright/test').Page) {
	const images = page.locator('img');
	const count = await images.count();
	
	console.log(`Checking ${count} images on ${page.url()}`);
	
	for (let i = 0; i < count; i++) {
		const img = images.nth(i);
		const src = await img.getAttribute('src');
		
		// Wait for the image to load or fail
		await img.evaluate((img: HTMLImageElement) => {
			if (img.complete) return;
			return new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = resolve; // We want to check naturalWidth later anyway
			});
		});

		const isBroken = await img.evaluate((node: HTMLImageElement) => {
			return !node.complete || node.naturalWidth === 0;
		});

		expect(isBroken, `Image with src "${src}" is broken on ${page.url()}`).toBeFalsy();
	}
}

test.describe('Broken Image Link Tests', () => {
	test('homepage has no broken images', async ({ page }) => {
		await page.goto('/');
		await checkImagesOnPage(page);
	});

	test('posts archive has no broken images', async ({ page }) => {
		await page.goto('/posts');
		await checkImagesOnPage(page);
	});

	test('individual post detail has no broken images', async ({ page }) => {
		// Go to home and find first post
		await page.goto('/');
		const firstPostLink = page.locator('.post-card a').first();
		if (await firstPostLink.count() > 0) {
			await firstPostLink.click();
			await checkImagesOnPage(page);
		}
	});

	test('search results have no broken images', async ({ page }) => {
		await page.goto('/search?q=AI');
		await checkImagesOnPage(page);
	});

	test('about page has no broken images', async ({ page }) => {
		await page.goto('/about');
		await checkImagesOnPage(page);
	});
});
