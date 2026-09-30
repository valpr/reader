/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the manage card grid.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from '../fixtures/book-fixture';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

test.describe('Mobile: manage card grid', () => {
  test('cards render without horizontal overflow and menu is tappable', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'science-fiction', 'epic'] });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('book-card-tags-1')).toContainText('fantasy');

    const menuBtn = page.getByRole('button', {
      name: `Book options for ${SAMPLE_BOOK.title}`
    });
    await expect(menuBtn).toBeVisible();
    await menuBtn.tap();
    await expect(page.getByRole('button', { name: 'Complete Book' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View details' })).toBeVisible();
  });

  test('can toggle complete/uncomplete via mobile tap without overflow', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    const menuBtn = page.getByRole('button', {
      name: `Book options for ${SAMPLE_BOOK.title}`
    });
    await expect(menuBtn).toBeVisible();
    await menuBtn.tap();

    const completeBtn = page.getByRole('button', { name: /^Complete Book/ });
    await expect(completeBtn).toBeVisible();
    await completeBtn.tap();

    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('book-card-progress-complete')).toBeVisible();

    await menuBtn.tap();
    const uncompleteBtn = page.getByRole('button', { name: /^Uncomplete Book/ });
    await expect(uncompleteBtn).toBeVisible();
    await uncompleteBtn.tap();

    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId('book-card-progress-complete')).not.toBeVisible();
  });

  test('narrow 360px viewport has no horizontal overflow', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'science-fiction', 'epic'] });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await expectNoHorizontalOverflow(page);
  });
});
