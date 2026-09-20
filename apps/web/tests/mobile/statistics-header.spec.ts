/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the statistics header.
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
  test(`statistics header controls fit and open overflow at ${width}px without current book`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await expectNoHorizontalOverflow(page);

    const segmentedControl = page.getByRole('radiogroup');
    await expect(segmentedControl).toBeVisible();
    await expectFullyInViewport(page, segmentedControl, 'SegmentedControl');

    const moreActions = page.locator('button[aria-label="More Actions"]');

    if (width === 412) {
      // At 412px all four actions fit on the bar, so there is no overflow menu
      await expect(moreActions).toHaveCount(0);
      await expectFullyInViewport(
        page,
        page.getByRole('button', { name: 'Open Advanced Filtering' }),
        'Advanced Filtering'
      );
      await expectFullyInViewport(
        page,
        page.getByRole('button', { name: 'Open data actions' }),
        'Data actions'
      );
    } else {
      await expectFullyInViewport(page, moreActions, 'More Actions');

      await expectNoHorizontalOverflow(page);

      // Tap More Actions to verify overflow dropdown items
      await moreActions.tap();
      await expect(page.getByRole('button', { name: 'Manager' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

      // At 360px, the data-actions shortcut collapses into the overflow menu
      await expect(page.getByRole('button', { name: 'Copy or export data' })).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
  });

  test(`statistics header controls fit at ${width}px with current book opened`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 915 });
    await seedReaderBook(page);

    // Open book first so database has currentBookId
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 10000 });

    // Navigate to statistics
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await expectNoHorizontalOverflow(page);

    const moreActions = page.locator('button[aria-label="More Actions"]');
    await expectFullyInViewport(page, moreActions, 'More Actions');

    await moreActions.tap();
    await expect(page.getByRole('button', { name: 'Manager' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

    if (width === 360) {
      // At 360px, Back to Current Book collapses into the overflow menu
      await expect(page.getByRole('button', { name: 'Back to Current Book' })).toBeVisible();
    } else {
      // At 412px, Back to Current Book fits on the bar
      const backToBook = page.locator('button[aria-label="Back to Current Book"]');
      await expectFullyInViewport(page, backToBook, 'Back to Current Book');
    }

    await expectNoHorizontalOverflow(page);
  });
}
