/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Diagnostics report unit tests', () => {
  test('caps log history to MAX_LOG_ENTRIES (500) and records truncated count', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/diagnostics/diagnostics-report.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);

      const report = diagnostics.buildDiagnosticsReport({
        appVersion: '0.0.1',
        buildCommit: 'abc123',
        routeId: '/manage',
        userAgent: 'test-agent',
        settings: {
          theme: 'light',
          viewMode: 'paginated',
          writingMode: 'vertical-rl',
          fontSize: 20,
          autoReplication: 'off',
          syncTarget: false,
          lastSyncTimestamp: 0,
          activeProfileId: 'default-mobile',
          statisticsEnabled: false
        },
        log: Array.from({ length: 600 }, (_, index) => ({ level: 6, args: [index] }))
      });

      return {
        schemaVersion: report.schemaVersion,
        truncated: report.log.truncated,
        total: report.log.total,
        entries: report.log.entries.length
      };
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.total).toBe(600);
    expect(result.entries).toBe(500);
    expect(result.truncated).toBe(100);
  });

  test('scrubs FS paths to boolean, Sets to arrays, and prevents full theme/profile dumps', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/diagnostics/diagnostics-report.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);

      const scrubbedPathWin = diagnostics.scrubDiagnosticsValue(
        'customPath',
        'C:\\Users\\reader\\documents'
      );
      const scrubbedPathUnix = diagnostics.scrubDiagnosticsValue(
        'customPath',
        '/Users/reader/documents'
      );
      const scrubbedNormalString = diagnostics.scrubDiagnosticsValue('viewMode', 'paginated');
      const scrubbedSyncTarget = diagnostics.scrubDiagnosticsValue('syncTarget', 'D:\\MyCloud');
      const scrubbedEmptySyncTarget = diagnostics.scrubDiagnosticsValue('syncTarget', '');
      const scrubbedFsStorage = diagnostics.scrubDiagnosticsValue('fsStorageSource', 'some-id');
      const scrubbedSet = diagnostics.scrubDiagnosticsValue('tags', new Set(['fiction', 'sci-fi']));

      const scrubbedThemeObj = diagnostics.scrubDiagnosticsValue('theme', {
        name: 'Nord Dark',
        backgroundColor: '#2e3440',
        fontColor: '#eceff4'
      });

      const scrubbedProfileObj = diagnostics.scrubDiagnosticsValue('activeProfile', {
        id: 'p-ereader',
        name: 'E-Reader / E-Ink',
        fontSize: 20,
        fontWeight: 500,
        fontFamilyGroupOne: 'Noto Serif JP'
      });

      const report = diagnostics.buildDiagnosticsReport({
        settings: {
          fsStorageSource: 'C:\\Users\\test',
          syncTarget: 'googledrive',
          tags: new Set(['tag-a', 'tag-b']),
          theme: { name: 'Catppuccin Mocha', backgroundColor: '#1e1e2e', fontColor: '#cdd6f4' },
          activeProfile: { id: 'p1', name: 'Kindle Profile', fontSize: 18 }
        }
      });

      return {
        scrubbedPathWin,
        scrubbedPathUnix,
        scrubbedNormalString,
        scrubbedSyncTarget,
        scrubbedEmptySyncTarget,
        scrubbedFsStorage,
        scrubbedSet,
        scrubbedThemeObj,
        scrubbedProfileObj,
        reportSettings: report.settings
      };
    });

    expect(result.scrubbedPathWin).toBe(true);
    expect(result.scrubbedPathUnix).toBe(true);
    expect(result.scrubbedNormalString).toBe('paginated');
    expect(result.scrubbedSyncTarget).toBe(true);
    expect(result.scrubbedEmptySyncTarget).toBe(false);
    expect(result.scrubbedFsStorage).toBe(true);
    expect(result.scrubbedSet).toEqual(['fiction', 'sci-fi']);
    expect(result.scrubbedThemeObj).toBe('Nord Dark');
    expect(result.scrubbedProfileObj).toEqual({ id: 'p-ereader', name: 'E-Reader / E-Ink' });

    expect(result.reportSettings.fsStorageSource).toBe(true);
    expect(result.reportSettings.syncTarget).toBe(true);
    expect(result.reportSettings.syncTargetConfigured).toBe(true);
    expect(result.reportSettings.tags).toEqual(['tag-a', 'tag-b']);
    expect(result.reportSettings.theme).toBe('Catppuccin Mocha');
    expect(result.reportSettings.activeProfile).toEqual({ id: 'p1', name: 'Kindle Profile' });
  });

  test('buildNewIssueUrl enforces >7500 char guard when title or body is large', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/diagnostics/diagnostics-report.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);

      const normalUrl = diagnostics.buildNewIssueUrl(
        'https://github.com/valpr/reader/issues',
        '[Bug] Test title',
        'Normal issue body content'
      );

      const massiveBody = 'X'.repeat(12000);
      const guardedUrl = diagnostics.buildNewIssueUrl(
        'https://github.com/valpr/reader/issues',
        '[Bug] Massive body',
        massiveBody
      );

      return {
        normalUrl,
        normalLength: normalUrl.length,
        guardedLength: guardedUrl.length
      };
    });

    expect(result.normalUrl).toContain('/issues/new?template=bug_report.yml');
    expect(result.normalUrl).toContain('Normal%20issue%20body%20content');
    expect(result.normalLength).toBeLessThan(7500);

    // Guaranteed under 7500 char browser limit
    expect(result.guardedLength).toBeLessThanOrEqual(7500);
    expect(result.guardedLength).toBeGreaterThan(7000);
  });

  test('buildIssuePrefill creates minimal body without full JSON payload', async ({ page }) => {
    await page.goto('/');

    const prefill = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/diagnostics/diagnostics-report.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);

      const report = diagnostics.buildDiagnosticsReport({
        appVersion: '0.0.1',
        buildCommit: 'abc123',
        routeId: '/manage',
        errorCount: 2,
        syncRuns: [
          {
            startedAt: 1,
            durationMs: 1,
            target: 'drive',
            attemptedTypes: [],
            error: 'Network timeout'
          }
        ]
      });

      return diagnostics.buildIssuePrefill(report);
    });

    expect(prefill.title).toBe('[Bug] ');
    expect(prefill.body).toContain('## What happened');
    expect(prefill.body).toContain('<!-- describe steps / expected / actual -->');
    expect(prefill.body).toContain('## Diagnostics (auto)');
    expect(prefill.body).toContain(
      '- app: 0.0.1 (abc123) | route: /manage | errors: 2 | last sync error: Network timeout'
    );
    expect(prefill.body).toContain('## Logs');
    expect(prefill.body).toContain('Paste the copied report below (or attach log.json):');
    expect(prefill.body).toContain('```json\n<paste here>\n```');
    expect(prefill.body).not.toContain('"schemaVersion"');
  });

  test('falls back to safe defaults and reports no sync error', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const modulePath = '/src/lib/functions/diagnostics/diagnostics-report.ts';
      const diagnostics = await import(/* @vite-ignore */ modulePath);

      const report = diagnostics.buildDiagnosticsReport();

      return {
        appVersion: report.meta.appVersion,
        buildCommit: report.meta.buildCommit,
        lastSyncError: report.meta.lastSyncError,
        truncated: report.log.truncated,
        syncRuns: report.syncRuns
      };
    });

    expect(['dev', '0.0.1']).toContain(result.appVersion);
    expect(typeof result.buildCommit).toBe('string');
    expect(result.buildCommit).toMatch(/^([0-9a-f]{7,40}|unknown|[a-zA-Z0-9_-]+)$/);
    expect(result.lastSyncError).toBe('none');
    expect(result.truncated).toBe(0);
    expect(Array.isArray(result.syncRuns)).toBe(true);
  });
});

test.describe('Diagnostics report dialog smoke test', () => {
  test('renders dialog and executes 3 actions: copy report & open issue, download, and dismiss', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    // Install clipboard stub and window.open stub
    await page.evaluate(() => {
      (window as any).__openedUrls = [];
      (window as any).__copiedText = '';
      window.open = (url: string | URL | undefined) => {
        (window as any).__openedUrls.push(String(url));
        return null;
      };
      try {
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: async (text: string) => {
              (window as any).__copiedText = text;
            }
          },
          configurable: true
        });
      } catch {
        navigator.clipboard.writeText = async (text: string) => {
          (window as any).__copiedText = text;
        };
      }
    });

    // Open bug report dialog
    const reportButton = page.getByRole('button', { name: 'Report an Issue' });
    if (await reportButton.isVisible()) {
      await reportButton.click();
    } else {
      await page.getByRole('button', { name: 'More Actions' }).click();
      await page.getByRole('button', { name: 'Bug Report' }).click();
    }

    const dialog = page.getByTestId('log-report-dialog');
    await expect(dialog).toBeVisible();

    // ACTION 1: Copy Report & Report Issue
    const copyButton = page.getByTestId('copy-report-issue');
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    // 1a: Clipboard received full JSON report
    const copiedText: string = await page.evaluate(() => (window as any).__copiedText);
    expect(copiedText).toBeTruthy();
    const parsed = JSON.parse(copiedText);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.meta).toBeDefined();
    expect(parsed.settings).toBeDefined();
    expect(typeof parsed.settings.syncTarget).toBe('boolean');

    // 1b: window.open called with issues URL containing minimal prefill
    const openedUrls: string[] = await page.evaluate(() => (window as any).__openedUrls);
    expect(openedUrls.length).toBe(1);
    expect(openedUrls[0]).toContain('/issues/new?template=bug_report.yml');
    expect(openedUrls[0]).toContain('title=%5BBug%5D%20');

    // 1c: Transient notice displayed
    await expect(page.getByText('Report copied — paste it in the issue')).toBeVisible();

    // ACTION 2: Download Report
    const downloadLink = page.getByTestId('download-report');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('download', 'log.json');
    const href = await downloadLink.getAttribute('href');
    expect(href).toMatch(/^data:text\/json;charset=utf-8,/);
    const decodedDownloadedJson = decodeURIComponent(
      href!.replace('data:text/json;charset=utf-8,', '')
    );
    const parsedDownload = JSON.parse(decodedDownloadedJson);
    expect(parsedDownload.schemaVersion).toBe(1);

    // ACTION 3: Dismiss / close dialog
    // Backdrop click dismisses dialog
    const backdrop = page.locator('.backdrop-blur-\\[2px\\]');
    await backdrop.click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
  });
});
