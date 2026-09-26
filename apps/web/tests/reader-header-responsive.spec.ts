/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Reader Header Responsive Behavior (Astryx OverflowList)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('UNCAUGHT PAGE ERROR:', err.stack || err.message));
    await seedReaderBook(page);
  });

  async function openHeader(page: any) {
    // Wait for book content to load (cold Vite boot needs headroom)
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    // Click the top trigger zone to open the header
    const topTrigger = page.locator('button.fixed.inset-x-0.top-0');
    await topTrigger.click();
    await expect(page.locator('button[aria-label="Go to Book Manager"]')).toBeVisible({
      timeout: 10000
    });
  }

  async function expectViewportWidth(page: any, width: number) {
    await expect
      .poll(async () => page.evaluate(() => window.innerWidth), { timeout: 10000 })
      .toBe(width);
  }

  test('desktop viewport (1280x800): all actions visible on bar, more actions hidden', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectViewportWidth(page, 1280);
    await page.goto('/b?id=1');
    await openHeader(page);

    // Primary end actions must be visible
    await expect(page.locator('button[aria-label="Go to Reader Settings"]')).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('button[aria-label="Go to Book Manager"]')).toBeVisible({
      timeout: 10000
    });

    // Secondary actions should be visible on the bar
    await expect(page.locator('button[aria-label="Complete Book"]')).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('button[aria-label="Go to Statistics"]')).toBeVisible({
      timeout: 10000
    });

    // The overflow "More Actions" button should NOT be visible on wide screens
    const moreActions = page.locator('button[aria-label="More Actions"]');
    await expect(moreActions).toBeHidden({ timeout: 10000 });
  });

  test('narrow mobile viewport (375x667): primary actions visible, secondary items in popover', async ({
    page
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectViewportWidth(page, 375);
    await page.goto('/b?id=1');
    await openHeader(page);

    // Primary end actions must still be visible
    await expect(page.locator('button[aria-label="Go to Reader Settings"]')).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('button[aria-label="Go to Book Manager"]')).toBeVisible({
      timeout: 10000
    });

    // More Actions ellipsis button must be visible
    const moreActions = page.locator('button[aria-label="More Actions"]');
    await expect(moreActions).toBeVisible({ timeout: 10000 });

    // Click More Actions to open the popover
    await moreActions.click();

    // Complete Book fits on the bar; trailing items like Statistics collapse into the popover
    await expect(page.locator('button[aria-label="Complete Book"]')).toBeVisible({
      timeout: 10000
    });

    // The popover menu items should now be visible
    const statsItem = page.locator('button:has-text("Statistics")');
    await expect(statsItem).toBeVisible({ timeout: 10000 });

    // The header must remain open when interacting with the popover
    await expect(page.locator('button[aria-label="Go to Book Manager"]')).toBeVisible({
      timeout: 10000
    });
  });

  test('dynamic resize transition: smooth collapse and expand without layout breakage', async ({
    page
  }) => {
    // Start wide
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectViewportWidth(page, 1280);
    await page.goto('/b?id=1');
    await openHeader(page);

    const moreActions = page.locator('button[aria-label="More Actions"]');
    await expect(moreActions).toBeHidden({ timeout: 10000 });

    // Resize down to mobile width
    await page.setViewportSize({ width: 375, height: 667 });
    await expectViewportWidth(page, 375);

    // Now more actions should appear
    await expect(moreActions).toBeVisible({ timeout: 10000 });

    // Resize back to wide
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectViewportWidth(page, 1280);

    // More actions should disappear, and bar items reappear
    await expect(moreActions).toBeHidden({ timeout: 10000 });
    await expect(page.locator('button[aria-label="Complete Book"]')).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('button[aria-label="Go to Statistics"]')).toBeVisible({
      timeout: 10000
    });
  });
});
