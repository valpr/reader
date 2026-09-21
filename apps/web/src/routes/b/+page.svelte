<script lang="ts">
  import {
    auditTime,
    debounceTime,
    EMPTY,
    filter,
    fromEvent,
    map,
    merge,
    NEVER,
    of,
    share,
    shareReplay,
    skip,
    startWith,
    switchMap,
    take,
    takeWhile,
    tap,
    timer
  } from 'rxjs';
  import { quintInOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { faCloudBolt, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
  import { BookLoader } from '@custom-ereader/ui';
  import BookReader from '$lib/components/book-reader/book-reader.svelte';
  import type {
    AutoScroller,
    BookmarkManager,
    PageManager
  } from '$lib/components/book-reader/types';
  import LogReportDialog from '$lib/components/log-report-dialog.svelte';
  import MessageDialog from '$lib/components/message-dialog.svelte';
  import StyleSheetRenderer from '$lib/components/style-sheet-renderer.svelte';
  import {
    autosaveHistoryEnabled$,
    autosaveHistoryInterval$,
    autosaveHistoryMaxCount$,
    autoPositionOnResize$,
    avoidPageBreak$,
    bookReaderKeybindMap$,
    database,
    enableTapEdgeToFlip$,
    enableTextJustification$,
    enableTextWrapPretty$,
    firstDimensionMargin$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    fontSize$,
    fontWeight$,
    furiganaStyle$,
    hideFurigana$,
    hideSpoilerImage$,
    multiplier$,
    pageColumns$,
    prioritizeReaderStyles$,
    secondDimensionMaxValue$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    trackerAutostartTime$,
    verticalMode$,
    writingMode$,
    viewMode$,
    selectionToBookmarkEnabled$,
    lineHeight$,
    loaderMode$,
    syncTarget$,
    pendingCloudSync$,
    pushTransientNotice,
    autoReplication$,
    skipKeyDownListener$,
    replicationSaveBehavior$,
    cacheStorageData$,
    confirmClose$,
    verticalCustomReadingPosition$,
    horizontalCustomReadingPosition$,
    customReadingPointEnabled$,
    statisticsEnabled$,
    openTrackerOnCompletion$,
    addCharactersOnCompletion$,
    statisticsMergeMode$,
    isOnline$,
    manualBookmark$,
    customThemes$,
    overwriteBookCompletion$,
    startDayHoursForTracker$,
    readingGoalsMergeMode$,
    pauseTrackerOnCustomPointChange$,
    hideSpoilerImageMode$,
    showCharacterCounter$,
    showPercentage$,
    enableVerticalFontKerning$,
    enableFontVPAL$,
    verticalTextOrientation$
  } from '$lib/data/store';
  import BookCompletionConfetti from '$lib/components/book-reader/book-completion-confetti/book-completion-confetti.svelte';
  import BookReaderHeader from '$lib/components/book-reader/book-reader-header.svelte';
  import {
    readerImageGalleryPictures$,
    toggleImageGalleryPictureSpoiler$,
    updateImageGalleryPictureSpoilers$
  } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';
  import BookReaderImageGallery from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery.svelte';
  import {
    getDefaultStatistic,
    isTrackerMenuOpen$,
    isTrackerPaused$
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import BookReadingTracker from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker.svelte';
  import {
    getChapterData,
    nextChapter$,
    sectionList$,
    sectionProgress$,
    tocIsOpen$,
    type SectionWithProgress
  } from '$lib/components/book-reader/book-toc/book-toc';
  import BookToc from '$lib/components/book-reader/book-toc/book-toc.svelte';
  import { bookmarkPanelIsOpen$ } from '$lib/components/book-reader/book-bookmarks/book-bookmark-panel';
  import BookBookmarkPanel from '$lib/components/book-reader/book-bookmarks/book-bookmark-panel.svelte';
  import BookmarkCreateDialog from '$lib/components/book-reader/book-bookmarks/bookmark-create-dialog.svelte';
  import { generateBookmarkLabel } from '$lib/components/book-reader/book-bookmarks/bookmark-utils';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  import NumberDialog from '$lib/components/number-dialog.svelte';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import { preFilteredTitlesForStatistics$ } from '$lib/components/statistics/statistics-types';
  import {
    currentDbVersion,
    type BooksDbBookData,
    type BooksDbBookmarkData,
    type BooksDbStatistic,
    type BooksDbUserBookmarkData
  } from '$lib/data/database/books-db/versions/books-db';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { pagePath } from '$lib/data/env';
  import { DB_VERSION, PAGE_CHANGE, SKIPKEYLISTENER, SYNCED } from '$lib/data/events';
  import { fullscreenManager } from '$lib/data/fullscreen-manager';
  import { logger } from '$lib/data/logger';
  import { MergeMode } from '$lib/data/merge-mode';
  import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
  import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
  import type { BrowserStorageHandler } from '$lib/data/storage/handler/browser-handler';
  import {
    StorageDataType,
    StorageSourceDefault,
    StorageKey,
    getFriendlyStorageSourceName
  } from '$lib/data/storage/storage-types';
  import { storageSource$ } from '$lib/data/storage/storage-view';
  import { availableThemes } from '$lib/data/theme-option';
  import { ViewMode } from '$lib/data/view-mode';
  import loadBookData from '$lib/functions/book-data-loader/load-book-data';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { iffBrowser } from '$lib/functions/rxjs/iff-browser';
  import {
    AutoReplicationType,
    ReplicationSaveBehavior
  } from '$lib/functions/replication/replication-options';
  import { replicateData } from '$lib/functions/replication/replicator';
  import {
    triggerExitSync,
    waitForExitSync,
    type ExitSyncSnapshot
  } from '$lib/functions/replication/exit-sync';
  import { reconnectAndSyncNow } from '$lib/functions/replication/cloud-reauth';
  import { BOOK_SCOPED_DATA_TYPES } from '$lib/functions/replication/cloud-sync';
  import {
    StorageOAuthManager,
    getExpiredSyncTargets,
    isSessionExpiredError,
    storageConnectionStates$
  } from '$lib/data/storage/storage-oauth-manager';
  import { readableToObservable } from '$lib/functions/rxjs/readable-to-observable';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { takeWhenBrowser } from '$lib/functions/rxjs/take-when-browser';
  import { tapDom } from '$lib/functions/rxjs/tap-dom';
  import { multiClickHandler } from '$lib/functions/multi-click-handler';
  import {
    executeReplicate$,
    type ReplicationContext
  } from '$lib/functions/replication/replication-progress';
  import { getDateKey } from '$lib/functions/statistic-util';
  import { clickOutside } from '$lib/functions/use-click-outside';
  import {
    convertRemToPixels,
    dummyFn,
    isMobile$,
    limitToRange,
    getWeightedAverage
  } from '$lib/functions/utils';
  import { onKeydownReader } from './on-keydown-reader';
  import { onDestroy, onMount, tick } from 'svelte';
  import Fa from 'svelte-fa';
  import {
    clearRange,
    getParagraphToPoint,
    getRangeForUserSelection,
    getReferencePoints,
    pulseElement
  } from '$lib/functions/range-util';

  let showSpinner = true;
  let loaderStage = 'Opening local book…';
  let showHeader = false;
  let isBookmarkScreen = false;
  let showFooter = true;
  let exploredCharCount = 0;
  let bookCharCount = 0;
  let autoScroller: AutoScroller | undefined;
  let bookmarkManager: BookmarkManager | undefined;
  let pageManager: PageManager | undefined;
  let bookmarkData: Promise<BooksDbBookmarkData | undefined> = Promise.resolve(undefined);
  let customReadingPointTop = -2;
  let customReadingPointLeft = -2;
  let customReadingPoint = $verticalMode$
    ? $verticalCustomReadingPosition$
    : $horizontalCustomReadingPosition$;
  let customReadingPointScrollOffset = 0;
  let customReadingPointRange: Range | undefined;
  let lastSelectedRange: Range | undefined;
  let lastSelectedRangeWasEmpty = true;
  let isSelectingCustomReadingPoint = false;
  let showCustomReadingPoint = false;
  let localStorageHandler: BrowserStorageHandler;
  let dataToReplicate: StorageDataType[] = [];
  let dataToReplicateQueue: StorageDataType[] = [];
  let externalStorageHandler: BaseStorageHandler | undefined;
  let externalStorageErrors = 0;
  let isReplicating = false;
  let storedExploredCharacter = 0;
  let hasBookmarkData = false;
  let blockDataUpdates = false;
  let trackerElm: BookReadingTracker;
  let userBookmarks: BooksDbUserBookmarkData[] = [];
  let showTrackerIcon = false;
  let wasTrackerPaused = true;
  let frozenPosition = -1;
  let skipFirstFreezeChange = false;
  let bookCompleted = false;
  let confettiWidthModifier = 36;
  let confettiMaxRuns = 0;
  let showReaderImageGallery = false;
  let dismissDialogs = true;
  let syncedResolver: () => void;

  const syncedPromise = new Promise<void>((resolver) => {
    syncedResolver = resolver;
  });
  const queuedReaderImageGalleryPictures = new Map<string, boolean>();
  const fontFeatureSettings = [
    $enableVerticalFontKerning$ && '"vkrn"',
    $enableFontVPAL$ && '"vpal"'
  ]
    .filter((f) => !!f && $verticalMode$)
    .join(', ');
  const verticalTextOrientation = $verticalMode$ ? $verticalTextOrientation$ : '';

  const bookPageParams$ = iffBrowser(() => readableToObservable(page)).pipe(
    map((pageObj) => ({
      id: Number(pageObj.url.searchParams.get('id')),
      // Set by manage/+page openBook after a cloud download: the local copy
      // is already fresh, so the reader must not do any network sync on open
      // (option B: zero extra calls; lastBookOpen uploads on exit sync).
      justDownloaded: pageObj.url.searchParams.get('justDownloaded') === '1'
    })),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  const bookId$ = bookPageParams$.pipe(
    map((params) => params.id),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  const rawBookData$ = bookPageParams$.pipe(
    switchMap(async ({ id, justDownloaded }) => {
      let bookData: BooksDbBookData | undefined;

      try {
        await waitForExitSync();

        localStorageHandler = getStorageHandler(
          window,
          StorageKey.BROWSER,
          undefined,
          true,
          $cacheStorageData$,
          $replicationSaveBehavior$,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );

        bookData = await database.getData(id);

        if (!bookData) {
          return bookData;
        }

        const currentContext = {
          id: bookData.id,
          title: bookData.title,
          imagePath: bookData.coverImage
        };

        if (bookData.storageSource) {
          externalStorageHandler = await getStorageHandlerByName(bookData.storageSource, true);
        } else if ($autoReplication$ !== AutoReplicationType.Off) {
          externalStorageHandler = await getStorageHandlerByName($syncTarget$);
        }

        bookData.lastBookOpen = new Date().getTime();

        await localStorageHandler.updateLastRead(bookData, currentContext);
        if (justDownloaded) {
          // Option B: download already synced DATA/PROGRESS/BOOKMARKS. Skip
          // all network on open; strip the flag so a refresh syncs normally.
          // lastBookOpen stays local-only until the next/exit sync.
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('justDownloaded');
            window.history.replaceState({}, '', url.toString());
          } catch {
            // no-op
          }
        } else {
          loaderStage = 'Syncing cloud library…';
          await syncDownData(externalStorageHandler, currentContext);
        }

        if (!$statisticsEnabled$) {
          const wasNew = (
            await database.setFirstBookRead(currentContext.title, $startDayHoursForTracker$)
          )[1];

          if (wasNew && !justDownloaded) {
            scheduleReplication(StorageDataType.STATISTICS);
          }
        }

        if (!justDownloaded) {
          loaderStage = 'Saving reading position…';
          bookData = await saveExternalLastRead(externalStorageHandler, bookData, currentContext);
        }

        if (bookData.language) {
          document.documentElement.lang = bookData.language;
        }
      } catch (error: any) {
        // Expired cloud sessions surface via banner/icon + reconnect and
        // must never modal or bounce the reader: the local copy already
        // loaded above is fully readable, so continue with it.
        if (bookData && isSessionExpiredError(error)) {
          logger.warn(`Cloud sync skipped for "${bookData.title}": ${error.message}`);

          return bookData;
        }

        const message = `Error loading book: ${error.message}`;

        logger.warn(message);

        dialogManager.dialogs$.next([
          {
            component: MessageDialog,
            props: {
              title: 'Load Error',
              message
            }
          }
        ]);
        return undefined;
      } finally {
        syncedResolver();

        showSpinner = false;
      }

      if (externalStorageHandler) {
        externalStorageHandler.updateSettings(
          window,
          true,
          $replicationSaveBehavior$,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$,
          $cacheStorageData$,
          false,
          bookData.storageSource || $syncTarget$
        );
      }

      if (bookData?.id) {
        loaderStage = 'Restoring reading position…';
        bookmarkData = resolveResumeBookmark(bookData.id);
      }

      return bookData;
    }),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  const leaveIfBookMissing$ = rawBookData$.pipe(
    tap((data) => {
      if (!data) {
        goto(`${pagePath}${mergeEntries.MANAGE.routeId}`);
      }
    }),
    reduceToEmptyString()
  );

  const initBookmarkData$ = rawBookData$.pipe(
    tap((rawBookData) => {
      if (!rawBookData?.id) return;
      bookmarkData = resolveResumeBookmark(rawBookData.id);
    }),
    reduceToEmptyString()
  );

  function mapUserBookmarkToBookmark(
    dataId: number,
    bookmark: BooksDbUserBookmarkData
  ): BooksDbBookmarkData {
    // Restores are explicit user intent: stamp now so the restored position
    // wins the next last-write-wins comparison deterministically (P6).
    return {
      dataId,
      exploredCharCount: bookmark.exploredCharCount,
      progress: bookmark.progress,
      lastBookmarkModified: Date.now()
    };
  }

  function mapAutosaveToBookmark(
    dataId: number,
    autosave: BooksDbUserBookmarkData
  ): BooksDbBookmarkData {
    return {
      dataId,
      exploredCharCount: autosave.exploredCharCount,
      progress: autosave.progress,
      lastBookmarkModified: Date.now()
    };
  }

  async function seedLegacyBookmarkAsAutosave(
    dataId: number,
    stored: BooksDbBookmarkData
  ): Promise<void> {
    const charCount = Math.max(1, stored.exploredCharCount || 0);
    if (!charCount) return;

    const progress =
      typeof stored.progress === 'number'
        ? stored.progress
        : bookCharCount
          ? Math.min(1, charCount / bookCharCount)
          : 0;

    await database.putAutosaveBookmark(
      {
        dataId,
        exploredCharCount: charCount,
        progress,
        label: generateBookmarkLabel($sectionData$, charCount, bookCharCount || charCount),
        color: 'gray',
        note: 'Autosaved reading checkpoint',
        createdAt: stored.lastBookmarkModified || Date.now(),
        lastModified: Date.now(),
        isAutosave: true
      },
      $autosaveHistoryMaxCount$ || 10
    );

    await refreshUserBookmarks();
  }

  async function resolveResumeBookmark(dataId: number): Promise<BooksDbBookmarkData | undefined> {
    const [stored, all] = await Promise.all([
      database.getBookmark(dataId),
      database.getUserBookmarks(dataId).catch(() => [] as BooksDbUserBookmarkData[])
    ]);

    // Find the newest checkpoint across all user bookmarks (manual bookmarks or rolling autosaves)
    const latestUserBookmark = all
      .slice()
      .sort(
        (a, b) =>
          Math.max(b.lastModified || 0, b.createdAt || 0) -
          Math.max(a.lastModified || 0, a.createdAt || 0)
      )[0];

    const latestAutosave = all
      .filter((b) => b.isAutosave)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!stored) {
      if (!latestUserBookmark) return undefined;
      const mapped = mapUserBookmarkToBookmark(dataId, latestUserBookmark);
      await database.putBookmark(mapped);
      return mapped;
    }

    if (!latestUserBookmark) {
      // Forward-fill history from the legacy position so future resumes converge.
      if ($autosaveHistoryEnabled$ && (stored.exploredCharCount || 0) > 0) {
        void seedLegacyBookmarkAsAutosave(dataId, stored).catch(() => undefined);
      }
      return stored;
    }

    const userBookmarkTime = Math.max(
      latestUserBookmark.lastModified || 0,
      latestUserBookmark.createdAt || 0
    );
    const storedTime = stored.lastBookmarkModified || 0;

    // Prefer user bookmark/autosave if stored has 0 characters but user bookmark has reading progress,
    // or if the user bookmark was modified more recently than the stored bookmark.
    const preferUserBookmark =
      ((stored.exploredCharCount || 0) === 0 && (latestUserBookmark.exploredCharCount || 0) > 0) ||
      userBookmarkTime >= storedTime;

    if (preferUserBookmark) {
      const mapped = mapUserBookmarkToBookmark(dataId, latestUserBookmark);
      if (stored && stored.exploredCharCount === latestUserBookmark.exploredCharCount) {
        if (stored.scrollX !== undefined) mapped.scrollX = stored.scrollX;
        if (stored.scrollY !== undefined) mapped.scrollY = stored.scrollY;
      }
      // Keep the single-slot progress converged without extra sync churn on open.
      void database.putBookmark(mapped).catch(() => undefined);
      return mapped;
    }

    if ($autosaveHistoryEnabled$ && !latestAutosave && (stored.exploredCharCount || 0) > 0) {
      void seedLegacyBookmarkAsAutosave(dataId, stored).catch(() => undefined);
    }

    return stored;
  }

  const initUserBookmarks$ = rawBookData$.pipe(
    switchMap((b) => {
      if (!b?.id) return EMPTY;
      return database.userBookmarksChanged$.pipe(
        startWith(0),
        switchMap(() => database.getUserBookmarks(b.id)),
        tap((bms) => {
          userBookmarks = bms;
        })
      );
    }),
    map((): '' => '')
  );

  const bookData$ = rawBookData$.pipe(
    switchMap((rawBookData) => {
      if (!rawBookData) return EMPTY;

      sectionList$.next(rawBookData.sections || []);

      return loadBookData(
        rawBookData,
        '.book-content',
        document,
        $viewMode$ === ViewMode.Paginated,
        $hideSpoilerImageMode$
      );
    }),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  const resize$ = iffBrowser(() =>
    visualViewport ? fromEvent(visualViewport, 'resize') : of()
  ).pipe(share());

  const containerViewportWidth$ = resize$.pipe(
    startWith(0),
    map(() => visualViewport?.width || 0),
    takeWhenBrowser()
  );

  const containerViewportHeight$ = resize$.pipe(
    startWith(0),
    map(() => visualViewport?.height || 0),
    takeWhenBrowser()
  );

  const themeOption$ = theme$.pipe(
    map(
      (theme) =>
        availableThemes.get(theme) || $customThemes$[theme] || availableThemes.get('light-theme')
    ),
    filter((o): o is NonNullable<typeof o> => !!o),
    takeWhenBrowser()
  );

  const backgroundColor$ = themeOption$.pipe(map((o) => o.backgroundColor));

  const collectReaderImageGallerySpoilerToggles$ = toggleImageGalleryPictureSpoiler$.pipe(
    tap((readerImageGalleryPicture) => {
      queuedReaderImageGalleryPictures.set(
        readerImageGalleryPicture.url,
        readerImageGalleryPicture.unspoilered
      );

      updateImageGalleryPictureSpoilers$.next();
    }),
    reduceToEmptyString()
  );

  const handleUpdateImageGalleryPictureSpoilers$ = updateImageGalleryPictureSpoilers$.pipe(
    debounceTime(250),
    tap(() => {
      $readerImageGalleryPictures$ = $readerImageGalleryPictures$.map((galleryPicture) => {
        const picture = galleryPicture;

        if (queuedReaderImageGalleryPictures.has(picture.url)) {
          picture.unspoilered = queuedReaderImageGalleryPictures.get(picture.url)!;
        }

        return picture;
      });

      queuedReaderImageGalleryPictures.clear();
    }),
    reduceToEmptyString()
  );

  const backgroundStyleName = 'background-color';
  const setBackgroundColor$ = backgroundColor$.pipe(
    tapDom(
      () => document.body,
      (backgroundColor, body) => body.style.setProperty(backgroundStyleName, backgroundColor),
      (body) => body.style.removeProperty(backgroundStyleName)
    ),
    reduceToEmptyString(),
    takeWhenBrowser()
  );

  const writingModeStyleName = 'writing-mode';
  const setWritingMode$ = writingMode$.pipe(
    tapDom(
      () => document.documentElement,
      (writingMode, documentElement) =>
        documentElement.style.setProperty(writingModeStyleName, writingMode),
      (documentElement) => documentElement.style.removeProperty(writingModeStyleName)
    ),
    reduceToEmptyString(),
    takeWhenBrowser()
  );

  const sectionData$ = iffBrowser(() => sectionProgress$).pipe(
    map((sectionProgress) => [...sectionProgress.values()])
  );

  const textSelector$ = iffBrowser(() => fromEvent(document, 'selectionchange')).pipe(
    debounceTime(200),
    tap(() => {
      const currentSelected = window.getSelection()?.toString() || '';

      if (!currentSelected && lastSelectedRangeWasEmpty) {
        lastSelectedRange = undefined;
      } else if (currentSelected) {
        lastSelectedRange = window.getSelection()?.getRangeAt(0);
        lastSelectedRangeWasEmpty = false;
      } else {
        lastSelectedRangeWasEmpty = true;
      }
    }),
    reduceToEmptyString()
  );

  const replicator$ = executeReplicate$.pipe(
    auditTime(60000),
    switchMap(() => executeReplication()),
    reduceToEmptyString()
  );

  const autoStartTracker$ = iffBrowser(() =>
    $statisticsEnabled$ && $trackerAutostartTime$ > 0 ? fromEvent(document, PAGE_CHANGE) : NEVER
  ).pipe(
    debounceTime($trackerAutostartTime$ * 1000),
    take(1),
    tap(() => {
      wasTrackerPaused = false;
      isTrackerPaused$.next(wasTrackerPaused);
    }),
    reduceToEmptyString()
  );

  $: if ($tocIsOpen$) {
    autoScroller?.off();
  }

  $: if (browser && bookCharCount) {
    document.dispatchEvent(new CustomEvent(PAGE_CHANGE, { detail: { exploredCharCount } }));
  }

  $: if (browser) {
    document.dispatchEvent(new CustomEvent(PAGE_CHANGE, { detail: { bookCharCount } }));
  }

  $: if (showCustomReadingPoint) {
    pauseTracker();

    pulseElement(customReadingPointRange?.endContainer?.parentElement, 'add', 1);

    fromEvent(document, 'click')
      .pipe(skip(1), take(1))
      .subscribe(() => {
        showCustomReadingPoint = false;
        pulseElement(customReadingPointRange?.endContainer?.parentElement, 'remove', 1);
        restartTrackerAfterCharacterChangeOrTime(1);
      });
  }

  $: if (frozenPosition !== -1 && exploredCharCount >= frozenPosition) {
    if (skipFirstFreezeChange) {
      skipFirstFreezeChange = false;
    } else {
      frozenPosition = -1;
    }
  }

  $: isPaginated = $viewMode$ === ViewMode.Paginated;

  $: firstDimensionMargin =
    browser && $enableTapEdgeToFlip$ && isPaginated && $verticalMode$
      ? limitToRange(convertRemToPixels(window, 0.5), window.innerWidth, $firstDimensionMargin$)
      : ($firstDimensionMargin$ ?? 0);

  $: tapButtonHeight = `calc(100% - ${showHeader ? 5 : 4}rem)`;

  $: tapButtonTop = `${showHeader ? 3 : 2}rem`;

  $: footerChapterProgress = getCurrentChapterProgress($sectionData$);

  $: upSyncEnabled =
    externalStorageHandler &&
    ($autoReplication$ === AutoReplicationType.Up || $autoReplication$ === AutoReplicationType.All);

  $: bookmarkData.then((data) => {
    hasBookmarkData = !!data;
    storedExploredCharacter = data?.exploredCharCount || 0;
  });

  /** Experimental Code - May be removed any time without warning */

  $: if (browser) {
    document.dispatchEvent(new CustomEvent(SKIPKEYLISTENER, { detail: $skipKeyDownListener$ }));
  }

  onMount(() => document.addEventListener('ttu-action', handleAction, false));

  onDestroy(() => {
    if (browser) {
      autoScroller?.off();
      wasTrackerPaused = true;
      isTrackerPaused$.next(true);
      document.removeEventListener('ttu-action', handleAction, false);
    }
  });

  function handleAction({ detail }: any) {
    if (!detail.type) {
      return;
    }

    if (detail.type === 'dbVersion') {
      document.dispatchEvent(new CustomEvent(DB_VERSION, { detail: currentDbVersion }));
    } else if (detail.type === 'waitForSync') {
      syncedPromise.finally(() => document.dispatchEvent(new CustomEvent(SYNCED)));
    } else if (detail.type === 'skipKeyDownListener') {
      skipKeyDownListener$.next(detail.params.value);
    } else if (
      detail.type === 'sync' &&
      (detail.syncType === StorageDataType.AUDIOBOOK ||
        detail.syncType === StorageDataType.SUBTITLE)
    ) {
      scheduleReplication(detail.syncType);
    }
  }
  /** Experimental Code - May be removed any time without warning */

  onDestroy(() => {
    if (browser) {
      document.removeEventListener('ttu-action', handleAction, false);
      document.documentElement.lang = 'ja';
    }

    readerImageGalleryPictures$.next([]);

    if (autosaveDebounceTimer) {
      clearTimeout(autosaveDebounceTimer);
    }
  });

  let lastAutosavedCharCount = 0;
  let previousObservedCharCount = 0;
  let previousObservedTime = 0;
  let autosaveDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  function clearAutosaveDebounce() {
    if (autosaveDebounceTimer) {
      clearTimeout(autosaveDebounceTimer);
      autosaveDebounceTimer = undefined;
    }
  }

  function handlePositionChangeForAutosave(charCount: number) {
    if (!browser || !$autosaveHistoryEnabled$ || charCount <= 0 || !bookCharCount) return;

    const now = Date.now();
    if (previousObservedCharCount > 0 && previousObservedTime > 0) {
      const timeDiff = now - previousObservedTime;
      const charDiff = Math.abs(charCount - previousObservedCharCount);

      // Abnormal jump detection (> 2000 chars or > 5% of book in < 1.5s)
      const isGlitchJump = timeDiff < 1500 && (charDiff > 2000 || charDiff > bookCharCount * 0.05);
      if (isGlitchJump && Math.abs(previousObservedCharCount - lastAutosavedCharCount) >= 15) {
        createAutosaveSnapshot(previousObservedCharCount, 'Pre-jump Checkpoint');
        lastAutosavedCharCount = previousObservedCharCount;
      }
    } else {
      lastAutosavedCharCount = charCount;
    }

    previousObservedCharCount = charCount;
    previousObservedTime = now;

    // Reset debounce timer on every position change (page turn or scroll)
    clearAutosaveDebounce();

    const debounceSeconds = Math.max(1, $autosaveHistoryInterval$ || 3);
    autosaveDebounceTimer = setTimeout(() => {
      if (Math.abs(charCount - lastAutosavedCharCount) >= 15) {
        createAutosaveSnapshot(charCount);
        lastAutosavedCharCount = charCount;
      }
    }, debounceSeconds * 1000);
  }

  $: if (browser && exploredCharCount > 0 && bookCharCount > 0 && $autosaveHistoryEnabled$) {
    handlePositionChangeForAutosave(exploredCharCount);
  }

  async function refreshUserBookmarks() {
    const dataId = getBookIdSync();
    if (dataId) {
      userBookmarks = await database.getUserBookmarks(dataId);
    }
  }

  $: if ($bookmarkPanelIsOpen$) {
    refreshUserBookmarks();
  }

  async function syncAutosaveToProgress(dataId: number, charCount: number): Promise<void> {
    if ($manualBookmark$) return;
    if (!dataId || charCount <= 0) return;

    const data: BooksDbBookmarkData = {
      dataId,
      exploredCharCount: Math.max(1, charCount),
      progress: bookCharCount ? Math.min(1, charCount / bookCharCount) : 0,
      lastBookmarkModified: Date.now()
    };

    await database.putBookmark(data);

    bookmarkData = Promise.resolve(data);

    scheduleReplication(StorageDataType.PROGRESS);
  }

  async function createAutosaveSnapshot(charCount: number, customPrefix?: string) {
    const dataId = getBookIdSync();
    if (!dataId || charCount <= 0 || !bookCharCount) return;

    const chapterLabel = generateBookmarkLabel($sectionData$, charCount, bookCharCount);
    const label = customPrefix ? `${customPrefix}: ${chapterLabel}` : chapterLabel;

    await database.putAutosaveBookmark(
      {
        dataId,
        exploredCharCount: Math.max(1, charCount),
        progress: Math.min(1, charCount / bookCharCount),
        label,
        color: 'gray',
        note: 'Autosaved reading checkpoint',
        createdAt: Date.now(),
        lastModified: Date.now(),
        isAutosave: true
      },
      $autosaveHistoryMaxCount$ || 10
    );

    await syncAutosaveToProgress(dataId, charCount);

    await refreshUserBookmarks();
  }

  async function flushPendingAutosave(): Promise<void> {
    if (!browser || !$autosaveHistoryEnabled$) return;
    if (!autosaveDebounceTimer) return;

    const pendingCharCount = previousObservedCharCount;
    clearAutosaveDebounce();

    if (
      pendingCharCount > 0 &&
      bookCharCount > 0 &&
      Math.abs(pendingCharCount - lastAutosavedCharCount) >= 15
    ) {
      lastAutosavedCharCount = pendingCharCount;
      await createAutosaveSnapshot(pendingCharCount);
    }
  }

  function handleUnload(event: BeforeUnloadEvent) {
    if (
      $confirmClose$ &&
      (isReplicating ||
        storedExploredCharacter !== exploredCharCount ||
        (upSyncEnabled && dataToReplicate.length) ||
        (upSyncEnabled && dataToReplicateQueue.length))
    ) {
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      return (event.returnValue = 'Are you sure you want to exit?');
    }

    return event;
  }

  function trackerSingleClickHandler() {
    if (!statisticsEnabled$) {
      return;
    }

    wasTrackerPaused = $isTrackerPaused$;
    isTrackerPaused$.next(true);
    isTrackerMenuOpen$.next(true);
  }

  function trackerDblClickHandler() {
    if (!statisticsEnabled$) {
      return;
    }

    dialogManager.dialogs$.next([]);
    wasTrackerPaused = !$isTrackerPaused$;
    isTrackerPaused$.next(wasTrackerPaused);
  }

  async function handleJump() {
    const dataId = getBookIdSync();

    if (!bookmarkManager || !dataId) {
      return;
    }

    pauseTracker();
    skipKeyDownListener$.next(true);

    const target = await new Promise<number | undefined>((resolver) => {
      dialogManager.dialogs$.next([
        {
          component: NumberDialog,
          props: {
            dialogHeader: 'Jump to Position',
            minValue: 1,
            maxValue: bookCharCount || 1,
            resolver
          }
        }
      ]);
    });

    skipKeyDownListener$.next(false);

    if (typeof target !== 'number') {
      restartTrackerAfterCharacterChangeOrTime(1);
      return;
    }

    restartTrackerAfterCharacterChangeOrTime(1000);

    bookmarkManager.scrollToBookmark(
      {
        dataId: dataId,
        exploredCharCount: target,
        lastBookmarkModified: new Date().getTime(),
        progress: 0
      },
      customReadingPointScrollOffset
    );
  }

  async function completeBook() {
    if (!$rawBookData$) {
      return;
    }

    const wasAutoscrollerEnabled = autoScroller?.wasAutoScrollerEnabled$.getValue();
    const wasTrackerPausedBefore = $statisticsEnabled$ ? $isTrackerPaused$ : true;

    showHeader = false;
    autoScroller?.off();

    if ($statisticsEnabled$) {
      wasTrackerPaused = true;
      isTrackerPaused$.next(true);
    }

    const diffToComplete =
      $statisticsEnabled$ && $addCharactersOnCompletion$
        ? Math.max(0, bookCharCount - exploredCharCount)
        : 0;
    const wasCanceled = await new Promise((resolver) => {
      dialogManager.dialogs$.next([
        {
          component: ConfirmDialog,
          props: {
            dialogHeader: 'Complete Book',
            dialogMessage: `Would you like to complete this Book${
              diffToComplete ? ` and capture ${diffToComplete} characters read` : ''
            }?`,
            resolver
          }
        }
      ]);
    });

    if (wasCanceled) {
      if ($statisticsEnabled$ && !wasTrackerPausedBefore) {
        wasTrackerPaused = false;
        $isTrackerPaused$ = false;
      }

      if (wasAutoscrollerEnabled) {
        autoScroller?.toggle();
      }

      return;
    }

    dialogManager.dialogs$.next([
      {
        component: '<div/>',
        disableCloseOnClick: true
      }
    ]);

    try {
      if (diffToComplete) {
        const [hadError] = await trackerElm.processStatistics(diffToComplete);

        if (hadError) {
          throw new Error('Character Update failed');
        }
      }

      const finishedStatistic = await database.getStatisticForCompletedBook($rawBookData$.title);
      const todayKey = getDateKey($startDayHoursForTracker$);
      const statisticsUntilToday = await database.getStatisticsUntilDate(
        $rawBookData$.title,
        todayKey
      );
      const todayStatistic =
        statisticsUntilToday.find((statistic) => statistic.dateKey === todayKey) ||
        getDefaultStatistic($rawBookData$.title, todayKey);
      const statisticsToStore: BooksDbStatistic[] = [];
      const lastStatisticModified = Date.now();

      todayStatistic.lastStatisticModified = lastStatisticModified;
      todayStatistic.completedBook = 1;
      todayStatistic.completedData = {
        ...{ dateKey: todayKey },
        ...BaseStorageHandler.getStatisticsMetadata(
          BaseStorageHandler.getStatisticsFileName(
            statisticsUntilToday,
            todayStatistic.lastStatisticModified
          )
        )
      };

      let updateFinishedStatistic = false;

      if (!finishedStatistic) {
        statisticsToStore.push(todayStatistic);
      } else if (
        $overwriteBookCompletion$ &&
        finishedStatistic.dateKey !== todayStatistic.dateKey
      ) {
        delete finishedStatistic.completedBook;
        delete finishedStatistic.completedData;
        finishedStatistic.lastStatisticModified = lastStatisticModified;
        statisticsToStore.push(todayStatistic, finishedStatistic);
        updateFinishedStatistic = true;
      } else if ($overwriteBookCompletion$) {
        statisticsToStore.push(todayStatistic);
      }

      if (statisticsToStore.length) {
        await database.storeStatistics(
          $rawBookData$.title,
          statisticsToStore,
          ReplicationSaveBehavior.Overwrite,
          MergeMode.LOCAL,
          lastStatisticModified
        );

        trackerElm?.updateCompletedBook(
          todayStatistic,
          updateFinishedStatistic ? finishedStatistic : undefined
        );

        scheduleReplication(StorageDataType.STATISTICS);
      }

      if (bookmarkManager) {
        const data = {
          ...bookmarkManager.formatBookmarkData($rawBookData$.id, customReadingPointScrollOffset),
          exploredCharCount: Math.max(0, bookCharCount - 1),
          progress: 1
        };

        await database.putBookmark(data);

        bookmarkData = Promise.resolve(data);

        scheduleReplication(StorageDataType.PROGRESS);
      }

      if ($statisticsEnabled$ && $openTrackerOnCompletion$) {
        confettiWidthModifier = 36;
        confettiMaxRuns = 0;
        bookCompleted = window.matchMedia('(min-width: 900px)').matches;
        isTrackerMenuOpen$.next(true);
      } else {
        dialogManager.dialogs$.next([]);
        confettiWidthModifier = 0;
        confettiMaxRuns = 3;
        bookCompleted = true;

        merge(fromEvent(document, 'pointerup'), timer(10000))
          .pipe(take(1))
          .subscribe(() => {
            bookCompleted = false;
          });
      }
    } catch ({ message }: any) {
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Error',
            message: `Error completing Book: ${message}`
          }
        }
      ]);
    }
  }

  function getCurrentChapterProgress(sectionData: SectionWithProgress[]) {
    if (
      (!$showFooterChapterCharacterCounter$ && !$showFooterChapterPercentage$) ||
      !sectionData?.length
    ) {
      return '';
    }

    let chapterProgress = '';
    let chapterCharacters = '';

    const [mainChapters, chapterIndex, referenceId] = getChapterData($sectionData$);

    if ($showFooterChapterPercentage$) {
      const relevantSections = sectionData.filter(
        (section) => section.reference === referenceId || section.parentChapter === referenceId
      );

      chapterProgress = `${getWeightedAverage(
        relevantSections.map((section) => section.progress),
        relevantSections.map((section) => section.charactersWeight)
      ).toFixed(2)}%`;
    }

    if ($showFooterChapterCharacterCounter$) {
      const currentChapter = mainChapters[chapterIndex];

      if (currentChapter) {
        const endCharacter = currentChapter.characters as number;

        chapterCharacters = `${Math.min(
          Math.max(exploredCharCount - (currentChapter.startCharacter as number), 0),
          endCharacter
        )} / ${endCharacter}`;
      }
    }

    return [chapterCharacters, chapterProgress, 'C'].filter(Boolean).join(' ');
  }

  function copyCurrentProgress(currentProgress: string) {
    try {
      navigator.clipboard.writeText(currentProgress);
    } catch (error: any) {
      logger.error(`Error writing Progress to Clipboard: ${error.message}`);
    }
  }

  function freezeTrackerPosition() {
    if (!$statisticsEnabled$) {
      return;
    }

    if (frozenPosition > -1) {
      frozenPosition = -1;
    } else {
      skipFirstFreezeChange = true;
      frozenPosition = exploredCharCount;
    }
  }

  const offlineSyncNotice = 'Offline — cloud sync is paused and resumes when you reconnect.';

  async function getStorageHandlerByName(storageSourceName: string, throwIfNotFound = false) {
    if (!storageSourceName) {
      if (throwIfNotFound) {
        throw new Error(`No storage source found`);
      }

      return undefined;
    }

    if (storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT) {
      if (!$isOnline$) {
        logger.warn(offlineSyncNotice);
        pushTransientNotice(offlineSyncNotice);

        return undefined;
      }

      return getStorageHandler(
        window,
        StorageKey.GDRIVE,
        storageSourceName,
        true,
        $cacheStorageData$,
        $replicationSaveBehavior$,
        $statisticsMergeMode$,
        $readingGoalsMergeMode$
      );
    }
    if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
      if (!$isOnline$) {
        logger.warn(offlineSyncNotice);
        pushTransientNotice(offlineSyncNotice);

        return undefined;
      }

      return getStorageHandler(
        window,
        StorageKey.ONEDRIVE,
        storageSourceName,
        true,
        $cacheStorageData$,
        $replicationSaveBehavior$,
        $statisticsMergeMode$,
        $readingGoalsMergeMode$
      );
    }
    if (storageSourceName) {
      const db = await database.db;
      const storageSource = await db.get('storageSource', storageSourceName);

      if (storageSource) {
        if (storageSource.type !== StorageKey.FS && !$isOnline$) {
          logger.warn(offlineSyncNotice);
          pushTransientNotice(offlineSyncNotice);

          return undefined;
        }

        return getStorageHandler(
          window,
          storageSource.type,
          storageSourceName,
          true,
          $cacheStorageData$,
          $replicationSaveBehavior$,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );
      }
      if (throwIfNotFound) {
        throw new Error(`No storage source with name ${storageSourceName} found`);
      }
    }

    const message = `No storage source with name ${storageSourceName} found - skipping auto import/export`;

    logger.warn(message);

    dialogManager.dialogs$.next([
      {
        component: MessageDialog,
        props: {
          title: 'Configuration Error',
          message
        }
      }
    ]);

    return undefined;
  }

  async function saveExternalLastRead(
    storageHandler: BaseStorageHandler | undefined,
    localBookData: BooksDbBookData,
    context: ReplicationContext
  ) {
    if (!storageHandler) {
      return localBookData;
    }

    // eslint-disable-next-line prefer-const
    let { id, ...bookData } = localBookData;

    if (localBookData.storageSource) {
      const externalBookData = await storageHandler.getBook(context);

      if (externalBookData && !(externalBookData instanceof File)) {
        bookData = {
          ...externalBookData,
          ...{
            id: localBookData.id,
            lastBookOpen: localBookData.lastBookOpen,
            storageSource: localBookData.storageSource
          }
        };
      }
    } else if (!localBookData.elementHtml) {
      throw new Error('Book has no data stored');
    }

    const dataToReturn = { id, ...bookData };

    await storageHandler.updateLastRead(dataToReturn, context).catch((error: any) => {
      // Expired sessions surface via banner/icon + reconnect; a modal here
      // would interrupt reading for a background write that retries later.
      if (isSessionExpiredError(error)) {
        logger.warn(`Skipped external last-read update: ${error.message}`);
        return;
      }

      const message = `Failed to update last read on external storage: ${error.message}`;

      logger.warn(message);

      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Update Error',
            message
          }
        }
      ]);
    });

    return dataToReturn;
  }

  async function syncDownData(
    storageHandler: BaseStorageHandler | undefined,
    context: ReplicationContext
  ) {
    if (
      !localStorageHandler ||
      !storageHandler ||
      !(
        $autoReplication$ === AutoReplicationType.Down ||
        $autoReplication$ === AutoReplicationType.All
      )
    ) {
      return;
    }

    const currentName = storageHandler.getCurrentStorageSource() || '';
    const primaryName = $syncTarget$;

    const FULL_DOWN_TYPES = [
      StorageDataType.PROGRESS,
      StorageDataType.STATISTICS,
      StorageDataType.READING_GOALS,
      StorageDataType.PROFILES,
      StorageDataType.AUDIOBOOK,
      StorageDataType.SUBTITLE,
      StorageDataType.USER_BOOKMARKS
    ];

    // Primary-only sync: pull from the book's designated cloud alone.
    // Aggregate data (statistics / goals / profiles) can only ever come from
    // the primary target, so a secondary cloud pulls book-scoped data only.
    const dataTypes =
      currentName === primaryName
        ? FULL_DOWN_TYPES
        : FULL_DOWN_TYPES.filter((d) => BOOK_SCOPED_DATA_TYPES.includes(d));

    const error = await replicateData(
      storageHandler,
      localStorageHandler,
      false,
      [context],
      dataTypes
    );

    if (error) {
      throw new Error(error);
    }
  }

  function onKeydown(ev: KeyboardEvent) {
    const isAllowedShift =
      ev.shiftKey &&
      !ev.altKey &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      (ev.code === 'KeyB' ||
        ev.code === 'KeyR' ||
        ev.code === 'KeyN' ||
        ev.code === 'KeyP' ||
        ev.key === 'B' ||
        ev.key === 'R' ||
        ev.key === 'N' ||
        ev.key === 'P');

    if (
      $skipKeyDownListener$ ||
      ev.altKey ||
      ev.ctrlKey ||
      (ev.shiftKey && !isAllowedShift) ||
      ev.metaKey ||
      ev.repeat
    ) {
      return;
    }

    const result = onKeydownReader(
      ev,
      bookReaderKeybindMap$.getValue(),
      bookmarkPage,
      scrollToBookmark,
      (x) => multiplier$.next(multiplier$.getValue() + x),
      autoScroller,
      pageManager,
      $verticalMode$,
      changeChapter,
      handleSetCustomReadingPoint,
      trackerDblClickHandler,
      freezeTrackerPosition,
      openCreateBookmarkDialog,
      () => bookmarkPanelIsOpen$.next(!$bookmarkPanelIsOpen$),
      navigateToNextBookmark,
      navigateToPrevBookmark
    );

    if (!result) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    ev.preventDefault();
  }

  function navigateToNextBookmark() {
    const list = userBookmarks.filter((b) => !b.isAutosave);
    if (!list.length) return;
    const sorted = [...list].sort((a, b) => a.exploredCharCount - b.exploredCharCount);
    const next = sorted.find((b) => b.exploredCharCount > exploredCharCount + 5);
    if (next) {
      handleNavigateUserBookmark(next);
    } else {
      handleNavigateUserBookmark(sorted[0]);
    }
  }

  function navigateToPrevBookmark() {
    const list = userBookmarks.filter((b) => !b.isAutosave);
    if (!list.length) return;
    const sorted = [...list].sort((a, b) => a.exploredCharCount - b.exploredCharCount);
    const prev = [...sorted].reverse().find((b) => b.exploredCharCount < exploredCharCount - 5);
    if (prev) {
      handleNavigateUserBookmark(prev);
    } else {
      handleNavigateUserBookmark(sorted[sorted.length - 1]);
    }
  }

  async function openCreateBookmarkDialog() {
    const dataId = getBookIdSync();
    if (!dataId) return;

    pauseTracker();
    skipKeyDownListener$.next(true);

    const defaultLabel = generateBookmarkLabel($sectionData$, exploredCharCount, bookCharCount);

    const result = await new Promise<{ label: string; color: any; note: string } | undefined>(
      (resolver) => {
        dialogManager.dialogs$.next([
          {
            component: BookmarkCreateDialog,
            zIndex: '70',
            props: {
              initialLabel: defaultLabel,
              resolver
            }
          }
        ]);
      }
    );

    skipKeyDownListener$.next(false);
    restartTrackerAfterCharacterChangeOrTime(1000);

    if ($bookmarkPanelIsOpen$) {
      dialogManager.dialogs$.next([{ component: '<div/>' }]);
    }

    if (!result) return;

    await database.putUserBookmark({
      dataId,
      exploredCharCount: Math.max(1, exploredCharCount),
      progress: bookCharCount ? Math.min(1, exploredCharCount / bookCharCount) : 0,
      label: result.label,
      color: result.color,
      note: result.note,
      createdAt: Date.now(),
      lastModified: Date.now()
    });
    await refreshUserBookmarks();
    scheduleReplication(StorageDataType.USER_BOOKMARKS);
  }

  async function openEditBookmarkDialog(item: BooksDbUserBookmarkData) {
    pauseTracker();
    skipKeyDownListener$.next(true);

    const result = await new Promise<{ label: string; color: any; note: string } | undefined>(
      (resolver) => {
        dialogManager.dialogs$.next([
          {
            component: BookmarkCreateDialog,
            zIndex: '70',
            props: {
              title: 'Edit Bookmark',
              initialLabel: item.label,
              initialColor: item.color,
              initialNote: item.note || '',
              resolver
            }
          }
        ]);
      }
    );

    skipKeyDownListener$.next(false);
    restartTrackerAfterCharacterChangeOrTime(1000);

    if ($bookmarkPanelIsOpen$) {
      dialogManager.dialogs$.next([{ component: '<div/>' }]);
    }

    if (!result) return;

    await database.putUserBookmark({
      ...item,
      label: result.label,
      color: result.color,
      note: result.note,
      lastModified: Date.now()
    });
    scheduleReplication(StorageDataType.USER_BOOKMARKS);
  }

  function handleNavigateUserBookmark(item: BooksDbUserBookmarkData) {
    bookmarkPanelIsOpen$.next(false);
    if (!bookmarkManager) return;

    if (item.exploredCharCount !== exploredCharCount) {
      pauseTracker(true);
    }

    bookmarkManager.scrollToBookmark(
      {
        dataId: item.dataId,
        exploredCharCount: Math.max(1, item.exploredCharCount),
        lastBookmarkModified: item.lastModified,
        progress: item.progress
      },
      customReadingPointScrollOffset
    );

    // An explicit checkpoint restore is user intent: persist it immediately
    // as a newer position record so the restore itself wins later
    // last-write-wins comparisons instead of flip-flopping (P6).
    void database
      .putBookmark({
        dataId: item.dataId,
        exploredCharCount: Math.max(1, item.exploredCharCount),
        progress: item.progress,
        lastBookmarkModified: Date.now()
      })
      .catch(() => undefined);
  }

  async function handleDeleteUserBookmark(item: BooksDbUserBookmarkData) {
    if (item.id !== undefined) {
      await database.deleteUserBookmark(item.id);
      await refreshUserBookmarks();
      if (!item.isAutosave) {
        scheduleReplication(StorageDataType.USER_BOOKMARKS);
      }
    }
  }

  async function handlePromoteAutosave(item: BooksDbUserBookmarkData) {
    if (item.id === undefined) return;
    await database.promoteAutosaveToBookmark(item.id);
    await refreshUserBookmarks();
    scheduleReplication(StorageDataType.USER_BOOKMARKS);
  }

  async function handleClearAutosaves() {
    const dataId = getBookIdSync();
    if (!dataId) return;
    await database.clearAutosaveBookmarks(dataId);
    await refreshUserBookmarks();
  }

  function getBookIdSync() {
    let bookId: number | undefined;
    bookId$.subscribe((x) => (bookId = x)).unsubscribe();
    return bookId;
  }

  async function bookmarkPage(pulse: boolean | CustomEvent<void> = true) {
    const shouldPulse = typeof pulse === 'boolean' ? pulse : true;
    const bookId = getBookIdSync();
    if (!bookId || !bookmarkManager) return;

    let data: BooksDbBookmarkData;

    showHeader = false;

    if (isPaginated) {
      const userSelectedRange = $selectionToBookmarkEnabled$
        ? getRangeForUserSelection(window, lastSelectedRange)
        : undefined;
      const bookmarkRange = userSelectedRange || customReadingPointRange;

      if (shouldPulse) {
        pulseElement(bookmarkRange?.endContainer?.parentElement, 'add', 0.5, 500);
      }

      data = bookmarkManager.formatBookmarkDataByRange(bookId, bookmarkRange);

      if (userSelectedRange) {
        clearRange(window);
      }
    } else {
      data = bookmarkManager.formatBookmarkData(bookId, customReadingPointScrollOffset);
    }

    await database.putBookmark(data);

    bookmarkData = Promise.resolve(data);

    scheduleReplication(StorageDataType.PROGRESS);
  }

  async function scrollToBookmark() {
    const data = await bookmarkData;
    if (!data || !bookmarkManager) return;

    if (data.exploredCharCount !== exploredCharCount) {
      pauseTracker(true);
    }

    bookmarkManager.scrollToBookmark(data, customReadingPointScrollOffset);
  }

  function onFullscreenClick() {
    showHeader = false;

    if (!fullscreenManager.fullscreenElement) {
      fullscreenManager.requestFullscreen(document.documentElement);
      return;
    }
    fullscreenManager.exitFullscreen();
  }

  function onDomainHintClick() {
    dialogManager.dialogs$.next([
      {
        component: MessageDialog,
        props: {
          title: 'Old Domain',
          message:
            'You are currently using the old domain of ッツ Reader - consider switching to https://reader.ttsu.app to prevent issues and to ensure full features'
        },
        disableCloseOnClick: true
      }
    ]);
  }

  function changeChapter(offset: number) {
    if (!$sectionData$?.length) {
      return;
    }

    const [mainChapters, currentChapterIndex] = getChapterData($sectionData$);

    if (
      (!currentChapterIndex && offset === -1) ||
      (offset === 1 && currentChapterIndex === mainChapters.length - 1)
    ) {
      return;
    }

    const nextChapter = mainChapters[currentChapterIndex + offset];

    if (!nextChapter) {
      return;
    }

    if (nextChapter.startCharacter !== exploredCharCount) {
      pauseTracker(true);
    }

    nextChapter$.next(nextChapter.reference);
  }

  async function executeReplication(isSilent = true) {
    if (isReplicating || !dataToReplicate.length || !$rawBookData$ || !externalStorageHandler) {
      return;
    }

    isReplicating = true;

    if (!isSilent) {
      skipKeyDownListener$.next(true);
      logger.clearHistory();
      openActionBackdrop();
    }

    const currentHandlerStorageSource = $rawBookData$.storageSource || $syncTarget$;

    externalStorageHandler.updateSettings(
      window,
      false,
      $replicationSaveBehavior$,
      $statisticsMergeMode$,
      $readingGoalsMergeMode$,
      $cacheStorageData$,
      !isSilent,
      currentHandlerStorageSource
    );

    const context = {
      id: $rawBookData$.id,
      title: $rawBookData$.title,
      imagePath: $rawBookData$.coverImage
    };
    const refreshDataList = !isSilent && $storageSource$ === externalStorageHandler.storageType;

    const primaryName = $syncTarget$;
    const isPrimaryHandler = currentHandlerStorageSource === primaryName;

    // Primary-only sync: the designated handler receives everything when it
    // is the primary target, otherwise only the book-scoped types (progress,
    // user bookmarks) so aggregate data stays on the primary. Secondary
    // clouds are never touched by background sync; they sync on demand when
    // one of their books is opened.
    const types = isPrimaryHandler
      ? dataToReplicate
      : dataToReplicate.filter((d) => BOOK_SCOPED_DATA_TYPES.includes(d));

    let error: string | undefined;

    try {
      error = await replicateData(
        localStorageHandler,
        externalStorageHandler,
        refreshDataList,
        [context],
        types
      ).catch((err: any) => err.message);
    } finally {
      externalStorageHandler.updateSettings(
        window,
        true,
        $replicationSaveBehavior$,
        $statisticsMergeMode$,
        $readingGoalsMergeMode$,
        $cacheStorageData$,
        false,
        currentHandlerStorageSource
      );

      isReplicating = false;

      if (!isSilent) {
        skipKeyDownListener$.next(false);
      }
    }

    if (error) {
      if (isSessionExpiredError(error)) {
        // Banner/icon + reconnect own this failure; a modal would be a dead
        // end even for the explicit sync button. Always drop the backdrop so
        // it can't freeze the screen across navigation.
        logger.warn(error);

        if (!isSilent) {
          dialogManager.dialogs$.next([]);
        }
      } else if (!isSilent) {
        const showReport = logger.errorCount > 1;

        logger.warn(error);

        dialogManager.dialogs$.next([
          {
            component: showReport ? LogReportDialog : MessageDialog,
            props: {
              title: 'Error Processing Data',
              message: showReport
                ? `Some or all data could not be stored on an external storage`
                : error
            }
          }
        ]);
      }

      externalStorageErrors += 1;
    } else {
      externalStorageErrors = 0;

      if (!isSilent) {
        dialogManager.dialogs$.next([]);
      }

      if (dataToReplicateQueue.length) {
        const isAudioBookOnly =
          dataToReplicate.length === 1 && dataToReplicate[0] === StorageDataType.AUDIOBOOK;
        dataToReplicate = JSON.parse(JSON.stringify(dataToReplicateQueue));
        dataToReplicateQueue = [];

        if (isSilent || isAudioBookOnly) {
          executeReplicate$.next();
        } else if (!isAudioBookOnly) {
          await executeReplication(false);
        } else {
          dataToReplicate = [];
        }
      } else {
        dataToReplicate = [];
      }
    }
  }

  function openActionBackdrop() {
    dialogManager.dialogs$.next([
      {
        component: '<div/>',
        disableCloseOnClick: true
      }
    ]);
  }

  function capturePendingExitSync(): ExitSyncSnapshot | undefined {
    const raw = $rawBookData$;

    if (
      !upSyncEnabled ||
      isReplicating ||
      !dataToReplicate.length ||
      !raw ||
      !externalStorageHandler
    ) {
      return undefined;
    }

    const types = [
      ...dataToReplicate,
      ...dataToReplicateQueue.filter((t) => !dataToReplicate.includes(t))
    ];

    const snapshot: ExitSyncSnapshot = {
      types,
      context: {
        id: raw.id,
        title: raw.title,
        imagePath: raw.coverImage
      },
      localHandler: localStorageHandler,
      externalHandler: externalStorageHandler,
      storageSourceName: raw.storageSource || $syncTarget$,
      syncTargetName: $syncTarget$,
      refreshDataList: $storageSource$ === externalStorageHandler.storageType,
      saveBehavior: $replicationSaveBehavior$,
      statisticsMergeMode: $statisticsMergeMode$,
      readingGoalsMergeMode: $readingGoalsMergeMode$,
      cacheStorageData: $cacheStorageData$
    };

    dataToReplicate = [];
    dataToReplicateQueue = [];

    return snapshot;
  }

  async function leaveReader(routeId: string, deleteLastItem = true) {
    let message;
    let pendingExitSync: ExitSyncSnapshot | undefined;

    try {
      blockDataUpdates = true;

      await tick();

      autoScroller?.off();
      wasTrackerPaused = true;
      isTrackerPaused$.next(true);

      if ($confirmClose$ && storedExploredCharacter !== exploredCharCount) {
        const wasCanceled = await new Promise((resolver) => {
          dialogManager.dialogs$.next([
            {
              component: ConfirmDialog,
              props: {
                dialogHeader: 'Confirm Exit',
                dialogMessage: 'Your current location was not bookmarked. Continue leaving?',
                resolver
              },

              disableCloseOnClick: true
            }
          ]);
        });

        if (wasCanceled) {
          blockDataUpdates = false;
          return;
        }

        dialogManager.dialogs$.next([]);
        await tick();
      }

      const exitTasks: Promise<any>[] = [];

      if (deleteLastItem) {
        exitTasks.push(database.deleteLastItem());
      }

      exitTasks.push(flushPendingAutosave());

      if (!$manualBookmark$) {
        exitTasks.push(bookmarkPage(false));
      }

      if ($statisticsEnabled$ && trackerElm) {
        exitTasks.push(
          trackerElm.flushUpdates(true).then(([hadError, updated]) => {
            if (hadError) {
              throw new Error('Error updating Statistics');
            }

            if (updated) {
              scheduleReplication(StorageDataType.STATISTICS);
            }
          })
        );
      }

      await Promise.all(exitTasks);

      // Local exit writes above stay awaited (fast IndexedDB). Cloud sync is
      // snapshotted here and runs AFTER navigation so it never blocks the
      // screen, even when token reconnection is required.
      pendingExitSync = capturePendingExitSync();
    } catch (error: any) {
      // Auth failures already surface via banner/icon; don't block leaving
      // the reader with a modal for them.
      if (isSessionExpiredError(error)) {
        logger.warn(error?.message || error);
      } else {
        dialogManager.dialogs$.next([]);
        message = error.message;
      }

      pendingExitSync = undefined;
    }

    if (message) {
      logger.error(message);

      dismissDialogs = false;
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Error',
            message
          },
          disableCloseOnClick: true
        }
      ]);
    } else {
      // Drop any stale non-modal backdrop so it can't leak onto the next
      // page via the global layout overlay. Real error modals above are kept.
      const current = dialogManager.dialogs$.getValue();

      if (current.length > 0 && current.every((d) => typeof d.component === 'string')) {
        dialogManager.dialogs$.next([]);
      }
    }

    await goto(`${pagePath}${routeId}`);

    if (pendingExitSync) {
      void triggerExitSync(pendingExitSync);
    }
  }

  function handleSetCustomReadingPoint() {
    if (!$customReadingPointEnabled$ && !isPaginated) {
      return;
    }

    const contentEl = document.querySelector('.book-content');

    if (!contentEl) {
      return;
    }

    autoScroller?.off();

    if ($pauseTrackerOnCustomPointChange$) {
      pauseTracker();
    }

    if (isPaginated) {
      customReadingPointTop = window.innerHeight / 2 - 2;
      customReadingPointLeft = window.innerWidth / 2 - 2;
    }

    showHeader = false;
    isSelectingCustomReadingPoint = true;
    document.body.classList.add('cursor-crosshair');

    const {
      elLeftReferencePoint,
      elTopReferencePoint,
      elRightReferencePoint,
      elBottomReferencePoint,
      pointGap
    } = getReferencePoints(window, contentEl, $verticalMode$, firstDimensionMargin);

    merge(fromEvent(document, 'pointerup'), fromEvent(document, 'pointermove'))
      // eslint-disable-next-line rxjs/no-ignored-takewhile-value
      .pipe(takeWhile(() => isSelectingCustomReadingPoint))
      .subscribe((event: Event) => {
        if (!(event instanceof PointerEvent)) {
          return;
        }

        if (event.type === 'pointerup') {
          document.body.classList.remove('cursor-crosshair');
          isSelectingCustomReadingPoint = false;

          tick().then(() => {
            customReadingPointLeft = $verticalMode$ ? event.x : customReadingPointLeft;
            customReadingPointTop = $verticalMode$ ? customReadingPointTop : event.y;

            const result = getParagraphToPoint(customReadingPointLeft, customReadingPointTop);

            if (result) {
              pulseElement(result.parent, 'add', 0.5, 500);
            }

            if (isPaginated) {
              customReadingPointRange = result?.range;
            } else {
              let newPercentage = 0;

              if ($verticalMode$) {
                newPercentage = Math.ceil(
                  (Math.max(0, customReadingPointLeft - elLeftReferencePoint) /
                    (elRightReferencePoint - elLeftReferencePoint)) *
                    100
                );

                verticalCustomReadingPosition$.next(newPercentage);
              } else {
                newPercentage = Math.ceil(
                  (Math.max(0, customReadingPointTop - elTopReferencePoint) /
                    (elBottomReferencePoint - elTopReferencePoint)) *
                    100
                );

                horizontalCustomReadingPosition$.next(newPercentage);
              }

              customReadingPoint = newPercentage;
            }

            if ($pauseTrackerOnCustomPointChange$) {
              restartTrackerAfterCharacterChangeOrTime(1000);
            }
          });
        } else {
          const insideXBound =
            event.x >= elLeftReferencePoint + pointGap && event.x <= elRightReferencePoint;
          const insideYBound =
            event.y >= elTopReferencePoint && event.y <= elBottomReferencePoint - pointGap;

          if (isPaginated) {
            customReadingPointTop = insideYBound ? event.y : customReadingPointTop;
            customReadingPointLeft = insideXBound ? event.x : customReadingPointLeft;
          } else if ($verticalMode$ && insideXBound) {
            customReadingPointLeft = event.x;
          } else if (!$verticalMode$ && insideYBound) {
            customReadingPointTop = event.y;
          }
        }
      });
  }

  function pauseTracker(restartAfterCharacterChange = false) {
    if ($statisticsEnabled$ && !$isTrackerPaused$) {
      wasTrackerPaused = false;
      $isTrackerPaused$ = true;

      if (restartAfterCharacterChange) {
        restartTrackerAfterCharacterChangeOrTime();
      }
    }
  }

  function restartTrackerAfterCharacterChangeOrTime(timerAmount = 0) {
    if (!$statisticsEnabled$ || wasTrackerPaused) {
      return;
    }

    merge(fromEvent(document, PAGE_CHANGE), timerAmount ? timer(timerAmount) : NEVER)
      .pipe(debounceTime(200), take(1))
      .subscribe(() => {
        wasTrackerPaused = false;
        $isTrackerPaused$ = false;
      });
  }

  function scheduleReplication(dataType: StorageDataType) {
    if (upSyncEnabled) {
      const toReplicate = isReplicating ? dataToReplicateQueue : dataToReplicate;

      if (!toReplicate.includes(dataType)) {
        toReplicate.push(dataType);
      }

      if (!isReplicating) {
        dataToReplicate = [...dataToReplicate];
      }

      if (!blockDataUpdates) {
        executeReplicate$.next();
      }
    }
  }

  let cloudReconnecting = false;

  $: expiredSyncTarget =
    getExpiredSyncTargets($syncTarget$, $storageConnectionStates$, $pendingCloudSync$)[0] || '';

  async function handleCloudReconnect() {
    if (!expiredSyncTarget || cloudReconnecting) return;
    // Open synchronously in the click handler so mobile browsers don't block it.
    const preOpened = StorageOAuthManager.openAuthWindowSync(window);
    cloudReconnecting = true;
    try {
      await reconnectAndSyncNow(window, expiredSyncTarget, preOpened);
    } finally {
      cloudReconnecting = false;
    }
  }
</script>

<svelte:head>
  <title>{formatPageTitle($rawBookData$?.title ?? '')}</title>
</svelte:head>

{$collectReaderImageGallerySpoilerToggles$ ?? ''}
{$handleUpdateImageGalleryPictureSpoilers$ ?? ''}
{$initBookmarkData$ ?? ''}
{$initUserBookmarks$ ?? ''}
<button
  aria-label="Show reader header"
  class="fixed inset-x-0 top-0 z-10 h-8 w-full"
  on:click={() => (showHeader = true)}
></button>
{#if showHeader}
  <div
    class="elevation-4 writing-horizontal-tb fixed inset-x-0 top-0 z-10 w-full"
    transition:fly|local={{ y: -300, easing: quintInOut }}
    use:clickOutside={() => (showHeader = false)}
  >
    <BookReaderHeader
      hasChapterData={!!$sectionData$?.length}
      hasText={!!bookCharCount}
      hasCustomReadingPoint={!!(
        ($customReadingPointEnabled$ || isPaginated) &&
        ((isPaginated && customReadingPointRange) ||
          (!isPaginated && customReadingPointLeft > -1 && customReadingPointTop > -1))
      )}
      showFullscreenButton={fullscreenManager.fullscreenEnabled}
      autoScrollMultiplier={$multiplier$}
      {hasBookmarkData}
      bind:isBookmarkScreen
      on:tocClick={() => {
        pauseTracker();

        showHeader = false;
        tocIsOpen$.next(true);
      }}
      on:jumpClick={handleJump}
      on:completeBook={completeBook}
      on:setCustomReadingPoint={handleSetCustomReadingPoint}
      on:showCustomReadingPoint={() => {
        showHeader = false;
        showCustomReadingPoint = true;
      }}
      on:resetCustomReadingPoint={() => {
        showHeader = false;

        if ($pauseTrackerOnCustomPointChange$) {
          pauseTracker();
        }

        if (isPaginated) {
          customReadingPointRange = undefined;
        } else if ($verticalMode$) {
          verticalCustomReadingPosition$.next(100);
          customReadingPoint = 100;
        } else {
          horizontalCustomReadingPosition$.next(0);
          customReadingPoint = 0;
        }

        if ($pauseTrackerOnCustomPointChange$) {
          restartTrackerAfterCharacterChangeOrTime(1000);
        }
      }}
      on:fullscreenClick={onFullscreenClick}
      on:bookmarkClick={bookmarkPage}
      on:bookmarkPanelClick={() => {
        pauseTracker();
        showHeader = false;
        bookmarkPanelIsOpen$.next(true);
      }}
      on:createBookmarkClick={() => {
        showHeader = false;
        openCreateBookmarkDialog();
      }}
      on:scrollToBookmarkClick={() => {
        showHeader = false;
        scrollToBookmark();
      }}
      on:statisticsClick={() => {
        if ($rawBookData$) {
          $preFilteredTitlesForStatistics$ = new Set([$rawBookData$.title]);
        }

        leaveReader(mergeEntries.STATISTICS.routeId, false);
      }}
      on:readerImageGalleryClick={() => {
        showHeader = false;
        showReaderImageGallery = true;
      }}
      on:settingsClick={() => leaveReader(mergeEntries.SETTINGS.routeId, false)}
      on:domainHintClick={onDomainHintClick}
      on:bookManagerClick={() => leaveReader(mergeEntries.MANAGE.routeId)}
      showCloudWarning={!!expiredSyncTarget}
      cloudWarningLabel={expiredSyncTarget
        ? `Cloud session expired for ${getFriendlyStorageSourceName(expiredSyncTarget)}. Reconnect to resume syncing.`
        : 'Cloud session expired. Reconnect to resume syncing.'}
      on:cloudReconnectClick={handleCloudReconnect}
    />
  </div>
{/if}

{#if $bookData$ && $rawBookData$}
  {#if $statisticsEnabled$}
    <BookReadingTracker
      fontColor={$themeOption$.fontColor}
      backgroundColor={$backgroundColor$}
      bookTitle={$rawBookData$.title}
      sectionData={$sectionData$}
      {frozenPosition}
      {exploredCharCount}
      {bookCharCount}
      {autoScroller}
      {blockDataUpdates}
      bind:wasTrackerPaused
      bind:this={trackerElm}
      on:freezeCurrentLocation={freezeTrackerPosition}
      on:statisticsSaved={() => {
        if (!blockDataUpdates) {
          scheduleReplication(StorageDataType.STATISTICS);
        }
      }}
      on:trackerAvailable={() => (showTrackerIcon = true)}
      on:trackerMenuClosed={() => {
        if (!wasTrackerPaused) {
          isTrackerPaused$.next(false);
        }

        isTrackerMenuOpen$.next(false);

        bookCompleted = false;
      }}
    />
  {/if}
  <StyleSheetRenderer styleSheet={$bookData$.styleSheet} />
  <BookReader
    htmlContent={$bookData$.htmlContent}
    width={$containerViewportWidth$ ?? 0}
    height={$containerViewportHeight$ ?? 0}
    {fontFeatureSettings}
    {verticalTextOrientation}
    prioritizeReaderStyles={$prioritizeReaderStyles$}
    enableTextJustification={$enableTextJustification$}
    enableTextWrapPretty={$enableTextWrapPretty$}
    verticalMode={$verticalMode$}
    fontColor={$themeOption$?.fontColor}
    backgroundColor={$backgroundColor$}
    hintFuriganaFontColor={$themeOption$?.hintFuriganaFontColor}
    hintFuriganaShadowColor={$themeOption$?.hintFuriganaShadowColor}
    fontFamilyGroupOne={$fontFamilyGroupOne$}
    fontFamilyGroupTwo={$fontFamilyGroupTwo$}
    fontWeight={$fontWeight$}
    fontSize={$fontSize$}
    lineHeight={$lineHeight$}
    textIndentation={$textIndentation$}
    textMarginMode={$textMarginMode$}
    textMarginValue={$textMarginValue$}
    hideSpoilerImage={$hideSpoilerImage$}
    hideFurigana={$hideFurigana$}
    furiganaStyle={$furiganaStyle$}
    viewMode={$viewMode$}
    secondDimensionMaxValue={$secondDimensionMaxValue$}
    {firstDimensionMargin}
    autoPositionOnResize={$autoPositionOnResize$}
    avoidPageBreak={$avoidPageBreak$}
    pageColumns={$pageColumns$}
    multiplier={$multiplier$}
    {userBookmarks}
    bind:exploredCharCount
    bind:bookCharCount
    bind:isBookmarkScreen
    bind:bookmarkData
    bind:autoScroller
    bind:bookmarkManager
    bind:pageManager
    bind:customReadingPoint
    bind:customReadingPointTop
    bind:customReadingPointLeft
    bind:customReadingPointScrollOffset
    bind:customReadingPointRange
    bind:showCustomReadingPoint
    on:trackerPause={() => pauseTracker(true)}
  />
  {$setBackgroundColor$ ?? ''}
  {$setWritingMode$ ?? ''}
  {$textSelector$ ?? ''}
  {$replicator$ ?? ''}
  {$autoStartTracker$ ?? ''}
{:else}
  {$leaveIfBookMissing$ ?? ''}
{/if}

{#if $tocIsOpen$ && $sectionData$}
  <div
    class="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-full w-full max-w-xl flex-col justify-between"
    style:color={$themeOption$?.fontColor}
    style:background-color={$backgroundColor$}
    in:fly|local={{ x: -100, duration: 100, easing: quintInOut }}
    use:clickOutside={() => {
      if ($statisticsEnabled$ && !wasTrackerPaused) {
        isTrackerPaused$.next(false);
      }
      tocIsOpen$.next(false);
    }}
  >
    <BookToc
      sectionData={$sectionData$}
      verticalMode={$verticalMode$}
      {exploredCharCount}
      {wasTrackerPaused}
    />
  </div>
{/if}

{#if $bookmarkPanelIsOpen$}
  <div
    class="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-full w-full max-w-xl flex-col justify-between"
    style:color={$themeOption$?.fontColor}
    style:background-color={$backgroundColor$}
    in:fly|local={{ x: -100, duration: 100, easing: quintInOut }}
    use:clickOutside={() => {
      if ($statisticsEnabled$ && !wasTrackerPaused) {
        isTrackerPaused$.next(false);
      }
      bookmarkPanelIsOpen$.next(false);
    }}
  >
    <BookBookmarkPanel
      bookmarks={userBookmarks}
      currentExploredCharCount={exploredCharCount}
      {wasTrackerPaused}
      on:select={(e) => handleNavigateUserBookmark(e.detail)}
      on:edit={(e) => openEditBookmarkDialog(e.detail)}
      on:delete={(e) => handleDeleteUserBookmark(e.detail)}
      on:promote={(e) => handlePromoteAutosave(e.detail)}
      on:clearAutosaves={handleClearAutosaves}
      on:create={openCreateBookmarkDialog}
    />
  </div>
{/if}

{#if showReaderImageGallery}
  <BookReaderImageGallery
    fontColor={$themeOption$.fontColor}
    backgroundColor={$backgroundColor$}
    on:close={() => (showReaderImageGallery = false)}
  />
{/if}

{#if (isSelectingCustomReadingPoint && !$isMobile$) || (!isPaginated && showCustomReadingPoint)}
  <div
    class="fixed left-0 z-20 h-[1px] w-full border border-red-500"
    style:top={`${customReadingPointTop}px`}
  ></div>
  <div
    class="fixed top-0 z-20 h-full w-[1px] border border-red-500"
    style:left={`${customReadingPointLeft}px`}
  ></div>
{/if}

{#if $enableTapEdgeToFlip$ && isPaginated && !$skipKeyDownListener$}
  <button
    aria-label="Previous page edge tap zone"
    class="fixed left-0 z-10 w-5"
    on:click={$verticalMode$ ? () => pageManager?.nextPage() : () => pageManager?.prevPage()}
    style:height={tapButtonHeight}
    style:top={tapButtonTop}
  ></button>
  <button
    aria-label="Next page edge tap zone"
    class="fixed right-0 z-10 w-5"
    on:click={$verticalMode$ ? () => pageManager?.prevPage() : () => pageManager?.nextPage()}
    style:height={tapButtonHeight}
    style:top={tapButtonTop}
  ></button>
{/if}

{#if showSpinner}
  <div class="fixed inset-0 flex h-full w-full items-center justify-center">
    <BookLoader mode={$loaderMode$ === 'debug' ? 'debug' : 'flavor'} stage={loaderStage} />
  </div>
{/if}

<div
  id="ttu-page-footer"
  tabindex="0"
  role="button"
  class="writing-horizontal-tb fixed bottom-0 left-0 z-10 flex h-8 w-full items-center justify-between text-xs leading-none"
  style:color={$themeOption$?.tooltipTextFontColor}
  on:click={() => (showFooter = !showFooter)}
  on:keyup={dummyFn}
>
  <div class="flex h-full">
    {#if showTrackerIcon}
      <div
        role="button"
        title="Click to open Tracker Menu or Double Click to toggle Tracker"
        class="flex h-full w-8 items-center justify-center text-sm sm:text-lg"
        class:text-red-500={$isTrackerPaused$}
        class:animate-pulse={frozenPosition > -1}
        use:multiClickHandler={[trackerSingleClickHandler, trackerDblClickHandler]}
      >
        <Fa icon={$isTrackerPaused$ ? faPlay : faPause} />
      </div>
    {/if}
    {#if dataToReplicate.length}
      <div
        tabindex="0"
        role="button"
        class="flex h-full w-8 items-center justify-center text-sm sm:text-lg"
        class:text-red-500={externalStorageErrors > 1}
        class:animate-pulse={externalStorageErrors > 1 || isReplicating}
        on:click|stopPropagation={() => {
          if ($statisticsEnabled$) {
            wasTrackerPaused = $isTrackerPaused$;
            isTrackerPaused$.next(true);
          }

          executeReplication(false).finally(() => {
            if ($statisticsEnabled$ && !wasTrackerPaused) {
              isTrackerPaused$.next(false);
            }
          });
        }}
        on:keyup={dummyFn}
      >
        <Fa icon={faCloudBolt} />
      </div>
    {/if}
  </div>
  {#if showFooter && bookCharCount}
    {@const currentProgress = [
      $showCharacterCounter$ ? `${exploredCharCount} / ${bookCharCount}` : '',
      $showPercentage$ ? `${((exploredCharCount / bookCharCount) * 100).toFixed(2)}%` : '',
      $showFooterChapterCharacterCounter$ || $showFooterChapterPercentage$ ? 'T' : ''
    ]
      .filter(Boolean)
      .join(' ')}
    <div
      tabindex="0"
      role="button"
      title="Click to copy Progress"
      class="writing-horizontal-tb fixed bottom-2 right-2 z-10 text-xs leading-none select-none whitespace-pre"
      class:invisible={!$showCharacterCounter$ &&
        !$showPercentage$ &&
        !$showFooterChapterCharacterCounter$ &&
        !$showFooterChapterPercentage$}
      style:color={$themeOption$?.tooltipTextFontColor}
      on:click|stopPropagation={({ target }) => {
        if (!$showCharacterCounter$ && !$showPercentage$) {
          return;
        }

        copyCurrentProgress(currentProgress.replace(/ T$/, ''));

        if (target instanceof HTMLElement) {
          pulseElement(target.parentElement || target, 'add', 0.5, 500);
        }
      }}
      on:keyup={dummyFn}
    >
      <span class="mr-4" class:invisible={!footerChapterProgress}>{footerChapterProgress}</span>
      <span class:invisible={!$showCharacterCounter$ && !$showPercentage$}>{currentProgress}</span>
    </div>
  {/if}
</div>

{#if bookCompleted}
  <BookCompletionConfetti {confettiWidthModifier} {confettiMaxRuns} {window} />
{/if}

<svelte:window
  on:keydown={onKeydown}
  on:beforeunload={handleUnload}
  on:resize={() => {
    if ($statisticsEnabled$ && !$isTrackerPaused$) {
      pauseTracker();

      merge(fromEvent(document, PAGE_CHANGE), timer(1000))
        .pipe(debounceTime(1000), take(1))
        .subscribe(() => {
          restartTrackerAfterCharacterChangeOrTime(1000);
        });
    }
  }}
/>
