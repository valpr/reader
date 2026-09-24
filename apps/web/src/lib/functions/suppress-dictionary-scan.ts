/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Cancels a pending popup-dictionary text scan (Yomitan, 10ten Japanese
 * Reader, Rikaichamp, JPDB) triggered by the current pointer interaction.
 *
 * Why this exists: dictionary extensions observe pointer position on
 * `window` in the capture phase and scan the text at that point after a
 * short delay. When a popover/menu item overlapping book text is clicked,
 * the menu closes synchronously while the extension's delayed scan is still
 * pending — so the scan lands on the newly revealed book text underneath
 * and opens an unwanted dictionary popup.
 *
 * Dispatching synthetic `pointerout`/`pointercancel` synchronously from our
 * (bubble-phase) click handlers clears the extensions' pending scan timers
 * and drops the stale pointer position before the delay elapses. Harmless
 * when no extension is installed.
 */
export function suppressDictionaryScan(): void {
  if (typeof window === 'undefined' || typeof PointerEvent === 'undefined') return;
  try {
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: false,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: -1,
      clientY: -1
    };
    window.dispatchEvent(new PointerEvent('pointerout', init));
    window.dispatchEvent(new PointerEvent('pointercancel', init));
  } catch {
    // Older browsers without PointerEvent constructor — nothing to cancel.
  }
}
