/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for settings navigation.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

test.describe('Mobile: settings', () => {
  test('reader settings drill-down works by tap without overflow', async ({ page }) => {
    await page.goto('/settings/reader');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });

    await expectNoHorizontalOverflow(page);

    const sidebar = page.getByTestId('reader-settings-sidebar');
    const contentPanel = page.getByTestId('reader-settings-content-panel');
    await expect(sidebar).toBeVisible();

    await sidebar.locator('.astryx-list-item', { hasText: 'Theme & Appearance' }).tap();
    await expect(contentPanel).toBeVisible();
    await expect(contentPanel.getByRole('heading', { name: 'Appearance & Themes' })).toBeVisible();
    // Section tap syncs the URL silently without a navigation reload.
    await expect(page).toHaveURL(/\/settings\/reader\/appearance\/?$/);

    await expectNoHorizontalOverflow(page);
  });
});
