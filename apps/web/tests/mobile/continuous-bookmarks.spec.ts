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
      writingMode: 'horizontal-tb'
    });

    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();

    // Find P1 position and scroll into it
    const p1Pos = await page.evaluate(() => {
      const p1 = document.getElementById('p-prologue-1')!;
      const docEl = document.documentElement;
      const r = p1.getBoundingClientRect();
      const docTop = r.top - docEl.getBoundingClientRect().top;
      return { docTop };
    });

    const targetY = p1Pos.docTop + 20;
    await page.evaluate((y) => window.scrollTo(0, y), targetY);
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

    expect(bookmarkRecord.exploredCharCount).toBe(65);
    expect(bookmarkRecord.progress).toBeGreaterThan(0);
    expect(bookmarkRecord.scrollY).toBe(targetY);

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
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Jump to fast bookmark with 'r'
    await page.keyboard.press('r');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBe(targetY);

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Jump to user bookmark with Shift+KeyN
    await page.keyboard.press('Shift+KeyN');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(1300);
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
});
