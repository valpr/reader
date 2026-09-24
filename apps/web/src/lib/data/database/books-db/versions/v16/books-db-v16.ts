/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV15 from '$lib/data/database/books-db/versions/v15/books-db-v15';

export interface BookmarkHighlightAnchor {
  /** 0-based section index (spine item / chapter element) */
  sectionIndex: number;
  /** 0-based block index within the section (p, h1-h6, div, blockquote, li) */
  blockIndex: number;
  /** Text character offset within the block's textContent (excluding <rt>) */
  charOffset: number;
}

export interface BookmarkHighlight {
  start: BookmarkHighlightAnchor;
  end: BookmarkHighlightAnchor;
  /** Normalized text snippet (up to 500 chars) for verification and display */
  snippet: string;
}

export type BooksDbV16UserBookmarkData = BooksDbV15['userBookmark']['value'] & {
  highlight?: BookmarkHighlight;
};

export default interface BooksDbV16 extends BooksDbV15 {
  userBookmark: {
    key: number;
    value: BooksDbV16UserBookmarkData;
    indexes: {
      dataId: number;
      syncId: string;
    };
  };
}
