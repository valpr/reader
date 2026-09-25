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
import { seedReaderBook } from '../fixtures/book-fixture';
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

    const popover = page.getByTestId('popover-panel');
    await expectDialogFitsViewport(popover);
    await expectNoHorizontalOverflow(page);
  });

  test('progress segments wrap on narrow viewports, single row on desktop', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'epic'] });

    for (const width of [412, 360]) {
      await page.setViewportSize({ width, height: 800 });
      // Filters persist via localStorage: reset so the previous iteration's
      // progress selection can't hide the seeded (unread) book here.
      await page.goto('/');
      await page.evaluate(() => localStorage.removeItem('libraryFilters'));
      await page.goto('/manage');

      const bookCard = page.locator('.aspect-w-2').first();
      await expect(bookCard).toBeVisible({ timeout: 10000 });

      const searchBtn = page.getByTestId('library-search-filter-button');
      await expect(searchBtn).toBeVisible();
      await searchBtn.tap();

      const popover = page.getByTestId('popover-panel');
      await expect(popover).toBeVisible();

      const popoverBox = await popover.boundingBox();
      expect(popoverBox).not.toBeNull();

      // Narrow viewports use the wrapped 2x2 layout so long labels (notably
      // Completed) can never squeeze past the dropdown edge, regardless of
      // device font metrics: Completed sits on a row below All.
      const allBox = await page.getByRole('radio', { name: 'All', exact: true }).boundingBox();
      const completedBox = await page
        .getByRole('radio', { name: 'Completed', exact: true })
        .boundingBox();
      expect(allBox).not.toBeNull();
      expect(completedBox).not.toBeNull();
      expect(completedBox!.y).toBeGreaterThan(allBox!.y + allBox!.height / 2);

      // Every progress segment must be fully contained in the dropdown.
      for (const name of ['All', 'Unread', 'In Progress', 'Completed']) {
        const box = await page.getByRole('radio', { name, exact: true }).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(popoverBox!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(popoverBox!.x + popoverBox!.width + 1);
      }

      // The popover must stay open after toggling so users can change filters.
      await page.getByRole('radio', { name: 'In Progress', exact: true }).tap();
      await expect(popover).toBeVisible();
      await expect(page.getByTestId('library-search-input')).toBeVisible();

      await expectNoHorizontalOverflow(page);
    }

    // Desktop widths keep the single-row layout.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('libraryFilters'));
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('library-search-filter-button').tap();
    const desktopAll = await page.getByRole('radio', { name: 'All', exact: true }).boundingBox();
    const desktopCompleted = await page
      .getByRole('radio', { name: 'Completed', exact: true })
      .boundingBox();
    expect(Math.abs(desktopCompleted!.y - desktopAll!.y)).toBeLessThan(2);
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

    const popover = page.getByTestId('popover-panel');
    await expectDialogFitsViewport(popover);
    await expectNoHorizontalOverflow(page);
  });
});
