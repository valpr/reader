/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { LimitFunction } from 'p-limit';
import { logger } from '$lib/data/logger';
import { replicationProgress$ } from '$lib/functions/replication/replication-progress';

/**
 * A provider rejected a conditional write (HTTP 412): the file changed
 * between our read and our write. Callers re-fetch, re-merge, and retry a
 * bounded number of times — never silently overwrite.
 */
export class ConflictError extends Error {
  name = 'ConflictError';
  status = 412;
}

export function isConflictError(error: unknown): error is ConflictError {
  return !!error && typeof error === 'object' && (error as ConflictError).name === 'ConflictError';
}

/**
 * A second writer is publishing under our own deviceId (cloned identity or a
 * restored backup syncing beside its source). Publishing is held — never a
 * silent overwrite — until the device adopts a fresh identity.
 */
export class CloneSuspectError extends Error {
  name = 'CloneSuspectError';
}

export function isCloneSuspectError(error: unknown): error is CloneSuspectError {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as CloneSuspectError).name === 'CloneSuspectError'
  );
}

/**
 * Network-level failure with no HTTP response (XHR `status 0`, `Failed to
 * fetch`, `NetworkError`, offline). Covers every cloud data type because all
 * API traffic funnels through `ApiStorageHandler.request()` — profiles,
 * goals, tags, books, statistics, and listings all surface here.
 */
export const NETWORK_UNREACHABLE_MESSAGE =
  'Network unreachable — your local progress is safe and will sync when you reconnect.';

export function isNetworkUnreachableError(error: unknown): boolean {
  if (!error) return false;
  const status =
    typeof error === 'object' && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 0) return true;
  const message = error instanceof Error ? error.message : `${error ?? ''}`;
  return /received status 0\b|network unreachable|failed to fetch|fetch failed|networkerror|load failed|offline|network request failed/i.test(
    message
  );
}

/** Bounded retry for read-modify-write cycles: re-runs the whole attempt
 * (which re-fetches and re-merges) on conflict, then surfaces a visible
 * error instead of losing data silently. */
export async function withConflictRetry<T>(
  label: string,
  attempt: (attemptNumber: number) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    try {
      return await attempt(attemptNumber);
    } catch (error: unknown) {
      lastError = error;
      if (!isConflictError(error) || attemptNumber >= maxAttempts) {
        throw error;
      }
      logger.warn(`${label} conflicted (attempt ${attemptNumber}/${maxAttempts}); retrying`);
    }
  }

  throw lastError;
}

export function handleErrorDuringReplication(
  error: any,
  baseError = '',
  limiters?: LimitFunction[],
  currentProgressBase?: number
) {
  if (error.name !== 'AbortError') {
    logger.error(`${baseError}${error.message}`);
  }

  if (error.name === 'AbortError') {
    if (limiters) {
      for (let index = 0, { length } = limiters; index < length; index += 1) {
        limiters[index].clearQueue();
      }
    }

    throw error;
  }

  if (currentProgressBase !== undefined) {
    replicationProgress$.next({ progressBase: currentProgressBase, skipStep: true });
  } else {
    replicationProgress$.next({ skipStep: true });
  }

  return `${baseError}${error.message}`;
}

export async function convertAuthErrorResponse(
  response: Response | XMLHttpRequest
): Promise<string> {
  const isXHR = response instanceof XMLHttpRequest;

  if (response.status === 0) {
    return NETWORK_UNREACHABLE_MESSAGE;
  }

  let error = `Received Status ${response.status} `;

  try {
    const headers = isXHR
      ? response.getResponseHeader('Content-Type')
      : response.headers.get('Content-Type');

    if (headers?.includes('application/json')) {
      const jsonResponse = isXHR ? response.response : await response.json();

      error =
        jsonResponse.error_description ||
        jsonResponse.error?.message ||
        jsonResponse.error ||
        error;
    } else {
      const text = isXHR ? response.responseText : await response.text();
      error = text?.trim() ? text : error;
    }
  } catch (_) {
    // no-op
  }

  if (!error?.trim() || /received status 0\b/i.test(error)) {
    return NETWORK_UNREACHABLE_MESSAGE;
  }

  return error;
}
