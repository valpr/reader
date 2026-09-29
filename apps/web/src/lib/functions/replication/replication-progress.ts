/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Entry } from '@zip.js/zip.js';
import { filter, firstValueFrom, Subject, timeout } from 'rxjs';
import { writableSubject } from '$lib/functions/svelte/store';
import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';

export interface ReplicationContext {
  title: string;
  id?: number;
  imagePath?: string | Blob | Entry;
}

export interface ReplicationProgress {
  progressToAdd?: number;
  progressBase?: number;
  maxProgress?: number;
  skipStep?: boolean;
  completeStep?: boolean;
}

export interface ReplicationDeleteResult {
  error: string;
  deleted: number[];
}

export const replicationProgress$ = new Subject<ReplicationProgress>();
export const executeReplicate$ = new Subject<void>();

/**
 * Read-ready state for prioritized sync.
 *
 * Phase 1 of a cloud sync downloads reading position + manual bookmarks for
 * currently-reading books first (see `sync-priority.ts`). That payload is
 * what the reader needs before starting to read, so its completion flips
 * `phase` to `'ready'` — explicitly *not* full-sync completion. The deferred
 * upload and the remaining data types still run in phase 2 immediately
 * after; `markLastSync` still only fires when everything is done.
 *
 * `readyTitles` persist until the next priority phase begins so library
 * cards can keep their badge across views. They describe the last completed
 * download, never an upload acknowledgement.
 */
export type ReadReadyPhase = 'idle' | 'priority-syncing' | 'ready';

export interface ReadReadyState {
  phase: ReadReadyPhase;
  /** Priority titles still waiting for their phase-1 download. */
  pendingTitles: string[];
  /** Priority titles whose phase-1 download completed. */
  readyTitles: string[];
  total: number;
  completed: number;
}

const idleReadReady: ReadReadyState = {
  phase: 'idle',
  pendingTitles: [],
  readyTitles: [],
  total: 0,
  completed: 0
};

export const readReady$ = writableSubject<ReadReadyState>(idleReadReady);

export function beginPriorityPhase(titles: string[]): void {
  readReady$.next({
    phase: 'priority-syncing',
    pendingTitles: [...titles],
    readyTitles: [],
    total: titles.length,
    completed: 0
  });
}

export function markPriorityBookComplete(title: string): void {
  const current = readReady$.getValue();
  if (current.phase !== 'priority-syncing') return;
  if (!current.pendingTitles.includes(title)) return;
  readReady$.next({
    ...current,
    pendingTitles: current.pendingTitles.filter((t) => t !== title),
    readyTitles: [...current.readyTitles, title],
    completed: current.completed + 1
  });
}

export function markPriorityReady(): void {
  const current = readReady$.getValue();
  if (current.phase !== 'priority-syncing') return;
  readReady$.next({
    phase: 'ready',
    pendingTitles: [],
    readyTitles: current.readyTitles,
    total: current.total,
    completed: current.completed
  });
}

export function resetReadReady(): void {
  readReady$.next(idleReadReady);
}

/**
 * Whether a title has completed its phase-1 reading-state download and is
 * safe to open immediately without blocking on cloud sync.
 */
export function isTitleReadReady(title: string): boolean {
  if (!title) return false;
  return readReady$.getValue().readyTitles.includes(title);
}

/**
 * Await phase-1 priority download completion for a title currently in progress.
 * Resolves true if the title is/becomes ready, or false if it was not priority,
 * timed out, or priority sync aborted.
 */
export async function waitForPriorityBookReady(title: string, timeoutMs = 8000): Promise<boolean> {
  if (!title) return false;
  const current = readReady$.getValue();
  if (current.readyTitles.includes(title)) return true;
  if (!current.pendingTitles.includes(title)) return false;

  try {
    const ready = await firstValueFrom(
      readReady$.pipe(
        filter((state) => state.readyTitles.includes(title) || state.phase !== 'priority-syncing'),
        timeout({ each: timeoutMs })
      )
    );
    return ready.readyTitles.includes(title);
  } catch {
    return readReady$.getValue().readyTitles.includes(title);
  }
}

/**
 * A reading position observed on the download path, reported before
 * last-write-wins is applied. An incoming record can be further ahead in
 * position yet older in timestamp (late sync, clock skew) and lose the
 * merge silently — the local bookmark then never reflects genuinely
 * further reading. The reader uses these sightings (plus synced manual
 * bookmarks) to offer a jump without ever changing merge outcomes.
 */
export interface SeenProgress {
  title: string;
  exploredCharCount: number;
  progress?: number;
  lastBookmarkModified?: number;
}

export const progressSeen$ = new Subject<SeenProgress>();

export interface SyncActivity {
  active: boolean;
  runId: number;
  label: string;
  detail?: string;
  completed?: number;
  total?: number;
}

const idleSyncActivity: SyncActivity = { active: false, runId: 0, label: '' };

export const syncActivity$ = writableSubject<SyncActivity>(idleSyncActivity);

let syncActivityRunId = 0;

export function beginSyncActivity(
  label: string,
  detail?: string,
  total?: number,
  completed?: number
): number {
  syncActivityRunId += 1;
  syncActivity$.next({
    active: true,
    runId: syncActivityRunId,
    label,
    detail,
    total,
    completed
  });
  return syncActivityRunId;
}

export function updateSyncActivity(
  runId: number,
  patch: Partial<Omit<SyncActivity, 'active' | 'runId'>>
): void {
  const current = syncActivity$.getValue();
  if (!current.active || current.runId !== runId) return;
  syncActivity$.next({ ...current, ...patch });
}

export function endSyncActivity(runId: number): void {
  const current = syncActivity$.getValue();
  if (!current.active || current.runId !== runId) return;
  syncActivity$.next(idleSyncActivity);
}

const syncTypeLabels: Record<StorageDataType, string> = {
  [StorageDataType.DATA]: 'Book',
  [StorageDataType.PROGRESS]: 'Progress',
  [StorageDataType.STATISTICS]: 'Statistics',
  [StorageDataType.READING_GOALS]: 'Reading goals',
  [StorageDataType.AUDIOBOOK]: 'Audiobook',
  [StorageDataType.SUBTITLE]: 'Subtitles',
  [StorageDataType.USER_BOOKMARKS]: 'Bookmarks',
  [StorageDataType.PROFILES]: 'Profiles',
  [StorageDataType.BOOK_TAGS]: 'Tags'
};

export function friendlySyncTypeNames(types: StorageDataType[]): string {
  const names: string[] = [];
  for (const type of types) {
    const label = syncTypeLabels[type];
    if (label && !names.includes(label)) names.push(label);
  }
  return names.join(', ');
}

export function syncVerbForHandlers(sourceType?: string, targetType?: string): string {
  if (sourceType === StorageKey.BACKUP || targetType === StorageKey.BACKUP) {
    return sourceType === StorageKey.BACKUP ? 'Restoring' : 'Exporting';
  }
  if (sourceType === StorageKey.BROWSER && targetType && targetType !== StorageKey.BROWSER) {
    return 'Uploading';
  }
  if (targetType === StorageKey.BROWSER && sourceType && sourceType !== StorageKey.BROWSER) {
    return 'Downloading';
  }
  return 'Syncing';
}

export function buildSyncLabel(
  verb: string,
  types: StorageDataType[],
  title?: string,
  completed?: number,
  total?: number
): string {
  const typeNames = friendlySyncTypeNames(types);
  const countSuffix =
    total !== undefined && total > 1 && completed !== undefined
      ? ` (${Math.min(completed + 1, total)}/${total})`
      : '';
  const titlePart = title ? ` — \u201C${title}\u201D${countSuffix}` : '';
  return typeNames ? `${verb} ${typeNames}${titlePart}` : `${verb}${titlePart}`;
}
