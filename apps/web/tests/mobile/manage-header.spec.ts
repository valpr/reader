/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the manage-page header controls.
 * Regression: the Search button was clipped midway at 412px because the
 * Import/Filter/Search text buttons plus sort/overflow overflowed the bar.
 * The source filter and search are now merged into a single control.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedReaderBook } from '../fixtures/book-fixture';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

/** Control bounding box must fit fully inside the viewport (not clipped). */
async function expectFullyInViewport(page: Page, control: Locator, name: string) {
  await expect(control, `${name} should be visible`).toBeVisible();
  const box = await control.boundingBox();
  expect(box, `${name} has no bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, 'no viewport size').not.toBeNull();
  expect(box!.x, `${name} extends past the left edge`).toBeGreaterThanOrEqual(-1);
  expect(
    box!.x + box!.width,
    `${name} is clipped past the right edge of the viewport`
  ).toBeLessThanOrEqual(viewport!.width + 1);
}

for (const width of [412, 360]) {
  test(`manage header controls fit and open at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await seedReaderBook(page, { tags: ['fantasy'] });
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    const importButton = page.getByTestId('library-import-button');
    const searchFilterButton = page.getByTestId('library-search-filter-button');
    const sortButton = page.getByTestId('library-sort-button');
    const moreActionsButton = page.getByRole('button', { name: 'More Actions' });

    await expectFullyInViewport(page, importButton, 'Import');
    await expectFullyInViewport(page, searchFilterButton, 'Search and filter');
    await expectFullyInViewport(page, sortButton, 'Sort');
    await expectFullyInViewport(page, moreActionsButton, 'More actions');
    await expectNoHorizontalOverflow(page);

    // Every control must still be tappable and open its menu/popover.
    await importButton.tap();
    await expect(page.getByRole('button', { name: 'Import File(s)' })).toBeVisible();
    await importButton.tap();

    // Merged control opens one popover with both source options and search.
    await searchFilterButton.tap();
    await expect(page.getByRole('button', { name: 'All sources' })).toBeVisible();
    await expect(page.getByTestId('library-search-input')).toBeVisible();
    await expect(page.getByTestId('library-filter-tags')).toBeVisible();
    await searchFilterButton.tap();

    await sortButton.tap();
    await expect(page.getByText('Added (id)')).toBeVisible();

    await moreActionsButton.tap();
    await expect(page.getByRole('button', { name: 'Statistics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select Books' })).toBeVisible();

    // The overflow Select Books entry enters selection mode and exits cleanly.
    await page.getByRole('button', { name: 'Select Books' }).tap();
    const disableSelectButton = page.getByRole('button', { name: 'Disable Book Selection' });
    await expect(disableSelectButton).toBeVisible();
    await disableSelectButton.tap();
    await expect(importButton).toBeVisible();
  });
}
