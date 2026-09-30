/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Single canonical definition of "book completed".
 *
 * Completed = explicit `completedBook === 1` statistic flag
 *   OR normalized reading `progress >= 1`.
 *
 * No fuzzy thresholds (the former `>= 0.95` Lookback heuristic was removed).
 * Every UI surface (book card checkmark, library filters, Lookback counts)
 * must delegate here instead of reimplementing its own rule.
 */

export const COMPLETED_PROGRESS_THRESHOLD = 1;

export interface CompletionInput {
  progress?: number | string | null | undefined;
  completedBook?: number | null | undefined;
  title?: string | null | undefined;
  completedTitles?: Set<string> | undefined;
}

/**
 * Normalize a raw progress value to a 0-1 fraction.
 * Mirrors `normalizeProgress` in `library-filters.ts` (kept duplicate to
 * avoid a circular import): modern bookmarks store 0-1, legacy percent
 * strings/values > 1 are rescaled.
 */
function normalizeCompletionProgress(progress: number | string | null | undefined): number {
  if (typeof progress === 'string') {
    const trimmed = progress.trim();
    const numeric = Number(trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed) || 0;
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric > 1 ? Math.min(numeric / 100, 1) : Math.min(numeric, 1);
  }
  const p = Number(progress) || 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return p > 1 ? Math.min(p / 100, 1) : Math.min(p, 1);
}

/** True when normalized progress reaches the completion threshold. */
export function isCompletedProgress(progress: number | string | null | undefined): boolean {
  return normalizeCompletionProgress(progress) >= COMPLETED_PROGRESS_THRESHOLD;
}

/**
 * Canonical completion check. `completedTitles` is the materialized set of
 * titles carrying a `completedBook === 1` statistic row — never a heuristic.
 */
export function isBookCompleted(input: CompletionInput | null | undefined): boolean {
  if (!input) return false;
  if (input.completedBook === 1) return true;
  if (input.title && input.completedTitles?.has(input.title)) return true;
  return isCompletedProgress(input.progress);
}
