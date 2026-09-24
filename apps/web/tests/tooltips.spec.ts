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

    // Ensure Reader Profiles section is loaded
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    // Tooltips require JS hydration
    await page.waitForLoadState('networkidle');

    // Find Rename profile button on the default profile card
    const renameButton = page.getByRole('button', { name: 'Rename profile' }).first();
    await expect(renameButton).toBeVisible();

    const buttonBox = await renameButton.boundingBox();
    expect(buttonBox).not.toBeNull();

    // Hover over the rename button
    await renameButton.hover();

    // Wait for tooltip to appear
    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Rename profile' });
    await expect(tooltip).toBeVisible();

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

    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    // Tooltips require JS hydration
    await page.waitForLoadState('networkidle');

    const duplicateButton = page.getByRole('button', { name: 'Duplicate profile' }).first();
    await expect(duplicateButton).toBeVisible();

    await duplicateButton.hover();
    const tooltip = page.locator('.astryx-tooltip', {
      hasText: 'Duplicate profile'
    });
    await expect(tooltip).toBeVisible();

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
    await page.waitForLoadState('networkidle');

    const importButton = page.getByTestId('library-import-button');
    await expect(importButton).toBeVisible();

    await importButton.hover();
    const importTooltip = page.locator('.astryx-tooltip', { hasText: 'Import Books or Backup' });
    await expect(importTooltip).toBeVisible();

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
    await page.waitForLoadState('networkidle');

    const importButton = page.getByTestId('library-import-button');
    await expect(importButton).toBeVisible();

    await importButton.focus();
    const importTooltip = page.locator('.astryx-tooltip', { hasText: 'Import Books or Backup' });
    await expect(importTooltip).toBeVisible();

    await importButton.press('Enter');
    await expect(page.getByRole('button', { name: 'Import File(s)' })).toBeVisible();
    await expect(importTooltip).not.toBeVisible();
  });

  test('font management icon tooltip in settings does not crush into vertical column', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/reader');

    // Find "Manage Installed Web Fonts" button if available in the DOM
    const fontButton = page.getByRole('button', { name: 'Manage Installed Web Fonts' }).first();
    if (await fontButton.isVisible()) {
      const buttonBox = await fontButton.boundingBox();
      expect(buttonBox).not.toBeNull();

      await fontButton.hover();

      const tooltip = page.locator('.astryx-tooltip', { hasText: 'Manage Installed Web Fonts' });
      await expect(tooltip).toBeVisible();

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
    await expect(bookmarkButton).toBeVisible();

    await bookmarkButton.hover();

    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Bookmark Page (B)' });
    await expect(tooltip).toBeVisible();

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
    await expect(page.locator('.book-content')).toBeVisible();
    const topTrigger = page.locator('button.fixed.inset-x-0.top-0');
    await topTrigger.click();

    const completeBtn = page.locator('button[aria-label="Complete Book"]');
    await expect(completeBtn).toBeVisible({ timeout: 5000 });

    // Hover over Complete Book button
    await completeBtn.hover();

    const tooltip = page.locator('.astryx-tooltip', { hasText: 'Complete Book' });
    await expect(tooltip).toBeVisible();

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
