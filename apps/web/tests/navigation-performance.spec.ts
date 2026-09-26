/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Navigation Performance & Mechanisms', () => {
  async function openReaderHeader(page: any) {
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });
    const topTrigger = page.locator('button.fixed.inset-x-0.top-0');
    await topTrigger.click();
    await expect(page.locator('button[aria-label="Go to Book Manager"]')).toBeVisible({
      timeout: 10000
    });
  }

  test('reader exit to book manager does not mount or display action backdrop', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await openReaderHeader(page);

    // Ensure no backdrop is visible before navigation
    const backdrop = page.locator('.backdrop-blur-\\[2px\\]');
    await expect(backdrop).toHaveCount(0);

    const managerBtn = page.locator('button[aria-label="Go to Book Manager"]');
    await managerBtn.click();

    await expect(page).toHaveURL(/\/manage/);

    // Confirm that the blocking action backdrop was never rendered
    await expect(backdrop).toHaveCount(0);
  });

  test('reader exit to book manager completes promptly without hanging', async ({ page }) => {
    test.slow();
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await openReaderHeader(page);

    const managerBtn = page.locator('button[aria-label="Go to Book Manager"]');
    await managerBtn.hover();

    const start = Date.now();
    await managerBtn.click();
    await expect(page).toHaveURL(/\/manage/, { timeout: 15000 });
    const elapsed = Date.now() - start;

    // Safety ceiling: ensure navigation transitions without multi-second freezes.
    // Cold Vite boot can exceed 1.5s on first transform, so allow headroom.
    expect(elapsed).toBeLessThan(5000);
  });

  test('hovering navigation icons triggers route chunk preloading', async ({ page }) => {
    test.slow();
    await page.goto('/manage');

    const settingsBtn = page.locator('button[aria-label="Go to Reader Settings"]');
    await expect(settingsBtn).toBeVisible({ timeout: 15000 });

    // Listen for SvelteKit chunk preload request when hovering. Cold boot may
    // need a retry while Vite transforms the chunk, so poll the hover.
    await expect(async () => {
      const preloadRequestPromise = page.waitForRequest(
        (req) =>
          req.url().includes('settings') &&
          (req.resourceType() === 'script' || req.resourceType() === 'fetch'),
        { timeout: 5000 }
      );
      await settingsBtn.hover();
      const preloadRequest = await preloadRequestPromise;
      expect(preloadRequest).toBeDefined();
    }).toPass({ timeout: 15000 });
  });

  test('settings lazy-renders inactive tabs to minimize initial DOM overhead', async ({ page }) => {
    await page.goto('/settings/reader');

    // Reader settings (active by default) must be rendered
    await expect(page.getByText('Active Device Profile')).toBeVisible();

    // Inactive tabs (Data and Statistics) must NOT be mounted in the DOM initially
    await expect(page.locator('text=Local Storage & Caching')).toHaveCount(0);
    await expect(page.locator('text=Reading Tracker')).toHaveCount(0);

    // Switch to Data tab
    const dataTab = page.locator('role=tab[name="Data"]');
    await dataTab.click();

    // Data tab should now be mounted and visible
    await expect(page.locator('text=Local Storage & Caching')).toBeVisible();

    // Statistics tab should still not be mounted
    await expect(page.locator('text=Reading Tracker')).toHaveCount(0);

    // Switch back to Reader tab
    const readerTab = page.locator('role=tab[name="Reader"]');
    await readerTab.click();

    // Both Reader and Data are in DOM, but Data is hidden
    await expect(page.getByText('Active Device Profile')).toBeVisible();
    await expect(page.locator('text=Local Storage & Caching')).toBeHidden();
  });
});
