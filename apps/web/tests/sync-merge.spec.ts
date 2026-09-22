/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Pure merge-rule tests for tag & bookmark deletion sync (no browser state).
 * These pin the last-write-wins semantics both helpers implement:
 * deletion is an ordinary timestamped value, never a special branch.
 */

import { expect, test } from '@playwright/test';
import {
  dictFromEntries,
  entriesFromDict,
  mergeTagEntries,
  mergeTagEntriesWithDict,
  type BookTagEntries
} from '../src/lib/data/book-tags';
import {
  areUserBookmarkArraysEqual,
  isSameBookmark,
  mergeUserBookmarkArrays
} from '../src/lib/data/user-bookmarks-merge';
import type { BooksDbUserBookmarkData } from '../src/lib/data/database/books-db/versions/books-db';

function bookmark(
  overrides: Partial<BooksDbUserBookmarkData> & { syncId?: string }
): BooksDbUserBookmarkData {
  return {
    dataId: 1,
    exploredCharCount: 100,
    progress: 0.1,
    label: 'note',
    color: 'blue',
    note: '',
    createdAt: 1000,
    lastModified: 100,
    ...overrides
  };
}

test.describe('mergeTagEntries (per-title last-write-wins)', () => {
  test('newer modifiedAt wins wholesale, tags and deviceId travel together', () => {
    const local: BookTagEntries = {
      dune: { tags: ['fantasy', 'epic'], modifiedAt: 100, deviceId: 'device-a' }
    };
    const remote: BookTagEntries = {
      dune: { tags: ['sci-fi'], modifiedAt: 200, deviceId: 'device-b' }
    };
    const merged = mergeTagEntries(local, remote);
    expect(merged.dune).toEqual({ tags: ['sci-fi'], modifiedAt: 200, deviceId: 'device-b' });
    // Arrival order must not matter.
    expect(mergeTagEntries(remote, local)).toEqual(merged);
  });

  test('tie-break: higher deviceId wins deterministically', () => {
    const a: BookTagEntries = { dune: { tags: ['x'], modifiedAt: 100, deviceId: 'device-a' } };
    const b: BookTagEntries = { dune: { tags: ['y'], modifiedAt: 100, deviceId: 'device-b' } };
    expect(mergeTagEntries(a, b).dune.tags).toEqual(['y']);
    expect(mergeTagEntries(b, a).dune.tags).toEqual(['y']);
  });

  test('empty-list winner is a removal, not a special case', () => {
    const before: BookTagEntries = {
      dune: { tags: ['fantasy'], modifiedAt: 100, deviceId: 'device-a' }
    };
    const removal: BookTagEntries = {
      dune: { tags: [], modifiedAt: 200, deviceId: 'device-a' }
    };
    expect(mergeTagEntries(before, removal).dune.tags).toEqual([]);
    // An older live list never beats a newer removal.
    expect(mergeTagEntries(removal, before).dune.tags).toEqual([]);
  });

  test('re-add after removal wins when newer', () => {
    const removal: BookTagEntries = {
      dune: { tags: [], modifiedAt: 200, deviceId: 'device-a' }
    };
    const readd: BookTagEntries = {
      dune: { tags: ['fantasy'], modifiedAt: 300, deviceId: 'device-b' }
    };
    expect(mergeTagEntries(removal, readd).dune.tags).toEqual(['fantasy']);
  });

  test('disjoint keys union', () => {
    const merged = mergeTagEntries(
      { a: { tags: ['x'], modifiedAt: 1, deviceId: 'a' } },
      { b: { tags: ['y'], modifiedAt: 1, deviceId: 'b' } }
    );
    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
  });

  test('entries round-trip through the v1 mirror drops removals', () => {
    const entries: BookTagEntries = {
      live: { tags: ['fantasy'], modifiedAt: 100, deviceId: 'a' },
      removed: { tags: [], modifiedAt: 200, deviceId: 'a' }
    };
    expect(dictFromEntries(entries)).toEqual({ live: ['fantasy'] });
    expect(entriesFromDict({ live: ['fantasy'] }, 100, 'a')).toEqual({
      live: { tags: ['fantasy'], modifiedAt: 100, deviceId: 'a' }
    });
  });
});

test.describe('mergeTagEntriesWithDict (v1-downgrade path)', () => {
  test('dict adopts unknown keys with the fallback stamp', () => {
    const merged = mergeTagEntriesWithDict(undefined, { dune: ['Fantasy'] }, 123, 'device-a');
    expect(merged).toEqual({ dune: { tags: ['fantasy'], modifiedAt: 123, deviceId: 'device-a' } });
  });

  test('dict never corrupts existing entries, including empty-list removals', () => {
    const existing: BookTagEntries = {
      dune: { tags: [], modifiedAt: 200, deviceId: 'device-a' },
      kept: { tags: ['epic'], modifiedAt: 150, deviceId: 'device-a' }
    };
    // A stale v1 copy of the removed tag must not resurrect it, and a
    // concurrent v1 add on a known title is dropped (documented cost).
    const merged = mergeTagEntriesWithDict(
      existing,
      { dune: ['fantasy'], kept: ['epic', 'new-tag'] },
      999,
      'device-old'
    );
    expect(merged.dune.tags).toEqual([]);
    expect(merged.dune.modifiedAt).toBe(200);
    expect(merged.kept.tags).toEqual(['epic']);
  });

  test('dormant-C: stale dict folded into converged removals stays removed', () => {
    // A and B converged on a removal; C was dormant and still holds the
    // stale live list in v1 dict shape (no per-title timestamps).
    const converged: BookTagEntries = {
      dune: { tags: [], modifiedAt: 200, deviceId: 'device-a' }
    };
    const folded = mergeTagEntriesWithDict(converged, { dune: ['fantasy'] }, 50, 'device-c');
    expect(mergeTagEntries(converged, folded).dune.tags).toEqual([]);
  });
});

test.describe('mergeUserBookmarkArrays (per-syncId LWW)', () => {
  test('disjoint rows union', () => {
    const merged = mergeUserBookmarkArrays(
      [bookmark({ syncId: 's1', exploredCharCount: 10 })],
      [bookmark({ syncId: 's2', exploredCharCount: 20 })]
    );
    expect(merged).toHaveLength(2);
  });

  test('newer deletion wins over older live row, regardless of order', () => {
    const live = bookmark({ syncId: 's1', lastModified: 100 });
    const deleted = bookmark({ syncId: 's1', lastModified: 200, deleted: true, deletedAt: 200 });
    for (const merged of [
      mergeUserBookmarkArrays([live], [deleted]),
      mergeUserBookmarkArrays([deleted], [live])
    ]) {
      expect(merged).toHaveLength(1);
      expect(merged[0].deleted).toBe(true);
    }
  });

  test('older deletion never overwrites a newer live edit', () => {
    const deleted = bookmark({ syncId: 's1', lastModified: 100, deleted: true, deletedAt: 100 });
    const live = bookmark({ syncId: 's1', lastModified: 200, label: 'edited' });
    expect(mergeUserBookmarkArrays([live], [deleted])[0].deleted).toBeFalsy();
  });

  test('dormant-C: stale live copy syncing late does not resurrect the deletion', () => {
    const deleted = bookmark({ syncId: 's1', lastModified: 200, deleted: true, deletedAt: 200 });
    const staleLive = bookmark({ syncId: 's1', lastModified: 100 });
    const converged = mergeUserBookmarkArrays([staleLive], [deleted]);
    expect(converged[0].deleted).toBe(true);
    // Idempotent: merging the stale copy again changes nothing.
    const again = mergeUserBookmarkArrays(converged, [staleLive]);
    expect(again).toHaveLength(1);
    expect(again[0].deleted).toBe(true);
    expect(areUserBookmarkArraysEqual(converged, again)).toBe(true);
  });

  test('re-created bookmark at a fresh createdAt is a distinct row', () => {
    const deleted = bookmark({ syncId: 's1', createdAt: 1000, lastModified: 200, deleted: true });
    const recreated = bookmark({ syncId: 's2', createdAt: 2000, lastModified: 300 });
    expect(isSameBookmark(deleted, recreated)).toBe(false);
    expect(mergeUserBookmarkArrays([deleted], [recreated])).toHaveLength(2);
  });

  test('legacy rows without syncId match on position and converge syncIds', () => {
    const a = bookmark({ exploredCharCount: 50, createdAt: 1000, lastModified: 100 });
    const b = bookmark({ exploredCharCount: 50, createdAt: 1000, lastModified: 200, label: 'b' });
    delete a.syncId;
    delete b.syncId;
    expect(isSameBookmark(a, b)).toBe(true);
    const merged = mergeUserBookmarkArrays([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lastModified).toBe(200);
  });

  test('equality is order-independent and ignores per-device id/dataId', () => {
    const a = bookmark({ id: 1, dataId: 1, syncId: 's1' });
    const b = bookmark({ id: 9, dataId: 7, syncId: 's1' });
    expect(areUserBookmarkArraysEqual([a], [b])).toBe(true);
    const c = bookmark({ syncId: 's1' });
    const d = bookmark({ syncId: 's2' });
    expect(areUserBookmarkArraysEqual([c, d], [d, c])).toBe(true);
    expect(areUserBookmarkArraysEqual([c], [c, d])).toBe(false);
  });
});
