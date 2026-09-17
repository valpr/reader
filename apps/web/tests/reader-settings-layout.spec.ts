/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Reader Settings Astryx List Layout', () => {
  test.describe('Desktop Viewport (1280x800)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/settings/reader');
      await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
      await page.waitForLoadState('networkidle');
    });

    test('renders Astryx list sidebar', async ({ page }) => {
      // Check sidebar exists with list items
      const sidebar = page.getByTestId('reader-settings-sidebar');
      await expect(sidebar).toBeVisible();

      // "Theme & Appearance" is selected by default
      const appearanceItem = sidebar.locator('.astryx-list-item', {
        hasText: 'Theme & Appearance'
      });
      await expect(appearanceItem).toBeVisible();
      await expect(appearanceItem).toHaveClass(/is-selected/);

      // "All Settings" is not selected
      const allSettingsItem = sidebar.locator('.astryx-list-item', { hasText: 'All Settings' });
      await expect(allSettingsItem).not.toHaveClass(/is-selected/);
    });

    test('switches active section when clicking sidebar items in desktop view', async ({
      page
    }) => {
      const sidebar = page.getByTestId('reader-settings-sidebar');
      const contentPanel = page.getByTestId('reader-settings-content-panel');

      // 1. Click "Theme & Appearance"
      const appearanceItem = sidebar.locator('.astryx-list-item', {
        hasText: 'Theme & Appearance'
      });
      await appearanceItem.click();
      await expect(appearanceItem).toHaveClass(/is-selected/);

      // Appearance section should be visible in content panel
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).toBeVisible();

      // Other sections should not be visible in single section mode
      await expect(
        contentPanel.getByRole('heading', { name: 'Typography & Fonts' })
      ).not.toBeVisible();
      await expect(
        contentPanel.getByRole('heading', { name: 'Navigation, Gestures & Page Turns' })
      ).not.toBeVisible();

      // 2. Click "Typography & Fonts"
      const typographyItem = sidebar.locator('.astryx-list-item', {
        hasText: 'Typography & Fonts'
      });
      await typographyItem.click();
      await expect(typographyItem).toHaveClass(/is-selected/);
      await expect(appearanceItem).not.toHaveClass(/is-selected/);

      // Typography section should now be visible
      await expect(contentPanel.getByRole('heading', { name: 'Typography & Fonts' })).toBeVisible();
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).not.toBeVisible();

      // 3. Click "All Settings" to return to unified continuous view
      const allSettingsItem = sidebar.locator('.astryx-list-item', { hasText: 'All Settings' });
      await allSettingsItem.click();
      await expect(allSettingsItem).toHaveClass(/is-selected/);

      // Both sections should now be visible
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).toBeVisible();
      await expect(contentPanel.getByRole('heading', { name: 'Typography & Fonts' })).toBeVisible();
    });
  });

  test.describe('Mobile Viewport (375x667)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/settings/reader');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    });

    test('mobile drill-down: tapping section navigates to detail, back button returns to list', async ({
      page
    }) => {
      const sidebar = page.getByTestId('reader-settings-sidebar');
      const contentPanel = page.getByTestId('reader-settings-content-panel');

      // Initially on mobile: sidebar list is visible, content panel is hidden
      await expect(sidebar).toBeVisible();
      await expect(contentPanel).toBeHidden();

      // Tap "Theme & Appearance" in the list (local state, no navigation reload)
      const appearanceItem = sidebar.locator('.astryx-list-item', {
        hasText: 'Theme & Appearance'
      });
      await appearanceItem.click();

      // Now: sidebar is hidden, content panel is visible with section details
      await expect(sidebar).toBeHidden();
      await expect(contentPanel).toBeVisible();
      // URL bar still syncs silently so the section stays shareable
      await expect(page).toHaveURL(/\/settings\/reader\/appearance\/?$/);

      // Appearance controls are visible
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).toBeVisible();

      // Tap "All Settings" back button
      const backButton = contentPanel.getByRole('button', { name: /All Settings/i });
      await expect(backButton).toBeVisible();
      await backButton.click();

      // Returns to list overview
      await expect(sidebar).toBeVisible();
      await expect(contentPanel).toBeHidden();
      await expect(page).toHaveURL(/\/settings\/reader\/?$/);
    });

    test('thin mobile window: list item headlines and descriptions render horizontally and do not stack vertically', async ({
      page
    }) => {
      // Test on a very thin mobile window (320px width)
      await page.setViewportSize({ width: 320, height: 667 });
      const sidebar = page.getByTestId('reader-settings-sidebar');
      await expect(sidebar).toBeVisible();

      // Check "All Settings" item
      const allSettingsHeadline = sidebar.locator('.astryx-list-item-headline', {
        hasText: 'All Settings'
      });
      await expect(allSettingsHeadline).toBeVisible();
      const allBox = await allSettingsHeadline.boundingBox();
      expect(allBox).not.toBeNull();
      // Headline must be wide horizontally (>70px) and single-line height (<35px), not a 1-character vertical strip
      expect(allBox!.width).toBeGreaterThan(70);
      expect(allBox!.height).toBeLessThan(35);

      // Check "Theme & Appearance" item
      const themeHeadline = sidebar.locator('.astryx-list-item-headline', {
        hasText: 'Theme & Appearance'
      });
      await expect(themeHeadline).toBeVisible();
      const themeBox = await themeHeadline.boundingBox();
      expect(themeBox).not.toBeNull();
      expect(themeBox!.width).toBeGreaterThan(120);
      expect(themeBox!.height).toBeLessThan(35);

      // Suffix chevron should not consume 100% of the item width
      const chevronSuffix = sidebar
        .locator('.astryx-list-item', { hasText: 'Theme & Appearance' })
        .locator('.astryx-list-item-suffix');
      await expect(chevronSuffix).toBeVisible();
      const suffixBox = await chevronSuffix.boundingBox();
      expect(suffixBox).not.toBeNull();
      expect(suffixBox!.width).toBeLessThan(40);
    });
  });
});
