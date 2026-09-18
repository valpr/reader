/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) coverage for the BookLoader calligraphy loader.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';

for (const width of [412, 360]) {
  test(`book loaders fit without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.goto('/ui-showcase');

    // NOTE: the ui-showcase page itself overflows below ~512px (pre-existing
    // `.showcase-grid` forces 480px cards on a dev-only page), so assertions
    // are scoped to the loader surfaces instead of the viewport.
    const loaders = [
      page.getByTestId('showcase-loader-flavor').getByTestId('book-loader'),
      page.getByTestId('showcase-loader-debug').getByTestId('book-loader')
    ];

    for (const loader of loaders) {
      await expect(loader, 'loader should be visible').toBeVisible();

      // The loader caps itself at 20rem so it always fits narrow overlays.
      const loaderBox = await loader.boundingBox();
      expect(loaderBox, 'loader has no bounding box').not.toBeNull();
      expect(loaderBox!.width, 'loader exceeds its 20rem cap').toBeLessThanOrEqual(321);

      // No descendant (kanji mark, stage text, progress bar) may spill
      // past the loader surface, even with unbroken CJK strings.
      const spill = await loader.evaluate((el) => {
        const rootRight = el.getBoundingClientRect().right;
        let maxRight = rootRight;
        for (const descendant of el.querySelectorAll('*')) {
          maxRight = Math.max(maxRight, descendant.getBoundingClientRect().right);
        }
        return { rootRight, maxRight };
      });
      expect(
        spill.maxRight,
        `loader content spills past loader surface (${spill.maxRight} > ${spill.rootRight})`
      ).toBeLessThanOrEqual(spill.rootRight + 1);
    }
  });
}
