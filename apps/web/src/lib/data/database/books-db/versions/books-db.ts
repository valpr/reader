/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV15 from '$lib/data/database/books-db/versions/v15/books-db-v15';

type BooksDb = BooksDbV15;

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
export type { BookmarkColor } from '$lib/data/database/books-db/versions/v7/books-db-v7';
export const currentDbVersion = 15;

export type { BooksDb as default };
