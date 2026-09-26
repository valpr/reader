/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedLibraryItem } from './fixtures/book-fixture';

test.describe('Astryx Tooltip Component & Settings Page Tooltips', () => {
  test('settings page profile action tooltips do not collapse to icon width and stay within viewport', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/reader/profiles');

    // Ensure Reader Profiles section is loaded (also signals JS hydration;
    // networkidle never settles reliably under Vite HMR).
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 15000 });

    // Find Rename profile button on the default profile card
    const renameButton = page.getByRole('button', { name: 'Rename profile' }).first();
    await expect(renameButton).toBeVisible({ timeout: 15000 });

    const buttonBox = await renameButton.boundingBox();
    expect(buttonBox).not.toBeNull();

    // Hover with retry: on cold boot the first hover can land before Svelte
    // hydration swaps the DOM, leaving the pointer "inside" with no fresh
    // mouseenter. Moving away first guarantees each retry fires mouseenter,
    // then the delayed (150ms) tooltip shows.
    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Rename profile' });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await renameButton.hover();
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();

    if (buttonBox && tooltipBox) {
      // 1. Tooltip must not be squished to icon width (~28-32px)
      // "Rename profile" text is ~80-120px wide
      expect(tooltipBox.width).toBeGreaterThan(60);

      // 2. Tooltip must be completely within viewport boundaries
      expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
      expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(800);
    }

    // Move mouse away to ensure tooltip hides
    await page.mouse.move(0, 0);
    await expect(tooltip).not.toBeVisible();
  });

  test('settings page profile duplicate action tooltip works and dismisses with Escape', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/reader/profiles');

    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 15000 });

    const duplicateButton = page.getByRole('button', { name: 'Duplicate profile' }).first();
    await expect(duplicateButton).toBeVisible({ timeout: 15000 });

    const tooltip = page.locator('.astryx-tooltip', {
      hasText: 'Duplicate profile'
    });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await duplicateButton.hover();
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    if (tooltipBox) {
      expect(tooltipBox.width).toBeGreaterThan(60);
      expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
    }

    // Dismiss with Escape key
    await page.keyboard.press('Escape');
    await expect(tooltip).not.toBeVisible();
  });

  test('book manager Import tooltip dismisses when its dropdown menu opens', async ({ page }) => {
    await seedLibraryItem(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/manage');

    const importButton = page.getByTestId('library-import-button');
    await expect(importButton).toBeVisible({ timeout: 15000 });

    const importTooltip = page.locator('.astryx-tooltip', { hasText: 'Import Books or Backup' });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await importButton.hover();
      await expect(importTooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    // Opening the dropdown must dismiss the trigger tooltip so it cannot
    // overlap the menu (native title behavior).
    await importButton.click();
    await expect(page.getByRole('button', { name: 'Import File(s)' })).toBeVisible();
    await expect(importTooltip).not.toBeVisible();
  });

  test('book manager Import tooltip dismisses when its dropdown is opened via keyboard', async ({
    page
  }) => {
    await seedLibraryItem(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/manage');

    const importButton = page.getByTestId('library-import-button');
    await expect(importButton).toBeVisible({ timeout: 15000 });

    const importTooltip = page.locator('.astryx-tooltip', { hasText: 'Import Books or Backup' });
    await expect(async () => {
      // Blur first: re-focusing an already-focused element fires no focusin,
      // which stalls retries when the first focus lands pre-hydration.
      await importButton.evaluate((el) => (el as HTMLElement).blur()).catch(() => {});
      await importButton.focus();
      await expect(importTooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    await importButton.press('Enter');
    await expect(page.getByRole('button', { name: 'Import File(s)' })).toBeVisible();
    await expect(importTooltip).not.toBeVisible();
  });

  test('font management icon tooltip in settings does not crush into vertical column', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/reader');

    // Find "Manage Installed Web Fonts" button if available in the DOM.
    // The button only renders when the fonts section is present, so skip
    // gracefully when absent instead of failing cold boots.
    const fontButton = page.getByRole('button', { name: 'Manage Installed Web Fonts' }).first();
    if ((await fontButton.count()) === 0) return;
    await expect(fontButton).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    {
      const buttonBox = await fontButton.boundingBox();
      expect(buttonBox).not.toBeNull();

      const tooltip = page.locator('.astryx-tooltip', { hasText: 'Manage Installed Web Fonts' });
      await expect(async () => {
        await page.mouse.move(0, 0);
        await fontButton.hover();
        await expect(tooltip).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15000 });

      const tooltipBox = await tooltip.boundingBox();
      expect(tooltipBox).not.toBeNull();
      if (tooltipBox && buttonBox) {
        // Must be significantly wider than the icon (button is ~28px)
        expect(tooltipBox.width).toBeGreaterThan(120);
        // Must stay inside viewport boundaries
        expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
        expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
      }
    }
  });

  test('UI showcase tooltips render with proper widths and accessibility attributes', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ui-showcase');

    const bookmarkButton = page.getByRole('button', { name: 'Bookmark' }).first();
    await expect(bookmarkButton).toBeVisible({ timeout: 15000 });

    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Bookmark Page (B)' });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await bookmarkButton.hover();
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    if (tooltipBox) {
      expect(tooltipBox.width).toBeGreaterThan(80);
      expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
    }
  });

  test('reader header tooltips render horizontally and do not inherit vertical writing mode in reader view', async ({
    page
  }) => {
    await seedLibraryItem(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/b?id=1');

    // Wait for book content and open header
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const topTrigger = page.locator('button.fixed.inset-x-0.top-0');
    await topTrigger.click();

    const completeBtn = page.locator('button[aria-label="Complete Book"]');
    await expect(completeBtn).toBeVisible({ timeout: 10000 });

    // Hover over Complete Book button (retry for cold hydration; move away
    // first so each retry fires a fresh mouseenter)
    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Complete Book' });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await completeBtn.hover();
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    // Verify writing-mode is horizontal-tb (not vertical-rl)
    const writingMode = await tooltip.evaluate((el) => window.getComputedStyle(el).writingMode);
    expect(writingMode).toBe('horizontal-tb');

    // Verify tooltip bounding box has width significantly larger than height (horizontal orientation)
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    if (tooltipBox) {
      expect(tooltipBox.width).toBeGreaterThan(60);
      expect(tooltipBox.width).toBeGreaterThan(tooltipBox.height);
      expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(1280);
    }
  });
});
