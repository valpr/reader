/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export interface ReadingArchetype {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
}

export interface HourlyReadingDistribution {
  hour: number;
  label: string;
  readingTimeSeconds: number;
  charactersRead: number;
  lookups: number;
}

export interface TopBookSummary {
  title: string;
  readingTimeSeconds: number;
  charactersRead: number;
  lookupCount: number;
  maxProgress: number;
  completed: boolean;
  rank: number;
  coverImage?: string | Blob;
}

export interface ProfileReadingShare {
  profileId: string;
  profileName: string;
  profileIcon?: string;
  readingTimeSeconds: number;
  percentage: number;
}

export interface DropOffAnalysis {
  hasDropOffData: boolean;
  abandonedBooksCount: number;
  modalDropOffBracket: string;
  medianDropOffPercentage: number;
  bucketDistribution: { bracket: string; count: number }[];
  summaryMessage: string;
}

export interface YearOverYearComparison {
  hasPriorYearData: boolean;
  priorYear: number;
  readingTimeDeltaPercent: number;
  charactersDeltaPercent: number;
  speedDeltaPercent: number;
  booksCompletedDelta: number;
  lookupsDeltaPercent?: number;
}

export interface LookbackMetrics {
  hasSufficientData: boolean;
  targetYear: number | 'all';
  availableYears: number[];
  totalReadingTimeSeconds: number;
  totalCharactersRead: number;
  totalLookups: number;
  lookupsPer1kChars: number;
  averageReadingSpeedCharsPerHour: number;
  peakReadingSpeedCharsPerHour: number;
  activeReadingDays: number;
  totalDaysInPeriod: number;
  consistencyPercentage: number;
  longestStreakDays: number;
  longestSessionSeconds: number;
  booksStarted: number;
  booksCompleted: number;
  completionRate: number;

  // Reading Chronotype & Hourly Distribution
  hourlyDistribution: HourlyReadingDistribution[];
  peakReadingHour: number;
  peakTimeCategory: 'Early Bird' | 'Afternoon' | 'Evening' | 'Night Owl';

  // Reading Personas & Archetypes
  primaryArchetype: ReadingArchetype;
  earnedArchetypes: ReadingArchetype[];

  // Drop-off Cliff Analysis
  dropOffAnalysis: DropOffAnalysis;

  // Profile / Device Breakdown
  profileBreakdown: ProfileReadingShare[];
  topProfile?: ProfileReadingShare;

  // Book Rankings
  topBooks: TopBookSummary[];
  numberOneBook?: TopBookSummary;

  // Year-over-Year Comparison
  yoyComparison?: YearOverYearComparison;
}
