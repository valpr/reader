/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Mobile (Pixel 9) smoke tests for the bug-report dialog.
 * The footer now has a primary "Copy Report & Report Issue" action plus the
 * legacy download link; both must fit the viewport and stay tappable.
 * Runs in the `mobile` project only (see playwright.config.ts).
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from '../fixtures/book-fixture';
import {
  expectDialogFitsViewport,
  expectFooterActionVisible,
  expectNoHorizontalOverflow
} from '../helpers/mobile-assertions';

for (const width of [412, 360]) {
  test(`bug report dialog fits and actions are reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
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

    await page.getByRole('button', { name: 'More Actions' }).tap();
    await page.getByRole('button', { name: 'Bug Report' }).tap();

    const dialog = page.getByTestId('log-report-dialog');
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);

    await expectFooterActionVisible(page, 'Copy Report & Report Issue');
    const download = page.getByTestId('download-report');
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('download', 'log.json');
    await expectNoHorizontalOverflow(page);

    // Tap Copy Report & Report Issue
    await page.getByTestId('copy-report-issue').tap();
    const copiedText: string = await page.evaluate(() => (window as any).__copiedText);
    expect(copiedText).toBeTruthy();
    const openedUrls: string[] = await page.evaluate(() => (window as any).__openedUrls);
    expect(openedUrls.length).toBe(1);
    expect(openedUrls[0]).toContain('/issues/new?template=bug_report.yml');
    await expect(page.getByText('Report copied — paste it in the issue')).toBeVisible();
  });

  test(`bug report dialog contains long unbroken text without overflowing at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 915 });
    await seedReaderBook(page);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    // Open bug report dialog with an unbroken long message string (Rule 4.2)
    await page.evaluate(async () => {
      const dmPath = '/src/lib/data/dialog-manager.ts';
      const dialogManagerModule: any = await import(/* @vite-ignore */ dmPath);
      const compPath = '/src/lib/components/log-report-dialog.svelte';
      const dialogComponent = (await import(/* @vite-ignore */ compPath)).default;
      dialogManagerModule.dialogManager.dialogs$.next([
        {
          component: dialogComponent,
          props: {
            title: 'UnbreakableLongTitleWithoutSpacesExceedingViewportBoundaryTesting1234567890',
            message:
              'UnbreakableErrorMessageWithLongPathOrTokenLikeC:\\Very\\Long\\Path\\That\\Never\\Breaks\\1234567890abcdefghijklmnopqrstuvwxyz'
          }
        }
      ]);
    });

    const dialog = page.getByTestId('log-report-dialog');
    await expect(dialog).toBeVisible();
    await expectDialogFitsViewport(dialog);
    await expectNoHorizontalOverflow(page);
  });
}
