/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
import type { ReaderProfile } from '$lib/data/profiles/profile-types';
import type {
  DropOffAnalysis,
  HourlyReadingDistribution,
  LookbackMetrics,
  ProfileReadingShare,
  ReadingArchetype,
  TopBookSummary,
  YearOverYearComparison
} from './lookback-types';

export const ARCHETYPES: Record<string, ReadingArchetype> = {
  VOCAB_HUNTER: {
    id: 'vocab-hunter',
    name: 'Vocab Hunter',
    badge: '🔍',
    tagline: 'No word left unmined',
    description:
      'High dictionary lookup density. You tackled dense, challenging literature and expanded your vocabulary.'
  },
  LN_BINGER: {
    id: 'ln-binger',
    name: 'Light Novel Binger',
    badge: '⚡',
    tagline: 'Speed reading through story arcs',
    description:
      'Lightning-fast immersion and high character throughput. You power through entire volumes in days.'
  },
  NIGHT_OWL: {
    id: 'night-owl',
    name: 'Night Owl',
    badge: '🌙',
    tagline: 'Immersion under the moonlight',
    description:
      'The world sleeps while your stories unfold. Late night reading is your quiet sanctuary.'
  },
  EARLY_BIRD: {
    id: 'early-bird',
    name: 'Early Bird',
    badge: '🌅',
    tagline: 'Fresh morning immersion',
    description:
      'Starting your days with coffee and chapters. Morning reading gives your mind clarity and focus.'
  },
  MARATHONER: {
    id: 'marathoner',
    name: 'Marathon Reader',
    badge: '🏃',
    tagline: 'Lost in the flow state',
    description:
      'Once you start reading, hours pass unnoticed. Continuous multi-hour deep reading sessions.'
  },
  FINISHER: {
    id: 'finisher',
    name: 'Story Finisher',
    badge: '🏆',
    tagline: 'Seeing stories to the very end',
    description: 'Unwavering commitment. High completion rate with very few abandoned stories.'
  },
  CONSISTENCY_CHAMPION: {
    id: 'consistency-champion',
    name: 'Habitual Master',
    badge: '📅',
    tagline: 'The power of daily reading',
    description:
      'Long unbroken streaks and remarkable daily dedication. Reading is an inseparable part of your life.'
  },
  EXPLORER: {
    id: 'explorer',
    name: 'Literary Explorer',
    badge: '🧭',
    tagline: 'Wide horizons, endless curiosity',
    description:
      'You dipped into many different books and worlds this year, exploring broadly across stories.'
  },
  EMERGING: {
    id: 'emerging-reader',
    name: 'Emerging Reader',
    badge: '🌱',
    tagline: 'Every journey begins with a single page',
    description:
      'You are just beginning your reading journey for this period. Read across at least 3 books and 3+ days to unlock your reading persona!'
  },
  STEADY: {
    id: 'steady-reader',
    name: 'Dedicated Reader',
    badge: '📖',
    tagline: 'Every character counts',
    description: 'Steadily building your reading journey one page, chapter, and session at a time.'
  }
};

const HOUR_LABELS: string[] = [
  '12 AM',
  '1 AM',
  '2 AM',
  '3 AM',
  '4 AM',
  '5 AM',
  '6 AM',
  '7 AM',
  '8 AM',
  '9 AM',
  '10 AM',
  '11 AM',
  '12 PM',
  '1 PM',
  '2 PM',
  '3 PM',
  '4 PM',
  '5 PM',
  '6 PM',
  '7 PM',
  '8 PM',
  '9 PM',
  '10 PM',
  '11 PM'
];

export interface LookbackCalculatorOptions {
  profiles?: ReaderProfile[];
  bookMetadataMap?: Map<
    string,
    { coverImage?: string | Blob; characters?: number; progress?: number }
  >;
  completedTitles?: Set<string>;
}

export function extractEarliestDate(statistics: BooksDbStatistic[]): string | undefined {
  let earliest: string | undefined;
  for (let i = 0; i < statistics.length; i += 1) {
    const s = statistics[i];
    if ((s.readingTime > 0 || s.charactersRead > 0) && s.dateKey) {
      if (!earliest || s.dateKey < earliest) {
        earliest = s.dateKey;
      }
    }
  }
  return earliest;
}

export function calculateLookbackMetrics(
  allStatistics: BooksDbStatistic[],
  targetYear: number | 'all',
  options: LookbackCalculatorOptions = {}
): LookbackMetrics {
  const availableYears = extractAvailableYears(allStatistics);
  const allTimeEarliestDate = extractEarliestDate(allStatistics);

  // Filter statistics for the target period
  const periodStatistics = allStatistics.filter((s) => {
    if (targetYear === 'all') return true;
    return s.dateKey.startsWith(String(targetYear));
  });

  let totalReadingTimeSeconds = 0;
  let totalCharactersRead = 0;
  let totalLookups = 0;
  let peakReadingSpeedCharsPerHour = 0;
  let longestSessionSeconds = 0;

  const activeDatesSet = new Set<string>();
  const hourlyTime = new Array(24).fill(0);
  const hourlyChars = new Array(24).fill(0);
  const hourlyLookups = new Array(24).fill(0);
  const profileSecondsMap = new Map<string, number>();

  interface BookAgg {
    title: string;
    readingTime: number;
    charactersRead: number;
    lookupCount: number;
    maxProgress: number;
    completed: boolean;
  }
  const bookAggMap = new Map<string, BookAgg>();

  for (let i = 0; i < periodStatistics.length; i += 1) {
    const s = periodStatistics[i];
    totalReadingTimeSeconds += s.readingTime || 0;
    totalCharactersRead += s.charactersRead || 0;
    totalLookups += s.lookupCount || 0;

    if (s.readingTime > 0 || s.charactersRead > 0) {
      activeDatesSet.add(s.dateKey);
    }

    if (s.lastReadingSpeed && s.lastReadingSpeed > peakReadingSpeedCharsPerHour) {
      peakReadingSpeedCharsPerHour = s.lastReadingSpeed;
    }
    if (s.maxReadingSpeed && s.maxReadingSpeed > peakReadingSpeedCharsPerHour) {
      peakReadingSpeedCharsPerHour = s.maxReadingSpeed;
    }

    if (s.longestSessionSeconds) {
      if (s.longestSessionSeconds > longestSessionSeconds) {
        longestSessionSeconds = s.longestSessionSeconds;
      }
    } else if (s.readingTime > longestSessionSeconds) {
      // Fallback estimate if longestSessionSeconds was not tracked
      longestSessionSeconds = s.readingTime;
    }

    // Hourly buckets
    if (s.readingTimeByHour) {
      for (let h = 0; h < 24; h += 1) {
        hourlyTime[h] += s.readingTimeByHour[h] || 0;
      }
    }
    if (s.charactersByHour) {
      for (let h = 0; h < 24; h += 1) {
        hourlyChars[h] += s.charactersByHour[h] || 0;
      }
    }
    if (s.lookupsByHour) {
      for (let h = 0; h < 24; h += 1) {
        hourlyLookups[h] += s.lookupsByHour[h] || 0;
      }
    }

    // Reading time by profile
    if (s.readingTimeByProfile) {
      for (const [profId, sec] of Object.entries(s.readingTimeByProfile)) {
        profileSecondsMap.set(profId, (profileSecondsMap.get(profId) || 0) + sec);
      }
    }

    // Aggregate by book title
    const existing = bookAggMap.get(s.title) || {
      title: s.title,
      readingTime: 0,
      charactersRead: 0,
      lookupCount: 0,
      maxProgress: 0,
      completed: false
    };
    existing.readingTime += s.readingTime || 0;
    existing.charactersRead += s.charactersRead || 0;
    existing.lookupCount += s.lookupCount || 0;
    if (s.maxProgress !== undefined && s.maxProgress > existing.maxProgress) {
      existing.maxProgress = s.maxProgress;
    }
    if (s.completedBook === 1) {
      existing.completed = true;
    }
    bookAggMap.set(s.title, existing);
  }

  // Incorporate bookmark progress fallback from metadata
  if (options.bookMetadataMap) {
    for (const [title, existing] of bookAggMap.entries()) {
      const meta = options.bookMetadataMap.get(title);
      if (meta?.progress !== undefined && meta.progress > existing.maxProgress) {
        existing.maxProgress = meta.progress;
      }
    }
  }

  // Active days and streaks
  const activeReadingDays = activeDatesSet.size;
  const longestStreakDays = computeLongestStreak(activeDatesSet);
  const totalDaysInPeriod = computeTotalDaysInPeriod(
    targetYear,
    activeDatesSet,
    allTimeEarliestDate
  );
  const consistencyPercentage =
    totalDaysInPeriod > 0 ? Math.round((activeReadingDays / totalDaysInPeriod) * 100) : 0;

  // Average speed and lookup density
  const averageReadingSpeedCharsPerHour =
    totalReadingTimeSeconds > 0
      ? Math.round((totalCharactersRead / totalReadingTimeSeconds) * 3600)
      : 0;

  const lookupsPer1kChars =
    totalCharactersRead > 0 ? Number(((totalLookups / totalCharactersRead) * 1000).toFixed(1)) : 0;

  // Hourly distribution
  const hourlyDistribution: HourlyReadingDistribution[] = [];
  let peakReadingHour = 0;
  let maxHourTime = -1;

  for (let h = 0; h < 24; h += 1) {
    if (hourlyTime[h] > maxHourTime) {
      maxHourTime = hourlyTime[h];
      peakReadingHour = h;
    }
    hourlyDistribution.push({
      hour: h,
      label: HOUR_LABELS[h],
      readingTimeSeconds: hourlyTime[h],
      charactersRead: hourlyChars[h],
      lookups: hourlyLookups[h]
    });
  }

  // Chronotype category
  const earlyBirdTime = sumHours(hourlyTime, 5, 11);
  const afternoonTime = sumHours(hourlyTime, 12, 16);
  const eveningTime = sumHours(hourlyTime, 17, 21);
  const nightOwlTime = sumHours(hourlyTime, 22, 23) + sumHours(hourlyTime, 0, 4);

  let peakTimeCategory: LookbackMetrics['peakTimeCategory'];
  const maxBlock = Math.max(earlyBirdTime, afternoonTime, eveningTime, nightOwlTime);
  if (maxBlock === nightOwlTime) {
    peakTimeCategory = 'Night Owl';
  } else if (maxBlock === earlyBirdTime) {
    peakTimeCategory = 'Early Bird';
  } else if (maxBlock === afternoonTime) {
    peakTimeCategory = 'Afternoon';
  } else {
    peakTimeCategory = 'Evening';
  }

  // Book rankings and completion
  const completedTitles = options.completedTitles || new Set<string>();
  const bookMetadataMap = options.bookMetadataMap || new Map();
  const allBooksList = Array.from(bookAggMap.values()).filter(
    (b) => b.readingTime > 0 || b.charactersRead > 0
  );

  const topBooks: TopBookSummary[] = allBooksList
    .sort((a, b) => b.readingTime - a.readingTime || b.charactersRead - a.charactersRead)
    .map((b, idx) => {
      const isCompleted = b.completed || completedTitles.has(b.title) || b.maxProgress >= 0.95;
      const meta = bookMetadataMap.get(b.title);
      return {
        title: b.title,
        readingTimeSeconds: b.readingTime,
        charactersRead: b.charactersRead,
        lookupCount: b.lookupCount,
        maxProgress: b.maxProgress,
        completed: isCompleted,
        rank: idx + 1,
        coverImage: meta?.coverImage
      };
    });

  const booksStarted = topBooks.length;
  const booksCompleted = topBooks.filter((b) => b.completed).length;
  const completionRate = booksStarted > 0 ? Math.round((booksCompleted / booksStarted) * 100) : 0;
  const numberOneBook = topBooks.length > 0 ? topBooks[0] : undefined;

  const hasSufficientData = booksStarted >= 3 && activeReadingDays > 2;

  // Drop-off cliff analysis
  const dropOffAnalysis = calculateDropOffAnalysis(topBooks);

  // Profile breakdown
  const profileBreakdown = calculateProfileBreakdown(profileSecondsMap, options.profiles);
  const topProfile = profileBreakdown.length > 0 ? profileBreakdown[0] : undefined;

  // Reading personas
  const { primaryArchetype, earnedArchetypes } = evaluateArchetypes({
    hasSufficientData,
    lookupsPer1kChars,
    totalLookups,
    averageReadingSpeedCharsPerHour,
    totalCharactersRead,
    activeReadingDays,
    peakTimeCategory,
    nightOwlTime,
    earlyBirdTime,
    totalReadingTimeSeconds,
    longestSessionSeconds,
    booksStarted,
    booksCompleted,
    completionRate,
    longestStreakDays,
    consistencyPercentage
  });

  // Year-over-Year comparison
  let yoyComparison: YearOverYearComparison | undefined;
  if (targetYear !== 'all') {
    const priorYear = targetYear - 1;
    const priorYearStats = allStatistics.filter((s) => s.dateKey.startsWith(String(priorYear)));
    if (priorYearStats.length > 0) {
      yoyComparison = calculateYoYComparison(
        targetYear,
        priorYear,
        periodStatistics,
        priorYearStats,
        completedTitles
      );
    }
  }

  return {
    hasSufficientData,
    targetYear,
    availableYears,
    totalReadingTimeSeconds,
    totalCharactersRead,
    totalLookups,
    lookupsPer1kChars,
    averageReadingSpeedCharsPerHour,
    peakReadingSpeedCharsPerHour,
    activeReadingDays,
    totalDaysInPeriod,
    consistencyPercentage,
    longestStreakDays,
    longestSessionSeconds,
    booksStarted,
    booksCompleted,
    completionRate,
    hourlyDistribution,
    peakReadingHour,
    peakTimeCategory,
    primaryArchetype,
    earnedArchetypes,
    dropOffAnalysis,
    profileBreakdown,
    topProfile,
    topBooks: topBooks.slice(0, 5),
    numberOneBook,
    yoyComparison
  };
}

export function extractAvailableYears(statistics: BooksDbStatistic[]): number[] {
  const years = new Set<number>();
  for (let i = 0; i < statistics.length; i += 1) {
    const dateKey = statistics[i].dateKey;
    if (dateKey && dateKey.length >= 4) {
      const yr = parseInt(dateKey.slice(0, 4), 10);
      if (!Number.isNaN(yr) && yr > 2000) {
        years.add(yr);
      }
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

function sumHours(arr: number[], startHour: number, endHour: number): number {
  let sum = 0;
  for (let h = startHour; h <= endHour; h += 1) {
    sum += arr[h] || 0;
  }
  return sum;
}

export function computeLongestStreak(activeDates: Set<string>): number {
  if (activeDates.size === 0) return 0;
  const sorted = Array.from(activeDates).sort();

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const curr = new Date(`${sorted[i]}T00:00:00`);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak += 1;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

export function computeTotalDaysInPeriod(
  targetYear: number | 'all',
  activeDates: Set<string>,
  allTimeEarliestDate?: string
): number {
  if (activeDates.size === 0) return 0;

  const sortedActive = Array.from(activeDates).sort();

  if (targetYear === 'all') {
    const first = new Date(`${sortedActive[0]}T00:00:00`).getTime();
    const last = new Date(`${sortedActive[sortedActive.length - 1]}T00:00:00`).getTime();
    return Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24)) + 1);
  }

  const currentYear = new Date().getFullYear();
  const startOfYear = `${targetYear}-01-01`;

  // If the user's very first reading day began mid-way through this year,
  // measure consistency against days since they started rather than Jan 1st.
  const effectiveStartDateStr =
    allTimeEarliestDate && allTimeEarliestDate > startOfYear ? allTimeEarliestDate : startOfYear;

  const startTime = new Date(`${effectiveStartDateStr}T00:00:00`).getTime();

  let endTime: number;
  if (targetYear === currentYear) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endTime = today.getTime();
  } else {
    endTime = new Date(`${targetYear}-12-31T00:00:00`).getTime();
  }

  return Math.max(1, Math.round((endTime - startTime) / (1000 * 60 * 60 * 24)) + 1);
}

export function calculateDropOffAnalysis(books: TopBookSummary[]): DropOffAnalysis {
  const unfinished = books.filter((b) => !b.completed);
  const allFinished = books.length > 0 && books.every((b) => b.completed);

  const bracketLabels = [
    '0–10%',
    '10–20%',
    '20–30%',
    '30–40%',
    '40–50%',
    '50–60%',
    '60–70%',
    '70–80%',
    '80–95%'
  ];

  const bucketCounts = new Array(bracketLabels.length).fill(0);

  if (unfinished.length === 0) {
    return {
      hasDropOffData: false,
      abandonedBooksCount: 0,
      modalDropOffBracket: 'N/A',
      medianDropOffPercentage: 0,
      bucketDistribution: bracketLabels.map((bracket, i) => ({
        bracket,
        count: bucketCounts[i]
      })),
      summaryMessage: allFinished
        ? '100% Completion! You finished every book you started reading!'
        : 'No reading drop-offs recorded.'
    };
  }

  const progressValues: number[] = [];

  for (let i = 0; i < unfinished.length; i += 1) {
    const pct = Math.min(94.9, Math.max(0, (unfinished[i].maxProgress || 0) * 100));
    progressValues.push(pct);

    let bracketIndex = Math.floor(pct / 10);
    if (bracketIndex >= bracketLabels.length) {
      bracketIndex = bracketLabels.length - 1;
    }
    bucketCounts[bracketIndex] += 1;
  }

  // Median progress
  progressValues.sort((a, b) => a - b);
  const mid = Math.floor(progressValues.length / 2);
  const medianProgress =
    progressValues.length % 2 !== 0
      ? progressValues[mid]
      : (progressValues[mid - 1] + progressValues[mid]) / 2;

  const medianDropOffPercentage = Math.round(medianProgress);

  // Modal bracket (bracket with highest count)
  let maxCount = -1;
  let modalIndex = 0;
  for (let i = 0; i < bucketCounts.length; i += 1) {
    if (bucketCounts[i] > maxCount) {
      maxCount = bucketCounts[i];
      modalIndex = i;
    }
  }

  const modalDropOffBracket = bracketLabels[modalIndex];
  const hasDropOffData = unfinished.length > 2;

  const summaryMessage = hasDropOffData
    ? `You are most likely to stop reading around ${medianDropOffPercentage}% (peak drop-off in the ${modalDropOffBracket} range).`
    : `Drop-off cliff analysis unlocks once more than 2 books are left unfinished (currently ${unfinished.length} / 3).`;

  return {
    hasDropOffData,
    abandonedBooksCount: unfinished.length,
    modalDropOffBracket,
    medianDropOffPercentage,
    bucketDistribution: bracketLabels.map((bracket, i) => ({
      bracket,
      count: bucketCounts[i]
    })),
    summaryMessage
  };
}

export function calculateProfileBreakdown(
  profileSecondsMap: Map<string, number>,
  profiles: ReaderProfile[] = []
): ProfileReadingShare[] {
  let totalProfileSeconds = 0;
  for (const sec of profileSecondsMap.values()) {
    totalProfileSeconds += sec;
  }

  if (totalProfileSeconds === 0) {
    return [];
  }

  const profileMap = new Map<string, ReaderProfile>();
  for (let i = 0; i < profiles.length; i += 1) {
    profileMap.set(profiles[i].id, profiles[i]);
  }

  const result: ProfileReadingShare[] = [];
  for (const [profId, sec] of profileSecondsMap.entries()) {
    const knownProfile = profileMap.get(profId);
    let profileName = profId;
    let profileIcon = knownProfile?.icon;

    if (knownProfile) {
      profileName = knownProfile.name.trim() || 'Custom Profile';
      profileIcon = knownProfile.icon || 'custom';
    } else if (profId === 'default-desktop') {
      profileName = 'PC / Desktop';
      profileIcon = 'desktop';
    } else if (profId === 'default-mobile') {
      profileName = 'Mobile / Phone';
      profileIcon = 'mobile';
    } else if (profId === 'default-tablet') {
      profileName = 'Tablet / E-Reader';
      profileIcon = 'tablet';
    } else if (profId.startsWith('profile-')) {
      profileName = 'Archived Profile';
      profileIcon = 'custom';
    }

    const percentage = Math.round((sec / totalProfileSeconds) * 100);
    result.push({
      profileId: profId,
      profileName,
      profileIcon,
      readingTimeSeconds: sec,
      percentage
    });
  }

  return result.sort((a, b) => b.readingTimeSeconds - a.readingTimeSeconds);
}

interface ArchetypeEvalContext {
  hasSufficientData: boolean;
  lookupsPer1kChars: number;
  totalLookups: number;
  averageReadingSpeedCharsPerHour: number;
  totalCharactersRead: number;
  activeReadingDays: number;
  peakTimeCategory: LookbackMetrics['peakTimeCategory'];
  nightOwlTime: number;
  earlyBirdTime: number;
  totalReadingTimeSeconds: number;
  longestSessionSeconds: number;
  booksStarted: number;
  booksCompleted: number;
  completionRate: number;
  longestStreakDays: number;
  consistencyPercentage: number;
}

export function evaluateArchetypes(ctx: ArchetypeEvalContext): {
  primaryArchetype: ReadingArchetype;
  earnedArchetypes: ReadingArchetype[];
} {
  if (!ctx.hasSufficientData) {
    return {
      primaryArchetype: ARCHETYPES.EMERGING,
      earnedArchetypes: [ARCHETYPES.EMERGING]
    };
  }

  const earned: ReadingArchetype[] = [];

  // Criteria evaluation
  const isVocabHunter = ctx.lookupsPer1kChars >= 12 || ctx.totalLookups >= 300;
  if (isVocabHunter) earned.push(ARCHETYPES.VOCAB_HUNTER);

  const isLnBinger =
    ctx.averageReadingSpeedCharsPerHour >= 20000 ||
    (ctx.totalCharactersRead >= 500000 && ctx.activeReadingDays >= 20);
  if (isLnBinger) earned.push(ARCHETYPES.LN_BINGER);

  const isNightOwl =
    ctx.totalReadingTimeSeconds > 0 &&
    (ctx.peakTimeCategory === 'Night Owl' || ctx.nightOwlTime / ctx.totalReadingTimeSeconds >= 0.4);
  if (isNightOwl) earned.push(ARCHETYPES.NIGHT_OWL);

  const isEarlyBird =
    ctx.totalReadingTimeSeconds > 0 &&
    (ctx.peakTimeCategory === 'Early Bird' ||
      ctx.earlyBirdTime / ctx.totalReadingTimeSeconds >= 0.4);
  if (isEarlyBird) earned.push(ARCHETYPES.EARLY_BIRD);

  const isMarathoner = ctx.longestSessionSeconds >= 2 * 3600 && ctx.totalReadingTimeSeconds > 0;
  if (isMarathoner) earned.push(ARCHETYPES.MARATHONER);

  const isFinisher = ctx.booksCompleted >= 3 && ctx.completionRate >= 70;
  if (isFinisher) earned.push(ARCHETYPES.FINISHER);

  const isConsistencyChampion = ctx.longestStreakDays >= 14 || ctx.consistencyPercentage >= 50;
  if (isConsistencyChampion) earned.push(ARCHETYPES.CONSISTENCY_CHAMPION);

  const isExplorer = ctx.booksStarted >= 6;
  if (isExplorer) earned.push(ARCHETYPES.EXPLORER);

  earned.push(ARCHETYPES.STEADY);

  // Priority selection for the primary archetype
  let primaryArchetype = ARCHETYPES.STEADY;
  if (isVocabHunter) {
    primaryArchetype = ARCHETYPES.VOCAB_HUNTER;
  } else if (isLnBinger) {
    primaryArchetype = ARCHETYPES.LN_BINGER;
  } else if (isNightOwl) {
    primaryArchetype = ARCHETYPES.NIGHT_OWL;
  } else if (isEarlyBird) {
    primaryArchetype = ARCHETYPES.EARLY_BIRD;
  } else if (isMarathoner) {
    primaryArchetype = ARCHETYPES.MARATHONER;
  } else if (isFinisher) {
    primaryArchetype = ARCHETYPES.FINISHER;
  } else if (isConsistencyChampion) {
    primaryArchetype = ARCHETYPES.CONSISTENCY_CHAMPION;
  } else if (isExplorer) {
    primaryArchetype = ARCHETYPES.EXPLORER;
  }

  return {
    primaryArchetype,
    earnedArchetypes: earned
  };
}

function calculateYoYComparison(
  _currYear: number,
  priorYear: number,
  currStats: BooksDbStatistic[],
  priorStats: BooksDbStatistic[],
  completedTitles: Set<string>
): YearOverYearComparison {
  let currTime = 0;
  let currChars = 0;
  let currLookups = 0;
  const currBooks = new Set<string>();

  for (let i = 0; i < currStats.length; i += 1) {
    currTime += currStats[i].readingTime || 0;
    currChars += currStats[i].charactersRead || 0;
    currLookups += currStats[i].lookupCount || 0;
    if (completedTitles.has(currStats[i].title) || (currStats[i].maxProgress || 0) >= 0.95) {
      currBooks.add(currStats[i].title);
    }
  }

  let priorTime = 0;
  let priorChars = 0;
  let priorLookups = 0;
  const priorBooks = new Set<string>();

  for (let i = 0; i < priorStats.length; i += 1) {
    priorTime += priorStats[i].readingTime || 0;
    priorChars += priorStats[i].charactersRead || 0;
    priorLookups += priorStats[i].lookupCount || 0;
    if (completedTitles.has(priorStats[i].title) || (priorStats[i].maxProgress || 0) >= 0.95) {
      priorBooks.add(priorStats[i].title);
    }
  }

  const currSpeed = currTime > 0 ? (currChars / currTime) * 3600 : 0;
  const priorSpeed = priorTime > 0 ? (priorChars / priorTime) * 3600 : 0;

  const readingTimeDeltaPercent =
    priorTime > 0 ? Number((((currTime - priorTime) / priorTime) * 100).toFixed(1)) : 100;

  const charactersDeltaPercent =
    priorChars > 0 ? Number((((currChars - priorChars) / priorChars) * 100).toFixed(1)) : 100;

  const speedDeltaPercent =
    priorSpeed > 0 ? Number((((currSpeed - priorSpeed) / priorSpeed) * 100).toFixed(1)) : 0;

  const booksCompletedDelta = currBooks.size - priorBooks.size;

  const lookupsDeltaPercent =
    priorLookups > 0
      ? Number((((currLookups - priorLookups) / priorLookups) * 100).toFixed(1))
      : undefined;

  return {
    hasPriorYearData: true,
    priorYear,
    readingTimeDeltaPercent,
    charactersDeltaPercent,
    speedDeltaPercent,
    booksCompletedDelta,
    lookupsDeltaPercent
  };
}
