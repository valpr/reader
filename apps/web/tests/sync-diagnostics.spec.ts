/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Sync diagnostics', () => {
  test('keeps a bounded local history and ignores malformed stored entries', async ({ page }) => {
    await page.goto('/');

    const runs = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/replication/sync-diagnostics.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);
      localStorage.setItem(
        'syncRuns',
        JSON.stringify([
          { startedAt: 'bad' },
          { startedAt: 1, durationMs: 2, target: 'old', attemptedTypes: [] }
        ])
      );

      for (let index = 0; index < 55; index += 1) {
        diagnostics.recordSyncRun({
          startedAt: index,
          durationMs: index + 1,
          target: 'test-target',
          attemptedTypes: []
        });
      }

      return diagnostics.getSyncRuns();
    });

    expect(runs).toHaveLength(50);
    expect(runs[0]).toMatchObject({ startedAt: 54, target: 'test-target' });
    expect(runs.at(-1)).toMatchObject({ startedAt: 5, target: 'test-target' });
  });
});
