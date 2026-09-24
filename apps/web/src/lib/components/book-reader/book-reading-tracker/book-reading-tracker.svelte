<script lang="ts">
  import {
    getDefaultStatistic,
    isTrackerPaused$,
    type TrackingHistory,
    isTrackerMenuOpen$,
    TrackerSkipThresholdAction,
    TrackerAutoPause
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import BookTimerMenu from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker-menu.svelte';
  import type { SectionWithProgress } from '$lib/components/book-reader/book-toc/book-toc';
  import type { AutoScroller } from '$lib/components/book-reader/types';
  import type {
    BooksDbReadingGoal,
    BooksDbStatistic
  } from '$lib/data/database/books-db/versions/books-db';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { PAGE_CHANGE } from '$lib/data/events';
  import { logger } from '$lib/data/logger';
  import { MergeMode } from '$lib/data/merge-mode';
  import { getReadingGoalWindow, type ReadingGoal } from '$lib/data/reading-goal';
  import {
    activeProfileId$,
    adjustStatisticsAfterIdleTime$,
    database,
    readingGoal$,
    startDayHoursForTracker$,
    trackerAutoPause$,
    trackerBackwardSkipThreshold$,
    trackerForwardSkipThreshold$,
    trackerIdleTime$,
    trackerPopupDetection$,
    trackerSkipThresholdAction$
  } from '$lib/data/store';
  import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import {
    getDate,
    getDateKey,
    getDateTimeString,
    getPreviousDayKey,
    getSecondsToDate,
    toTimeString
  } from '$lib/functions/statistic-util';
  import { clickOutside } from '$lib/functions/use-click-outside';
  import { filterNotNullAndNotUndefined } from '$lib/functions/utils';
  import {
    fromEvent,
    interval,
    merge,
    NEVER,
    Observable,
    startWith,
    switchMap,
    tap,
    throttleTime
  } from 'rxjs';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { quintInOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  export let fontColor: string;
  export let backgroundColor: string;
  export let bookTitle: string;
  export let wasTrackerPaused: boolean;
  export let exploredCharCount: number;
  export let bookCharCount: number;
  export let sectionData: SectionWithProgress[];
  export let frozenPosition: number;
  export let autoScroller: AutoScroller | undefined;
  export let blockDataUpdates: boolean;

  export function processStatistics(
    characterDiff: number,
    timeDiff = 1,
    referenceTick = Date.now(),
    flushData = true
  ) {
    const todayDate = new Date();
    const absoluteTimeDiff = Math.abs(timeDiff);
    const isNegativeTimeDiff = timeDiff < 0;
    const referenceDate = new Date(referenceTick);
    const referenceDateKey = getDateKey($startDayHoursForTracker$, referenceDate);
    const lastStatisticModified = referenceDate.getTime();
    const secondsOnDay = getSecondsToDate($startDayHoursForTracker$, referenceDate) || 1;
    const overlappedDay = absoluteTimeDiff > secondsOnDay;
    const timeDiffForToday = overlappedDay ? secondsOnDay : absoluteTimeDiff;
    const dateTimeKey = getDateTimeString(lastStatisticModified);
    const trackerHistory: TrackingHistory[] = [
      {
        id: lastStatisticModified * Math.random(),
        dateKey: referenceDateKey,
        dateTimeKey,
        timeDiff: isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday,
        characterDiff,
        saved: false
      }
    ];

    todayKey = getDateKey($startDayHoursForTracker$, todayDate);

    if (overlappedDay || referenceDateKey !== todayKey) {
      let otherDayTimeDiff = 0;

      if (overlappedDay) {
        otherDayTimeDiff = isNegativeTimeDiff
          ? -(absoluteTimeDiff - secondsOnDay)
          : absoluteTimeDiff - secondsOnDay;
      } else {
        otherDayTimeDiff = isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday;
      }

      const otherDayKey = overlappedDay
        ? getPreviousDayKey($startDayHoursForTracker$, referenceDate)
        : referenceDateKey;
      const otherDayStatistics =
        statistics.get(otherDayKey) || getDefaultStatistic(bookTitle, otherDayKey);

      const otherDayCharDiff = overlappedDay ? 0 : characterDiff;
      const otherDayHour = overlappedDay
        ? new Date(referenceTick - secondsOnDay * 1000).getHours()
        : referenceDate.getHours();

      updateStatistic(
        otherDayStatistics,
        otherDayTimeDiff,
        otherDayCharDiff,
        lastStatisticModified,
        otherDayHour
      );

      statistics.set(otherDayKey, otherDayStatistics);
      statisticsToStore.add(otherDayKey);

      if (overlappedDay) {
        trackerHistory.unshift({
          id: lastStatisticModified * Math.random(),
          dateKey: otherDayStatistics.dateKey,
          dateTimeKey,
          timeDiff: otherDayTimeDiff,
          characterDiff: otherDayCharDiff,
          saved: false
        });
      }
    }

    todaysStatistics =
      todaysStatistics.dateKey === todayKey
        ? todaysStatistics
        : statistics.get(todayKey) || getDefaultStatistic(bookTitle, todayKey);

    if (todayKey === referenceDateKey) {
      const todayTimeDiff = isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday;
      updateStatistic(
        todaysStatistics,
        todayTimeDiff,
        characterDiff,
        lastStatisticModified,
        referenceDate.getHours()
      );
      // Mirror session deltas into the folded "Today" display total so the
      // menu stays live; the write model above stays own-only for flush.
      if (displayTodaysStatistics.dateKey === todayKey) {
        updateStatistic(
          displayTodaysStatistics,
          todayTimeDiff,
          characterDiff,
          lastStatisticModified,
          referenceDate.getHours()
        );
      }
    } else {
      updateStatistic(todaysStatistics, 0, 0, lastStatisticModified);
    }

    statistics.set(todayKey, todaysStatistics);
    statisticsToStore.add(todayKey);

    updateStatistic(
      sessionStatistics,
      timeDiff,
      characterDiff,
      lastStatisticModified,
      referenceDate.getHours()
    );
    updateStatistic(
      allTimeStatistics,
      timeDiff,
      characterDiff,
      lastStatisticModified,
      referenceDate.getHours()
    );

    for (let index = 0, { length } = trackerHistory; index < length; index += 1) {
      if (historyIndex > 59) {
        historyIndex = 0;
      }

      if (trackingHistory.length < 60) {
        trackingHistory.unshift(trackerHistory[index]);
      } else {
        trackingHistory[historyIndex] = trackerHistory[index];
        trackingHistory.sort((t1, t2) => (t2.dateTimeKey > t1.dateTimeKey ? 1 : -1));
        historyIndex += 1;
      }
    }

    updateTimeToFinishBook();

    return flushData ? flushUpdates() : Promise.resolve([false, 0]);
  }

  /**
   * Re-baseline the scroll position without counting time or characters.
   * Hosts should call this after programmatic scroll restores (resume
   * bookmark, checkpoint jumps) so the resulting position delta is never
   * recorded as fresh reading.
   */
  export function syncPositionBaseline() {
    updateLastExploredCharCount(exploredCharCount, frozenPosition);
    lastTrackerTick = Date.now();
  }

  export async function flushUpdates(force = false) {
    if (!statisticsToStore.size || (blockDataUpdates && !force)) {
      return [false, 0];
    }

    actionInProgress = true;
    hadError = false;

    const toUpdate: string[] = JSON.parse(JSON.stringify([...statisticsToStore]));
    const itemsToStore = toUpdate
      .map((statisticToStore) => statistics.get(statisticToStore))
      .filter(filterNotNullAndNotUndefined);

    statisticsToStore.clear();

    try {
      await database.storeStatistics(
        bookTitle,
        itemsToStore,
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );

      trackingHistory = trackingHistory.map((item) => {
        const oldItem = item;

        oldItem.saved = toUpdate.some((dateKey) => dateKey === item.dateKey);

        return oldItem;
      });

      dispatch('statisticsSaved');
    } catch (error: any) {
      hadError = true;
      statisticsToStore = new Set([...statisticsToStore, ...toUpdate]);
      logger.error(`Error updating statistics: ${error.message}`);
    } finally {
      actionInProgress = false;
      lastTrackerFlushTime = Date.now();

      if ($isTrackerMenuOpen$) {
        updateReadingGoalWindow();
      }
    }

    return [hadError, toUpdate.length];
  }

  export function updateCompletedBook(
    completedBookStatistics: BooksDbStatistic,
    oldCompletedBookStatistics?: BooksDbStatistic
  ) {
    bookCompletionStatistics = completedBookStatistics.completedData;

    let statistic = statistics.get(completedBookStatistics.dateKey);

    if (statistic) {
      statistic = {
        ...statistic,
        ...{ completedBook: 1, completedData: bookCompletionStatistics }
      };
      statistics.set(completedBookStatistics.dateKey, statistic);
    } else {
      statistics.set(completedBookStatistics.dateKey, completedBookStatistics);
    }

    if (oldCompletedBookStatistics) {
      statistics.set(oldCompletedBookStatistics.dateKey, oldCompletedBookStatistics);
    }
  }

  let yomiPopover: HTMLElement | null;
  let jpdbPopover: HTMLElement | null;
  let actionInProgress = false;
  let hadError = false;
  let pausedByAutoPause = false;
  let visibilityState: DocumentVisibilityState;
  let currentReadingGoalStart = '';
  let currentReadingGoalEnd = '';
  let remainingTimeInReadingGoalWindow = '';
  let currentReadingGoal: ReadingGoal | undefined;
  let currentTimeGoal = 0;
  let currentCharacterGoal = 0;
  let statistics = new Map<string, BooksDbStatistic>();
  let todayKey = getDateKey($startDayHoursForTracker$);
  let sessionStatistics = getDefaultStatistic(bookTitle, todayKey);
  let todaysStatistics = getDefaultStatistic(bookTitle, todayKey);
  // Write model (own device only) — the ONLY source flushed via
  // storeStatistics(..., LOCAL). Seeded from getOwnStatisticsForBook, never
  // from folded display rows (see init). `displayTodaysStatistics` below is
  // the folded total shown in the menu / goals UI.
  let displayTodaysStatistics = getDefaultStatistic(bookTitle, todayKey);
  let allTimeStatistics = getDefaultStatistic(bookTitle, todayKey);
  let bookCompletionStatistics:
    Omit<BooksDbStatistic, 'title' | 'lastStatisticModified'> | undefined;
  let bookStartDate = todayKey;
  let timeToFinishBook = 'N/A';
  let lastExploredCharCount = exploredCharCount;
  let previousLastExploredCharCount = 0;
  let trackingHistory: TrackingHistory[] = [];
  let historyIndex = 0;
  let autoScrollerStatistics: BooksDbStatistic | undefined;
  let autoScrollerTimer$: Observable<''> | undefined;
  let lastExploredCharCountScroller = exploredCharCount;
  let statisticsToStore = new Set<string>();
  let lastTrackerTick = 0;
  let lastTrackerFlushTime = 0;
  let trackerIdleTime = 0;
  let wasDictionaryDisplayed = false;
  let currentSessionDurationSeconds = 0;

  const dispatch = createEventDispatcher<{
    trackerAvailable: void;
    statisticsSaved: void;
    trackerMenuClosed: void;
  }>();
  const yomiObserver = new MutationObserver(handleYomiMutation);
  const dictionaryObserver = new MutationObserver(handleMutation);

  const readingTracker$ = isTrackerPaused$.pipe(
    switchMap((isPaused) => {
      if (isPaused) {
        trackerIdleTime = 0;
        currentSessionDurationSeconds = 0;

        flushUpdates();

        return NEVER;
      }

      const now = Date.now();

      lastTrackerFlushTime = now;
      lastTrackerTick = now;
      currentSessionDurationSeconds = 0;

      todaysStatistics.sessionCount = (todaysStatistics.sessionCount || 0) + 1;
      todaysStatistics.lastStatisticModified = now;
      statistics.set(todayKey, todaysStatistics);
      statisticsToStore.add(todayKey);

      return interval(1000);
    }),
    tap(processTicks),
    reduceToEmptyString()
  );

  const updateTrackerIdleTime$ = isTrackerPaused$.pipe(
    switchMap((isPaused) =>
      isPaused || $trackerIdleTime$ <= 0
        ? NEVER
        : merge(
            fromEvent(document, PAGE_CHANGE),
            fromEvent<PointerEvent>(window, 'pointermove'),
            fromEvent<Event>(document, 'selectionchange')
          ).pipe(
            startWith(true),
            throttleTime(1000),
            tap(() => (trackerIdleTime = Date.now() + $trackerIdleTime$ * 1000))
          )
    ),
    reduceToEmptyString()
  );

  $: hasReadingGoal = !!($readingGoal$.goalStartDate && todayKey >= $readingGoal$.goalStartDate);

  $: handleVisibilityChange(visibilityState);

  $: updateReadingGoalWindowForPausedState($isTrackerMenuOpen$);

  let wasPaused = true;
  $: {
    if ($isTrackerPaused$) {
      updateLastExploredCharCount(exploredCharCount, frozenPosition);
      wasPaused = true;
    } else if (wasPaused) {
      updateLastExploredCharCount(exploredCharCount, frozenPosition);
      wasPaused = false;
    }
  }

  $: if (autoScroller && !autoScrollerTimer$) {
    autoScrollerTimer$ = autoScroller.wasAutoScrollerEnabled$.pipe(
      tap((isEnabled) => {
        if (isEnabled) {
          todayKey = getDateKey($startDayHoursForTracker$);
          autoScrollerStatistics = getDefaultStatistic(bookTitle, todayKey);
          lastExploredCharCountScroller = exploredCharCount;
        } else {
          autoScrollerStatistics = undefined;
        }
      }),
      switchMap((isEnabled) => (isEnabled ? interval(1000) : NEVER)),
      tap(() => {
        if (!autoScrollerStatistics) {
          return;
        }

        const diff = exploredCharCount - lastExploredCharCountScroller;

        lastExploredCharCountScroller = exploredCharCount;
        autoScrollerStatistics = {
          ...updateStatistic(autoScrollerStatistics, 1, diff, Date.now())
        };
      }),
      reduceToEmptyString()
    );
  }

  $: if (!yomiPopover) {
    yomiPopover = document.querySelector(
      '.yomichan-popup,.yomichan-float,.yomitan-popup,.yomitan-float'
    );

    if (!yomiPopover) {
      yomiObserver.observe(document.body, { childList: true, subtree: false });
    }
  }

  $: if (yomiPopover) {
    dictionaryObserver.observe(yomiPopover, { attributes: true });
  }

  $: if (jpdbPopover) {
    dictionaryObserver.observe(jpdbPopover, { attributes: true });
  }

  onMount(init);

  onDestroy(() => {
    isTrackerPaused$.next(true);
    yomiObserver.disconnect();
    dictionaryObserver.disconnect();
  });

  function handleYomiMutation() {
    yomiPopover = document.querySelector(
      '.yomichan-popup,.yomichan-float,.yomitan-popup,.yomitan-float'
    );

    if (yomiPopover) {
      yomiObserver.disconnect();
    }
  }

  function handleMutation() {
    if (!jpdbPopover && !yomiPopover) {
      return;
    }

    const isDisplayed = isDictionaryDisplayed();

    if (isDisplayed && !wasDictionaryDisplayed) {
      const now = Date.now();
      todaysStatistics.lookupCount = (todaysStatistics.lookupCount || 0) + 1;
      todaysStatistics.lastStatisticModified = now;
      const currentHour = new Date().getHours();
      if (!todaysStatistics.lookupsByHour) {
        todaysStatistics.lookupsByHour = new Array(24).fill(0);
      }
      todaysStatistics.lookupsByHour[currentHour] =
        (todaysStatistics.lookupsByHour[currentHour] || 0) + 1;
      statistics.set(todayKey, todaysStatistics);
      statisticsToStore.add(todayKey);
      if (displayTodaysStatistics.dateKey === todaysStatistics.dateKey) {
        displayTodaysStatistics.lookupCount = (displayTodaysStatistics.lookupCount || 0) + 1;
        displayTodaysStatistics.lastStatisticModified = now;
        if (!displayTodaysStatistics.lookupsByHour) {
          displayTodaysStatistics.lookupsByHour = new Array(24).fill(0);
        }
        displayTodaysStatistics.lookupsByHour[currentHour] =
          (displayTodaysStatistics.lookupsByHour[currentHour] || 0) + 1;
      }
    }
    wasDictionaryDisplayed = isDisplayed;

    if ($trackerAutoPause$ === TrackerAutoPause.OFF || $trackerPopupDetection$) {
      return;
    }

    if (isDisplayed && !$isTrackerPaused$) {
      pausedByAutoPause = true;
      isTrackerPaused$.next(true);
    } else if (!isDisplayed && $isTrackerPaused$ && !wasTrackerPaused && pausedByAutoPause) {
      pausedByAutoPause = false;
      isTrackerPaused$.next(false);
    }
  }

  function isDictionaryDisplayed(): boolean {
    return !!(
      (yomiPopover && yomiPopover.style.visibility !== 'hidden') ||
      (jpdbPopover && jpdbPopover.style.opacity !== '0')
    );
  }

  function handleBlur() {
    if (
      $isTrackerPaused$ ||
      $trackerAutoPause$ !== TrackerAutoPause.STRICT ||
      ($trackerPopupDetection$ && isDictionaryDisplayed())
    ) {
      return;
    }

    pausedByAutoPause = true;
    isTrackerPaused$.next(true);
  }

  function handleFocus() {
    if (
      !$isTrackerPaused$ ||
      !pausedByAutoPause ||
      wasTrackerPaused ||
      $trackerAutoPause$ !== TrackerAutoPause.STRICT ||
      (!$trackerPopupDetection$ && isDictionaryDisplayed())
    ) {
      return;
    }

    pausedByAutoPause = false;
    isTrackerPaused$.next(false);
  }

  function updateLastExploredCharCount(charCount = exploredCharCount, frozen = frozenPosition) {
    const referenceCharCount = frozen !== -1 ? frozen : charCount;

    if (lastExploredCharCount !== referenceCharCount) {
      previousLastExploredCharCount = lastExploredCharCount;
      lastExploredCharCount = referenceCharCount;
    }
  }

  function revertTrackerHistory({ detail: historyItem }: CustomEvent<TrackingHistory>) {
    const entry = statistics.get(historyItem.dateKey);

    if (!entry) {
      trackingHistory = trackingHistory.filter((item) => item.id !== historyItem.id);
      return;
    }

    actionInProgress = true;

    const lastStatisticModified = Date.now();

    updateStatistic(
      entry,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );
    updateStatistic(
      sessionStatistics,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );
    updateStatistic(
      allTimeStatistics,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );
    if (displayTodaysStatistics.dateKey === historyItem.dateKey) {
      updateStatistic(
        displayTodaysStatistics,
        -historyItem.timeDiff,
        -historyItem.characterDiff,
        lastStatisticModified
      );
    }

    statistics.set(entry.dateKey, entry);
    statisticsToStore.add(entry.dateKey);

    trackingHistory = trackingHistory.map((item) =>
      item.id === historyItem.id
        ? {
            id: historyItem.id,
            dateKey: historyItem.dateKey,
            dateTimeKey: getDateTimeString(lastStatisticModified),
            timeDiff: -historyItem.timeDiff,
            characterDiff: -historyItem.characterDiff,
            saved: false
          }
        : item
    );
    trackingHistory.sort((t1, t2) => (t2.dateTimeKey > t1.dateTimeKey ? 1 : -1));
    sessionStatistics = { ...sessionStatistics };

    updateTimeToFinishBook();
    flushUpdates();
  }

  function handleVisibilityChange(state: DocumentVisibilityState) {
    if ($trackerAutoPause$ !== TrackerAutoPause.MODERATE) {
      return;
    }

    if (
      state === 'hidden' &&
      !$isTrackerPaused$ &&
      (!$trackerPopupDetection$ || !isDictionaryDisplayed())
    ) {
      pausedByAutoPause = true;
      isTrackerPaused$.next(true);
    } else if (
      state === 'visible' &&
      $isTrackerPaused$ &&
      pausedByAutoPause &&
      !wasTrackerPaused &&
      ($trackerPopupDetection$ || !isDictionaryDisplayed())
    ) {
      pausedByAutoPause = false;
      isTrackerPaused$.next(false);
    }
  }

  function updateReadingGoalWindowForPausedState(isTrackerMenuOpen: boolean) {
    if (isTrackerMenuOpen && wasTrackerPaused) {
      updateReadingGoalWindow();
    }
  }

  async function init() {
    try {
      todayKey = getDateKey($startDayHoursForTracker$);
      jpdbPopover = document.getElementById('jpdb-popup');

      const statisticsForTitle = await database.getStatisticsForBook(bookTitle);
      const setFirstBookReadResult = await database.setFirstBookRead(
        bookTitle,
        $startDayHoursForTracker$,
        statisticsForTitle[0]
      );

      bookStartDate = setFirstBookReadResult[0] as string;

      if (setFirstBookReadResult[1]) {
        dispatch('statisticsSaved');
      }

      // Write-model seed: own contributions only. Folded display rows contain
      // remote + legacy reading; seeding from them copies peer totals into our
      // own contribution on the next flush, and refold sums them twice.
      // Pre-sync fallback: with no device identity there is no remote data, so
      // display rows are our own reading — seed from them to keep continuity.
      const ownStatisticsForTitle = await database.getOwnStatisticsForBook(bookTitle);
      const hasIdentity = await database.hasDeviceIdentity();
      const writeSeed =
        ownStatisticsForTitle.length > 0 || hasIdentity
          ? ownStatisticsForTitle
          : statisticsForTitle;

      for (let index = 0, { length } = writeSeed; index < length; index += 1) {
        const statisticEntry = writeSeed[index];

        statistics.set(statisticEntry.dateKey, { ...statisticEntry });

        if (todayKey === statisticEntry.dateKey) {
          addToStatistic(todaysStatistics, statisticEntry);
        }
      }

      // Display model (folded totals across devices) for menu / goals UI.
      for (let index = 0, { length } = statisticsForTitle; index < length; index += 1) {
        const statisticEntry = statisticsForTitle[index];

        addToStatistic(allTimeStatistics, statisticEntry);

        if (todayKey === statisticEntry.dateKey) {
          addToStatistic(displayTodaysStatistics, statisticEntry);
        }

        if (statisticEntry.completedBook && statisticEntry.completedData) {
          bookCompletionStatistics = statisticEntry.completedData;
        }
      }

      dispatch('trackerAvailable');
    } catch ({ message }: any) {
      logger.error(`Error initializing timer: ${message}`);
    }
  }

  async function updateReadingGoalWindow() {
    todayKey = getDateKey($startDayHoursForTracker$);
    todaysStatistics = statistics.get(todayKey) || getDefaultStatistic(bookTitle, todayKey);
    // Keep the menu's folded "Today" total in step on day rollover.
    try {
      const displayRows = await database.getStatisticsForBook(bookTitle);
      const displayToday = displayRows.find((row) => row.dateKey === todayKey);
      displayTodaysStatistics = displayToday
        ? { ...displayToday }
        : getDefaultStatistic(bookTitle, todayKey);
    } catch {
      // Display refresh is best-effort; the write model above is authoritative.
    }

    try {
      await tick();

      let currentClosedReadingGoal: BooksDbReadingGoal | undefined;

      if (!hasReadingGoal) {
        currentClosedReadingGoal = await database.getCurrentClosedReadingGoal(todayKey);

        if (!currentClosedReadingGoal) {
          return;
        }
      }

      currentReadingGoal = currentClosedReadingGoal || $readingGoal$;
      [currentReadingGoalStart, currentReadingGoalEnd, remainingTimeInReadingGoalWindow] =
        getReadingGoalWindow(todayKey, $startDayHoursForTracker$, currentReadingGoal);

      if (
        currentClosedReadingGoal?.goalEndDate &&
        currentClosedReadingGoal.goalEndDate < currentReadingGoalEnd
      ) {
        currentReadingGoalEnd = currentClosedReadingGoal.goalEndDate;

        const adjustedEndDate = getDate(currentReadingGoalEnd, $startDayHoursForTracker$);

        remainingTimeInReadingGoalWindow = toTimeString(
          (adjustedEndDate.getTime() + 8.64e7 - Date.now()) / 1000
        );
      }

      const statisticsForTimeWindow = await database.getStatisticsForTimeWindow(
        currentReadingGoalStart,
        currentReadingGoalEnd
      );

      currentTimeGoal = 0;
      currentCharacterGoal = 0;

      for (let index = 0, { length } = statisticsForTimeWindow; index < length; index += 1) {
        const statistic = statisticsForTimeWindow[index];

        currentTimeGoal += statistic.readingTime;
        currentCharacterGoal += statistic.charactersRead;
      }
    } catch ({ message }: any) {
      logger.error(`Error updating Goal Data: ${message}`);
    }
  }

  function processTicks() {
    const now = Date.now();
    const nowTick = trackerIdleTime ? Math.min(trackerIdleTime, now) : now;
    const trackerIdleTimeReached = trackerIdleTime && nowTick >= trackerIdleTime;
    const elapsed = Math.round((nowTick - lastTrackerTick) / 1000);

    lastTrackerTick = nowTick;

    // Position restore / navigation guard: while the host blocks data updates
    // (e.g. reader is resolving the resume bookmark or leaving), never count
    // time or characters — just re-baseline so the post-restore jump is not
    // recorded as fresh reading on the next tick.
    if (blockDataUpdates) {
      updateLastExploredCharCount(exploredCharCount, frozenPosition);
      return;
    }

    if (trackerIdleTimeReached) {
      wasTrackerPaused = true;
      isTrackerPaused$.next(true);

      if (frozenPosition === -1) {
        if ($adjustStatisticsAfterIdleTime$) {
          processStatistics(0, elapsed - $trackerIdleTime$, lastTrackerTick, true);
        } else if (elapsed) {
          processStatistics(0, elapsed, lastTrackerTick, true);
        }
      }

      return;
    }

    currentSessionDurationSeconds += elapsed;
    todaysStatistics.longestSessionSeconds = Math.max(
      todaysStatistics.longestSessionSeconds || 0,
      currentSessionDurationSeconds
    );

    if (frozenPosition === -1) {
      const characterDiff = exploredCharCount - lastExploredCharCount;
      let finalCharacterDiff =
        characterDiff < 0 && Math.abs(characterDiff) > sessionStatistics.charactersRead
          ? -sessionStatistics.charactersRead
          : characterDiff;

      if (
        (finalCharacterDiff > 0 &&
          $trackerForwardSkipThreshold$ &&
          finalCharacterDiff >= $trackerForwardSkipThreshold$) ||
        (finalCharacterDiff < 0 &&
          $trackerBackwardSkipThreshold$ &&
          finalCharacterDiff <= -Math.abs($trackerBackwardSkipThreshold$))
      ) {
        if ($trackerSkipThresholdAction$ === TrackerSkipThresholdAction.PAUSE) {
          wasTrackerPaused = true;
          isTrackerPaused$.next(true);
          return;
        }
        finalCharacterDiff = 0;
      }

      previousLastExploredCharCount = lastExploredCharCount;
      lastExploredCharCount = exploredCharCount;

      processStatistics(
        finalCharacterDiff,
        elapsed,
        lastTrackerTick,
        now - lastTrackerFlushTime > 10000
      );
    }
  }

  function addToStatistic(statisticObject: BooksDbStatistic, entry: BooksDbStatistic) {
    const statistic = statisticObject;

    statistic.title = entry.title;
    statistic.readingTime += entry.readingTime;
    statistic.charactersRead += entry.charactersRead;
    statistic.lastReadingSpeed = statistic.readingTime
      ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
      : 0;
    statistic.minReadingSpeed = statistic.minReadingSpeed
      ? Math.min(statistic.minReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.altMinReadingSpeed = statistic.altMinReadingSpeed
      ? Math.min(statistic.altMinReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.maxReadingSpeed = Math.max(statistic.maxReadingSpeed, statistic.lastReadingSpeed);
    statistic.lastStatisticModified = Math.max(
      statistic.lastStatisticModified,
      entry.lastStatisticModified
    );

    if (entry.readingTimeByHour) {
      if (!statistic.readingTimeByHour) {
        statistic.readingTimeByHour = [...entry.readingTimeByHour];
      } else {
        for (let i = 0; i < 24; i += 1) {
          statistic.readingTimeByHour[i] =
            (statistic.readingTimeByHour[i] || 0) + (entry.readingTimeByHour[i] || 0);
        }
      }
    }
    if (entry.charactersByHour) {
      if (!statistic.charactersByHour) {
        statistic.charactersByHour = [...entry.charactersByHour];
      } else {
        for (let i = 0; i < 24; i += 1) {
          statistic.charactersByHour[i] =
            (statistic.charactersByHour[i] || 0) + (entry.charactersByHour[i] || 0);
        }
      }
    }
    if (entry.lookupCount) {
      statistic.lookupCount = (statistic.lookupCount || 0) + entry.lookupCount;
    }
    if (entry.lookupsByHour) {
      if (!statistic.lookupsByHour) {
        statistic.lookupsByHour = [...entry.lookupsByHour];
      } else {
        for (let i = 0; i < 24; i += 1) {
          statistic.lookupsByHour[i] =
            (statistic.lookupsByHour[i] || 0) + (entry.lookupsByHour[i] || 0);
        }
      }
    }
    if (entry.sessionCount) {
      statistic.sessionCount = (statistic.sessionCount || 0) + entry.sessionCount;
    }
    if (entry.longestSessionSeconds) {
      statistic.longestSessionSeconds = Math.max(
        statistic.longestSessionSeconds || 0,
        entry.longestSessionSeconds
      );
    }
    if (entry.maxProgress !== undefined) {
      statistic.maxProgress = Math.max(statistic.maxProgress || 0, entry.maxProgress);
    }
    if (entry.readingTimeByProfile) {
      if (!statistic.readingTimeByProfile) {
        statistic.readingTimeByProfile = { ...entry.readingTimeByProfile };
      } else {
        const profiles = new Set([
          ...Object.keys(statistic.readingTimeByProfile),
          ...Object.keys(entry.readingTimeByProfile)
        ]);
        for (const profile of profiles) {
          statistic.readingTimeByProfile[profile] =
            (statistic.readingTimeByProfile[profile] || 0) +
            (entry.readingTimeByProfile[profile] || 0);
        }
      }
    }
  }

  function updateStatistic(
    statisticObject: BooksDbStatistic,
    timeDiff: number,
    characterDiff: number,
    lastStatisticModified: number,
    hourOfDay?: number
  ) {
    const statistic = statisticObject;

    statistic.readingTime = Math.max(0, statistic.readingTime + timeDiff);
    statistic.charactersRead = Math.max(0, statistic.charactersRead + characterDiff);
    statistic.lastReadingSpeed = statistic.readingTime
      ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
      : 0;
    statistic.minReadingSpeed = statistic.minReadingSpeed
      ? Math.min(statistic.minReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.maxReadingSpeed = Math.max(statistic.maxReadingSpeed, statistic.lastReadingSpeed);
    statistic.lastStatisticModified = lastStatisticModified;

    if (characterDiff) {
      statistic.altMinReadingSpeed = statistic.altMinReadingSpeed
        ? Math.min(statistic.altMinReadingSpeed, statistic.lastReadingSpeed)
        : statistic.lastReadingSpeed;
    }

    if (hourOfDay !== undefined && timeDiff > 0) {
      if (!statistic.readingTimeByHour) {
        statistic.readingTimeByHour = new Array(24).fill(0);
      }
      statistic.readingTimeByHour[hourOfDay] =
        (statistic.readingTimeByHour[hourOfDay] || 0) + timeDiff;
    }

    if (hourOfDay !== undefined && characterDiff > 0) {
      if (!statistic.charactersByHour) {
        statistic.charactersByHour = new Array(24).fill(0);
      }
      statistic.charactersByHour[hourOfDay] =
        (statistic.charactersByHour[hourOfDay] || 0) + characterDiff;
    }

    if (timeDiff > 0 && $activeProfileId$) {
      if (!statistic.readingTimeByProfile) {
        statistic.readingTimeByProfile = {};
      }
      statistic.readingTimeByProfile[$activeProfileId$] =
        (statistic.readingTimeByProfile[$activeProfileId$] || 0) + timeDiff;
    }

    if (bookCharCount > 0 && exploredCharCount > 0) {
      const currentProgress = Math.min(1, Math.max(0, exploredCharCount / bookCharCount));
      statistic.maxProgress = Math.max(statistic.maxProgress || 0, currentProgress);
    }

    return statistic;
  }

  function updateTimeToFinishBook() {
    timeToFinishBook = sessionStatistics.lastReadingSpeed
      ? toTimeString(
          Math.max(
            0,
            Math.floor(
              (bookCharCount - exploredCharCount) / (sessionStatistics.lastReadingSpeed / 3600)
            )
          )
        )
      : 'N/A';
  }
</script>

{$readingTracker$ ?? ''}
{$updateTrackerIdleTime$ ?? ''}
{$autoScrollerTimer$ ?? ''}

<svelte:window on:blur={handleBlur} on:focus={handleFocus} />
<svelte:document bind:visibilityState />

{#if $isTrackerMenuOpen$}
  <div
    class="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-full w-full max-w-xl flex-col justify-between"
    style:color={fontColor}
    style:background-color={backgroundColor}
    in:fly|local={{ x: -100, duration: 100, easing: quintInOut }}
    use:clickOutside={() => {
      if (!actionInProgress) {
        dialogManager.dialogs$.next([]);
        dispatch('trackerMenuClosed');
      }
    }}
  >
    <BookTimerMenu
      {fontColor}
      {backgroundColor}
      {actionInProgress}
      {hadError}
      {currentReadingGoal}
      {currentTimeGoal}
      {currentCharacterGoal}
      {currentReadingGoalStart}
      {currentReadingGoalEnd}
      {remainingTimeInReadingGoalWindow}
      {timeToFinishBook}
      {exploredCharCount}
      {lastExploredCharCount}
      {previousLastExploredCharCount}
      {frozenPosition}
      {trackingHistory}
      {sessionStatistics}
      todaysStatistics={displayTodaysStatistics}
      {allTimeStatistics}
      {bookCompletionStatistics}
      {autoScrollerStatistics}
      {bookStartDate}
      {sectionData}
      canSaveStatistics={statisticsToStore.size > 0}
      bind:wasTrackerPaused
      on:trackerMenuClosed
      on:freezeCurrentLocation
      on:updateCurrentLocation={() => updateLastExploredCharCount()}
      on:saveStatistics={() => flushUpdates()}
      on:revertStatistic={revertTrackerHistory}
    />
  </div>
{/if}
