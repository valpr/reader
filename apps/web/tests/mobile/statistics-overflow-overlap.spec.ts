/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) regression tests: an open dropdown's options must win
 * over controls rendered underneath them.
 *
 * Repro: on the statistics Summary tab the header "More Actions" overflow
 * menu drops down over the date stepper's date picker. Tapping a menu
 * option that covers the date picker used to hit the invisible native date
 * input overlay (absolute inset-0 opacity-0 z-10) instead, because the
 * Popover panel was trapped behind ancestor stacking contexts
 * (overflow-hidden header wrapper, translucent TopBar backdrop-filter) at
 * the same z-index. The overlap geometry only occurs where the menu is
 * tall enough to reach the date pill (360px), so the tap-steal assertion
 * runs there; at 412px we still cover the portaled panel basics.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

function formatDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

test.describe('Mobile (Pixel 9): dropdown options win over controls below', () => {
  const now = new Date();
  const todayKey = formatDateKey(now);

  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, { title: 'Overlap Test Book', characters: 60000 });
    await seedStatistics(page, [
      {
        title: 'Overlap Test Book',
        dateKey: todayKey,
        charactersRead: 5000,
        readingTime: 1500,
        minReadingSpeed: 12000,
        altMinReadingSpeed: 12000,
        lastReadingSpeed: 12000,
        maxReadingSpeed: 12000,
        lastStatisticModified: Date.now()
      }
    ]);
  });

  async function openSummaryOverflow(page: Page) {
    // Open the book first so the header has a currentBookId (forces the
    // overflow menu to exist at both widths).
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 10000 });

    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    // Switch to the Summary tab so the date stepper renders below the header.
    await page.getByRole('radio', { name: 'Summary' }).tap();
    await expect(page.getByTestId('summary-date-stepper')).toBeVisible();

    await page.locator('button[aria-label="More Actions"]').tap();
    // Floating panel (portaled to <body>); the trigger wrapper also
    // carries data-popover but always has the flex layout class.
    const panel = page.locator('div[data-popover]:not(.flex)');
    await expect(panel).toBeVisible();
    return panel;
  }

  test('option covering the date picker activates at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 915 });
    const panel = await openSummaryOverflow(page);

    const dateInput = page.locator('#summaryDatePicker');
    await expect(dateInput).toBeAttached();
    const dateBox = await dateInput.boundingBox();
    expect(dateBox, 'date picker overlay has no bounding box').not.toBeNull();
    const dateLabel = await page.getByTestId('summary-date-label').textContent();

    // Find the option whose tap target covers the date picker overlay —
    // that is the option the date picker used to steal. Tap the covered
    // point itself (not the option center, which can fall outside the
    // overlay) via touchscreen so hit-testing decides the winner.
    const options = panel.getByRole('button');
    const optionCount = await options.count();
    expect(optionCount, 'overflow menu has no options').toBeGreaterThan(0);

    let tapPoint: { x: number; y: number } | null = null;
    for (let index = 0; index < optionCount; index += 1) {
      const option = options.nth(index);
      const box = await option.boundingBox();
      if (!box) continue;
      const intersectX = Math.max(box.x, dateBox!.x);
      const intersectY = Math.max(box.y, dateBox!.y);
      const intersectRight = Math.min(box.x + box.width, dateBox!.x + dateBox!.width);
      const intersectBottom = Math.min(box.y + box.height, dateBox!.y + dateBox!.height);
      if (intersectRight > intersectX && intersectBottom > intersectY) {
        tapPoint = {
          x: intersectX + (intersectRight - intersectX) / 2,
          y: intersectY + (intersectBottom - intersectY) / 2
        };
        break;
      }
    }
    expect(tapPoint, 'no overflow option covers the date picker').not.toBeNull();

    await page.touchscreen.tap(tapPoint!.x, tapPoint!.y);

    // The option won: either the data-controls drawer opens (data
    // actions / filtering options) or the page navigates (Back to
    // Current Book / Settings / Manager). If the date picker stole the
    // tap, neither happens and we stay on /statistics with no drawer.
    const drawer = page.getByTestId('statistics-data-controls');
    await expect
      .poll(
        async () => ((await drawer.count()) > 0 ? 'drawer' : page.url()),
        'tapped option had no effect (date picker may have stolen the tap)'
      )
      .not.toMatch(/\/statistics$/);

    if ((await drawer.count()) > 0) {
      // Still on the page: the date picker must not have stolen focus
      // and the day must not have changed.
      await expect(dateInput).not.toBeFocused();
      await expect(page.getByTestId('summary-date-label')).toHaveText(dateLabel ?? '');
    }
    // Navigated away: the option action ran, so the tap reached the menu.

    await expectNoHorizontalOverflow(page);
  });

  test('overflow panel fits viewport and options work at 412px', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const panel = await openSummaryOverflow(page);

    const box = await panel.boundingBox();
    expect(box, 'overflow panel has no bounding box').not.toBeNull();
    const viewport = page.viewportSize();
    expect(box!.x, 'panel extends past the left edge').toBeGreaterThanOrEqual(-1);
    expect(
      box!.x + box!.width,
      'panel is clipped past the right edge of the viewport'
    ).toBeLessThanOrEqual(viewport!.width + 1);

    // Tapping the first option must run its action (drawer or navigation),
    // proving the portaled panel receives taps at this width too.
    await panel.getByRole('button').first().tap();
    const drawer = page.getByTestId('statistics-data-controls');
    await expect
      .poll(async () => ((await drawer.count()) > 0 ? 'drawer' : page.url()))
      .not.toMatch(/\/statistics$/);

    await expectNoHorizontalOverflow(page);
  });
});
