/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Shared assertions for the mobile (Pixel 9) smoke suite.
 * Keeps per-spec cost low: import these instead of re-implementing
 * viewport/overflow checks in every mobile spec.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** Page must not scroll horizontally at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return {
      scrollWidth: el.scrollWidth,
      innerWidth: window.innerWidth
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth ${overflow.scrollWidth} > viewport ${overflow.innerWidth}`
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

/** Dialog bounding box must fit fully inside the viewport. */
export async function expectDialogFitsViewport(dialog: Locator) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box, 'dialog has no bounding box').not.toBeNull();
  const viewport = dialog.page().viewportSize();
  expect(viewport, 'no viewport size').not.toBeNull();
  expect(box!.x, 'dialog extends past the left edge').toBeGreaterThanOrEqual(-1);
  expect(box!.y, 'dialog extends past the top edge').toBeGreaterThanOrEqual(-1);
  expect(
    box!.x + box!.width,
    'dialog extends past the right edge of the viewport'
  ).toBeLessThanOrEqual(viewport!.width + 1);
  expect(
    box!.y + box!.height,
    'dialog extends past the bottom edge of the viewport'
  ).toBeLessThanOrEqual(viewport!.height + 1);
}

/** A primary footer action (e.g. Save tags) must be visible and enabled. */
export async function expectFooterActionVisible(page: Page, name: string | RegExp) {
  const action = page.getByRole('button', { name });
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
}

/** Control bounding box must fit fully inside the viewport (not clipped). */
export async function expectFullyInViewport(page: Page, control: Locator, label?: string) {
  const name = label || 'Control';
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
