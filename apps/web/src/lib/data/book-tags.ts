/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Shared helpers for per-book text tags (e.g. 'fantasy', 'science-fiction').
 *
 * Local truth lives on the book record (`BooksDbBookData.tags`). For sync,
 * the whole library's tags travel as a single root-file dictionary
 * (`title key -> tags`), mirroring the reading-goals / profiles pattern, so
 * cloud-only books can display tags without downloading every book.
 */

export const MAX_TAGS_PER_BOOK = 10;

export const MAX_TAG_LENGTH = 20;

/** Normalized-title key used by the tags dictionary. Keep in sync with `normalizeTitle`. */
export function normalizeTagTitle(title: string): string {
  return (title || '').trim().toLowerCase();
}

export type BookTagsDict = Record<string, string[]>;

/**
 * Per-title last-write-wins record (Phase 1 of the tag/bookmark
 * deletion-sync plan). Removal is simply a newer record with a shorter list
 * — no tombstone store, no separate "deleted" branch in the merge.
 */
export interface BookTagEntry {
  tags: string[];
  modifiedAt: number;
  deviceId: string;
}

export type BookTagEntries = Record<string, BookTagEntry>;

export interface BookTagsSyncPayload {
  version: 1 | 2;
  lastModified: number;
  /** v2: per-title LWW records. Absent on files written by v1 clients. */
  entries?: BookTagEntries;
  /**
   * Flattened mirror regenerated from `entries` on every v2 publish, so
   * un-upgraded (v1-payload) clients keep working in union mode. They can't
   * see deletions — the documented downgrade cost — and their dict-only
   * publishes must never corrupt `entries` (see `mergeTagEntriesWithDict`).
   */
  tagsByTitle?: BookTagsDict;
  /** Normalized-title key -> display title (first seen casing). */
  titles?: Record<string, string>;
}

/** Trim, lowercase, collapse inner whitespace to '-', drop empties, cap length. */
export function normalizeTag(input: string): string {
  const cleaned = (input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH);

  return cleaned;
}

/** Normalize a tag list: normalize each entry, drop empties, dedupe, sort, cap count. */
export function normalizeTagList(tags: string[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (normalized) seen.add(normalized);
    if (seen.size >= MAX_TAGS_PER_BOOK) break;
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Per-title union of two dictionaries. Used for MERGE sync and card overlays. */
export function mergeTagsDicts(
  local: BookTagsDict | undefined,
  remote: BookTagsDict | undefined
): BookTagsDict {
  const merged: BookTagsDict = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);

  for (const key of keys) {
    merged[key] = normalizeTagList([...(local?.[key] || []), ...(remote?.[key] || [])]);
    if (!merged[key].length) delete merged[key];
  }

  return merged;
}

/**
 * Newest `modifiedAt` wins wholesale per title (tags array + deviceId travel
 * together, never merged field-by-field). Tie-break: higher `deviceId` string
 * wins — arbitrary but deterministic so every device reaches the same winner
 * regardless of arrival order. Empty-list winners are tag removals; they are
 * ordinary values, not a special case.
 */
export function mergeTagEntries(
  local: BookTagEntries | undefined,
  remote: BookTagEntries | undefined
): BookTagEntries {
  const merged: BookTagEntries = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);

  for (const key of keys) {
    const a = local?.[key];
    const b = remote?.[key];
    if (!a) {
      if (b) merged[key] = { tags: [...b.tags], modifiedAt: b.modifiedAt, deviceId: b.deviceId };
      continue;
    }
    if (!b) {
      merged[key] = { tags: [...a.tags], modifiedAt: a.modifiedAt, deviceId: a.deviceId };
      continue;
    }
    const aWins =
      a.modifiedAt > b.modifiedAt ||
      (a.modifiedAt === b.modifiedAt && (a.deviceId || '') >= (b.deviceId || ''));
    const winner = aWins ? a : b;
    merged[key] = {
      tags: [...winner.tags],
      modifiedAt: winner.modifiedAt,
      deviceId: winner.deviceId
    };
  }

  return merged;
}

/**
 * Fold a v1-shaped dict (no per-title timestamps) into an entries map without
 * corrupting existing deletion state: dict tags only create entries for keys
 * with no entry yet. Existing entries — including empty-list removals — are
 * left untouched, because a timestamp-less union cannot tell a genuinely new
 * tag from a stale copy of a tag someone else already removed. Dropping a
 * concurrent v1 add on a known title is the documented downgrade cost;
 * resurrecting a removal fleet-wide would be the bug this plan exists to fix.
 */
export function mergeTagEntriesWithDict(
  existing: BookTagEntries | undefined,
  dict: BookTagsDict | undefined,
  fallbackModifiedAt: number,
  fallbackDeviceId: string
): BookTagEntries {
  const merged: BookTagEntries = {};
  for (const [key, entry] of Object.entries(existing || {})) {
    merged[key] = { tags: [...entry.tags], modifiedAt: entry.modifiedAt, deviceId: entry.deviceId };
  }
  for (const key of Object.keys(dict || {})) {
    if (merged[key]) continue;
    const tags = normalizeTagList(dict?.[key]);
    if (!tags.length) continue;
    merged[key] = { tags, modifiedAt: fallbackModifiedAt, deviceId: fallbackDeviceId };
  }
  return merged;
}

/** Build entries for a legacy dict that carries one timestamp for all keys. */
export function entriesFromDict(
  dict: BookTagsDict | undefined,
  modifiedAt: number,
  deviceId: string
): BookTagEntries {
  const entries: BookTagEntries = {};
  for (const key of Object.keys(dict || {})) {
    const tags = normalizeTagList(dict?.[key]);
    if (!tags.length) continue;
    entries[key] = { tags, modifiedAt, deviceId };
  }
  return entries;
}

/** Flatten entries back to the v1 mirror shape. Drops empty-list removals. */
export function dictFromEntries(entries: BookTagEntries | undefined): BookTagsDict {
  const dict: BookTagsDict = {};
  for (const [key, entry] of Object.entries(entries || {})) {
    if (!entry.tags.length) continue;
    dict[key] = [...entry.tags];
  }
  return dict;
}

/** Max `modifiedAt` across entries, for the payload filename only. */
export function maxEntryModifiedAt(entries: BookTagEntries | undefined): number {
  let max = 0;
  for (const entry of Object.values(entries || {})) {
    if (entry.modifiedAt > max) max = entry.modifiedAt;
  }
  return max;
}

/** Unique sorted union of every tag in a dictionary. Feeds the editor suggestions. */
export function getAllTagsFromDict(dict: BookTagsDict | undefined): string[] {
  const seen = new Set<string>();

  for (const tags of Object.values(dict || {})) {
    for (const tag of tags || []) {
      const normalized = normalizeTag(tag);
      if (normalized) seen.add(normalized);
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Merge display-title maps, preferring existing entries. */
export function mergeTagsTitles(
  local: Record<string, string> | undefined,
  remote: Record<string, string> | undefined
): Record<string, string> {
  return { ...(remote || {}), ...(local || {}) };
}

/** Canonical JSON for no-op comparison: sorted keys on both maps. */
export function canonicalizeBookTagsPayload(
  tagsByTitle: BookTagsDict | undefined,
  titles: Record<string, string> | undefined,
  lastModified: number
): string {
  const sortedTags: BookTagsDict = {};
  for (const key of Object.keys(tagsByTitle || {}).sort()) {
    sortedTags[key] = [...(tagsByTitle?.[key] || [])].sort();
  }
  const sortedTitles: Record<string, string> = {};
  for (const key of Object.keys(titles || {}).sort()) {
    sortedTitles[key] = titles?.[key] ?? '';
  }
  return JSON.stringify({ tagsByTitle: sortedTags, titles: sortedTitles, lastModified });
}

/** True when a merged tags payload carries nothing new versus the remote file. */
export function isBookTagsPayloadUnchanged(
  existing: BookTagsSyncPayload | undefined,
  tagsToStore: BookTagsDict,
  titlesToStore: Record<string, string> | undefined,
  newTagsModified: number,
  entriesToStore?: BookTagEntries
): boolean {
  if (!existing) return false;
  if (
    canonicalizeBookTagsPayload(
      existing.tagsByTitle,
      existing.titles,
      existing.lastModified || 0
    ) !== canonicalizeBookTagsPayload(tagsToStore, titlesToStore, newTagsModified)
  ) {
    return false;
  }
  // v2: the mirror can match while entries differ (e.g. a removal followed
  // by a re-add converging to the same list with a newer timestamp).
  // Compare entries canonically whenever either side carries them.
  if (existing.entries || entriesToStore) {
    return canonicalizeTagEntries(existing.entries) === canonicalizeTagEntries(entriesToStore);
  }
  return true;
}

/** Canonical JSON for entries: sorted keys, sorted tag lists. */
export function canonicalizeTagEntries(entries: BookTagEntries | undefined): string {
  const sorted: BookTagEntries = {};
  for (const key of Object.keys(entries || {}).sort()) {
    const entry = (entries as BookTagEntries)[key];
    sorted[key] = {
      tags: [...entry.tags].sort(),
      modifiedAt: entry.modifiedAt,
      deviceId: entry.deviceId || ''
    };
  }
  return JSON.stringify(sorted);
}
