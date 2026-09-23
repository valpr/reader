/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Entry } from '@zip.js/zip.js';
import { Subject } from 'rxjs';
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
