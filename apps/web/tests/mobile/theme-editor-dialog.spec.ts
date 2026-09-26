/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the reader palette theme editor dialog.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test, type Page } from '@playwright/test';
import {
  expectDialogFitsViewport,
  expectFooterActionVisible,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

async function openThemeEditor(page: Page) {
  await page.goto('/settings/reader/appearance');
  await page.waitForLoadState('networkidle');

  const newThemeButton = page.getByRole('button', { name: 'Create new custom theme' });
  await expect(newThemeButton).toBeVisible({ timeout: 10000 });
  await newThemeButton.tap();

  const dialog = page.getByTestId('theme-editor-dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

test.describe('Mobile: theme editor dialog', () => {
  for (const width of [412, 360]) {
    test(`create-theme dialog fits at ${width}px, footer reachable via tap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 915 });
      const dialog = await openThemeEditor(page);

      await expectDialogFitsViewport(dialog);
      await expectNoHorizontalOverflow(page);

      // Clearly labelled sections and Astryx controls are present.
      await expect(dialog.getByText('1. Start from an existing palette')).toBeVisible();
      await expect(dialog.getByText('2. Customize colors')).toBeVisible();
      await expect(dialog.getByText('3. Name & preview')).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Copy colors/ })).toBeVisible();
      await expect(dialog.getByText('Body copy rendered in the reading view')).toBeVisible();

      // Sticky dialog footer: the primary action stays pinned in the
      // viewport while the color list scrolls, and is directly tappable.
      const createButton = page.getByRole('button', { name: 'Create theme' });
      await expectFooterActionVisible(page, 'Create theme');
      await expect(createButton).toBeInViewport();
      await createButton.tap();

      // Empty name blocks save with an inline error instead of closing.
      await expect(dialog.getByText('Enter a name for this theme.')).toBeVisible();
      await expect(dialog).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('long unbroken theme name stays contained at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 915 });
    const dialog = await openThemeEditor(page);

    const longName = `Supercalifragilisticexpialidocious${'A'.repeat(40)}Theme`;
    await page.getByLabel('Theme name').fill(longName);
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);
    const overflow = await dialog.evaluate((el) => {
      const dialogRect = el.getBoundingClientRect();
      const descendants = Array.from(el.querySelectorAll('*'));
      return descendants
        .map((child) => {
          const rect = (child as HTMLElement).getBoundingClientRect();
          // Skip zero-area boxes (hidden options, slider internals, svg defs).
          if (rect.width === 0 || rect.height === 0) {
            return null;
          }
          const overflows = rect.right > dialogRect.right + 1 || rect.left < dialogRect.left - 1;
          return overflows
            ? {
                overflows,
                right: rect.right,
                left: rect.left,
                dialogRight: dialogRect.right,
                dialogLeft: dialogRect.left,
                tag: (child as HTMLElement).tagName,
                text: (child as HTMLElement).innerText?.slice(0, 60) ?? ''
              }
            : null;
        })
        .filter((entry) => entry !== null);
    });
    expect(overflow, 'dialog descendant spills past the dialog surface').toEqual([]);

    await expectFooterActionVisible(page, 'Create theme');
  });
});
