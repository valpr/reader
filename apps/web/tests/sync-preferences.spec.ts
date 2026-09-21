/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Sync preferences (M4)', () => {
  test('legacy sync direction migrates to two-way, manual-only stays', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('autoReplication', 'down');
    });
    await page.goto('/settings/data');
    const migrated = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { autoReplication$ } = await import(/* @vite-ignore */ storePath);
      return autoReplication$.getValue();
    });
    expect(migrated).toBe('all');

    await page.addInitScript(() => {
      window.localStorage.setItem('autoReplication', 'off');
    });
    await page.reload();
    const preserved = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { autoReplication$ } = await import(/* @vite-ignore */ storePath);
      return autoReplication$.getValue();
    });
    expect(preserved).toBe('off');
  });

  test('data tab has no persistent direction, overwrite, or merge-mode controls', async ({
    page
  }) => {
    await page.goto('/settings/data');
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');

    await expect(page.getByText('Auto Import/Export Direction')).toHaveCount(0);
    await expect(page.getByText('Import/Export Save Behavior')).toHaveCount(0);
    await expect(page.getByText('Statistics Sync Mode')).toHaveCount(0);
    await expect(page.getByText('Reading Goals Sync Mode')).toHaveCount(0);

    // The recovery actions replace those controls.
    await expect(page.getByText('Sync Recovery')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Push…' }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Pull…' }).first()).toBeDisabled();
  });

  test('recovery actions confirm before running and report the outcome', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'ttu-gdrive-default');
    });
    await page.goto('/settings/data');
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');

    const pull = page.getByRole('button', { name: 'Pull…' }).first();
    await expect(pull).toBeEnabled();
    await pull.click();

    // Confirmation comes first and names the destructive scope.
    await expect(page.getByText('Replace this device from cloud?')).toBeVisible();
    const dialog = page.locator('section', { hasText: 'Replace this device from cloud?' });
    await expect(dialog.getByText(/including deletions/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    // The action runs against the named target and reports back.
    await expect(page.getByText(/Recovery (complete|failed)/)).toBeVisible({ timeout: 30000 });
  });
});
