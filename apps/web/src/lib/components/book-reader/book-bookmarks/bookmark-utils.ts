/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Section } from '$lib/data/database/books-db/versions/v6/books-db-v6';

export function generateBookmarkLabel(
  sections: Section[] | undefined,
  exploredCharCount: number,
  totalCharCount: number
): string {
  const safeCharCount = Math.max(1, exploredCharCount);
  const totalPercentage = Math.round((safeCharCount / (totalCharCount || 1)) * 100);

  if (!sections || sections.length === 0) {
    return `Bookmark · ${totalPercentage}%`;
  }

  const sectionsWithProgress = sections as (Section & { progress?: number })[];
  const inProgressSection = sectionsWithProgress.find(
    (s) => !s.parentChapter && s.progress !== undefined && s.progress < 100
  );

  const mainChapters = sections.filter((s) => !s.parentChapter);
  const currentChapter = [...mainChapters]
    .reverse()
    .find((ch) => (ch.startCharacter ?? 0) <= safeCharCount);

  let targetChapter: (Section & { progress?: number }) | undefined = currentChapter;
  let useSectionProgress = false;

  if (
    inProgressSection?.label &&
    (exploredCharCount === 0 ||
      (inProgressSection.startCharacter ?? 0) > (currentChapter?.startCharacter ?? 0))
  ) {
    targetChapter = inProgressSection;
    useSectionProgress = true;
  }

  if (!targetChapter?.label) {
    return `Bookmark · ${totalPercentage}%`;
  }

  const chapterStart = targetChapter.startCharacter ?? 0;
  const chapterChars = targetChapter.characters ?? 1;
  const chapterProgress = useSectionProgress
    ? Math.max(0, Math.min(100, Math.round(targetChapter.progress || 0)))
    : Math.max(0, Math.min(100, Math.round(((safeCharCount - chapterStart) / chapterChars) * 100)));

  return `${targetChapter.label} · ${chapterProgress}%`;
}
