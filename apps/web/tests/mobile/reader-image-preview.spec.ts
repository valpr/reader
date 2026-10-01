/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK_WITH_IMAGES, seedReaderBook } from '../fixtures/book-fixture';
import {
  expectDialogFitsViewport,
  expectFullyInViewport,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

test.describe('Mobile: Reader Image Preview', () => {
  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, SAMPLE_BOOK_WITH_IMAGES, { hideSpoilerImage: false });
  });

  test('tapping illustration on mobile opens preview with no overflow', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await expect(img).toBeVisible();
    await img.tap();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    // Check no horizontal overflow at 412px (Pixel 9)
    await expectNoHorizontalOverflow(page);
    await expectDialogFitsViewport(dialog);

    // Verify close button touch target is at least 44px
    const closeBtn = page.getByRole('button', { name: 'Close image preview' });
    await expectFullyInViewport(page, closeBtn, 'Close button');
    const box = await closeBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Tap close button dismisses preview
    await closeBtn.tap();
    await expect(dialog).toBeHidden();
  });

  test('preview stays contained at narrow 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    const img = page.locator('#test-img-1');
    await img.tap();

    const dialog = page.locator('div[role="dialog"][aria-label="Image preview"]');
    await expect(dialog).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectDialogFitsViewport(dialog);

    const closeBtn = page.getByRole('button', { name: 'Close image preview' });
    await closeBtn.tap();
    await expect(dialog).toBeHidden();
  });
});
