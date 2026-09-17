/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BlurMode } from '$lib/data/blur-mode';
import {
  TrackerAutoPause,
  TrackerSkipThresholdAction
} from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
import { FuriganaStyle } from '$lib/data/furigana-style';
import type { AppThemeMode } from '$lib/data/store';
import type { TextMarginMode } from '$lib/data/text-margin-mode';
import type { ThemeOption } from '$lib/data/theme-option';
import type { VerticalTextOrientation } from '$lib/data/vertical-text-orientation';
import { ViewMode } from '$lib/data/view-mode';
import type { WritingMode } from '$lib/data/writing-mode';

export interface ReaderProfileSettings {
  // Appearance & Themes
  appThemeMode: AppThemeMode;
  theme: string;
  blurImage: boolean;
  blurImageMode: string;

  // Layout & Reading Modes
  viewMode: ViewMode;
  writingMode: WritingMode;
  pageColumns: number;
  enableReaderWakeLock: boolean;

  // Typography & Fonts
  fontFamilyGroupOne: string;
  fontFamilyGroupTwo: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number | null;
  textIndentation: number;
  textMarginMode: TextMarginMode;
  textMarginValue: number;

  // Reader Margins & Boundaries
  firstDimensionMargin: number;
  secondDimensionMaxValue: number;

  // Text Rendering & Furigana
  prioritizeReaderStyles: boolean;
  enableTextJustification: boolean;
  enableTextWrapPretty: boolean;
  enableVerticalFontKerning: boolean;
  enableFontVPAL: boolean;
  verticalTextOrientation: VerticalTextOrientation;
  hideFurigana: boolean;
  furiganaStyle: FuriganaStyle;

  // Navigation, Gestures & Page Turns
  swipeThreshold: number;
  enableTapEdgeToFlip: boolean;
  avoidPageBreak: boolean;
  selectionToBookmarkEnabled: boolean;
  autoPositionOnResize: boolean;
  customReadingPointEnabled: boolean;
  pauseTrackerOnCustomPointChange: boolean;
  disableWheelNavigation: boolean;
  confirmClose: boolean;

  // Bookmarks, Autosaves & Progress
  manualBookmark: boolean;
  autosaveHistoryEnabled: boolean;
  autosaveHistoryInterval: number;
  autosaveHistoryMaxCount: number;
  showCharacterCounter: boolean;
  showPercentage: boolean;
  showFooterChapterCharacterCounter: boolean;
  showFooterChapterPercentage: boolean;
}

export type ProfileIconType = 'desktop' | 'mobile' | 'tablet' | 'ereader' | 'custom';

export interface ReaderProfile {
  id: string;
  name: string;
  icon?: ProfileIconType;
  description?: string;
  updatedAt: number;
  isDefault?: boolean;
  settings: ReaderProfileSettings;
}

export interface ReaderProfilesSyncPayload {
  version: number;
  lastModified: number;
  profiles: ReaderProfile[];
  customThemes?: Record<string, ThemeOption>;
  statisticsSettings?: StatisticsSyncSection;
}

/**
 * Global statistics/tracker behavior settings roamed via the profiles sync
 * payload. Kept separate from per-profile reader settings on purpose.
 * Whole-section last-writer-wins on `lastModified`; every field optional so
 * old payloads and version skew degrade to "keep local".
 */
export interface StatisticsSyncSection {
  lastModified: number;
  settings: StatisticsSyncSettings;
}

export interface StatisticsSyncSettings {
  statisticsEnabled?: boolean;
  trackerAutostartTime?: number;
  trackerIdleTime?: number;
  trackerForwardSkipThreshold?: number;
  trackerBackwardSkipThreshold?: number;
  trackerSkipThresholdAction?: TrackerSkipThresholdAction;
  trackerPopupDetection?: boolean;
  trackerAutoPause?: TrackerAutoPause;
  adjustStatisticsAfterIdleTime?: boolean;
  openTrackerOnCompletion?: boolean;
  addCharactersOnCompletion?: boolean;
  keepLocalStatisticsOnDeletion?: boolean;
  overwriteBookCompletion?: boolean;
  startDayHoursForTracker?: number;
}

export const defaultDesktopSettings: ReaderProfileSettings = {
  appThemeMode: 'system',
  theme: 'light-theme',
  blurImage: true,
  blurImageMode: BlurMode.AFTER_TOC,
  viewMode: ViewMode.Paginated,
  writingMode: 'vertical-rl',
  pageColumns: 0,
  enableReaderWakeLock: false,
  fontFamilyGroupOne: 'Noto Serif JP',
  fontFamilyGroupTwo: 'Noto Sans JP',
  fontSize: 20,
  lineHeight: 1.65,
  fontWeight: null,
  textIndentation: 0,
  textMarginMode: 'auto',
  textMarginValue: 0,
  firstDimensionMargin: 0,
  secondDimensionMaxValue: 0,
  prioritizeReaderStyles: false,
  enableTextJustification: false,
  enableTextWrapPretty: false,
  enableVerticalFontKerning: true,
  enableFontVPAL: false,
  verticalTextOrientation: 'mixed',
  hideFurigana: false,
  furiganaStyle: FuriganaStyle.Partial,
  swipeThreshold: 10,
  enableTapEdgeToFlip: false,
  avoidPageBreak: false,
  selectionToBookmarkEnabled: false,
  autoPositionOnResize: true,
  customReadingPointEnabled: false,
  pauseTrackerOnCustomPointChange: true,
  disableWheelNavigation: false,
  confirmClose: false,
  manualBookmark: false,
  autosaveHistoryEnabled: true,
  autosaveHistoryInterval: 3,
  autosaveHistoryMaxCount: 10,
  showCharacterCounter: true,
  showPercentage: true,
  showFooterChapterCharacterCounter: false,
  showFooterChapterPercentage: false
};

export const defaultMobileSettings: ReaderProfileSettings = {
  ...defaultDesktopSettings,
  fontSize: 17,
  lineHeight: 1.55,
  pageColumns: 1,
  swipeThreshold: 15,
  enableTapEdgeToFlip: true,
  enableReaderWakeLock: true
};

export const defaultTabletSettings: ReaderProfileSettings = {
  ...defaultDesktopSettings,
  fontSize: 22,
  lineHeight: 1.7,
  pageColumns: 1,
  firstDimensionMargin: 24,
  secondDimensionMaxValue: 900,
  swipeThreshold: 15,
  enableTapEdgeToFlip: true,
  enableReaderWakeLock: true
};

export const defaultEReaderSettings: ReaderProfileSettings = {
  ...defaultDesktopSettings,
  fontSize: 20,
  lineHeight: 1.6,
  fontWeight: 500,
  pageColumns: 1,
  firstDimensionMargin: 10,
  secondDimensionMaxValue: 0,
  swipeThreshold: 20,
  enableTapEdgeToFlip: true,
  enableReaderWakeLock: true,
  appThemeMode: 'light',
  theme: 'light-theme'
};

export const defaultReaderProfiles: ReaderProfile[] = [
  {
    id: 'default-desktop',
    name: 'PC / Desktop',
    icon: 'desktop',
    description: 'Optimized for large screens & monitors (20px font, auto columns)',
    updatedAt: 1,
    isDefault: true,
    settings: defaultDesktopSettings
  },
  {
    id: 'default-mobile',
    name: 'Mobile / Phone',
    icon: 'mobile',
    description: 'Compact screen layout with tap-edge page turning (17px font, 1 column)',
    updatedAt: 1,
    isDefault: true,
    settings: defaultMobileSettings
  },
  {
    id: 'default-tablet',
    name: 'Tablet',
    icon: 'tablet',
    description: 'Spacious touch layout with generous margins for tablets (22px font)',
    updatedAt: 1,
    isDefault: true,
    settings: defaultTabletSettings
  },
  {
    id: 'default-ereader',
    name: 'E-Reader / E-Ink',
    icon: 'ereader',
    description: 'High contrast & medium font weight for E-Ink devices (20px font, 500 weight)',
    updatedAt: 1,
    isDefault: true,
    settings: defaultEReaderSettings
  }
];
