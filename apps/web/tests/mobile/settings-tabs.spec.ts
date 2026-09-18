/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for settings navigation.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';
import { seedReaderBook } from '../fixtures/book-fixture';

async function seedCloudSource(
  page: Page,
  source: { name: string; disconnected: boolean; refreshToken?: string }
) {
  await page.evaluate(async (s) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('books');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('storageSource', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('storageSource').put({
        name: s.name,
        type: 'gdrive',
        data: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: s.refreshToken || '',
          accountEmail: 'reader.long.user.account@example.com',
          accountName: 'Reader User'
        },
        storedInManager: false,
        encryptionDisabled: true,
        lastSourceModified: Date.now(),
        disconnected: s.disconnected
      });
    });
  }, source);
}

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

  test('connected cloud sync card, status badge, and disconnect button stay inside card without overflow', async ({
    page
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'test-mobile-gdrive');
    });
    await seedReaderBook(page);
    await seedCloudSource(page, {
      name: 'test-mobile-gdrive',
      disconnected: false,
      refreshToken: 'test-refresh-token'
    });

    await page.goto('/settings/data');
    await page.waitForLoadState('networkidle');

    // Transition connection state to CONNECTED
    await page.evaluate(async () => {
      // @ts-expect-error - dynamic browser import in playwright evaluate
      const mod = await import('/src/lib/data/storage/storage-oauth-manager.ts');
      mod.setConnectionState('test-mobile-gdrive', mod.StorageConnectionState.CONNECTED);
    });

    for (const width of [412, 360]) {
      await page.setViewportSize({ width, height: 800 });

      const card = page.locator('.astryx-card').filter({ hasText: 'test-mobile-gdrive' });
      await expect(card).toBeVisible({ timeout: 10000 });

      const connectedBadge = card.getByText('Connected', { exact: true });
      await expect(connectedBadge).toBeVisible();

      const disconnectBtn = card.getByRole('button', { name: 'Disconnect', exact: true });
      await expect(disconnectBtn).toBeVisible();

      const cardBox = await card.boundingBox();
      const badgeBox = await connectedBadge.boundingBox();
      const disconnectBox = await disconnectBtn.boundingBox();

      expect(cardBox).not.toBeNull();
      expect(badgeBox).not.toBeNull();
      expect(disconnectBox).not.toBeNull();

      // Badge must stay inside card with proper right padding (at least 8px margin from card edge)
      expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width - 8);

      // Disconnect button must stay strictly inside the card
      expect(disconnectBox!.x + disconnectBox!.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width - 8
      );

      await expectNoHorizontalOverflow(page);
    }
  });

  test('needs reconnect sync card with alert message keeps buttons contained inside card', async ({
    page
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'test-mobile-reconnect');
    });
    await seedReaderBook(page);
    await seedCloudSource(page, {
      name: 'test-mobile-reconnect',
      disconnected: false,
      refreshToken: 'test-refresh-token'
    });

    await page.goto('/settings/data');
    await page.waitForLoadState('networkidle');

    for (const width of [412, 360]) {
      await page.setViewportSize({ width, height: 800 });

      const card = page.locator('.astryx-card').filter({ hasText: 'test-mobile-reconnect' });
      await expect(card).toBeVisible({ timeout: 10000 });

      const disconnectBtn = card.getByRole('button', { name: 'Disconnect', exact: true });
      await expect(disconnectBtn).toBeVisible();

      const reconnectBtn = card.getByRole('button', { name: 'Reconnect Session', exact: true });
      await expect(reconnectBtn).toBeVisible();

      const cardBox = await card.boundingBox();
      const disconnectBox = await disconnectBtn.boundingBox();
      const reconnectBox = await reconnectBtn.boundingBox();

      expect(cardBox).not.toBeNull();
      expect(disconnectBox).not.toBeNull();
      expect(reconnectBox).not.toBeNull();

      expect(disconnectBox!.x + disconnectBox!.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width - 8
      );
      expect(reconnectBox!.x + reconnectBox!.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width - 8
      );

      await expectNoHorizontalOverflow(page);
    }
  });
});
