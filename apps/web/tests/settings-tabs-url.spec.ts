/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Settings tab URLs', () => {
  test('/settings redirects to /settings/reader', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/reader\/?$/);
    await expect(page.getByRole('tab', { name: 'Reader' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible();
  });

  test('Data tab has its own deep-linkable URL', async ({ page }) => {
    await page.goto('/settings/data');
    await expect(page).toHaveURL(/\/settings\/data\/?$/);
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Local Storage & Caching')).toBeVisible();
  });

  test('clicking header tabs updates the URL and content', async ({ page }) => {
    await page.goto('/settings/reader');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Statistics' }).click();
    await expect(page).toHaveURL(/\/settings\/statistics\/?$/);
    await expect(page.getByRole('heading', { name: 'Reading Tracker', exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page).toHaveURL(/\/settings\/data\/?$/);
    await expect(page.getByText('Local Storage & Caching')).toBeVisible();

    await page.getByRole('tab', { name: 'Reader' }).click();
    await expect(page).toHaveURL(/\/settings\/reader\/?$/);
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible();
  });

  test('browser back/forward walks settings tabs', async ({ page }) => {
    await page.goto('/settings/reader');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page).toHaveURL(/\/settings\/data\/?$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/reader\/?$/);
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/settings\/data\/?$/);
    await expect(page.getByText('Local Storage & Caching')).toBeVisible();
  });

  test.describe('Reader section URLs (desktop)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    test('reader section deep-link renders that section', async ({ page }) => {
      await page.goto('/settings/reader/typography');
      await expect(page).toHaveURL(/\/settings\/reader\/typography\/?$/);
      const contentPanel = page.getByTestId('reader-settings-content-panel');
      await expect(contentPanel.getByRole('heading', { name: 'Typography & Fonts' })).toBeVisible();
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).not.toBeVisible();
      const sidebar = page.getByTestId('reader-settings-sidebar');
      await expect(
        sidebar.locator('.astryx-list-item', { hasText: 'Typography & Fonts' })
      ).toHaveClass(/is-selected/);
    });

    test('bare reader URL defaults to the appearance section', async ({ page }) => {
      await page.goto('/settings/reader');
      await expect(page).toHaveURL(/\/settings\/reader\/?$/);
      const contentPanel = page.getByTestId('reader-settings-content-panel');
      await expect(
        contentPanel.getByRole('heading', { name: 'Appearance & Themes' })
      ).toBeVisible();
      await expect(
        contentPanel.getByRole('heading', { name: 'Typography & Fonts' })
      ).not.toBeVisible();
      const sidebar = page.getByTestId('reader-settings-sidebar');
      await expect(
        sidebar.locator('.astryx-list-item', { hasText: 'Theme & Appearance' })
      ).toHaveClass(/is-selected/);
    });

    test('sidebar clicks update the section URL', async ({ page }) => {
      await page.goto('/settings/reader');
      await expect(page.locator('text=Reader Profiles').first()).toBeVisible();
      // Section switches are local-state buttons (no navigation), so wait for
      // hydration before clicking; bare anchors would navigate natively instead.
      await page.waitForLoadState('networkidle');

      const sidebar = page.getByTestId('reader-settings-sidebar');
      await sidebar.locator('.astryx-list-item', { hasText: 'Typography & Fonts' }).click();
      await expect(page).toHaveURL(/\/settings\/reader\/typography\/?$/);

      await sidebar.locator('.astryx-list-item', { hasText: 'Reader Profiles' }).click();
      await expect(page).toHaveURL(/\/settings\/reader\/profiles\/?$/);
      const contentPanel = page.getByTestId('reader-settings-content-panel');
      await expect(
        contentPanel.getByRole('button', { name: 'Rename profile' }).first()
      ).toBeVisible();
      await expect(
        contentPanel.getByRole('heading', { name: 'Typography & Fonts' })
      ).not.toBeVisible();
    });
  });

  test.describe('Reader section URLs (mobile)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('bare reader URL opens the section list', async ({ page }) => {
      await page.goto('/settings/reader');
      await expect(page.locator('text=Reader Profiles').first()).toBeVisible();
      await expect(page.getByTestId('reader-settings-sidebar')).toBeVisible();
      await expect(page.getByTestId('reader-settings-content-panel')).toBeHidden();
    });

    test('section deep-link opens the detail view directly', async ({ page }) => {
      await page.goto('/settings/reader/typography');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('reader-settings-sidebar')).toBeHidden();
      const contentPanel = page.getByTestId('reader-settings-content-panel');
      await expect(contentPanel).toBeVisible();
      await expect(contentPanel.getByRole('heading', { name: 'Typography & Fonts' })).toBeVisible();

      await contentPanel.getByRole('button', { name: /All Settings/i }).click();
      await expect(page).toHaveURL(/\/settings\/reader\/?$/);
      await expect(page.getByTestId('reader-settings-sidebar')).toBeVisible();
    });
  });

  test('unknown settings tab returns 404', async ({ page }) => {
    const response = await page.goto('/settings/nope');
    expect(response?.status()).toBe(404);
  });

  test('unknown reader section returns 404', async ({ page }) => {
    const response = await page.goto('/settings/reader/nope');
    expect(response?.status()).toBe(404);
  });
});
