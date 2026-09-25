/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export const baseHeaderClasses =
  'relative h-12 bg-[var(--astryx-color-surface,#ffffff)] text-[var(--astryx-color-fg-primary,#18181b)] border-b border-[var(--astryx-color-border-subtle,#e4e4e7)] xl:h-10 transition-colors';
export const pHeaderMat = 'p-2.5';
export const pxScreen = 'px-4 md:px-8 lg:max-w-4xl xl:max-w-none 2xl:max-w-6xl mx-auto';
export const opacityHeaderIcon = 'opacity-70 hover:opacity-100 transition-opacity';
export const pHeaderFa = 'p-4 xl:p-3';
export const nTranslateXHeaderFa = '-translate-x-4 xl:-translate-x-3';
export const translateXHeaderFa = 'translate-x-4 xl:translate-x-3';
export const inputClasses =
  'mt-1 block w-full px-0.5 bg-background-color border-0 border-b-2 border-gray-400/50 focus:ring-0 focus:border-black transition';
/**
 * Dark-theme friendly styling for native `<input>`/`<textarea>` elements that must stay
 * native (e.g. inputs using the constraint-validation API via element refs).
 * Prefer the `@custom-ereader/ui` `Input`/`Textarea` components for new code.
 */
export const themedInputClasses =
  'min-h-[44px] w-full max-w-full min-w-0 rounded-lg border border-[var(--astryx-color-border-default,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] px-3 py-2 text-sm text-[var(--astryx-color-fg-primary,#18181b)] placeholder:text-[var(--astryx-color-fg-muted,#71717a)] focus:outline-none focus:ring-2 focus:ring-[var(--astryx-color-primary,#6366f1)] disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonClasses =
  'inline-block no-underline font-medium rounded min-w-[32px] sm:min-w-[64px] px-4 leading-9 cursor-pointer text-[var(--astryx-color-fg-primary,#18181b)] hover:opacity-80 transition-opacity';
export const baseIconClasses = `flex justify-center select-none items-center h-12 w-12 cursor-pointer text-xl xl:h-10 xl:w-10 xl:text-lg text-[var(--astryx-color-fg-primary,inherit)] ${pHeaderMat} ${opacityHeaderIcon}`;
