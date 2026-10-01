/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { writableSubject } from '$lib/functions/svelte/store';

export interface ImagePreviewData {
  url: string;
  alt?: string;
  /** Index into readerImageGalleryPictures$ for prev/next navigation */
  index: number;
}

export const activeImagePreview$ = writableSubject<ImagePreviewData | null>(null);

export function openImagePreview(url: string, index = 0, alt?: string): void {
  activeImagePreview$.next({ url, index, alt });
}

export function closeImagePreview(): void {
  activeImagePreview$.next(null);
}
