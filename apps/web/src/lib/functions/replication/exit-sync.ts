/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { logger } from '$lib/data/logger';
import type { MergeMode } from '$lib/data/merge-mode';
import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { BrowserStorageHandler } from '$lib/data/storage/handler/browser-handler';
import type { StorageDataType } from '$lib/data/storage/storage-types';
import { BOOK_SCOPED_DATA_TYPES } from '$lib/functions/replication/cloud-sync';
import type { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { replicateData } from '$lib/functions/replication/replicator';
import {
  beginSyncActivity,
  buildSyncLabel,
  endSyncActivity
} from '$lib/functions/replication/replication-progress';

export interface ExitSyncSnapshot {
  types: StorageDataType[];
  context: ReplicationContext;
  localHandler: BrowserStorageHandler;
  externalHandler: BaseStorageHandler;
  storageSourceName: string;
  syncTargetName: string;
  refreshDataList: boolean;
  saveBehavior: ReplicationSaveBehavior;
  statisticsMergeMode: MergeMode;
  readingGoalsMergeMode: MergeMode;
  cacheStorageData: boolean;
}

let activeExitSyncPromise: Promise<void> | undefined;

export function isExitSyncActive(): boolean {
  return !!activeExitSyncPromise;
}

export async function waitForExitSync(timeoutMs = 15000): Promise<void> {
  if (!activeExitSyncPromise) return;
  try {
    await Promise.race([
      activeExitSyncPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch {
    // Errors are logged during replication execution
  }
}

export function triggerExitSync(snapshot: ExitSyncSnapshot): Promise<void> {
  const previous = activeExitSyncPromise || Promise.resolve();
  const currentPromise = previous
    .catch(() => {})
    .then(() => runExitSync(snapshot))
    .finally(() => {
      if (activeExitSyncPromise === currentPromise) {
        activeExitSyncPromise = undefined;
      }
    });

  activeExitSyncPromise = currentPromise;
  return currentPromise;
}

async function runExitSync(snapshot: ExitSyncSnapshot): Promise<void> {
  // Silent by design: no backdrop, no modal. Failures surface via the
  // global CloudSyncStatus banner / reconnect flow, never as a blocker.
  if (typeof window === 'undefined') {
    return;
  }

  const win = window;

  snapshot.externalHandler.updateSettings(
    win,
    false,
    snapshot.saveBehavior,
    snapshot.statisticsMergeMode,
    snapshot.readingGoalsMergeMode,
    snapshot.cacheStorageData,
    false,
    snapshot.storageSourceName
  );

  try {
    const types =
      snapshot.storageSourceName === snapshot.syncTargetName
        ? snapshot.types
        : snapshot.types.filter((d) => BOOK_SCOPED_DATA_TYPES.includes(d));

    if (!types.length) {
      return;
    }

    // Parent activity owns the spinner so the header icon survives the
    // navigation that triggered this post-exit run; inner replicateData
    // acts as a child and never clears it early.
    const runId = beginSyncActivity(buildSyncLabel('Uploading', types, snapshot.context?.title));
    try {
      const error = await replicateData(
        snapshot.localHandler,
        snapshot.externalHandler,
        snapshot.refreshDataList,
        [snapshot.context],
        types
      ).catch((err: any) => err?.message || String(err));

      if (error) {
        logger.warn(error);
      }
    } finally {
      endSyncActivity(runId);
    }
  } catch (error: any) {
    logger.warn(error?.message || String(error));
  } finally {
    snapshot.externalHandler.updateSettings(
      win,
      true,
      snapshot.saveBehavior,
      snapshot.statisticsMergeMode,
      snapshot.readingGoalsMergeMode,
      snapshot.cacheStorageData,
      false,
      snapshot.storageSourceName
    );
  }
}
