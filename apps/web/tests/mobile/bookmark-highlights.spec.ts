/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from '../fixtures/book-fixture';
import {
  expectDialogFitsViewport,
  expectFooterActionVisible,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

test.describe('Mobile bookmark text highlighting', () => {
  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, {}, { viewMode: 'paginated', writingMode: 'horizontal-tb' });
  });

  test('floating selection pill appears in thumb zone on selection, fits viewport at 412px and 360px', async ({
    page
  }) => {
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await expect(page.locator('.book-content p').first()).toBeVisible();

    // Select text within first paragraph
    await page.evaluate(() => {
      const p = document.querySelector('.book-content p');
      if (!p || !p.firstChild) throw new Error('Paragraph missing');
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 7); // '吾輩は猫である'
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    // Check that floating selection pill appears
    const pill = page.locator('[data-testid="bookmark-selection-pill"]');
    await expect(pill).toBeVisible();

    // Verify touch target is at least 44px
    const pillButton = pill.locator('button');
    const box = await pillButton.boundingBox();
    expect(box, 'pill button has no bounding box').not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    // Verify pill is situated in thumb zone (near bottom)
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeGreaterThan(viewport!.height - 100);

    // Check no horizontal overflow at 412px
    await expectNoHorizontalOverflow(page);

    // Check at narrow 360px viewport
    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);

    // Reset viewport
    await page.setViewportSize({ width: 412, height: 915 });

    // Tap the pill to open BookmarkCreateDialog
    await pillButton.tap();

    const dialog = page.locator('[data-app-dialog]');
    await expect(dialog).toBeVisible();
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);

    // Verify checkbox is checked by default
    const checkbox = dialog.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();

    // Verify footer action is visible and tappable
    await expectFooterActionVisible(page, 'Save');

    // Tap Save
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(dialog).toBeHidden();

    // Verify highlight mark was injected into text
    const mark = page.locator('mark[data-ttu-highlight]');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText('吾輩は猫である');

    // Verify pill disappeared after bookmark creation
    await expect(pill).toBeHidden();
  });

  test('dialog containment with long unbroken title and text at 360px', async ({ page }) => {
    // Seed book with long unbroken title (40+ chars)
    const longUnbrokenTitle =
      'SupercalifragilisticexpialidociousUnbreakableSuperLongBookTitleText1234567890';
    await seedReaderBook(
      page,
      { title: longUnbrokenTitle },
      { viewMode: 'paginated', writingMode: 'horizontal-tb' }
    );

    // Set narrow 360px viewport
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible();
    await expect(page.locator('.book-content p').first()).toBeVisible();

    // Select text to trigger highlight dialog
    await page.evaluate(() => {
      const p = document.querySelector('.book-content p');
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 10);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });

    const pill = page.locator('[data-testid="bookmark-selection-pill"] button');
    await expect(pill).toBeVisible();
    await pill.tap();

    const dialog = page.locator('[data-app-dialog]');
    await expect(dialog).toBeVisible();
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);

    // Confirm that no descendant overflows dialog surface
    const isContained = await page.evaluate(() => {
      const dialogEl = document.querySelector('[data-app-dialog]');
      if (!dialogEl) return false;
      const dialogRect = dialogEl.getBoundingClientRect();
      const allDescendants = dialogEl.querySelectorAll('*');
      for (const el of allDescendants) {
        const r = el.getBoundingClientRect();
        // Allow slight subpixel leeway of 2px
        if (r.right > dialogRect.right + 2 || r.left < dialogRect.left - 2) {
          return false;
        }
      }
      return true;
    });
    expect(isContained, 'Descendant element overflows dialog').toBe(true);

    await page.getByRole('button', { name: 'Cancel' }).tap();
    await expect(dialog).toBeHidden();
  });
});
