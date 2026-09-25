/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, type TestBookData } from '../fixtures/book-fixture';

const BOOK_WITH_PICTURES: Partial<TestBookData> = {
  elementHtml: `
    <div id="section-0" class="reader-chapter ttu-no-text">
      <div class="ttu-img-container ttu-illustration-container" style="height: 1200px;">
        <span class="ttu-img-parent">
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='600'%3E%3Crect width='100%25' height='100%25' fill='%23ccc'/%3E%3C/svg%3E" alt="Cover" style="height: 600px; display: block;" />
        </span>
      </div>
    </div>
    <div id="section-1" class="reader-chapter">
      <p id="p-prologue-1">吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。</p>
      <p id="p-prologue-2">吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。</p>
    </div>
    <div id="section-2" class="reader-chapter" style="height: 3000px;">
      <h2>第一章</h2>
      <p id="p-ch1-1">この書生の掌の裏でしばらくはよい心持に坐っておったが、しばらくすると非常な速力で動く。</p>
    </div>
  `,
  characters: 500,
  sections: [
    {
      reference: 'section-0',
      charactersWeight: 1,
      label: '口絵 (Pictures)',
      startCharacter: 0,
      characters: 0
    },
    {
      reference: 'section-1',
      charactersWeight: 250,
      label: 'プロローグ (Prologue)',
      startCharacter: 0,
      characters: 250
    },
    {
      reference: 'section-2',
      charactersWeight: 250,
      label: '第一章 (Chapter 1)',
      startCharacter: 250,
      characters: 250
    }
  ]
};

test.describe('Continuous mobile bookmarking', () => {
  test('continuous horizontal mobile bookmarking and navigation', async ({ page }) => {
    await seedReaderBook(page, BOOK_WITH_PICTURES, {
      viewMode: 'continuous',
      writingMode: 'horizontal-tb',
      showCharacterCounter: true
    });

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    const footerTextLocator = page.locator('.writing-horizontal-tb.fixed.bottom-2.right-2');

    // Wait for fonts/images so the layout the target is computed from is
    // close to final (reduces re-scroll iterations below).
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const imgs = [...document.images];
      return Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => img.addEventListener('load', r, { once: true }))
        )
      );
    });

    // Scroll into P1 and save the fast bookmark. The reader fires late
    // restore scrolls (initial bookmark/section setup via BookmarkManager and
    // PageManager) that can yank a programmatic scroll back to the top, so
    // recompute the target and re-scroll until the position sticks; only then
    // does the 'b' save observe the intended position. The loop is
    // self-healing: a save raced by a yank simply fails the poll and retries.
    let bookmarkRecord: any;
    await expect
      .poll(
        async () => {
          const targetY = await page.evaluate(() => {
            const p1 = document.getElementById('p-prologue-1')!;
            const r = p1.getBoundingClientRect();
            return r.top - document.documentElement.getBoundingClientRect().top + 20;
          });
          if (Math.abs((await page.evaluate(() => window.scrollY)) - targetY) > 2) {
            await page.evaluate((y) => window.scrollTo(0, y), targetY);
            return -1;
          }
          await page.keyboard.press('b');
          bookmarkRecord = await page.evaluate(async () => {
            return new Promise<any>((resolve, reject) => {
              const req = indexedDB.open('books');
              req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('bookmark', 'readonly');
                const getReq = tx.objectStore('bookmark').get(1);
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => reject(getReq.error);
              };
              req.onerror = () => reject(req.error);
            });
          });
          return bookmarkRecord?.exploredCharCount ?? -1;
        },
        { timeout: 20000 }
      )
      .toBe(65);

    const targetY = await page.evaluate(() => window.scrollY);
    expect(bookmarkRecord.progress).toBeGreaterThan(0);
    expect(bookmarkRecord.scrollY).toBe(targetY);

    // Wait for the live tracker to catch up to the saved position before
    // opening the create dialog: its default label is generated from the
    // live exploredCharCount, not the saved record.
    await expect(footerTextLocator).toContainText('65');

    // Open create bookmark dialog and verify default label points to active chapter
    await page.keyboard.press('Shift+KeyB');
    await page.waitForTimeout(300);
    const labelInput = page.locator('#bookmark-label');
    await expect(labelInput).toBeVisible();
    const labelValue = await labelInput.inputValue();
    expect(labelValue).toContain('プロローグ');

    // Save user bookmark
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(300);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // Reopening resumes at the fast bookmark (the 'r' jump keybind was
    // removed in #179 along with the Return to Bookmark button). Layout can
    // shift slightly across loads, so allow the same tolerance as the
    // vertical-rl resume test below.
    await page.goto('/manage');
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    // Same settle as above: the resume scroll fires after content layout,
    // so only assert once fonts/images are done shifting it.
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(async () => {
        const y = await page.evaluate(() => window.scrollY);
        return Math.abs(y - targetY);
      })
      .toBeLessThanOrEqual(150);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // Jump to user bookmark with Shift+KeyN
    await page.keyboard.press('Shift+KeyN');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(1300);
  });

  test('continuous vertical-rl mobile bookmarking works properly', async ({ page }) => {
    await seedReaderBook(page, BOOK_WITH_PICTURES, {
      viewMode: 'continuous',
      writingMode: 'vertical-rl'
    });

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Scroll to Prologue P1 and scroll slightly into it
    await page.evaluate(() => {
      const p1 = document.getElementById('p-prologue-1')!;
      p1.scrollIntoView();
      window.scrollBy(-20, 0);
    });
    await page.waitForTimeout(500);

    // Set fast bookmark
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    const bookmarkRecord = await page.evaluate(async () => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open('books');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('bookmark', 'readonly');
          const getReq = tx.objectStore('bookmark').get(1);
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(bookmarkRecord.exploredCharCount).toBeGreaterThanOrEqual(65);
    expect(bookmarkRecord.progress).toBeGreaterThan(0);

    // Open create bookmark dialog and verify label
    await page.keyboard.press('Shift+KeyB');
    await page.waitForTimeout(300);
    const labelInput = page.locator('#bookmark-label');
    await expect(labelInput).toBeVisible();
    const labelValue = await labelInput.inputValue();
    expect(labelValue).toContain('プロローグ');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(300);
  });

  test('continuous vertical-rl resumes at latest bookmark/autosave when reopened', async ({
    page
  }) => {
    await seedReaderBook(page, BOOK_WITH_PICTURES, {
      viewMode: 'continuous',
      writingMode: 'vertical-rl'
    });

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Scroll to Prologue P1 and scroll into it
    await page.evaluate(() => {
      const p1 = document.getElementById('p-prologue-1')!;
      p1.scrollIntoView();
      window.scrollBy(-20, 0);
    });
    await page.waitForTimeout(500);

    // Set fast bookmark
    await page.keyboard.press('b');
    await page.waitForTimeout(500);

    const initialScrollX = await page.evaluate(() => window.scrollX);
    expect(initialScrollX).toBeLessThan(0);

    // Navigate away to /manage and reopen the book
    await page.goto('/manage');
    await page.waitForTimeout(500);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await page.waitForTimeout(1000);

    const resumedScrollX = await page.evaluate(() => window.scrollX);
    expect(resumedScrollX).toBeLessThan(0);
    expect(Math.abs(resumedScrollX - initialScrollX)).toBeLessThanOrEqual(50);
  });
});
