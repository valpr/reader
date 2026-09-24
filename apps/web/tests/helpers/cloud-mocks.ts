/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { Page, Route } from '@playwright/test';

export interface MockGoogleDriveOptions {
  /** Override the /token endpoint behavior */
  handleToken?: (route: Route) => Promise<void>;
  /** Override the /drive/v3/files behavior */
  handleFiles?: (route: Route) => Promise<void>;
  /** Override the /upload/drive/v3/files behavior */
  handleUpload?: (route: Route) => Promise<void>;
  /** Fallback default files array for the list response if handleFiles is not provided */
  defaultFiles?: any[];
  /** Fallback cloud payload if handleFiles is not provided */
  cloudPayload?: any;
}

export async function mockGoogleDrive(page: Page, options: MockGoogleDriveOptions = {}) {
  const { handleToken, handleFiles, handleUpload, defaultFiles, cloudPayload } = options;
  let uploadedBody = '';

  await page.route('https://oauth2.googleapis.com/token', async (route) => {
    if (handleToken) {
      return handleToken(route);
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token',
        expires_in: '3600',
        scope: 'test'
      })
    });
  });

  await page.route('https://www.googleapis.com/drive/v3/files**', async (route) => {
    if (handleFiles) {
      return handleFiles(route);
    }

    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'root-id' })
      });
    }

    const url = new URL(route.request().url());
    if (url.searchParams.get('alt') === 'media') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(cloudPayload || {})
      });
    }

    const query = url.searchParams.get('q') || '';
    if (query.includes("mimeType = 'application/vnd.google-apps.folder'")) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: [{ id: 'root-id' }] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        files: defaultFiles || []
      })
    });
  });

  await page.route('https://www.googleapis.com/upload/drive/v3/files**', async (route) => {
    if (handleUpload) {
      return handleUpload(route);
    }

    if (route.request().method() === 'PATCH') {
      uploadedBody = route.request().postData() || '';
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'profiles-file-id', name: 'uploaded.json' })
    });
  });

  return {
    getUploadedBody: () => uploadedBody
  };
}
