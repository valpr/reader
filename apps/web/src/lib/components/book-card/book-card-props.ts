/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { StorageKey } from '$lib/data/storage/storage-types';

export interface BookCardProps {
  id: number;
  imagePath: string | Blob;
  title: string;
  characters: number;
  lastBookModified: number;
  lastBookOpen: number;
  progress: number;
  lastBookmarkModified: number;
  isPlaceholder: boolean;
  /**
   * Explicit completion flag (`completedBook === 1` statistic row).
   * Part of the canonical `isBookCompleted` check alongside `progress`;
   * optional so cloud/legacy card builders keep compiling.
   */
  completedBook?: 0 | 1;
  sources?: StorageKey[];
  tags?: string[];
}
