/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { StorageKey } from '$lib/data/storage/storage-types';
import { MemoryBookmarksHandler } from '$lib/functions/replication/user-bookmarks-sync-test-double';

/**
 * TEST-ONLY in-memory remote for whole-sync early-exit specs. Never
 * imported by production code (nothing references this module outside
 * `apps/web/tests`), so it is tree-shaken out of every prod bundle.
 *
 * NOTE: specs import it inside `page.evaluate` (browser context via the
 * vite dev server), never statically — Node-side spec code cannot resolve
 * the `$lib` alias, and it must live under `src/` (not `tests/`) because
 * vite's `server.fs.allow` list does not serve `tests/` to the browser.
 * Import and use happen in the same evaluate call, so HMR reloads
 * between tests cannot drop the class reference.
 *
 * Extends the bookmarks double with per-title file maps and root-file
 * maps, so specs can script the remote inventory the gate observes:
 * `setTitleFiles` for a book folder's progress/statistics/bookmark
 * files, `setRootFiles` for the goals/profiles/contribution singletons.
 * `getBookList` returns the scripted titles, so a remote-only book
 * appears exactly when a test adds one.
 */
export class MemorySyncStateRemote extends MemoryBookmarksHandler {
  titles: string[];
  filesByTitle: Map<string, Array<{ name: string; revision?: string }>>;
  remoteRootFiles: Map<string, Array<{ name: string; revision?: string }>>;

  constructor(win: any, sourceName: string) {
    super(win, StorageKey.GDRIVE, sourceName);
    this.titles = [];
    this.filesByTitle = new Map();
    this.remoteRootFiles = new Map();
  }

  async getBookList(): Promise<any> {
    return this.titles.map((title) => ({ title }));
  }

  async listFilesWithPrefix(prefix: any, context: any): Promise<any> {
    this.metaLists += 1;
    const files = this.filesByTitle.get(context?.title) || [];
    return files
      .filter((file: any) => file.name.startsWith(prefix))
      .map((file: any) => ({ ...file }));
  }

  async listRootFileIdentities(prefix: any): Promise<any> {
    return (this.remoteRootFiles.get(prefix) || []).map((file: any) => ({ ...file }));
  }

  setTitleFiles(title: string, files: Array<{ name: string; revision?: string }>): void {
    this.filesByTitle.set(
      title,
      files.map((file) => ({ ...file }))
    );
    if (!this.titles.includes(title)) this.titles.push(title);
  }

  setRootFiles(prefix: string, files: Array<{ name: string; revision?: string }>): void {
    this.remoteRootFiles.set(
      prefix,
      files.map((file) => ({ ...file }))
    );
  }
}
