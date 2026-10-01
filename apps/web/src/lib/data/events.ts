/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/** Experimental Code - May be removed any time without warning */
export const SKIPKEYLISTENER = 'reader:skipKeyListener';
export const LEGACY_SKIPKEYLISTENER = 'ttsu:skipKeyListener';

export const SYNCED = 'reader:synced';
export const LEGACY_SYNCED = 'ttsu:synced';

export const DB_VERSION = 'reader:db.version';
export const LEGACY_DB_VERSION = 'ttsu:db.version';

export const SECTION_CHANGE = 'reader:section.change';
export const LEGACY_SECTION_CHANGE = 'ttsu:section.change';

/** Experimental Code - May be removed any time without warning */
export const PAGE_CHANGE = 'reader:page.change';
export const LEGACY_PAGE_CHANGE = 'ttsu:page.change';

export const CLOSE_POPOVER = 'reader:close:popover';

/**
 * Dispatches an event under the current name and optionally also under its legacy name
 * to preserve backward compatibility for browser extensions and userscripts.
 */
export function dispatchReaderEvent<T>(
  target: EventTarget,
  primaryEvent: string,
  legacyEvent?: string,
  detail?: T
) {
  target.dispatchEvent(new CustomEvent(primaryEvent, { detail, bubbles: true }));
  if (legacyEvent) {
    target.dispatchEvent(new CustomEvent(legacyEvent, { detail, bubbles: true }));
  }
}
