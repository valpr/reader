/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) regression tests for the Data-tab Sync Recovery section
 * (M4): the section and its confirm dialog must fit narrow viewports with
 * tappable actions. Runs in the `mobile` project only.
 */

import { expect, test } from '@playwright/test';
import { expectDialogFitsViewport, expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

for (const width of [412, 360]) {
  test(`sync recovery fits and confirms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'ttu-gdrive-default');
    });
    await page.goto('/settings/data');
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');

    const section = page.getByText('Sync Recovery');
    await expect(section).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const push = page.getByRole('button', { name: 'Push…' }).first();
    const pull = page.getByRole('button', { name: 'Pull…' }).first();
    await expect(push).toBeVisible();
    await expect(pull).toBeVisible();
    await expect(push).toBeEnabled();
    await expect(pull).toBeEnabled();
    await expectNoHorizontalOverflow(page);

    await pull.tap();
    await expect(page.getByText('Erase this device and copy from cloud?')).toBeVisible();
    const dialog = page.locator('section', { hasText: 'Erase this device and copy from cloud?' });
    await expectDialogFitsViewport(dialog);
    await expect(dialog.getByText(/permanently lost/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Erase this device' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();
    // Cancel is the safe path on mobile: no network, dialog dismisses.
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();
    await expect(cancel).toBeEnabled();
    await cancel.tap();
    await expect(page.getByText('Erase this device and copy from cloud?')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // The clone-hold escape hatch lives in the same section and its confirm
    // dialog (long unbreakable strings in the held-sync wording) must fit too.
    const adopt = page.getByRole('button', { name: 'Adopt…' }).first();
    await expect(adopt).toBeVisible();
    await expect(adopt).toBeEnabled();
    await adopt.tap();
    await expect(page.getByText('Adopt a fresh device identity?')).toBeVisible();
    const adoptDialog = page.locator('section', {
      hasText: 'Adopt a fresh device identity?'
    });
    await expectDialogFitsViewport(adoptDialog);
    await expect(adoptDialog.getByText(/publishing is held/)).toBeVisible();
    const adoptConfirm = adoptDialog.getByRole('button', { name: 'Adopt fresh identity' });
    await expect(adoptConfirm).toBeVisible();
    await expect(adoptConfirm).toBeEnabled();
    const adoptCancel = adoptDialog.getByRole('button', { name: 'Cancel' });
    await expect(adoptCancel).toBeVisible();
    await expect(adoptCancel).toBeEnabled();
    await adoptCancel.tap();
    await expect(page.getByText('Adopt a fresh device identity?')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}
