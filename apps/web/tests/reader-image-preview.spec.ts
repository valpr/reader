/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK_WITH_IMAGES, seedReaderBook } from './fixtures/book-fixture';

test.describe('Reader Image Preview', () => {
  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, SAMPLE_BOOK_WITH_IMAGES, { hideSpoilerImage: false });
  });

  test('clicking an illustration opens the image preview overlay', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await expect(img).toBeVisible();
    const contentSrc = await img.getAttribute('src');
    expect(contentSrc).toBeTruthy();
    expect(contentSrc).toContain('blob:');
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    // Verify test-img-2 (current reader: format) is also hydrated and rendered
    const img2 = page.locator('#test-img-2');
    await expect(img2).toBeVisible();
    const contentSrc2 = await img2.getAttribute('src');
    expect(contentSrc2).toBeTruthy();
    expect(contentSrc2).toContain('blob:');
    const naturalWidth2 = await img2.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth2).toBeGreaterThan(0);

    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    // Verify preview image src is populated
    const previewImg = dialog.locator('main img');
    await expect(previewImg).toBeVisible();
    const previewSrc = await previewImg.getAttribute('src');
    expect(previewSrc).toBeTruthy();
    expect(previewSrc).toContain('blob:');

    // Close button dismisses overlay
    const closeBtn = page.getByRole('button', { name: 'Close image preview' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(dialog).toBeHidden();
  });

  test('Escape key dismisses the image preview overlay', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('zoom controls adjust image scale and reset', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    const zoomInBtn = page.getByRole('button', { name: 'Zoom in' });
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom out' });

    // Initial zoom badge should show 100%
    await expect(dialog.getByText('100%')).toBeVisible();

    // Zoom in
    await zoomInBtn.click();
    await expect(dialog.getByText('135%')).toBeVisible();

    // Reset button should now appear
    const resetBtn = page.getByRole('button', { name: 'Reset zoom' });
    await expect(resetBtn).toBeVisible();

    // Zoom in further
    await zoomInBtn.click();
    await expect(dialog.getByText('182%')).toBeVisible();

    // Zoom out
    await zoomOutBtn.click();
    await expect(dialog.getByText('135%')).toBeVisible();

    // Reset zoom
    await resetBtn.click();
    await expect(dialog.getByText('100%')).toBeVisible();
    await expect(resetBtn).toBeHidden();
  });

  test('next and previous buttons navigate between illustrations', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    // Expect counter showing image 1 of 2
    await expect(dialog.getByText('1 / 2')).toBeVisible();

    const nextBtn = page.getByRole('button', { name: 'Next image' });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Now showing image 2 of 2
    await expect(dialog.getByText('2 / 2')).toBeVisible();

    const prevBtn = page.getByRole('button', { name: 'Previous image' });
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();

    // Back to image 1 of 2
    await expect(dialog.getByText('1 / 2')).toBeVisible();
  });

  test('clicking gaiji inline glyphs does not open preview', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const gaiji = page.locator('#test-gaiji');
    await expect(gaiji).toBeVisible();
    await gaiji.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeHidden();
  });

  test('spoilered images reveal on first click and open preview on second click', async ({
    page
  }) => {
    await seedReaderBook(page, SAMPLE_BOOK_WITH_IMAGES, {
      theme: 'default',
      hideSpoilerImage: true
    });
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const spoilerLabel = page.locator('.spoiler-label').first();
    await expect(spoilerLabel).toBeVisible();

    // First click should un-spoiler
    await spoilerLabel.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeHidden();

    // Second click on the unspoilered image should open preview
    const img = page.locator('#test-img-1');
    await img.click();
    await expect(dialog).toBeVisible();
  });

  test('works in continuous layout mode and vertical-rl writing mode', async ({ page }) => {
    await seedReaderBook(page, SAMPLE_BOOK_WITH_IMAGES, {
      viewMode: 'continuous',
      writingMode: 'vertical-rl',
      hideSpoilerImage: false
    });
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await expect(img).toBeVisible();
    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('anchor links wrapping illustrations are not hijacked by preview', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const linkedImg = page.locator('#test-linked-img');
    await expect(linkedImg).toBeVisible();
    await linkedImg.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeHidden();
  });

  test('arrow keys pan the image when zoomed in instead of switching images', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await img.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    // Zoom in
    const zoomInBtn = page.getByRole('button', { name: 'Zoom in' });
    await zoomInBtn.click();
    await expect(dialog.getByText('135%')).toBeVisible();

    // Press ArrowRight - should pan, not switch to image 2
    await page.keyboard.press('ArrowRight');

    // Should still be at image 1 of 2 (counter still 1 / 2) and zoom still 135%
    await expect(dialog.getByText('1 / 2')).toBeVisible();
    await expect(dialog.getByText('135%')).toBeVisible();
  });
});
