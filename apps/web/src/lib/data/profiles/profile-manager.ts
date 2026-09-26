/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { browser } from '$app/environment';
import {
  activeProfileId$,
  addCharactersOnCompletion$,
  adjustStatisticsAfterIdleTime$,
  appThemeMode$,
  autoPositionOnResize$,
  autoReplication$,
  autosaveHistoryEnabled$,
  autosaveHistoryInterval$,
  autosaveHistoryMaxCount$,
  avoidPageBreak$,
  cacheStorageData$,
  confirmClose$,
  customReadingPointEnabled$,
  customThemes$,
  database,
  disableWheelNavigation$,
  enableFontVPAL$,
  enableReaderWakeLock$,
  enableTapEdgeToFlip$,
  enableTextJustification$,
  enableTextWrapPretty$,
  enableVerticalFontKerning$,
  firstDimensionMargin$,
  fontFamilyGroupOne$,
  fontFamilyGroupTwo$,
  fontSize$,
  fontWeight$,
  furiganaStyle$,
  hideFurigana$,
  hideSpoilerImage$,
  hideSpoilerImageMode$,
  isOnline$,
  keepLocalStatisticsOnDeletion$,
  keepReaderHeaderVisible$,
  lastProfilesModified$,
  lastStatisticsSettingsModified$,
  lineHeight$,
  manualBookmark$,
  openTrackerOnCompletion$,
  overwriteBookCompletion$,
  pageColumns$,
  pauseTrackerOnCustomPointChange$,
  prioritizeReaderStyles$,
  readerProfiles$,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  secondDimensionMaxValue$,
  selectionToBookmarkEnabled$,
  showCharacterCounter$,
  showFooterChapterCharacterCounter$,
  showFooterChapterPercentage$,
  showPercentage$,
  startDayHoursForTracker$,
  statisticsEnabled$,
  statisticsMergeMode$,
  swipeThreshold$,
  syncTarget$,
  textIndentation$,
  textMarginMode$,
  textMarginValue$,
  theme$,
  trackerAutoPause$,
  trackerAutostartTime$,
  trackerBackwardSkipThreshold$,
  trackerForwardSkipThreshold$,
  trackerIdleTime$,
  trackerPopupDetection$,
  trackerSkipThresholdAction$,
  verticalTextOrientation$,
  viewMode$,
  writingMode$
} from '$lib/data/store';
import {
  TrackerAutoPause,
  TrackerSkipThresholdAction
} from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
import { AutoReplicationType } from '$lib/functions/replication/replication-options';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import { StorageDataType, StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
import { replicateData } from '$lib/functions/replication/replicator';
import { logger } from '$lib/data/logger';
import {
  defaultDesktopSettings,
  defaultReaderProfiles,
  type ProfileIconType,
  type ReaderProfile,
  type ReaderProfileSettings,
  type ReaderProfilesSyncPayload,
  type StatisticsSyncSection,
  type StatisticsSyncSettings
} from './profile-types';

export function getCurrentReaderSettings(): ReaderProfileSettings {
  return {
    appThemeMode: appThemeMode$.getValue(),
    theme: theme$.getValue(),
    blurImage: hideSpoilerImage$.getValue(),
    blurImageMode: hideSpoilerImageMode$.getValue(),
    viewMode: viewMode$.getValue(),
    writingMode: writingMode$.getValue(),
    pageColumns: pageColumns$.getValue(),
    enableReaderWakeLock: enableReaderWakeLock$.getValue(),
    fontFamilyGroupOne: fontFamilyGroupOne$.getValue(),
    fontFamilyGroupTwo: fontFamilyGroupTwo$.getValue(),
    fontSize: fontSize$.getValue(),
    lineHeight: lineHeight$.getValue(),
    fontWeight: fontWeight$.getValue(),
    textIndentation: textIndentation$.getValue(),
    textMarginMode: textMarginMode$.getValue(),
    textMarginValue: textMarginValue$.getValue(),
    firstDimensionMargin: firstDimensionMargin$.getValue(),
    secondDimensionMaxValue: secondDimensionMaxValue$.getValue(),
    prioritizeReaderStyles: prioritizeReaderStyles$.getValue(),
    enableTextJustification: enableTextJustification$.getValue(),
    enableTextWrapPretty: enableTextWrapPretty$.getValue(),
    enableVerticalFontKerning: enableVerticalFontKerning$.getValue(),
    enableFontVPAL: enableFontVPAL$.getValue(),
    verticalTextOrientation: verticalTextOrientation$.getValue(),
    hideFurigana: hideFurigana$.getValue(),
    furiganaStyle: furiganaStyle$.getValue(),
    swipeThreshold: swipeThreshold$.getValue(),
    enableTapEdgeToFlip: enableTapEdgeToFlip$.getValue(),
    keepReaderHeaderVisible: keepReaderHeaderVisible$.getValue(),
    avoidPageBreak: avoidPageBreak$.getValue(),
    selectionToBookmarkEnabled: selectionToBookmarkEnabled$.getValue(),
    autoPositionOnResize: autoPositionOnResize$.getValue(),
    customReadingPointEnabled: customReadingPointEnabled$.getValue(),
    pauseTrackerOnCustomPointChange: pauseTrackerOnCustomPointChange$.getValue(),
    disableWheelNavigation: disableWheelNavigation$.getValue(),
    confirmClose: confirmClose$.getValue(),
    manualBookmark: manualBookmark$.getValue(),
    autosaveHistoryEnabled: autosaveHistoryEnabled$.getValue(),
    autosaveHistoryInterval: autosaveHistoryInterval$.getValue(),
    autosaveHistoryMaxCount: autosaveHistoryMaxCount$.getValue(),
    showCharacterCounter: showCharacterCounter$.getValue(),
    showPercentage: showPercentage$.getValue(),
    showFooterChapterCharacterCounter: showFooterChapterCharacterCounter$.getValue(),
    showFooterChapterPercentage: showFooterChapterPercentage$.getValue()
  };
}

export function applyProfile(profile: ReaderProfile): void {
  const s = profile.settings;
  if (!s) return;

  if (s.appThemeMode !== undefined) appThemeMode$.next(s.appThemeMode);
  if (s.theme !== undefined) theme$.next(s.theme);
  if (s.blurImage !== undefined) hideSpoilerImage$.next(s.blurImage);
  if (s.blurImageMode !== undefined) hideSpoilerImageMode$.next(s.blurImageMode as any);
  if (s.viewMode !== undefined) viewMode$.next(s.viewMode);
  if (s.writingMode !== undefined) writingMode$.next(s.writingMode);
  if (s.pageColumns !== undefined) pageColumns$.next(s.pageColumns);
  if (s.enableReaderWakeLock !== undefined) enableReaderWakeLock$.next(s.enableReaderWakeLock);
  if (s.fontFamilyGroupOne !== undefined) fontFamilyGroupOne$.next(s.fontFamilyGroupOne);
  if (s.fontFamilyGroupTwo !== undefined) fontFamilyGroupTwo$.next(s.fontFamilyGroupTwo);
  if (s.fontSize !== undefined) fontSize$.next(s.fontSize);
  if (s.lineHeight !== undefined) lineHeight$.next(s.lineHeight);
  if (s.fontWeight !== undefined) fontWeight$.next(s.fontWeight);
  if (s.textIndentation !== undefined) textIndentation$.next(s.textIndentation);
  if (s.textMarginMode !== undefined) textMarginMode$.next(s.textMarginMode);
  if (s.textMarginValue !== undefined) textMarginValue$.next(s.textMarginValue);
  if (s.firstDimensionMargin !== undefined) firstDimensionMargin$.next(s.firstDimensionMargin);
  if (s.secondDimensionMaxValue !== undefined)
    secondDimensionMaxValue$.next(s.secondDimensionMaxValue);
  if (s.prioritizeReaderStyles !== undefined)
    prioritizeReaderStyles$.next(s.prioritizeReaderStyles);
  if (s.enableTextJustification !== undefined)
    enableTextJustification$.next(s.enableTextJustification);
  if (s.enableTextWrapPretty !== undefined) enableTextWrapPretty$.next(s.enableTextWrapPretty);
  if (s.enableVerticalFontKerning !== undefined)
    enableVerticalFontKerning$.next(s.enableVerticalFontKerning);
  if (s.enableFontVPAL !== undefined) enableFontVPAL$.next(s.enableFontVPAL);
  if (s.verticalTextOrientation !== undefined)
    verticalTextOrientation$.next(s.verticalTextOrientation);
  if (s.hideFurigana !== undefined) hideFurigana$.next(s.hideFurigana);
  if (s.furiganaStyle !== undefined) furiganaStyle$.next(s.furiganaStyle);
  if (s.swipeThreshold !== undefined) swipeThreshold$.next(s.swipeThreshold);
  if (s.enableTapEdgeToFlip !== undefined) enableTapEdgeToFlip$.next(s.enableTapEdgeToFlip);
  if (s.keepReaderHeaderVisible !== undefined)
    keepReaderHeaderVisible$.next(s.keepReaderHeaderVisible);
  if (s.avoidPageBreak !== undefined) avoidPageBreak$.next(s.avoidPageBreak);
  if (s.selectionToBookmarkEnabled !== undefined)
    selectionToBookmarkEnabled$.next(s.selectionToBookmarkEnabled);
  if (s.autoPositionOnResize !== undefined) autoPositionOnResize$.next(s.autoPositionOnResize);
  if (s.customReadingPointEnabled !== undefined)
    customReadingPointEnabled$.next(s.customReadingPointEnabled);
  if (s.pauseTrackerOnCustomPointChange !== undefined)
    pauseTrackerOnCustomPointChange$.next(s.pauseTrackerOnCustomPointChange);
  if (s.disableWheelNavigation !== undefined)
    disableWheelNavigation$.next(s.disableWheelNavigation);
  if (s.confirmClose !== undefined) confirmClose$.next(s.confirmClose);
  if (s.manualBookmark !== undefined) manualBookmark$.next(s.manualBookmark);
  if (s.autosaveHistoryEnabled !== undefined)
    autosaveHistoryEnabled$.next(s.autosaveHistoryEnabled);
  if (s.autosaveHistoryInterval !== undefined)
    autosaveHistoryInterval$.next(s.autosaveHistoryInterval);
  if (s.autosaveHistoryMaxCount !== undefined)
    autosaveHistoryMaxCount$.next(s.autosaveHistoryMaxCount);
  if (s.showCharacterCounter !== undefined) showCharacterCounter$.next(s.showCharacterCounter);
  if (s.showPercentage !== undefined) showPercentage$.next(s.showPercentage);
  if (s.showFooterChapterCharacterCounter !== undefined)
    showFooterChapterCharacterCounter$.next(s.showFooterChapterCharacterCounter);
  if (s.showFooterChapterPercentage !== undefined)
    showFooterChapterPercentage$.next(s.showFooterChapterPercentage);

  activeProfileId$.next(profile.id);
}

export function applyProfileById(id: string): boolean {
  const profiles = readerProfiles$.getValue() || defaultReaderProfiles;
  const target = profiles.find((p) => p.id === id);
  if (target) {
    applyProfile(target);
    return true;
  }
  return false;
}

export function getActiveProfile(): ReaderProfile {
  const profiles = readerProfiles$.getValue() || defaultReaderProfiles;
  const activeId = activeProfileId$.getValue();
  return profiles.find((p) => p.id === activeId) || profiles[0] || defaultReaderProfiles[0];
}

export function saveCurrentToActiveProfile(): void {
  const profiles = [...(readerProfiles$.getValue() || defaultReaderProfiles)];
  const activeId = activeProfileId$.getValue();
  const index = profiles.findIndex((p) => p.id === activeId);
  const now = Date.now();

  if (index !== -1) {
    profiles[index] = {
      ...profiles[index],
      updatedAt: now,
      settings: getCurrentReaderSettings()
    };
  } else {
    profiles.push({
      id: activeId || `profile-${now}`,
      name: 'Custom Profile',
      updatedAt: now,
      settings: getCurrentReaderSettings()
    });
  }

  readerProfiles$.next(profiles);
  lastProfilesModified$.next(now);
}

export function getCurrentStatisticsSettings(): StatisticsSyncSettings {
  return {
    statisticsEnabled: statisticsEnabled$.getValue(),
    trackerAutostartTime: trackerAutostartTime$.getValue(),
    trackerIdleTime: trackerIdleTime$.getValue(),
    trackerForwardSkipThreshold: trackerForwardSkipThreshold$.getValue(),
    trackerBackwardSkipThreshold: trackerBackwardSkipThreshold$.getValue(),
    trackerSkipThresholdAction: trackerSkipThresholdAction$.getValue(),
    trackerPopupDetection: trackerPopupDetection$.getValue(),
    trackerAutoPause: trackerAutoPause$.getValue(),
    adjustStatisticsAfterIdleTime: adjustStatisticsAfterIdleTime$.getValue(),
    openTrackerOnCompletion: openTrackerOnCompletion$.getValue(),
    addCharactersOnCompletion: addCharactersOnCompletion$.getValue(),
    keepLocalStatisticsOnDeletion: keepLocalStatisticsOnDeletion$.getValue(),
    overwriteBookCompletion: overwriteBookCompletion$.getValue(),
    startDayHoursForTracker: startDayHoursForTracker$.getValue()
  };
}

export function getStatisticsSettingsSection(): StatisticsSyncSection {
  return {
    lastModified: lastStatisticsSettingsModified$.getValue() || 0,
    settings: getCurrentStatisticsSettings()
  };
}

let suppressStatisticsSettingsSync = false;

export function isStatisticsSettingsSyncSuppressed(): boolean {
  return suppressStatisticsSettingsSync;
}

function isTrackerAutoPause(value: unknown): value is TrackerAutoPause {
  return typeof value === 'string' && (Object.values(TrackerAutoPause) as string[]).includes(value);
}

function isTrackerSkipThresholdAction(value: unknown): value is TrackerSkipThresholdAction {
  return (
    typeof value === 'string' &&
    (Object.values(TrackerSkipThresholdAction) as string[]).includes(value)
  );
}

/**
 * Applies a remotely synced statistics settings section using whole-section
 * last-writer-wins. Returns true when applied (remote strictly newer).
 * Unknown enum values from version skew fall back to the local value.
 */
export function applyStatisticsSettings(section: StatisticsSyncSection | undefined): boolean {
  if (!section || typeof section.lastModified !== 'number') return false;
  if (section.lastModified <= (lastStatisticsSettingsModified$.getValue() || 0)) return false;
  const s = section.settings;
  if (!s || typeof s !== 'object') return false;

  suppressStatisticsSettingsSync = true;
  try {
    if (typeof s.statisticsEnabled === 'boolean') statisticsEnabled$.next(s.statisticsEnabled);
    if (typeof s.trackerAutostartTime === 'number')
      trackerAutostartTime$.next(s.trackerAutostartTime);
    if (typeof s.trackerIdleTime === 'number') trackerIdleTime$.next(s.trackerIdleTime);
    if (typeof s.trackerForwardSkipThreshold === 'number')
      trackerForwardSkipThreshold$.next(s.trackerForwardSkipThreshold);
    if (typeof s.trackerBackwardSkipThreshold === 'number')
      trackerBackwardSkipThreshold$.next(s.trackerBackwardSkipThreshold);
    if (isTrackerSkipThresholdAction(s.trackerSkipThresholdAction))
      trackerSkipThresholdAction$.next(s.trackerSkipThresholdAction);
    if (typeof s.trackerPopupDetection === 'boolean')
      trackerPopupDetection$.next(s.trackerPopupDetection);
    if (isTrackerAutoPause(s.trackerAutoPause)) trackerAutoPause$.next(s.trackerAutoPause);
    if (typeof s.adjustStatisticsAfterIdleTime === 'boolean')
      adjustStatisticsAfterIdleTime$.next(s.adjustStatisticsAfterIdleTime);
    if (typeof s.openTrackerOnCompletion === 'boolean')
      openTrackerOnCompletion$.next(s.openTrackerOnCompletion);
    if (typeof s.addCharactersOnCompletion === 'boolean')
      addCharactersOnCompletion$.next(s.addCharactersOnCompletion);
    if (typeof s.keepLocalStatisticsOnDeletion === 'boolean')
      keepLocalStatisticsOnDeletion$.next(s.keepLocalStatisticsOnDeletion);
    if (typeof s.overwriteBookCompletion === 'boolean')
      overwriteBookCompletion$.next(s.overwriteBookCompletion);
    if (typeof s.startDayHoursForTracker === 'number')
      startDayHoursForTracker$.next(s.startDayHoursForTracker);
  } finally {
    suppressStatisticsSettingsSync = false;
  }

  lastStatisticsSettingsModified$.next(section.lastModified);
  return true;
}

/**
 * Picks the newer of two statistics settings sections (whole-section LWW).
 * Ties prefer `second` so an upload carrying equal timestamps still converges.
 */
export function newerStatisticsSettingsSection(
  first: StatisticsSyncSection | undefined,
  second: StatisticsSyncSection | undefined
): StatisticsSyncSection | undefined {
  if (second && (!first || second.lastModified >= first.lastModified)) return second;
  return first;
}

export function createProfile(
  name: string,
  icon: ProfileIconType = 'custom',
  fromCurrent = true,
  templateSettings?: ReaderProfileSettings
): ReaderProfile {
  const now = Date.now();
  const id = `profile-${now}-${Math.random().toString(36).substring(2, 7)}`;
  const settings = fromCurrent
    ? getCurrentReaderSettings()
    : templateSettings || defaultDesktopSettings;

  const newProfile: ReaderProfile = {
    id,
    name: name.trim() || 'New Profile',
    icon,
    updatedAt: now,
    settings
  };

  const profiles = [...(readerProfiles$.getValue() || defaultReaderProfiles), newProfile];
  readerProfiles$.next(profiles);
  activeProfileId$.next(id);
  lastProfilesModified$.next(now);

  return newProfile;
}

export function updateProfileMetadata(
  id: string,
  updates: { name?: string; icon?: ProfileIconType; description?: string }
): void {
  const profiles = [...(readerProfiles$.getValue() || defaultReaderProfiles)];
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) return;

  const now = Date.now();
  profiles[index] = {
    ...profiles[index],
    ...updates,
    updatedAt: now
  };

  readerProfiles$.next(profiles);
  lastProfilesModified$.next(now);
}

export function deleteProfile(id: string): boolean {
  const profiles = [...(readerProfiles$.getValue() || defaultReaderProfiles)];
  if (profiles.length <= 1) return false;

  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) return false;

  const activeId = activeProfileId$.getValue();
  if (activeId === id) {
    const nextActive = filtered[0];
    applyProfile(nextActive);
  }

  readerProfiles$.next(filtered);
  lastProfilesModified$.next(Date.now());
  return true;
}

export function duplicateProfile(id: string): ReaderProfile | undefined {
  const profiles = [...(readerProfiles$.getValue() || defaultReaderProfiles)];
  const source = profiles.find((p) => p.id === id);
  if (!source) return undefined;

  const now = Date.now();
  const newProfile: ReaderProfile = {
    ...source,
    id: `profile-${now}-${Math.random().toString(36).substring(2, 7)}`,
    name: `${source.name} (Copy)`,
    isDefault: false,
    updatedAt: now,
    settings: { ...source.settings }
  };

  profiles.push(newProfile);
  readerProfiles$.next(profiles);
  activeProfileId$.next(newProfile.id);
  lastProfilesModified$.next(now);

  return newProfile;
}

export function mergeProfiles(
  localProfiles: ReaderProfile[] = [],
  remoteProfiles: ReaderProfile[] = [],
  isNewOnly = false,
  fallbackLastModified = 0
): { mergedProfiles: ReaderProfile[]; newLastModified: number } {
  const mergedMap = new Map<string, ReaderProfile>();
  let newLastModified = fallbackLastModified;

  // Add all local profiles to map
  for (const local of localProfiles) {
    mergedMap.set(local.id, local);
    if (local.updatedAt > newLastModified) {
      newLastModified = local.updatedAt;
    }
  }

  // Merge remote profiles
  for (const remote of remoteProfiles) {
    const existing = mergedMap.get(remote.id);
    if (!existing) {
      mergedMap.set(remote.id, remote);
      if (remote.updatedAt > newLastModified) {
        newLastModified = remote.updatedAt;
      }
    } else if (!isNewOnly && remote.updatedAt > existing.updatedAt) {
      mergedMap.set(remote.id, remote);
      if (remote.updatedAt > newLastModified) {
        newLastModified = remote.updatedAt;
      }
    }
  }

  const mergedProfiles = Array.from(mergedMap.values());
  return { mergedProfiles, newLastModified };
}

export function exportProfilesAsJson(): void {
  if (!browser) return;

  const payload: ReaderProfilesSyncPayload = {
    version: 1,
    lastModified: lastProfilesModified$.getValue() || Date.now(),
    profiles: readerProfiles$.getValue() || defaultReaderProfiles,
    customThemes: customThemes$.getValue() || {},
    statisticsSettings: getStatisticsSettingsSection()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `ttu-reader-profiles-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importProfilesFromJson(jsonString: string): {
  success: boolean;
  count: number;
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString) as ReaderProfilesSyncPayload;
    if (!data || !Array.isArray(data.profiles) || data.profiles.length === 0) {
      return { success: false, count: 0, error: 'Invalid profile file format' };
    }

    const localProfiles = readerProfiles$.getValue() || defaultReaderProfiles;
    const { mergedProfiles, newLastModified } = mergeProfiles(
      localProfiles,
      data.profiles,
      false,
      data.lastModified || Date.now()
    );

    readerProfiles$.next(mergedProfiles);
    lastProfilesModified$.next(newLastModified);

    if (data.customThemes && typeof data.customThemes === 'object') {
      customThemes$.next({
        ...(customThemes$.getValue() || {}),
        ...data.customThemes
      });
    }

    applyStatisticsSettings(data.statisticsSettings);

    return { success: true, count: data.profiles.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Failed to parse JSON' };
  }
}

export async function syncProfilesToCloudTarget(): Promise<string | undefined> {
  if (!browser) return undefined;
  const syncTarget = syncTarget$.getValue();
  if (!syncTarget || !isOnline$.getValue()) return undefined;
  if (autoReplication$.getValue() === AutoReplicationType.Off) return undefined;

  try {
    let externalStorageHandler: any;

    if (syncTarget === StorageSourceDefault.GDRIVE_DEFAULT) {
      externalStorageHandler = getStorageHandler(
        window,
        StorageKey.GDRIVE,
        syncTarget,
        true,
        cacheStorageData$.getValue(),
        replicationSaveBehavior$.getValue(),
        statisticsMergeMode$.getValue(),
        readingGoalsMergeMode$.getValue()
      );
    } else if (syncTarget === StorageSourceDefault.ONEDRIVE_DEFAULT) {
      externalStorageHandler = getStorageHandler(
        window,
        StorageKey.ONEDRIVE,
        syncTarget,
        true,
        cacheStorageData$.getValue(),
        replicationSaveBehavior$.getValue(),
        statisticsMergeMode$.getValue(),
        readingGoalsMergeMode$.getValue()
      );
    } else {
      const db = await database.db;
      const storageSource = await db.get('storageSource', syncTarget);
      if (storageSource) {
        if (storageSource.type !== StorageKey.FS && !isOnline$.getValue()) return undefined;
        externalStorageHandler = getStorageHandler(
          window,
          storageSource.type,
          syncTarget,
          true,
          cacheStorageData$.getValue(),
          replicationSaveBehavior$.getValue(),
          statisticsMergeMode$.getValue(),
          readingGoalsMergeMode$.getValue()
        );
      }
    }

    if (!externalStorageHandler) return undefined;

    const localStorageHandler = getStorageHandler(
      window,
      StorageKey.BROWSER,
      '',
      true,
      cacheStorageData$.getValue(),
      replicationSaveBehavior$.getValue(),
      statisticsMergeMode$.getValue(),
      readingGoalsMergeMode$.getValue()
    );

    return await replicateData(
      localStorageHandler,
      externalStorageHandler,
      false,
      [],
      [StorageDataType.PROFILES]
    );
  } catch (err: any) {
    logger.error(`Error auto-syncing profiles to cloud: ${err?.message || err}`);
    return err?.message || String(err);
  }
}

export const PROFILES_SCHEMA_VERSION = 3;

export const PROFILE_CHOICE_SEEN_KEY = 'profileChoiceSeen';

const EREADER_UA_PATTERN =
  /kindle|silk-accelerated|kobo|tolino|onyx|boox|likebook|pocketbook|nook|e-ink|eink|ereader/i;

export function isEReaderUserAgent(userAgent: string): boolean {
  return EREADER_UA_PATTERN.test(userAgent || '');
}

export type SuggestedProfileId = 'default-mobile' | 'default-ereader';

/**
 * Binary first-run suggestion: desktop/laptop returns null (no prompt).
 * Anything else preselects Mobile, except E-Ink UAs which preselect E-Reader.
 * Pure function of its inputs so it is unit-testable and SSR-safe.
 */
export function detectSuggestedProfileId(
  userAgent: string,
  isMobileDevice: boolean
): SuggestedProfileId | null {
  if (isEReaderUserAgent(userAgent)) return 'default-ereader';
  if (isMobileDevice) return 'default-mobile';
  return null;
}

/**
 * True only for first-timers: the onboarding choice was never answered and no
 * active profile was ever persisted. Reads raw localStorage (not the stores,
 * whose in-memory defaults would mask a fresh install).
 */
export function isFirstTimeProfileUser(): boolean {
  if (!browser) return false;
  try {
    return (
      localStorage.getItem(PROFILE_CHOICE_SEEN_KEY) === null &&
      localStorage.getItem('activeProfileId') === null
    );
  } catch {
    return false;
  }
}

export function markProfileChoiceSeen(): void {
  if (!browser) return;
  try {
    localStorage.setItem(PROFILE_CHOICE_SEEN_KEY, '1');
  } catch {
    // Storage may be unavailable (private mode); the modal simply may reappear.
  }
}

const EREADER_PRE_V3_DESCRIPTION =
  'High contrast & medium font weight for E-Ink devices (20px font, 500 weight)';

export function ensureDefaultProfiles(): void {
  if (!browser) return;
  const storedVersion = Number(localStorage.getItem('readerProfilesVersion') || 0);
  if (storedVersion >= PROFILES_SCHEMA_VERSION) return;

  const currentProfiles = readerProfiles$?.getValue?.() || [];
  let modified = false;
  const updated = [...currentProfiles];

  // 1. If 'default-tablet' is still named 'Tablet / E-Reader', update name and description
  const tabletIndex = updated.findIndex((p) => p.id === 'default-tablet');
  if (tabletIndex !== -1 && updated[tabletIndex].name === 'Tablet / E-Reader') {
    updated[tabletIndex] = {
      ...updated[tabletIndex],
      name: 'Tablet',
      description: 'Spacious touch layout with generous margins for tablets (22px font)'
    };
    modified = true;
  }

  // 2. If 'default-ereader' does not exist, append it
  if (!updated.some((p) => p.id === 'default-ereader')) {
    const ereaderProfile = defaultReaderProfiles.find((p) => p.id === 'default-ereader');
    if (ereaderProfile) {
      updated.push(ereaderProfile);
      modified = true;
    }
  }

  // 3. v3: pinned reader header setting + e-reader navigation defaults.
  //    keepReaderHeaderVisible is new, so stored profiles get the per-profile
  //    default (ON for E-Reader, OFF elsewhere). Tap-edge/page-break flips only
  //    apply when the stored e-reader profile still carries the old defaults,
  //    so deliberate user customizations are never clobbered.
  if (storedVersion < 3) {
    const ereaderDefaults = defaultReaderProfiles.find((p) => p.id === 'default-ereader');
    for (let i = 0; i < updated.length; i++) {
      const profile = updated[i];
      if (!profile?.settings) continue;
      const settings = { ...profile.settings };
      let changed = false;

      if (settings.keepReaderHeaderVisible === undefined) {
        settings.keepReaderHeaderVisible = profile.id === 'default-ereader';
        changed = true;
      }

      if (profile.id === 'default-ereader') {
        if (settings.enableTapEdgeToFlip === true) {
          settings.enableTapEdgeToFlip = false;
          changed = true;
        }
        if (settings.avoidPageBreak === false) {
          settings.avoidPageBreak = true;
          changed = true;
        }
        if (profile.description === EREADER_PRE_V3_DESCRIPTION && ereaderDefaults?.description) {
          updated[i] = { ...profile, settings, description: ereaderDefaults.description };
          modified = true;
          continue;
        }
      }

      if (changed) {
        updated[i] = { ...profile, settings };
        modified = true;
      }
    }

    // Reflect the same conditional flips in the live stores when E-Reader is
    // the active profile, otherwise the reader keeps the stale values until
    // the profile is next applied.
    if (activeProfileId$.getValue?.() === 'default-ereader') {
      if (enableTapEdgeToFlip$.getValue() === true) enableTapEdgeToFlip$.next(false);
      if (avoidPageBreak$.getValue() === false) avoidPageBreak$.next(true);
      if (keepReaderHeaderVisible$.getValue() === false) keepReaderHeaderVisible$.next(true);
    }
  }

  if (modified) {
    readerProfiles$.next(updated);
  }
  localStorage.setItem('readerProfilesVersion', String(PROFILES_SCHEMA_VERSION));
}

if (browser) {
  queueMicrotask(() => {
    ensureDefaultProfiles();
  });
}
