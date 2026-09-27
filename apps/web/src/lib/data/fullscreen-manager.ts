/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { browser } from '$app/environment';
import { writable } from 'svelte/store';

class FullscreenManager {
  readonly isFullscreen$ = writable(false);

  get fullscreenEnabled() {
    return this.fallbackSpec('fullscreenEnabled', 'webkitFullscreenEnabled') ?? false;
  }

  get fullscreenElement() {
    return this.fallbackSpec('fullscreenElement', 'webkitFullscreenElement') ?? null;
  }

  constructor(document: Document) {
    this.fallbackSpec = fallbackSpec(document);

    if (browser && typeof document.addEventListener === 'function') {
      const sync = () => this.isFullscreen$.set(!!this.fullscreenElement);
      document.addEventListener('fullscreenchange', sync);
      // Safari < 16 prefix
      document.addEventListener('webkitfullscreenchange', sync as EventListener);
      sync();
    }
  }

  async requestFullscreen(el: Element, fullscreenOptions?: FullscreenOptions) {
    const fn = fallbackSpec(el)('requestFullscreen', 'webkitRequestFullscreen');
    if (!fn) return false;
    try {
      await fn(fullscreenOptions);
      this.isFullscreen$.set(true);
      return true;
    } catch {
      return false;
    }
  }

  async exitFullscreen() {
    const fn = this.fallbackSpec('exitFullscreen', 'webkitExitFullscreen');
    if (!fn) return;
    try {
      await fn();
    } catch {
      // no-op: already exited or rejected by browser
    } finally {
      this.isFullscreen$.set(false);
    }
  }

  /** Best-effort exit used on navigation; never throws. */
  async exitIfActive() {
    if (!this.fullscreenElement) return;
    await this.exitFullscreen();
  }

  private fallbackSpec: <P extends keyof Document>(specName: P, alias: string) => Document[P];
}

function fallbackSpec<T>(obj: T) {
  return <P extends keyof T>(specName: P, alias: string) =>
    tryGet(obj, specName) ?? tryGet(obj, alias as P);
}

function tryGet<T, P extends keyof T>(obj: T, propertyName: P) {
  const val = obj[propertyName];
  if (typeof val === 'function') {
    return val.bind(obj) as typeof val;
  }
  return val;
}

export const fullscreenManager = new FullscreenManager(browser ? document : ({} as Document));
