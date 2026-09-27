/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Single source of truth for the "Report Issue with logs" diagnostics
 * payload. Pure functions: all shaping, scrubbing, truncation, and GitHub
 * prefill logic live here so settings stay in sync and private data never leaks.
 */

import { logger } from '$lib/data/logger';
import {
  activeProfileId$,
  autoReplication$,
  fontSize$,
  lastSyncTimestamp$,
  readerProfiles$,
  statisticsEnabled$,
  syncTarget$,
  theme$,
  viewMode$,
  writingMode$
} from '$lib/data/store';
import { getSyncRuns, type SyncRun } from '$lib/functions/replication/sync-diagnostics';

export const DIAGNOSTICS_SCHEMA_VERSION = 1;

/** Full log history is capped so the downloadable report stays small. */
export const MAX_LOG_ENTRIES = 500;

/** GitHub `issues/new` URLs must stay well under browser URL limits. */
export const MAX_NEW_ISSUE_URL_LENGTH = 7500;

export type StoreLike<T = unknown> = { getValue: () => T };

export type DiagnosticsStoreEntry = [string, StoreLike];

export function getDiagnosticsSettingsRegistry(): DiagnosticsStoreEntry[] {
  return [
    ['theme', theme$],
    ['viewMode', viewMode$],
    ['writingMode', writingMode$],
    ['fontSize', fontSize$],
    ['syncTarget', syncTarget$],
    ['autoReplication', autoReplication$],
    ['lastSyncTimestamp', lastSyncTimestamp$],
    ['activeProfileId', activeProfileId$],
    ['statisticsEnabled', statisticsEnabled$]
  ];
}

/**
 * Minimal-repro settings registry array [key, store$].
 * Fixes drift and avoids typos (like showCharacterCounter$).
 * Lazily resolves store references to break any circular module dependency during bundle load.
 */
export const DIAGNOSTICS_SETTINGS_REGISTRY: DiagnosticsStoreEntry[] = new Proxy(
  [] as DiagnosticsStoreEntry[],
  {
    get(target, prop, receiver) {
      return Reflect.get(getDiagnosticsSettingsRegistry(), prop, receiver);
    },
    has(target, prop) {
      return Reflect.has(getDiagnosticsSettingsRegistry(), prop);
    },
    ownKeys() {
      return Reflect.ownKeys(getDiagnosticsSettingsRegistry());
    },
    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(getDiagnosticsSettingsRegistry(), prop);
    }
  }
);

export interface DiagnosticsSettingsSnapshot {
  theme?: unknown;
  viewMode?: unknown;
  writingMode?: unknown;
  fontSize?: unknown;
  /** True when a sync target is configured (never the raw path). */
  syncTarget?: boolean;
  syncTargetConfigured?: boolean;
  autoReplication?: unknown;
  lastSyncTimestamp?: unknown;
  activeProfileId?: unknown;
  activeProfileName?: string;
  statisticsEnabled?: unknown;
  [key: string]: unknown;
}

export interface DiagnosticsViewport {
  hasVisualViewport: boolean;
  width: number;
  height: number;
}

export interface DiagnosticsMeta {
  appVersion: string;
  buildCommit: string;
  routeId: string;
  timestamp: number;
  userAgent: string;
  timezone: string;
  timezoneOffset: number;
  languages: readonly string[];
  viewport: DiagnosticsViewport;
  errorCount: number;
  syncLastError: string;
  lastSyncError: string;
}

export interface DiagnosticsLog {
  truncated: number;
  total: number;
  entries: unknown[];
}

export interface DiagnosticsReport {
  schemaVersion: number;
  meta: DiagnosticsMeta;
  settings: DiagnosticsSettingsSnapshot;
  log: DiagnosticsLog;
  syncRuns: SyncRun[];
}

export interface BuildDiagnosticsOptions {
  routeId?: string;
  appVersion?: string;
  buildCommit?: string;
  timestamp?: number;
  userAgent?: string;
  errorCount?: number;
  timezone?: string;
  timezoneOffset?: number;
  languages?: readonly string[] | string;
  viewport?: Partial<DiagnosticsViewport>;
  settings?: Record<string, unknown> | DiagnosticsSettingsSnapshot;
  log?: unknown[];
  syncRuns?: SyncRun[];
}

/**
 * Scrubs values for safe reporting:
 * - FS paths → boolean
 * - Sets → arrays
 * - Themes/profiles → string ID/name only (no full dumps)
 */
export function scrubDiagnosticsValue(key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return Array.from(value).map((v) => scrubDiagnosticsValue('', v));
  }

  const lowerKey = key.toLowerCase();

  // Explicit syncTarget / fsStorageSource keys or path keys become boolean
  if (
    key === 'syncTarget' ||
    key === 'syncTargetConfigured' ||
    key === 'fsStorageSource' ||
    lowerKey.endsWith('path') ||
    lowerKey.endsWith('folder') ||
    lowerKey.endsWith('dir')
  ) {
    if (typeof value === 'string') return value.trim().length > 0;
    return Boolean(value);
  }

  // File system path strings (Windows or Unix paths) scrubbed to boolean
  if (typeof value === 'string') {
    const isFsPath =
      /^[a-zA-Z]:[\\/]/.test(value) ||
      value.startsWith('\\\\') ||
      /^\/(Users|home|var|tmp|etc|private|mnt)\//i.test(value);
    if (isFsPath) return true;
    return value;
  }

  // Avoid full theme dumps: keep string or name/id only
  if (key === 'theme') {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return obj.name ?? obj.id ?? 'custom';
    }
  }

  // Avoid full profile dumps: keep string or { id, name } only
  if (key === 'activeProfile' || key === 'profile') {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return { id: obj.id, name: obj.name };
    }
  }

  // Detect and scrub rogue ThemeOption or ReaderProfile objects dumped into settings
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('backgroundColor' in obj && 'fontColor' in obj) {
      return obj.name ?? obj.id ?? 'custom';
    }
    if ('fontFamilyGroupOne' in obj || 'firstDimensionMargin' in obj) {
      return { id: obj.id, name: obj.name };
    }
    if (Array.isArray(value)) {
      return value.map((v) => scrubDiagnosticsValue('', v));
    }
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      scrubbed[k] = scrubDiagnosticsValue(k, v);
    }
    return scrubbed;
  }

  return value;
}

function getActiveProfileName(profileId: unknown): string {
  try {
    const profiles = readerProfiles$.getValue();
    if (Array.isArray(profiles)) {
      const matched = profiles.find((p) => p.id === profileId);
      if (matched?.name) return matched.name;
    }
  } catch {
    // Non-browser or uninitialized store
  }
  return typeof profileId === 'string' ? profileId : '';
}

/**
 * Collects a scrubbed settings snapshot from the store registry.
 */
export function collectDiagnosticsSettings(
  registry: DiagnosticsStoreEntry[] = DIAGNOSTICS_SETTINGS_REGISTRY
): DiagnosticsSettingsSnapshot {
  const result: Record<string, unknown> = {};

  for (const [key, store$] of registry) {
    const raw = store$.getValue();
    result[key] = scrubDiagnosticsValue(key, raw);
  }

  result.syncTarget = Boolean(result.syncTarget);
  result.syncTargetConfigured = result.syncTarget;

  if (result.activeProfileId && !result.activeProfileName) {
    result.activeProfileName = getActiveProfileName(result.activeProfileId);
  }

  return result as DiagnosticsSettingsSnapshot;
}

function normalizeLanguages(languages: readonly string[] | string | undefined): readonly string[] {
  if (typeof languages === 'string') return [languages];
  return languages ?? [];
}

const DEFAULT_APP_VERSION =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_APP_VERSION as string | undefined)) ||
  'dev';
const DEFAULT_BUILD_COMMIT =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_BUILD_COMMIT as string | undefined)) ||
  'unknown';

export function buildDiagnosticsReport(options: BuildDiagnosticsOptions = {}): DiagnosticsReport {
  let settingsSnapshot: DiagnosticsSettingsSnapshot;

  if (options.settings) {
    const scrubbed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(options.settings)) {
      scrubbed[k] = scrubDiagnosticsValue(k, v);
    }
    if (scrubbed.syncTarget !== undefined) {
      scrubbed.syncTarget = Boolean(scrubbed.syncTarget);
      if (scrubbed.syncTargetConfigured === undefined) {
        scrubbed.syncTargetConfigured = scrubbed.syncTarget;
      }
    } else if (scrubbed.syncTargetConfigured !== undefined) {
      scrubbed.syncTargetConfigured = Boolean(scrubbed.syncTargetConfigured);
      scrubbed.syncTarget = scrubbed.syncTargetConfigured;
    }
    if (scrubbed.activeProfileId && !scrubbed.activeProfileName) {
      scrubbed.activeProfileName = getActiveProfileName(scrubbed.activeProfileId);
    }
    settingsSnapshot = scrubbed as DiagnosticsSettingsSnapshot;
  } else {
    settingsSnapshot = collectDiagnosticsSettings();
  }

  const rawLog = options.log ?? logger.history ?? [];
  const total = rawLog.length;
  const entries = rawLog.slice(-MAX_LOG_ENTRIES);
  const syncRuns = options.syncRuns ?? getSyncRuns();
  const syncLastError = syncRuns.find((run) => typeof run.error === 'string')?.error ?? 'none';

  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    meta: {
      appVersion: options.appVersion ?? DEFAULT_APP_VERSION,
      buildCommit: options.buildCommit ?? DEFAULT_BUILD_COMMIT,
      routeId: options.routeId || '',
      timestamp: options.timestamp ?? Date.now(),
      userAgent:
        options.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
      timezone:
        options.timezone ||
        (typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'unknown'),
      timezoneOffset:
        options.timezoneOffset ??
        (typeof Date !== 'undefined' ? new Date().getTimezoneOffset() : 0),
      languages: normalizeLanguages(
        options.languages ?? (typeof navigator !== 'undefined' ? navigator.languages : [])
      ),
      viewport: {
        hasVisualViewport:
          options.viewport?.hasVisualViewport ??
          (typeof window !== 'undefined' ? !!window.visualViewport : false),
        width:
          options.viewport?.width ??
          (typeof window !== 'undefined' ? (window.visualViewport?.width ?? window.innerWidth) : 0),
        height:
          options.viewport?.height ??
          (typeof window !== 'undefined'
            ? (window.visualViewport?.height ?? window.innerHeight)
            : 0)
      },
      errorCount: options.errorCount ?? logger.errorCount,
      syncLastError,
      lastSyncError: syncLastError
    },
    settings: settingsSnapshot,
    log: {
      truncated: Math.max(0, total - entries.length),
      total,
      entries
    },
    syncRuns
  };
}

export interface IssuePrefill {
  title: string;
  body: string;
}

/**
 * Minimal prefill: one-line diagnostics summary plus an explicit paste
 * target for the full report. The full JSON travels via clipboard/download,
 * never via the URL.
 */
export function buildIssuePrefill(report: DiagnosticsReport): IssuePrefill {
  const { meta } = report;
  const version = meta.appVersion || 'dev';
  const commit = meta.buildCommit || 'unknown';
  const routeId = meta.routeId || 'unknown';
  const errors = meta.errorCount ?? 0;
  const lastSyncError = meta.syncLastError ?? meta.lastSyncError ?? 'none';

  return {
    title: '[Bug] ',
    body: [
      '## What happened',
      '<!-- describe steps / expected / actual -->',
      '',
      '## Diagnostics (auto)',
      `- app: ${version} (${commit}) | route: ${routeId} | errors: ${errors} | last sync error: ${lastSyncError}`,
      '',
      '## Logs',
      'Paste the copied report below (or attach log.json):',
      '```json',
      '<paste here>',
      '```',
      ''
    ].join('\n')
  };
}

/**
 * Builds a `.../issues/new?template=bug_report.yml&title=&body=` URL.
 * Enforces a >7500 char guard by truncating the prefill body if needed.
 */
export function buildNewIssueUrl(issuesUrl: string, title: string, body: string): string {
  const base = (issuesUrl || '').replace(/\/+$/, '');
  const normalized = base.endsWith('/new')
    ? base
    : base.endsWith('/issues')
      ? `${base}/new`
      : `${base}/issues/new`;

  const queryPrefix = `${normalized}?template=bug_report.yml&title=${encodeURIComponent(title)}&body=`;
  let encodedBody = encodeURIComponent(body);

  if (queryPrefix.length + encodedBody.length > MAX_NEW_ISSUE_URL_LENGTH) {
    const maxEncodedBodyLength = Math.max(0, MAX_NEW_ISSUE_URL_LENGTH - queryPrefix.length);
    let truncatedBody = body;
    while (
      truncatedBody.length > 0 &&
      encodeURIComponent(truncatedBody).length > maxEncodedBodyLength
    ) {
      const step = Math.max(
        1,
        Math.floor((encodeURIComponent(truncatedBody).length - maxEncodedBodyLength) / 3)
      );
      truncatedBody = truncatedBody.slice(0, -step);
    }
    encodedBody = encodeURIComponent(truncatedBody);
  }

  return `${queryPrefix}${encodedBody}`;
}

/**
 * Copies text to the clipboard, falling back to a hidden textarea for
 * non-secure contexts where the async Clipboard API is unavailable.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy textarea path below.
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
