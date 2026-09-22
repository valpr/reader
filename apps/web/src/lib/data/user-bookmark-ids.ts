/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Deterministic bookmark identity (Phase 2 of the tag/bookmark deletion-sync
 * plan). Local auto-increment `id`s and per-book `dataId`s are never stable
 * across devices, so every device derives the same `syncId` for the same
 * logical bookmark independently: UUIDv5 (SHA-1, via `crypto.subtle` — no new
 * dependency) over `` `${normalizedTitle}|${exploredCharCount}|${createdAt}` ``.
 *
 * No negotiation round trip is needed and a one-time backfill converges
 * without coordination, which is what a per-device random backfill could
 * never do (same bookmark, two IDs, permanent duplicates).
 */

import type { BooksDbUserBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import { normalizeTagTitle } from '$lib/data/book-tags';

/** Fixed namespace for bookmark UUIDv5 derivation. Never change: IDs are stored. */
export const BOOKMARK_SYNC_NAMESPACE = 'a7f3c9e2-4b5d-4f8a-9c1e-2d3f4a5b6c7d';

function parseNamespaceUuid(namespace: string): Uint8Array {
  const hex = namespace.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function formatUuidV5(digest: ArrayBuffer): string {
  const bytes = new Uint8Array(digest).slice(0, 16);
  // Version 5 (SHA-1) + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/** Seed string for a bookmark. Titles normalize the same way as tag keys. */
export function bookmarkSyncIdSeed(
  title: string,
  exploredCharCount: number,
  createdAt: number
): string {
  return `${normalizeTagTitle(title)}|${exploredCharCount || 0}|${createdAt || 0}`;
}

/** Deterministic UUIDv5 for one bookmark. */
export async function computeBookmarkSyncId(
  title: string,
  exploredCharCount: number,
  createdAt: number
): Promise<string> {
  const seed = bookmarkSyncIdSeed(title, exploredCharCount, createdAt);
  const namespace = parseNamespaceUuid(BOOKMARK_SYNC_NAMESPACE);
  const message = new TextEncoder().encode(seed);
  const input = new Uint8Array(namespace.length + message.length);
  input.set(namespace, 0);
  input.set(message, namespace.length);
  const digest = await crypto.subtle.digest('SHA-1', input);
  return formatUuidV5(digest);
}

/**
 * Stable match key for merge/canonicalize: the `syncId` when present, else
 * the legacy fuzzy identity (`exploredCharCount` + `createdAt`, falling back
 * to `label`) that `storeUserBookmarks` has always used. Pre-migration rows
 * without `syncId` keep matching until backfill completes fleet-wide.
 */
export function bookmarkMatchKey(
  row: Pick<BooksDbUserBookmarkData, 'syncId' | 'exploredCharCount' | 'createdAt' | 'label'>
): string {
  if (row.syncId) return `id:${row.syncId}`;
  return `fuzzy:${row.exploredCharCount}|${row.createdAt}|${row.label}`;
}

/** True for soft-deleted rows (Phase 2 deletion state). */
export function isUserBookmarkDeleted(row: BooksDbUserBookmarkData): boolean {
  return !!row.deleted;
}

/** Display/suggestion paths consume only live rows through this predicate. */
export function isLiveUserBookmark(row: BooksDbUserBookmarkData): boolean {
  return !row.deleted;
}
