/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Reader Navigation & Progress Tracking', () => {
  test('keyboard navigation flips pages and updates progress counter', async ({ page }) => {
    await seedReaderBook(
      page,
      {},
      {
        viewMode: 'paginated',
        writingMode: 'horizontal-tb',
        showCharacterCounter: true,
        showPercentage: true
      }
    );

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    const progressCounter = page.locator('div[title="Click to copy Progress"]');
    await expect(progressCounter).toBeVisible();

    const initialText = await progressCounter.innerText();

    // Navigate to next page via PageDown key
    await page.keyboard.press('PageDown');

    // Progress counter should update
    await expect(progressCounter).not.toHaveText(initialText);

    // Navigate back via PageUp key
    await page.keyboard.press('PageUp');
    await expect(progressCounter).toHaveText(initialText);
  });

  test('edge tap to flip enables left/right click navigation zones', async ({ page }) => {
    await seedReaderBook(
      page,
      {},
      {
        viewMode: 'paginated',
        writingMode: 'horizontal-tb',
        enableTapEdgeToFlip: true,
        showCharacterCounter: true,
        showPercentage: true
      }
    );

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Verify left and right edge tap buttons are in DOM
    const leftTapButton = page.locator('button.fixed.left-0.z-10');
    const rightTapButton = page.locator('button.fixed.right-0.z-10');

    await expect(leftTapButton).toBeVisible();
    await expect(rightTapButton).toBeVisible();

    const progressCounter = page.locator('div[title="Click to copy Progress"]');
    const initialText = await progressCounter.innerText();

    // Click right tap button to advance page (in horizontal mode)
    await rightTapButton.click();
    await expect(progressCounter).not.toHaveText(initialText);

    // Click left tap button to return to previous page
    await leftTapButton.click();
    await expect(progressCounter).toHaveText(initialText);
  });

  test('footer toggles visibility upon click', async ({ page }) => {
    await seedReaderBook(
      page,
      {},
      {
        showCharacterCounter: true,
        showPercentage: true
      }
    );

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    const progressCounter = page.locator('div[title="Click to copy Progress"]');
    await expect(progressCounter).toBeVisible();

    const footer = page.locator('#ttu-page-footer');
    // Click footer bar to toggle off
    await footer.click({ position: { x: 10, y: 10 } });

    // Progress counter should be hidden
    await expect(progressCounter).toBeHidden();

    // Click footer bar again to toggle back on
    await footer.click({ position: { x: 10, y: 10 } });
    await expect(progressCounter).toBeVisible();
  });
});
