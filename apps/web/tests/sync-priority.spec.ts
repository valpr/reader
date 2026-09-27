/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Sync priority (read-ready)', () => {
  test('currently-reading books rank first, finished/unread/stale defer', async ({ page }) => {
    // The landing route auto-navigates to the library; load it directly so
    // the execution context stays stable for page.evaluate.
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const priorityPath = '/src/lib/functions/replication/sync-priority.ts';
      const mod = await import(/* @vite-ignore */ priorityPath);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const contexts = [
        { title: 'finished', progress: 1, lastBookOpen: now - 1 * day },
        { title: 'unread', progress: 0, lastBookOpen: now - 1 * day },
        { title: 'stale', progress: 0.5, lastBookOpen: now - 40 * day },
        { title: 'older', progress: 0.3, lastBookOpen: now - 5 * day },
        { title: 'newest', progress: 0.7, lastBookOpen: now - 1 * day },
        // Legacy percent progress rescales into the in-progress window.
        { title: 'legacy', progress: 50, lastBookOpen: now - 2 * day }
      ];
      const { priority, deferred } = mod.splitSyncContexts(contexts, now);
      return {
        priority: priority.map((c: { title: string }) => c.title),
        deferred: deferred.map((c: { title: string }) => c.title)
      };
    });

    expect(result.priority).toEqual(['newest', 'legacy', 'older']);
    expect(result.deferred).toEqual(['finished', 'unread', 'stale']);
  });

  test('read-ready store tracks phase-1 download progress', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      const log: string[] = [];
      mod.beginPriorityPhase(['a', 'b']);
      log.push(JSON.stringify(mod.readReady$.getValue()));
      // Unknown titles never advance the count.
      mod.markPriorityBookComplete('zzz');
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.markPriorityBookComplete('a');
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.markPriorityBookComplete('b');
      mod.markPriorityReady();
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.resetReadReady();
      log.push(JSON.stringify(mod.readReady$.getValue()));
      return log;
    });

    const [started, ignored, partial, ready, reset] = result.map((s) => JSON.parse(s));
    expect(started.phase).toBe('priority-syncing');
    expect(started.total).toBe(2);
    expect(ignored.completed).toBe(0);
    expect(partial.readyTitles).toEqual(['a']);
    expect(partial.pendingTitles).toEqual(['b']);
    expect(ready.phase).toBe('ready');
    expect(ready.readyTitles).toEqual(['a', 'b']);
    expect(reset.phase).toBe('idle');
  });
});
