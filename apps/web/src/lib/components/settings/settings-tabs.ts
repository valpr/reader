/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { pagePath } from '$lib/data/env';

export const SETTINGS_TABS = ['Reader', 'Data', 'Statistics'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const READER_SECTIONS = [
  'profiles',
  'all',
  'appearance',
  'layout',
  'typography',
  'margins',
  'rendering',
  'navigation',
  'progress'
] as const;

export type ReaderSection = (typeof READER_SECTIONS)[number];

export const DEFAULT_READER_SECTION: ReaderSection = 'profiles';

export function settingsTabFromSlug(slug: string | undefined): SettingsTab | undefined {
  const normalized = slug?.toLowerCase();
  return SETTINGS_TABS.find((tab) => tab.toLowerCase() === normalized);
}

export function settingsTabToSlug(tab: string): string {
  return tab.toLowerCase();
}

export function isReaderSection(value: string | undefined | null): value is ReaderSection {
  if (!value) return false;
  return (READER_SECTIONS as readonly string[]).includes(value.toLowerCase());
}

/**
 * Builds the canonical URL for a settings tab, optionally with a Reader section.
 * The bare `/settings/reader` URL defaults to the profiles section (see +page.ts).
 * Every explicit section (including `all`) maps to `/settings/reader/<section>`.
 * Section URLs are entry/share targets only: in-app section switches use local
 * state plus silent `history.replaceState` sync (no navigation) to avoid
 * scroll-to-top / reload flashes on mobile.
 */
export function settingsUrl(tab: string, section?: string | null): string {
  const slug = settingsTabToSlug(tab);
  const normalizedSection = section?.toLowerCase();
  const suffix = normalizedSection ? `/${normalizedSection}` : '';
  return `${pagePath}/settings/${slug}${suffix}`;
}
