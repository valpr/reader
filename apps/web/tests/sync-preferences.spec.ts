/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedSyncConfig } from './fixtures/book-fixture';

test.describe('Sync preferences (M4)', () => {
  test('legacy sync direction migrates to two-way, manual-only stays', async ({ page }) => {
    await page.goto('/');
    await seedSyncConfig(page, { autoReplication: 'down' });
    await page.goto('/settings/data');
    const migrated = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { autoReplication$ } = await import(/* @vite-ignore */ storePath);
      return autoReplication$.getValue();
    });
    expect(migrated).toBe('all');

    await page.goto('/');
    await seedSyncConfig(page, { autoReplication: 'off' });
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
    await page.goto('/');
    await seedSyncConfig(page, { syncTarget: 'ttu-gdrive-default' });
    await page.goto('/settings/data');
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');

    const pull = page.getByRole('button', { name: 'Pull…' }).first();
    await expect(pull).toBeEnabled();
    await pull.click();

    // Confirmation comes first and names the destructive scope.
    await expect(page.getByText('Erase this device and copy from cloud?')).toBeVisible();
    const dialog = page.locator('section', {
      hasText: 'Erase this device and copy from cloud?'
    });
    await expect(dialog.getByText(/permanently lost/)).toBeVisible();
    await expect(dialog.getByText(/newest change/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Erase this device' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // The action runs against the named target and reports back.
    await expect(page.getByText(/Recovery (complete|failed)/)).toBeVisible({ timeout: 30000 });
  });

  test('push recovery warns that cloud-only data is deleted', async ({ page }) => {
    await page.goto('/');
    await seedSyncConfig(page, { syncTarget: 'ttu-gdrive-default' });
    await page.goto('/settings/data');
    await expect(page.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');

    const push = page.getByRole('button', { name: 'Push…' }).first();
    await expect(push).toBeEnabled();
    await push.click();

    await expect(page.getByText('Replace the cloud copy with this device?')).toBeVisible();
    const dialog = page.locator('section', {
      hasText: 'Replace the cloud copy with this device?'
    });
    await expect(dialog.getByText(/permanently deleted/)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Replace cloud copy' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Replace the cloud copy with this device?')).toHaveCount(0);
  });
});
