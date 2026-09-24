/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      // The mobile smoke suite lives in tests/mobile/ and runs on the
      // `mobile` project instead, so the desktop run stays as-is.
      testIgnore: '**/mobile/**',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile',
      // Pixel 9 UA/touch profile, but with the real-world Chrome CSS viewport
      // (412x915). Playwright's bundled Pixel 9 descriptor defaults to a
      // 360-wide viewport, so override it here. Use --project=chromium or
      // --project=mobile to run a single project locally.
      // Smoke suite only: keeps the mobile gate fast.
      testMatch: '**/mobile/**',
      use: { ...devices['Pixel 9'], viewport: { width: 412, height: 915 } }
    }
  ],
  webServer: {
    command: 'pnpm dev --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  }
});
