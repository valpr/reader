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

    // Verify stored in IndexedDB userBookmark. The create dialog closes
    // before the write lands, so poll instead of reading once.
    await expect
      .poll(
        async () => {
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
          return userBookmarks.find((b) => b.label === 'My Important Note');
        },
        { timeout: 10000 }
      )
      .toBeDefined();

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

  test('deleting a manual bookmark soft-deletes the row for sync propagation', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Create a named bookmark
    await page.keyboard.press('Shift+KeyB');
    const dialogTitle = page.locator('text=New Bookmark');
    await expect(dialogTitle).toBeVisible();
    await page.locator('#bookmark-label').fill('Doomed Note');
    await page.locator('button:has-text("Save")').click();
    await expect(dialogTitle).toBeHidden();

    // Open the drawer and confirm it lists the bookmark
    await page.keyboard.press('Shift+KeyR');
    const bookmarksTab = page.locator('button:has-text("Bookmarks")');
    await expect(bookmarksTab).toBeVisible();
    await bookmarksTab.click();
    await expect(page.locator('text=Doomed Note')).toBeVisible();

    // Delete it: the row must vanish from the UI but survive in IndexedDB
    // as a soft-deleted row (deleted/syncId/deletedAt) so the removal
    // propagates instead of resurrecting on the next merge.
    await page.locator('button[title="Delete Bookmark"]').first().click();
    await expect(page.locator('text=Doomed Note')).toBeHidden();

    const rows = await page.evaluate(async (version) => {
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

    const tombstoned = rows.find((b) => b.label === 'Doomed Note');
    expect(tombstoned).toBeDefined();
    expect(tombstoned.deleted).toBe(true);
    expect(typeof tombstoned.syncId).toBe('string');
    expect(tombstoned.syncId.length).toBeGreaterThan(0);
    expect(typeof tombstoned.deletedAt).toBe('number');
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

  test('creates a highlighted bookmark from text selection and renders mark element with bookmark color', async ({
    page
  }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await expect(page.locator('.book-content p').first()).toBeVisible();

    // Select text within the first paragraph
    await page.evaluate(() => {
      const p = document.querySelector('.book-content p');
      if (!p || !p.firstChild) throw new Error('First paragraph node missing');
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 7); // '吾輩は猫である'
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    // Open create bookmark dialog via Shift+B
    await page.keyboard.press('Shift+KeyB');
    const dialogTitle = page.locator('text=New Bookmark');
    await expect(dialogTitle).toBeVisible();

    // Verify "Highlight selected text" checkbox is visible and checked
    const highlightCheckbox = page.locator('input[type="checkbox"]');
    await expect(highlightCheckbox).toBeVisible();
    await expect(highlightCheckbox).toBeChecked();

    // Verify snippet preview is visible in the dialog
    await expect(page.locator('[data-app-dialog]')).toContainText('吾輩は猫である');

    // Fill label and select red color
    await page.locator('#bookmark-label').fill('Neko Highlight');
    await page.locator('button[title="red"]').click();

    // Save
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialogTitle).toBeHidden();

    // Verify mark element is rendered in .book-content
    const mark = page.locator('mark[data-ttu-highlight]');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText('吾輩は猫である');

    // Verify mark has red rgba background color: rgba(239, 68, 68, 0.35)
    const bgColor = await mark.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toMatch(/rgba?\(239,\s*68,\s*68/);

    // Verify highlight persisted in IndexedDB
    const bookmarkRecord = await page.evaluate(async (version) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('userBookmark', 'readonly');
          const getAllReq = tx.objectStore('userBookmark').getAll();
          getAllReq.onsuccess = () => {
            const row = (getAllReq.result as any[]).find((b) => b.label === 'Neko Highlight');
            resolve(row);
          };
          getAllReq.onerror = () => reject(getAllReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    expect(bookmarkRecord).toBeDefined();
    expect(bookmarkRecord.highlight).toBeDefined();
    expect(bookmarkRecord.highlight.snippet).toBe('吾輩は猫である');
    expect(bookmarkRecord.color).toBe('red');
  });

  test('multi-paragraph selection creates highlights across multiple blocks', async ({ page }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await expect(page.locator('.book-content p').nth(1)).toBeVisible();

    // Select text spanning paragraph 0 and paragraph 1
    await page.evaluate(() => {
      const paras = document.querySelectorAll('.book-content p');
      if (paras.length < 2 || !paras[0].firstChild || !paras[1].firstChild) {
        throw new Error('Not enough paragraphs found');
      }
      const range = document.createRange();
      range.setStart(paras[0].firstChild, 5); // middle of para 0
      range.setEnd(paras[1].firstChild, 10); // middle of para 1
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await page.keyboard.press('Shift+KeyB');
    await expect(page.locator('text=New Bookmark')).toBeVisible();
    await page.locator('#bookmark-label').fill('MultiPara Highlight');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('text=New Bookmark')).toBeHidden();

    // Verify marks exist in both paragraphs
    const marks = page.locator('mark[data-ttu-highlight]');
    await expect(marks).toHaveCount(2);
  });

  test('highlight color updates on bookmark edit and is removed on bookmark delete', async ({
    page
  }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await expect(page.locator('.book-content p').first()).toBeVisible();

    // Create a highlighted bookmark
    await page.evaluate(() => {
      const p = document.querySelector('.book-content p');
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 5);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await page.keyboard.press('Shift+KeyB');
    await page.locator('#bookmark-label').fill('Editable Highlight');
    await page.locator('button[title="blue"]').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const mark = page.locator('mark[data-ttu-highlight]');
    await expect(mark).toBeVisible();
    const bgColor = await mark.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toMatch(/rgba?\(59,\s*130,\s*246/); // blue

    // Open drawer
    await page.keyboard.press('Shift+KeyR');
    const bookmarksTab = page.locator('button:has-text("Bookmarks")');
    await expect(bookmarksTab).toBeVisible();
    await bookmarksTab.click();

    // Edit bookmark to green
    const editBtn = page.locator('button[title="Edit Bookmark"]').first();
    await editBtn.click();
    const editTitle = page.locator('text=Edit Bookmark');
    await expect(editTitle).toBeVisible();
    await page.locator('button[title="green"]').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editTitle).toBeHidden();

    // Close drawer
    await page.locator('button[title="Close"]').click();
    await expect(bookmarksTab).toBeHidden();

    // Verify mark background color updated to green: rgba(34, 197, 94, 0.35)
    await expect
      .poll(async () => {
        return mark.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      })
      .toMatch(/rgba?\(34,\s*197,\s*94/);

    // Reopen drawer and delete bookmark
    await page.keyboard.press('Shift+KeyR');
    await bookmarksTab.click();
    await page.locator('button[title="Delete Bookmark"]').first().click();
    await page.locator('button[title="Close"]').click();

    // Verify mark is removed from DOM
    await expect(page.locator('mark[data-ttu-highlight]')).toHaveCount(0);
  });

  test('highlight renders in continuous view mode', async ({ page }) => {
    // Seed book in continuous mode
    await seedReaderBook(page, {}, { viewMode: 'continuous', writingMode: 'horizontal-tb' });
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Select text
    await page.evaluate(() => {
      const p = document.querySelector('.book-content p');
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 5);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    await page.keyboard.press('Shift+KeyB');
    await expect(page.locator('text=New Bookmark')).toBeVisible();
    await page.locator('#bookmark-label').fill('Continuous Highlight');
    await page.locator('button:has-text("Save")').click();

    const mark = page.locator('mark[data-ttu-highlight]');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText('吾輩は猫で');
  });
});
