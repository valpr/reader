<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  /** Display mode: rotating flavor lines, or real stage + progress. */
  export let mode: 'flavor' | 'debug' = 'flavor';
  /** Kanji drawn by the brush animation (stroke-order paths cover 本). */
  export let kanji = '本';
  /** Current loading stage, e.g. 'Syncing cloud bookmarks…'. */
  export let stage = '';
  /** Secondary detail line shown under the stage in debug mode. */
  export let detail = '';
  /** Determinate progress 0–1, or null for indeterminate. */
  export let progress: number | null = null;
  /** Optional foreground color override (reader passes its font color). */
  export let foreground = '';
  /** Rotating lines shown in flavor mode. */
  export let flavorLines: string[] = [
    '筆を整えています…',
    '文庫本を開いています…',
    '栞を挟んでいます…'
  ];

  let flavorIndex = 0;
  let flavorTimer: ReturnType<typeof setInterval> | undefined;

  $: currentFlavorLine = flavorLines.length
    ? (flavorLines[flavorIndex % flavorLines.length] ?? '')
    : '';
  $: clampedProgress = progress === null ? null : Math.min(1, Math.max(0, progress));

  onMount(() => {
    if (flavorLines.length > 1) {
      flavorTimer = setInterval(() => {
        flavorIndex += 1;
      }, 2400);
    }
  });

  onDestroy(() => {
    if (flavorTimer) clearInterval(flavorTimer);
  });
</script>

<div
  class="astryx-bookloader"
  role="status"
  aria-live="polite"
  aria-busy="true"
  data-testid="book-loader"
  data-mode={mode}
  style:color={foreground || undefined}
>
  <div class="astryx-bookloader-mark" aria-hidden="true">
    <span class="astryx-bookloader-ghost">{kanji}</span>
    <svg class="astryx-bookloader-brush" viewBox="0 0 100 100" fill="none">
      <path class="astryx-stroke s1" pathLength="100" d="M20 20 H80" />
      <path class="astryx-stroke s2" pathLength="100" d="M29 39 H71" />
      <path class="astryx-stroke s3" pathLength="100" d="M50 10 V90" />
      <path class="astryx-stroke s4" pathLength="100" d="M50 48 C42 62 33 74 24 86" />
      <path class="astryx-stroke s5" pathLength="100" d="M50 48 C58 62 67 74 76 86" />
    </svg>
  </div>
  {#if mode === 'debug'}
    {#if stage}
      <p class="astryx-bookloader-stage" data-testid="book-loader-stage">{stage}</p>
    {/if}
    {#if clampedProgress !== null}
      <div
        class="astryx-bookloader-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(clampedProgress * 100)}
        aria-label={stage || 'Loading progress'}
      >
        <div class="astryx-bookloader-fill" style:width="{clampedProgress * 100}%"></div>
      </div>
    {/if}
    {#if detail}
      <p class="astryx-bookloader-detail">{detail}</p>
    {/if}
  {:else if currentFlavorLine}
    <p class="astryx-bookloader-flavor" data-testid="book-loader-flavor">{currentFlavorLine}</p>
  {/if}
</div>

<style>
  .astryx-bookloader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--astryx-space-4, 16px);
    width: 100%;
    max-width: 20rem;
    margin-inline: auto;
    padding-inline: var(--astryx-space-4, 16px);
    text-align: center;
  }

  .astryx-bookloader-mark {
    position: relative;
    width: 7rem;
    height: 7rem;
    animation: astryx-ink-settle 3.4s linear infinite;
  }

  .astryx-bookloader-mark::after {
    content: '';
    position: absolute;
    inset: -22%;
    background: radial-gradient(circle, currentColor 0, transparent 65%);
    opacity: 0.07;
    pointer-events: none;
  }

  .astryx-bookloader-ghost {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Klee One', 'Noto Serif JP', serif;
    font-weight: 600;
    font-size: 5.5rem;
    line-height: 1;
    opacity: 0.14;
  }

  .astryx-bookloader-brush {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .astryx-stroke {
    stroke: currentColor;
    stroke-width: 9;
    stroke-linecap: round;
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation-duration: 3.4s;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  /* 本 stroke order: two horizontals, vertical, left-falling, right-falling.
     Each stroke draws in its own window, holds, then the mark fades out
     (see astryx-ink-settle) so the dash snap stays invisible. */
  .s1 {
    animation-name: astryx-draw-s1;
  }
  .s2 {
    animation-name: astryx-draw-s2;
  }
  .s3 {
    animation-name: astryx-draw-s3;
  }
  .s4 {
    animation-name: astryx-draw-s4;
  }
  .s5 {
    animation-name: astryx-draw-s5;
  }

  @keyframes astryx-draw-s1 {
    0%,
    4% {
      stroke-dashoffset: 100;
    }
    16%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  @keyframes astryx-draw-s2 {
    0%,
    18% {
      stroke-dashoffset: 100;
    }
    28%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  @keyframes astryx-draw-s3 {
    0%,
    30% {
      stroke-dashoffset: 100;
    }
    44%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  @keyframes astryx-draw-s4 {
    0%,
    46% {
      stroke-dashoffset: 100;
    }
    58%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  /* Final harai flicks out faster than the pressed strokes above. */
  @keyframes astryx-draw-s5 {
    0%,
    60% {
      stroke-dashoffset: 100;
    }
    68%,
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes astryx-ink-settle {
    0% {
      opacity: 0;
    }
    6%,
    84% {
      opacity: 1;
    }
    96%,
    100% {
      opacity: 0;
    }
  }

  .astryx-bookloader-stage,
  .astryx-bookloader-flavor {
    margin: 0;
    font-size: var(--astryx-font-size-sm, 0.875rem);
    line-height: 1.5;
    opacity: 0.8;
    overflow-wrap: anywhere;
  }

  .astryx-bookloader-detail {
    margin: 0;
    font-size: var(--astryx-font-size-xs, 0.75rem);
    line-height: 1.5;
    opacity: 0.6;
    overflow-wrap: anywhere;
  }

  .astryx-bookloader-track {
    width: 12rem;
    max-width: 100%;
    height: 6px;
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-border-strong, #c1c1c1);
    background-color: color-mix(in srgb, currentColor 18%, transparent);
    overflow: hidden;
  }

  .astryx-bookloader-fill {
    height: 100%;
    border-radius: inherit;
    background-color: currentColor;
    transition: width var(--astryx-duration-normal, 200ms) var(--astryx-ease, ease);
  }

  @media (prefers-reduced-motion: reduce) {
    .astryx-bookloader-mark,
    .astryx-stroke {
      animation: none;
    }
    .astryx-bookloader-mark {
      opacity: 1;
    }
    .astryx-stroke {
      stroke-dashoffset: 0;
    }
  }
</style>
