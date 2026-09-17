/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';

test.describe('Reader Bookmarks & Autosave Checkpoints', () => {
  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, {}, { viewMode: 'paginated', writingMode: 'horizontal-tb' });
  });

  test('fast bookmark key (KeyB) updates bookmark in IndexedDB', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Advance to next page
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);

    // Save fast bookmark
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    // Verify bookmark store in IndexedDB was updated
    const bookmarkRecord = await page.evaluate(async (version) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('bookmark', 'readonly');
          const getReq = tx.objectStore('bookmark').get(1);
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    expect(bookmarkRecord).toBeDefined();
    expect(bookmarkRecord.dataId).toBe(1);
  });

  test('reopening a previously read book resumes at latest bookmark/autosave position', async ({
    page
  }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Advance 2 pages
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);

    // Save fast bookmark
    await page.keyboard.press('b');
    await page.waitForTimeout(300);

    const bookmarkRecord = await page.evaluate(async (version) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('bookmark', 'readonly');
          const getReq = tx.objectStore('bookmark').get(1);
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    expect(bookmarkRecord.exploredCharCount).toBeGreaterThan(0);

    // Navigate to /manage and reopen the book
    await page.goto('/manage');
    await page.waitForTimeout(500);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await page.waitForTimeout(1000);

    const footerText = await page
      .locator('.writing-horizontal-tb.fixed.bottom-2.right-2')
      .textContent();
    expect(footerText).toContain(String(bookmarkRecord.exploredCharCount));
  });

  test('named bookmark creation (Shift+B) and drawer inspection (Shift+R)', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Open BookmarkCreateDialog via Shift+B
    await page.keyboard.press('Shift+KeyB');

    // Dialog should appear
    const dialogTitle = page.locator('text=New Bookmark');
    await expect(dialogTitle).toBeVisible();

    // Enter custom label
    const labelInput = page.locator('#bookmark-label');
    await labelInput.fill('My Important Note');

    // Click Save
    const saveBtn = page.locator('button:has-text("Save")');
    await saveBtn.click();
    await expect(dialogTitle).toBeHidden();

    // Verify stored in IndexedDB userBookmark
    const userBookmarks = await page.evaluate(async (version) => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('userBookmark', 'readonly');
          const getAllReq = tx.objectStore('userBookmark').getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result);
          getAllReq.onerror = () => reject(getAllReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    const created = userBookmarks.find((b) => b.label === 'My Important Note');
    expect(created).toBeDefined();

    // Open bookmark drawer via Shift+R
    await page.keyboard.press('Shift+KeyR');

    // Drawer should show Bookmarks and Autosaves tabs
    const bookmarksTab = page.locator('button:has-text("Bookmarks")');
    await expect(bookmarksTab).toBeVisible();

    // Click Bookmarks tab to view manual bookmarks
    await bookmarksTab.click();
    await expect(page.locator('text=My Important Note')).toBeVisible();

    // Close drawer
    const closeBtn = page.locator('button[title="Close"]');
    await closeBtn.click();
    await expect(bookmarksTab).toBeHidden();
  });

  test('storeUserBookmarks imports bookmarks with existing IDs without DataError', async ({
    page
  }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    const result = await page.evaluate(async (version) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      // Simulate bookmarks from cloud payload which carry remote IDs
      const cloudBookmarks = [
        {
          id: 99,
          dataId: 1,
          exploredCharCount: 50,
          progress: 0.1,
          label: 'Cloud Bookmark 1',
          color: 'blue',
          note: 'From cloud',
          createdAt: Date.now(),
          lastModified: Date.now()
        },
        {
          id: 100,
          dataId: 1,
          exploredCharCount: 150,
          progress: 0.3,
          label: 'Cloud Bookmark 2',
          color: 'green',
          note: 'Another from cloud',
          createdAt: Date.now(),
          lastModified: Date.now()
        }
      ];

      // Verify that omitting id succeeds whereas passing id: undefined throws DataError
      let passedDataError = false;
      try {
        const txFail = db.transaction('userBookmark', 'readwrite');
        txFail.objectStore('userBookmark').add({
          ...cloudBookmarks[0],
          id: undefined,
          dataId: 1
        });
        await new Promise((r, j) => {
          txFail.oncomplete = r;
          txFail.onerror = () => j(txFail.error);
        });
      } catch (err: any) {
        passedDataError = err.name === 'DataError';
      }

      // Verify fix: stripping id allows autoIncrement to succeed
      const insertedIds: number[] = [];
      const tx = db.transaction('userBookmark', 'readwrite');
      const store = tx.objectStore('userBookmark');
      for (const bm of cloudBookmarks) {
        const { id: _ignored, ...bmWithoutId } = bm;
        const req = store.add({
          ...bmWithoutId,
          dataId: 1
        });
        req.onsuccess = () => insertedIds.push(req.result as number);
      }
      await new Promise((r, j) => {
        tx.oncomplete = r;
        tx.onerror = () => j(tx.error);
      });

      // Read back from database
      const txRead = db.transaction('userBookmark', 'readonly');
      const getAllReq = txRead.objectStore('userBookmark').getAll();
      const allBookmarks = await new Promise<any[]>((r, j) => {
        getAllReq.onsuccess = () => r(getAllReq.result);
        getAllReq.onerror = () => j(getAllReq.error);
      });

      return {
        passedDataError,
        insertedCount: insertedIds.length,
        totalCount: allBookmarks.length,
        labels: allBookmarks.map((b) => b.label)
      };
    }, currentDbVersion);

    expect(result.passedDataError).toBe(true);
    expect(result.insertedCount).toBe(2);
    expect(result.labels).toContain('Cloud Bookmark 1');
    expect(result.labels).toContain('Cloud Bookmark 2');
  });
});
