/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

for (const width of [412, 360]) {
  test(`speed trend fits and drills at ${width}px without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });

    const longTitle =
      '本好きの下剋上〜司書になるためには手段を選んでいられません〜AAAAAAAAAA (40+ char unbroken title tail)';
    await seedReaderBook(page, { title: longTitle, characters: 180000 });

    const currentYear = new Date().getFullYear();

    await seedStatistics(page, [
      {
        title: longTitle,
        dateKey: `${currentYear}-02-10`,
        charactersRead: 40000,
        readingTime: 7200,
        minReadingSpeed: 20000,
        altMinReadingSpeed: 20000,
        lastReadingSpeed: 20000,
        maxReadingSpeed: 20000,
        lastStatisticModified: Date.now()
      },
      {
        title: 'Second Mobile Trend Book',
        dateKey: `${currentYear}-03-05`,
        charactersRead: 18000,
        readingTime: 1800,
        minReadingSpeed: 36000,
        altMinReadingSpeed: 36000,
        lastReadingSpeed: 36000,
        maxReadingSpeed: 36000,
        lastStatisticModified: Date.now()
      }
    ]);

    await page.goto('/statistics');
    await expectNoHorizontalOverflow(page);

    const recapTab = page.getByRole('radio', { name: 'Recap' });
    await expect(recapTab).toBeVisible({ timeout: 10000 });
    await recapTab.tap();
    await expect(recapTab).toHaveAttribute('aria-checked', 'true');

    const card = page.getByTestId('speed-trend-card');
    await expect(card).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Long unbroken title in the breakdown must not spill past the card
    const breakdown = page.getByTestId('speed-trend-breakdown');
    await expect(breakdown).toContainText('36,000/hr');
    const cardBox = await card.boundingBox();
    expect(cardBox, 'trend card has no bounding box').not.toBeNull();
    const overflowing = await breakdown.evaluate((el) => {
      const root = el.getBoundingClientRect();
      const descendants = el.querySelectorAll('*');
      const bad: string[] = [];
      descendants.forEach((child) => {
        const box = (child as HTMLElement).getBoundingClientRect();
        if (box.width > 0 && (box.left < root.left - 1 || box.right > root.right + 1)) {
          bad.push((child as HTMLElement).tagName);
        }
      });
      return bad;
    });
    expect(
      overflowing,
      `breakdown descendants overflow the card: ${overflowing.join(',')}`
    ).toEqual([]);
    await expectNoHorizontalOverflow(page);

    // Dot stays tappable, drill button reachable, breadcrumb updates
    const febDot = page.getByTestId(`speed-trend-dot-${currentYear}-02`);
    await febDot.tap();
    await expect(febDot).toHaveAttribute('aria-pressed', 'true');
    await expect(breakdown).toContainText('February');
    await expectNoHorizontalOverflow(page);

    const drill = page.getByTestId('speed-trend-drill');
    await expect(drill).toBeVisible();
    await expect(drill).toBeEnabled();
    await drill.tap();
    await expect(
      page.getByTestId('speed-trend-breadcrumb').getByText('February', { exact: false }).first()
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
