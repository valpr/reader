/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) specs for the statistics Advanced Filtering bottom sheet.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test, type Page } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import {
  expectDialogFitsViewport,
  expectFullyInViewport,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

const LONG_TITLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx';

function todayKey() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function seedTwoTitles(page: Page) {
  await seedReaderBook(page, { title: LONG_TITLE, characters: 90000 });
  await seedStatistics(page, [
    {
      title: LONG_TITLE,
      dateKey: todayKey(),
      charactersRead: 12000,
      readingTime: 2400,
      minReadingSpeed: 18000,
      altMinReadingSpeed: 18000,
      lastReadingSpeed: 18000,
      maxReadingSpeed: 18000,
      lastStatisticModified: Date.now()
    },
    {
      title: 'Beta Book',
      dateKey: todayKey(),
      charactersRead: 6000,
      readingTime: 1200,
      minReadingSpeed: 18000,
      altMinReadingSpeed: 18000,
      lastReadingSpeed: 18000,
      maxReadingSpeed: 18000,
      lastStatisticModified: Date.now()
    }
  ]);
}

/**
 * The sheet plays a 100ms fly-in on open; visibility resolves at t=0 while it
 * is still translated. Poll until it has settled inside the viewport instead
 * of asserting a hardcoded timeout.
 */
async function expectSheetSettledInViewport(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport, 'no viewport size').not.toBeNull();
  await expect
    .poll(async () => {
      const box = await page.getByTestId('statistics-data-controls').boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(viewport!.height + 1);
}

/** Sheet surface must not scroll horizontally at the current viewport. */
async function expectSheetNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="statistics-data-controls"]');
    if (!sheet) return { scrollWidth: 0, clientWidth: 1, missing: true };
    return { scrollWidth: sheet.scrollWidth, clientWidth: sheet.clientWidth, missing: false };
  });
  expect(overflow.missing, 'data controls sheet is missing').toBe(false);
  expect(
    overflow.scrollWidth,
    `sheet horizontal overflow: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

for (const width of [412, 360]) {
  test(`data controls sheet fits and closes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await seedTwoTitles(page);
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: 'Summary' }).tap();
    await expect(page.getByText('2 of 2 titles')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Open Advanced Filtering' }).tap();

    const sheet = page.getByTestId('statistics-data-controls');
    await expectSheetSettledInViewport(page);
    await expectDialogFitsViewport(sheet);
    await expectNoHorizontalOverflow(page);
    await expectSheetNoHorizontalOverflow(page);

    // All four tabs stay reachable; view toggles keep the sheet open
    await page.getByRole('tab', { name: 'Titles' }).tap();
    // Every action button fits on screen — nothing scrolls off the right
    await expectFullyInViewport(page, page.getByRole('button', { name: 'All' }), 'All');
    await expectFullyInViewport(page, page.getByRole('button', { name: 'None' }), 'None');
    await expectFullyInViewport(page, page.getByRole('button', { name: 'In range' }), 'In range');
    await expectSheetNoHorizontalOverflow(page);
    await expectNoHorizontalOverflow(page);

    // Removing the long title then searching for it surfaces it as a
    // truncated dropdown option without overflowing the sheet
    await page.getByRole('button', { name: `Remove ${LONG_TITLE}` }).tap();
    await page.getByPlaceholder('Search titles…').fill(LONG_TITLE);
    const longTitleOption = page.getByRole('option', { name: LONG_TITLE });
    await expect(longTitleOption).toBeVisible();
    await expectSheetNoHorizontalOverflow(page);
    await expectNoHorizontalOverflow(page);

    // Re-adding restores the scope immediately (no Apply step)
    await longTitleOption.tap();
    await expect(page.getByRole('button', { name: `Remove ${LONG_TITLE}` })).toBeVisible();
    await expect(page.getByText('2 of 2 titles').first()).toBeVisible();

    await page.getByRole('button', { name: 'In range' }).tap();
    await expect(page.getByPlaceholder('Search titles…')).toBeVisible();
    await expectDialogFitsViewport(sheet);

    await page.getByRole('tab', { name: 'Actions' }).tap();
    await expect(page.getByRole('button', { name: 'Copy Reading Time' })).toBeVisible();
    // Delete lives in the Summary toolbar now, not in Advanced Filtering
    await expect(page.getByRole('button', { name: 'Delete everything' })).toHaveCount(0);
    await expectSheetNoHorizontalOverflow(page);

    // Primary footer action is visible, enabled, and tappable
    const closeButton = page.getByRole('button', { name: /^Close$/ });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeEnabled();
    await closeButton.tap();
    await expect(sheet).not.toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test(`heatmap shows compact titles chip without date header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await seedTwoTitles(page);
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: 'Heatmap' }).tap();
    // Titles chip is the only scope affordance; date header is irrelevant here
    await expect(page.getByRole('button', { name: '2 of 2 titles' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Data for/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /grouped by/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Chip opens the sheet directly at the Titles tab
    await page.getByRole('button', { name: '2 of 2 titles' }).tap();
    const sheet = page.getByTestId('statistics-data-controls');
    await expectSheetSettledInViewport(page);
    await expect(page.getByRole('tab', { name: 'Titles' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expectDialogFitsViewport(sheet);
    await expectSheetNoHorizontalOverflow(page);
  });
}
