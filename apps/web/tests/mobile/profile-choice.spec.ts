/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) tests for the first-run profile choice modal.
 * Runs in the `mobile` project only (see playwright.config.ts).
 * The modal mounts ONLY on the landing route `/`, so manage/settings specs
 * that navigate directly to their routes are unaffected.
 */

import { expect, test } from '@playwright/test';
import {
  expectDialogFitsViewport,
  expectFooterActionVisible,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

test.describe('Mobile: first-run profile choice', () => {
  test('non-desktop visitor picks Mobile, stays chosen after reload', async ({ page }) => {
    await page.goto('/');

    const modal = page.getByTestId('profile-choice-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Pixel 9 UA is not E-Ink, so Mobile is preselected.
    const mobileCard = page.getByTestId('profile-choice-mobile');
    const ereaderCard = page.getByTestId('profile-choice-ereader');
    await expect(mobileCard).toHaveAttribute('aria-checked', 'true');
    await expect(ereaderCard).toHaveAttribute('aria-checked', 'false');

    // Cards toggle selection and stay a radio group.
    await ereaderCard.tap();
    await expect(ereaderCard).toHaveAttribute('aria-checked', 'true');
    await expect(mobileCard).toHaveAttribute('aria-checked', 'false');
    await mobileCard.tap();
    await expect(mobileCard).toHaveAttribute('aria-checked', 'true');

    // Modal fits the viewport and the footer Confirm is actionable.
    await expectDialogFitsViewport(modal);
    await expectNoHorizontalOverflow(page);
    await expectFooterActionVisible(page, 'Confirm');

    await page.getByTestId('profile-choice-confirm').tap();

    // Choice applied, dismissal persisted, landing redirect resumes.
    await expect(page).toHaveURL(/\/manage/, { timeout: 10000 });
    await expect(modal).toHaveCount(0);
    const stored = await page.evaluate(() => ({
      active: localStorage.getItem('activeProfileId'),
      seen: localStorage.getItem('profileChoiceSeen')
    }));
    expect(stored.active).toBe('default-mobile');
    expect(stored.seen).toBe('1');

    // The modal never reappears for this user.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('profile-choice-modal')).toHaveCount(0);
  });

  test('skip keeps Desktop and dismisses permanently', async ({ page }) => {
    await page.goto('/');
    const modal = page.getByTestId('profile-choice-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    await page.getByTestId('profile-choice-skip').tap();

    await expect(page).toHaveURL(/\/manage/, { timeout: 10000 });
    await expect(modal).toHaveCount(0);
    const stored = await page.evaluate(() => ({
      active: localStorage.getItem('activeProfileId'),
      seen: localStorage.getItem('profileChoiceSeen')
    }));
    expect(stored.seen).toBe('1');
    expect(stored.active).not.toBe('default-mobile');
    expect(stored.active).not.toBe('default-ereader');
  });

  test.describe('e-ink user agent preselects E-Reader', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (X11; U; Linux armv7l like Android; en-US) AppleWebKit/531.2+ (KHTML, like Gecko) Version/5.0 Safari/533.2+ Kindle/3.0+'
    });

    test('ereader card preselected and confirmable', async ({ page }) => {
      await page.goto('/');
      const modal = page.getByTestId('profile-choice-modal');
      await expect(modal).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId('profile-choice-ereader')).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await expect(page.getByTestId('profile-choice-mobile')).toHaveAttribute(
        'aria-checked',
        'false'
      );

      await expectDialogFitsViewport(modal);
      await page.getByTestId('profile-choice-confirm').tap();

      await expect(page).toHaveURL(/\/manage/, { timeout: 10000 });
      const active = await page.evaluate(() => localStorage.getItem('activeProfileId'));
      expect(active).toBe('default-ereader');
    });
  });
});
