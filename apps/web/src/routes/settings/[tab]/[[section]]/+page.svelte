<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { combineLatest, skip, tap, type Subscription } from 'rxjs';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import SettingsContent from '$lib/components/settings/settings-content.svelte';
  import SettingsHeader from '$lib/components/settings/settings-header.svelte';
  import { DEFAULT_READER_SECTION } from '$lib/components/settings/settings-tabs';
  import { pxScreen } from '$lib/css-classes';
  import {
    isStatisticsSettingsSyncSuppressed,
    syncProfilesToCloudTarget
  } from '$lib/data/profiles/profile-manager';
  import {
    addCharactersOnCompletion$,
    adjustStatisticsAfterIdleTime$,
    appThemeMode$,
    autosaveHistoryEnabled$,
    autosaveHistoryInterval$,
    autosaveHistoryMaxCount$,
    autoPositionOnResize$,
    avoidPageBreak$,
    cacheStorageData$,
    confirmClose$,
    customReadingPointEnabled$,
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
    externalReadAction$,
    hideFurigana$,
    hideSpoilerImage$,
    importHTMLFixMode$,
    keepReaderHeaderVisible$,
    lastProfilesModified$,
    lineHeight$,
    loaderMode$,
    manualBookmark$,
    keepLocalStatisticsOnDeletion$,
    openTrackerOnCompletion$,
    overwriteBookCompletion$,
    pageColumns$,
    pauseTrackerOnCustomPointChange$,
    prioritizeReaderStyles$,
    restrictImportFixToAnchor$,
    secondDimensionMaxValue$,
    selectionToBookmarkEnabled$,
    showCharacterCounter$,
    showPercentage$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    startDayHoursForTracker$,
    statisticsEnabled$,
    swipeThreshold$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    trackerAutoPause$,
    trackerBackwardSkipThreshold$,
    trackerForwardSkipThreshold$,
    trackerAutostartTime$,
    trackerIdleTime$,
    trackerPopupDetection$,
    trackerSkipThresholdAction$,
    verticalTextOrientation$,
    viewMode$,
    writingMode$,
    hideSpoilerImageMode$,
    lastStatisticsSettingsModified$
  } from '$lib/data/store';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import type { PageData } from './$types';
  import { pagePath } from '$lib/data/env';
  import { storage } from '$lib/data/window/navigator/storage';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { writableSubject } from '$lib/functions/svelte/store';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';

  export let data: PageData;

  const persistentStorage$ = writableSubject(false);
  let persistentStorageReactive = false;

  let initialProfilesModified = 0;
  let statisticsSettingsSyncSub: Subscription | undefined;

  // Statistics behavior settings roam via the profiles payload but are not
  // profile-scoped, so they need their own dirty tracking. Any local edit
  // bumps both timestamps: the section LWW marker and lastProfilesModified$,
  // which the existing leave-page check uses as its upload trigger.
  const statisticsSettingsSubjects = [
    statisticsEnabled$,
    trackerAutostartTime$,
    trackerIdleTime$,
    trackerForwardSkipThreshold$,
    trackerBackwardSkipThreshold$,
    trackerSkipThresholdAction$,
    trackerPopupDetection$,
    trackerAutoPause$,
    adjustStatisticsAfterIdleTime$,
    openTrackerOnCompletion$,
    addCharactersOnCompletion$,
    keepLocalStatisticsOnDeletion$,
    overwriteBookCompletion$,
    startDayHoursForTracker$
  ];

  onMount(() => {
    initialProfilesModified = lastProfilesModified$.getValue() || 0;
    storage.persisted().then(setPersistentStorage);

    setStorageQuota();

    statisticsSettingsSyncSub = combineLatest(statisticsSettingsSubjects)
      .pipe(skip(1))
      .subscribe(() => {
        if (isStatisticsSettingsSyncSuppressed()) return;
        const now = Date.now();
        lastStatisticsSettingsModified$.next(now);
        lastProfilesModified$.next(now);
      });
  });

  function checkAndSyncProfiles() {
    const currentModified = lastProfilesModified$.getValue() || 0;
    if (currentModified > initialProfilesModified) {
      initialProfilesModified = currentModified;
      syncProfilesToCloudTarget();
    }
  }

  beforeNavigate(() => {
    checkAndSyncProfiles();
  });

  onDestroy(() => {
    statisticsSettingsSyncSub?.unsubscribe();
    statisticsSettingsSyncSub = undefined;
    checkAndSyncProfiles();
  });

  let prevPage = `${pagePath}${mergeEntries.MANAGE.routeId}`;

  $: activeSettings = data.tab;
  $: activeReaderSection = data.section ?? DEFAULT_READER_SECTION;
  $: activeReaderSectionExplicit = data.sectionParam !== null;

  // Reader sections switch locally without navigation (see settings-content.svelte),
  // so the document title follows the silent `sectionChange` event. Real route
  // changes reseed via `data` and clear the override.
  let readerSectionOverride: string | null = null;
  $: {
    data.section;
    data.sectionParam;
    readerSectionOverride = null;
  }
  $: effectiveReaderSection = readerSectionOverride ?? activeReaderSection;

  $: settingsTitle =
    activeSettings === 'Reader' && effectiveReaderSection !== 'all'
      ? `Settings – Reader – ${effectiveReaderSection.charAt(0).toUpperCase()}${effectiveReaderSection.slice(1)}`
      : `Settings – ${activeSettings}`;

  let storageQuota = '';

  afterNavigate((navigation) => {
    const { from, to } = navigation;
    if (!from) return;
    // Tab/section switches stay inside settings and must not clobber the back target.
    if (from.route?.id?.startsWith('/settings') && to?.route?.id?.startsWith('/settings')) {
      return;
    }
    prevPage = `${from.url.pathname}${from.url.search}`;
  });

  const setPersistentStorage$ = persistentStorage$.pipe(
    tap((value) => {
      if (!persistentStorageReactive) return;
      if (!value) {
        setPersistentStorage(true);
        return;
      }

      storage.persist().then(setPersistentStorage).finally(setStorageQuota);
    }),
    reduceToEmptyString()
  );

  function setPersistentStorage(value: boolean) {
    persistentStorageReactive = false;
    persistentStorage$.next(value);
    persistentStorageReactive = true;
  }

  function setStorageQuota() {
    storage
      .estimate()
      .then((storageData) => {
        const { usage, quota } = storageData;

        if (usage === undefined || quota === undefined) {
          return;
        }

        storageQuota = `${Math.round(((usage / quota) * 100 + Number.EPSILON) * 100) / 100} % used`;
      })
      .catch(() => {
        // no-op
      });
  }
</script>

<svelte:head>
  <title>{formatPageTitle(settingsTitle)}</title>
</svelte:head>

<div class="elevation-4 fixed inset-x-0 top-0 z-30">
  <SettingsHeader leavePageLink={prevPage} {activeSettings} />
</div>

<div class="{pxScreen} h-full pt-16 xl:pt-14">
  <div class="w-full max-w-6xl mx-auto">
    <SettingsContent
      {activeSettings}
      {activeReaderSection}
      {activeReaderSectionExplicit}
      on:sectionChange={(e) => (readerSectionOverride = e.detail.section)}
      {storageQuota}
      bind:appThemeMode={$appThemeMode$}
      bind:selectedTheme={$theme$}
      bind:fontFamilyGroupOne={$fontFamilyGroupOne$}
      bind:fontFamilyGroupTwo={$fontFamilyGroupTwo$}
      bind:fontWeight={$fontWeight$}
      bind:fontSize={$fontSize$}
      bind:lineHeight={$lineHeight$}
      bind:textIndentation={$textIndentation$}
      bind:textMarginValue={$textMarginValue$}
      bind:blurImage={$hideSpoilerImage$}
      bind:blurImageMode={$hideSpoilerImageMode$}
      bind:hideFurigana={$hideFurigana$}
      bind:furiganaStyle={$furiganaStyle$}
      bind:writingMode={$writingMode$}
      bind:enableFontKerning={$enableVerticalFontKerning$}
      bind:enableFontVPAL={$enableFontVPAL$}
      bind:verticalTextOrientation={$verticalTextOrientation$}
      bind:prioritizeReaderStyles={$prioritizeReaderStyles$}
      bind:enableTextJustification={$enableTextJustification$}
      bind:enableTextWrapPretty={$enableTextWrapPretty$}
      bind:textMarginMode={$textMarginMode$}
      bind:enableReaderWakeLock={$enableReaderWakeLock$}
      bind:showCharacterCounter={$showCharacterCounter$}
      bind:showPercentage={$showPercentage$}
      bind:showFooterChapterCharacterCounter={$showFooterChapterCharacterCounter$}
      bind:showFooterChapterPercentage={$showFooterChapterPercentage$}
      bind:viewMode={$viewMode$}
      bind:secondDimensionMaxValue={$secondDimensionMaxValue$}
      bind:firstDimensionMargin={$firstDimensionMargin$}
      bind:swipeThreshold={$swipeThreshold$}
      bind:disableWheelNavigation={$disableWheelNavigation$}
      bind:autoPositionOnResize={$autoPositionOnResize$}
      bind:avoidPageBreak={$avoidPageBreak$}
      bind:pauseTrackerOnCustomPointChange={$pauseTrackerOnCustomPointChange$}
      bind:customReadingPointEnabled={$customReadingPointEnabled$}
      bind:selectionToBookmarkEnabled={$selectionToBookmarkEnabled$}
      bind:enableTapEdgeToFlip={$enableTapEdgeToFlip$}
      bind:keepReaderHeaderVisible={$keepReaderHeaderVisible$}
      bind:pageColumns={$pageColumns$}
      bind:persistentStorage={$persistentStorage$}
      bind:externalReadAction={$externalReadAction$}
      bind:confirmClose={$confirmClose$}
      bind:manualBookmark={$manualBookmark$}
      bind:autosaveHistoryEnabled={$autosaveHistoryEnabled$}
      bind:autosaveHistoryInterval={$autosaveHistoryInterval$}
      bind:autosaveHistoryMaxCount={$autosaveHistoryMaxCount$}
      bind:importHTMLFixMode={$importHTMLFixMode$}
      bind:restrictImportFixToAnchor={$restrictImportFixToAnchor$}
      bind:cacheStorageData={$cacheStorageData$}
      bind:keepLocalStatisticsOnDeletion={$keepLocalStatisticsOnDeletion$}
      bind:overwriteBookCompletion={$overwriteBookCompletion$}
      bind:startDayHoursForTracker={$startDayHoursForTracker$}
      bind:statisticsEnabled={$statisticsEnabled$}
      bind:loaderMode={$loaderMode$}
      bind:trackerAutoPause={$trackerAutoPause$}
      bind:openTrackerOnCompletion={$openTrackerOnCompletion$}
      bind:addCharactersOnCompletion={$addCharactersOnCompletion$}
      bind:trackerAutoStartTime={$trackerAutostartTime$}
      bind:trackerIdleTime={$trackerIdleTime$}
      bind:trackerForwardSkipThreshold={$trackerForwardSkipThreshold$}
      bind:trackerBackwardSkipThreshold={$trackerBackwardSkipThreshold$}
      bind:trackerSkipThresholdAction={$trackerSkipThresholdAction$}
      bind:trackerPopupDetection={$trackerPopupDetection$}
      bind:adjustStatisticsAfterIdleTime={$adjustStatisticsAfterIdleTime$}
    />
  </div>
</div>
{$setPersistentStorage$ ?? ''}
