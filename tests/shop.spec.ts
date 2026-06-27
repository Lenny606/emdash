import { test, expect } from '@playwright/test';

test('shop page loads and lists products', async ({ page }) => {
  await page.goto('/obchod');
  
  // Verify main header
  const heading = page.locator('h1');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(/Obchod/i);

  // Verify that products are listed
  const products = page.locator('.product');
  await expect(products).toHaveCount(3);

  // Verify product details
  const firstProductTitle = page.locator('.product__title a').first();
  await expect(firstProductTitle).toHaveText(/Katalog výstavy/i); // Alphabetically sorted
});

test('can navigate to product detail page and render correctly', async ({ page }) => {
  await page.goto('/obchod');
  
  // Click on the first product link
  const productLink = page.locator('.product__title a').first();
  const productTitle = await productLink.textContent();
  await productLink.click();

  // Should navigate to product detail page
  await expect(page.url()).toContain('/obchod/katalog-vystavy');
  
  // Verify heading matches title
  const detailTitle = page.locator('.product-detail__title');
  await expect(detailTitle).toBeVisible();
  await expect(detailTitle).toHaveText(productTitle || '');

  // Verify price is present
  const price = page.locator('.product-detail__price-tag');
  await expect(price).toBeVisible();
  await expect(price).toHaveText(/590,00/);
});

test('quantity selector, adding to cart, toast and checkout navigation', async ({ page }) => {
  await page.goto('/obchod/plakat-praha');

  // Verify quantity input defaults to 1
  const qtyInput = page.locator('#qty-val');
  await expect(qtyInput).toHaveValue('1');

  // Click increment
  await page.locator('#qty-inc').click();
  await expect(qtyInput).toHaveValue('2');

  // Click decrement
  await page.locator('#qty-dec').click();
  await expect(qtyInput).toHaveValue('1');

  // Click increment twice to get to 3
  await page.locator('#qty-inc').click();
  await page.locator('#qty-inc').click();
  await expect(qtyInput).toHaveValue('3');

  // Verify cart sidebar is hidden initially
  const cartSidebar = page.locator('[data-cart]');
  await expect(cartSidebar).toBeHidden();

  // Click Add to Cart
  await page.locator('#add-btn').click();

  // Toast notification should show up
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(/Produkt byl přidán do košíku!/);

  // Cart sidebar should now be visible and contain the product with quantity 3
  await expect(cartSidebar).toBeVisible();
  const cartItem = page.locator('[data-cart-items] li');
  await expect(cartItem).toContainText(/Plakát — Praha × 3/);

  // Verify the total (3 * 350 = 1050)
  const cartTotal = page.locator('[data-cart-total]');
  await expect(cartTotal).toContainText(/1 050/); // non-breaking space used in Intl format

  // Go to checkout
  await page.locator('[data-checkout]').click();
  await expect(page.url()).toContain('/checkout');
});
