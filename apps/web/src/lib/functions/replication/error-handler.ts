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
      error = isXHR ? response.responseText : await response.text();
    }
  } catch (_) {
    // no-op
  }

  return error;
}
