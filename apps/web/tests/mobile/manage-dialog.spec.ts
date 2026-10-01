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

  for (const width of [412, 360]) {
    test(`delete books dialog fits viewport and actions are reachable at ${width}px`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 915 });
      await seedReaderBook(page);
      await page.goto('/manage');

      const bookCard = page.locator('.aspect-w-2').first();
      await expect(bookCard).toBeVisible({ timeout: 10000 });

      // Open select mode and trigger delete
      await page.getByRole('button', { name: 'More Actions' }).tap();
      await page.getByRole('button', { name: 'Select Books' }).tap();
      await bookCard.tap();
      await page.getByRole('button', { name: 'Delete selected Books' }).tap();

      const dialog = page.getByTestId('delete-books-dialog');
      await expect(dialog).toBeVisible();
      await expectDialogFitsViewport(dialog);
      await expectNoHorizontalOverflow(page);
      await expectFooterActionVisible(page, 'Delete local copy');

      // Tap statistics checkbox
      const statsCheckbox = page.getByTestId('delete-statistics-checkbox');
      await expect(statsCheckbox).toBeVisible();
      await statsCheckbox.tap();
      await expect(statsCheckbox).toBeChecked();
      await expectFooterActionVisible(page, 'Delete local copy (all data)');

      // Cancel tap closes dialog
      await page.locator('.astryx-dialog-surface button').filter({ hasText: 'Cancel' }).tap();
      await expect(dialog).not.toBeVisible();
    });

    test(`delete books dialog contains long unbroken title without overflowing at ${width}px`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 915 });
      const longUnbrokenTitle =
        'SupercalifragilisticexpialidociousUnbreakableJapaneseBookTitleTestingContainment1234567890';
      await seedReaderBook(page, { title: longUnbrokenTitle });
      await page.goto('/manage');

      const bookCard = page.locator('.aspect-w-2').first();
      await expect(bookCard).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'More Actions' }).tap();
      await page.getByRole('button', { name: 'Select Books' }).tap();
      await bookCard.tap();
      await page.getByRole('button', { name: 'Delete selected Books' }).tap();

      const dialog = page.getByTestId('delete-books-dialog');
      await expect(dialog).toBeVisible();
      await expectDialogFitsViewport(dialog);
      await expectNoHorizontalOverflow(page);
      await expectFooterActionVisible(page, 'Delete local copy');

      await page.locator('.astryx-dialog-surface button').filter({ hasText: 'Cancel' }).tap();
      await expect(dialog).not.toBeVisible();
    });
  }
});
