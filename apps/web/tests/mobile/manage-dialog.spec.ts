/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the book details dialog.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from '../fixtures/book-fixture';
import {
  expectDialogFitsViewport,
  expectFooterActionVisible,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

test.describe('Mobile: book details dialog', () => {
  test('dialog fits the viewport and footer actions are reachable', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy'] });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).tap();
    await page.getByRole('button', { name: 'View details' }).tap();

    const dialog = page.getByTestId('book-details-dialog');
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);
    await expectFooterActionVisible(page, 'Close');

    // Save is disabled until there is something to save; typing (without
    // pressing Enter) must enable it via the pending-input dirty check.
    await expect(page.getByTestId('save-tags')).toBeDisabled();
    await page.getByTestId('book-tags-input').fill('cozy');
    await expect(page.getByTestId('save-tags')).toBeEnabled();
  });

  test('reset progress confirmation fits mobile viewport and works via tap', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).tap();
    await page.getByRole('button', { name: 'View details' }).tap();

    const dialog = page.getByTestId('book-details-dialog');
    await expectDialogFitsViewport(dialog);

    const resetBtn = page.getByTestId('reset-progress-button');
    // Center the button in the scrollable dialog: scrollIntoViewIfNeeded can
    // leave it at the bottom edge tucked under the sticky footer, which then
    // intercepts the tap on every retry.
    await resetBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(resetBtn).toBeVisible();
    await resetBtn.tap();

    const confirmBtn = page.getByTestId('confirm-reset-progress');
    const cancelBtn = page.getByTestId('cancel-reset-progress');
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);

    // Cancel tap hides prompt
    await cancelBtn.tap();
    await expect(confirmBtn).not.toBeVisible();
    await expect(resetBtn).toBeVisible();

    // Confirm tap resets and closes dialog
    await resetBtn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await resetBtn.tap();
    await confirmBtn.tap();
    await expect(dialog).not.toBeVisible();
  });
});
