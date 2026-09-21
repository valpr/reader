/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test, type Page } from '@playwright/test';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';

const PRIMARY_SOURCE = 'trusted-gdrive';

interface SeedSource {
  name: string;
  type: 'gdrive' | 'onedrive';
  disconnected?: boolean;
}

async function seedStorageSources(page: Page, sources: SeedSource[]) {
  await page.goto('/');
  await page.evaluate(
    async ({ list, version }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('books', version);
        request.onupgradeneeded = () => {
          const d = request.result;
          // Full schema: this may be the first open at the current version,
          // and the app never upgrades a DB already at version (see
          // factory.ts). A partial schema here would leave stores missing.
          if (!d.objectStoreNames.contains('data')) {
            const ds = d.createObjectStore('data', { keyPath: 'id', autoIncrement: true });
            ds.createIndex('title', 'title');
          }
          if (!d.objectStoreNames.contains('bookmark')) {
            d.createObjectStore('bookmark', { keyPath: 'dataId' });
          }
          if (!d.objectStoreNames.contains('userBookmark')) {
            const us = d.createObjectStore('userBookmark', { keyPath: 'id', autoIncrement: true });
            us.createIndex('dataId', 'dataId');
          }
          if (!d.objectStoreNames.contains('lastItem')) {
            d.createObjectStore('lastItem');
          }
          if (!d.objectStoreNames.contains('storageSource')) {
            d.createObjectStore('storageSource', { keyPath: 'name' });
          }
          if (!d.objectStoreNames.contains('statistic')) {
            const ss = d.createObjectStore('statistic', { keyPath: ['title', 'dateKey'] });
            ss.createIndex('dateKey', 'dateKey');
            ss.createIndex('completedBook', ['completedBook', 'title']);
          }
          if (!d.objectStoreNames.contains('readingGoal')) {
            const rs = d.createObjectStore('readingGoal', { keyPath: 'goalStartDate' });
            rs.createIndex('goalEndDate', 'goalEndDate');
          }
          if (!d.objectStoreNames.contains('lastModified')) {
            d.createObjectStore('lastModified', { keyPath: ['title', 'dataType'] });
          }
          if (!d.objectStoreNames.contains('audioBook')) {
            d.createObjectStore('audioBook', { keyPath: 'title' });
          }
          if (!d.objectStoreNames.contains('subtitle')) {
            d.createObjectStore('subtitle', { keyPath: 'title' });
          }
          if (!d.objectStoreNames.contains('handle')) {
            d.createObjectStore('handle', { keyPath: ['title', 'dataType'] });
          }
          if (!d.objectStoreNames.contains('deviceIdentity')) {
            d.createObjectStore('deviceIdentity', { keyPath: 'id' });
          }
          if (!d.objectStoreNames.contains('statisticContribution')) {
            const cs = d.createObjectStore('statisticContribution', {
              keyPath: ['title', 'dateKey']
            });
            cs.createIndex('dateKey', 'dateKey');
            cs.createIndex('year', 'year');
          }
          if (!d.objectStoreNames.contains('statisticSyncState')) {
            d.createObjectStore('statisticSyncState', { keyPath: 'id' });
          }
          if (!d.objectStoreNames.contains('statisticRemoteContribution')) {
            const rs = d.createObjectStore('statisticRemoteContribution', {
              keyPath: ['deviceId', 'title', 'dateKey']
            });
            rs.createIndex('byDevice', 'deviceId');
            rs.createIndex('byBook', ['title', 'dateKey']);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('storageSource', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        for (const source of list) {
          tx.objectStore('storageSource').put({
            name: source.name,
            type: source.type,
            storedInManager: true,
            encryptionDisabled: false,
            data: new ArrayBuffer(0),
            disconnected: source.disconnected ?? false,
            lastSourceModified: Date.now()
          });
        }
      });
    },
    { list: sources, version: currentDbVersion }
  );
}

test.describe('Cloud sync scope (primary-only)', () => {
  test('labels the primary sync target with automatic-sync scope', async ({ page }) => {
    await page.goto('/settings/data');

    await expect(page.getByText('Statistics Sync Target')).toBeVisible();
    await expect(page.getByText(/automatic sync runs only for this target/i)).toBeVisible();
  });

  test.describe('per-source connection status', () => {
    test.beforeEach(async ({ page }) => {
      await seedStorageSources(page, [
        { name: PRIMARY_SOURCE, type: 'gdrive' },
        { name: 'archive-onedrive', type: 'onedrive' }
      ]);
    });

    test('custom cloud sources render their own status chip', async ({ page }) => {
      await page.goto('/settings/data');

      // Wait for the storage list to hydrate (custom sources appear in the
      // dropdown only after the persisted storage-source records load).
      await expect(
        page.getByRole('option', { name: 'trusted-gdrive (Google Drive)' })
      ).toBeAttached();
      await expect(
        page.getByRole('option', { name: 'archive-onedrive (OneDrive)' })
      ).toBeAttached();

      await page.getByRole('button', { name: /Advanced: Custom Credentials/ }).click();

      const gdriveRow = page.locator('.astryx-list-item', { hasText: 'Custom Google Drive' });
      await expect(gdriveRow.getByText('Disconnected').first()).toBeVisible();

      const onedriveRow = page.locator('.astryx-list-item', { hasText: 'Custom OneDrive' });
      await expect(onedriveRow.getByText('Disconnected').first()).toBeVisible();
    });

    test('per-source status chip survives a reload', async ({ page }) => {
      await page.goto('/settings/data');

      await expect(
        page.getByRole('option', { name: 'trusted-gdrive (Google Drive)' })
      ).toBeAttached();
      await page.getByRole('button', { name: /Advanced: Custom Credentials/ }).click();
      await expect(
        page
          .locator('.astryx-list-item', { hasText: 'Custom Google Drive' })
          .getByText('Disconnected')
          .first()
      ).toBeVisible();

      await page.reload();
      await expect(
        page.getByRole('option', { name: 'trusted-gdrive (Google Drive)' })
      ).toBeAttached();
      await page.getByRole('button', { name: /Advanced: Custom Credentials/ }).click();

      await expect(
        page
          .locator('.astryx-list-item', { hasText: 'Custom Google Drive' })
          .getByText('Disconnected')
          .first()
      ).toBeVisible();
      await expect(
        page
          .locator('.astryx-list-item', { hasText: 'Custom OneDrive' })
          .getByText('Disconnected')
          .first()
      ).toBeVisible();
    });
  });

  test.describe('disconnected sources', () => {
    test.beforeEach(async ({ page }) => {
      await seedStorageSources(page, [
        { name: 'active-gdrive', type: 'gdrive' },
        { name: 'old-onedrive', type: 'onedrive', disconnected: true }
      ]);
    });

    test('disconnected custom sources show a warning sign in the sync target dropdown', async ({
      page
    }) => {
      await page.goto('/settings/data');

      await expect(
        page.getByRole('option', { name: 'active-gdrive (Google Drive)' })
      ).toBeAttached();
      // Native <option> elements cannot render icons, so disconnected sources
      // carry a text-style warning sign (U+26A0 U+FE0E) in their label.
      await expect(page.getByRole('option', { name: '⚠︎ old-onedrive (OneDrive)' })).toBeAttached();
    });

    test('disconnected custom sources offer reconnect in Advanced', async ({ page }) => {
      await page.goto('/settings/data');

      // Wait for the storage list to hydrate before opening Advanced.
      await expect(
        page.getByRole('option', { name: 'active-gdrive (Google Drive)' })
      ).toBeAttached();
      await page.getByRole('button', { name: /Advanced: Custom Credentials/ }).click();
      const row = page.locator('.astryx-list-item', { hasText: 'Custom OneDrive' });
      await expect(row.getByText('Disconnected').first()).toBeVisible();
      await expect(page.getByTestId('reconnect-old-onedrive')).toBeVisible();
    });
  });

  test.describe('per-source last sync time', () => {
    test('active provider card reads per-source sync time from persisted metadata', async ({
      page
    }) => {
      await page.addInitScript(
        ({ source, minsAgo }) => {
          window.localStorage.setItem('syncTarget', source);
          window.localStorage.setItem(
            'lastSyncBySource',
            JSON.stringify({ [source]: Date.now() - minsAgo * 60_000 })
          );
        },
        { source: PRIMARY_SOURCE, minsAgo: 1 }
      );
      await seedStorageSources(page, [{ name: PRIMARY_SOURCE, type: 'gdrive' }]);

      await page.goto('/settings/data');
      await expect(page.getByText('Synced 1 minute ago')).toBeVisible();

      // Metadata is durable: after a full reload the card still reflects it.
      await page.reload();
      await expect(page.getByText('Synced 1 minute ago')).toBeVisible();
    });
  });
});
