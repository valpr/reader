/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the manage bar search dropdown.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from '../fixtures/book-fixture';
import { expectDialogFitsViewport, expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

test.describe('Mobile: manage bar search dropdown', () => {
  test('search dropdown opens, fits within viewport on Pixel 9, and filters work', async ({
    page
  }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'epic'] });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    const searchBtn = page.getByTestId('library-search-filter-button');
    await expect(searchBtn).toBeVisible();
    await searchBtn.tap();

    const searchInput = page.getByTestId('library-search-input');
    await expect(searchInput).toBeVisible();

    const popover = page.locator('[data-popover].absolute');
    await expectDialogFitsViewport(popover);
    await expectNoHorizontalOverflow(page);

    // Type in search and verify books filter
    await searchInput.fill(SAMPLE_BOOK.title);
    await expect(page.getByText(SAMPLE_BOOK.title)).toBeVisible();

    // Verify progress filter options are visible and tappable
    const unreadOption = page.getByRole('radio', { name: 'Unread' });
    await expect(unreadOption).toBeVisible();
    await unreadOption.tap();
    await expect(page.getByTestId('library-active-filter-count')).toHaveText('2');

    // Tap clear filters
    const clearBtn = page.getByTestId('library-clear-filters');
    await expect(clearBtn).toBeVisible();
    await clearBtn.tap();
    await expect(page.getByTestId('library-active-filter-count')).not.toBeVisible();
  });

  test('search dropdown fits within 360px viewport without overflow', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'epic'] });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    const searchBtn = page.getByTestId('library-search-filter-button');
    await expect(searchBtn).toBeVisible();
    await searchBtn.tap();

    const searchInput = page.getByTestId('library-search-input');
    await expect(searchInput).toBeVisible();

    const popover = page.locator('[data-popover].absolute');
    await expectDialogFitsViewport(popover);
    await expectNoHorizontalOverflow(page);
  });
});
