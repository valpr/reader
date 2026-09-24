/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV16 from '$lib/data/database/books-db/versions/v16/books-db-v16';

type BooksDb = BooksDbV16;

export type BooksDbBookData = BooksDb['data']['value'];
export type BooksDbBookmarkData = BooksDb['bookmark']['value'];
export type BooksDbUserBookmarkData = BooksDb['userBookmark']['value'];
export type BooksDbStorageSource = BooksDb['storageSource']['value'];
export type BooksDbStatistic = BooksDb['statistic']['value'];
export type BooksDbReadingGoal = BooksDb['readingGoal']['value'];
export type BooksDbLastModified = BooksDb['lastModified']['value'];
export type BooksDbAudioBook = BooksDb['audioBook']['value'];
export type BooksDbSubtitleData = BooksDb['subtitle']['value'];
export type BooksDbHandle = BooksDb['handle']['value'];
export type BooksDbDeviceIdentity = BooksDb['deviceIdentity']['value'];
export type BooksDbStatisticContribution = BooksDb['statisticContribution']['value'];
export type BooksDbRemoteStatisticContribution = BooksDb['statisticRemoteContribution']['value'];
export type BooksDbStatisticSyncState = BooksDb['statisticSyncState']['value'];
export {
  type BookmarkColor,
  BOOKMARK_COLORS
} from '$lib/data/database/books-db/versions/v7/books-db-v7';
export type {
  BookmarkHighlight,
  BookmarkHighlightAnchor
} from '$lib/data/database/books-db/versions/v16/books-db-v16';
export const currentDbVersion = 16;

export type { BooksDb as default };
