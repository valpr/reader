/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { StorageDataType } from '$lib/data/storage/storage-types';

const SYNC_RUNS_STORAGE_KEY = 'syncRuns';
const MAX_SYNC_RUNS = 50;

export interface SyncRun {
  startedAt: number;
  durationMs: number;
  target: string;
  attemptedTypes: StorageDataType[];
  error?: string;
}

/**
 * Keep a small, device-local history so a report can identify the failed
 * transfer without adding sync state to the data being replicated.
 */
export function recordSyncRun(run: SyncRun): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const runs = getSyncRuns();
    runs.unshift(run);
    localStorage.setItem(SYNC_RUNS_STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_SYNC_RUNS)));
  } catch {
    // Diagnostics must never make a sync fail (private mode/storage quotas).
  }
}

export function getSyncRuns(): SyncRun[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_RUNS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isSyncRun) : [];
  } catch {
    return [];
  }
}

function isSyncRun(value: unknown): value is SyncRun {
  if (!value || typeof value !== 'object') return false;

  const run = value as Partial<SyncRun>;
  return (
    typeof run.startedAt === 'number' &&
    typeof run.durationMs === 'number' &&
    typeof run.target === 'string' &&
    Array.isArray(run.attemptedTypes) &&
    (run.error === undefined || typeof run.error === 'string')
  );
}
