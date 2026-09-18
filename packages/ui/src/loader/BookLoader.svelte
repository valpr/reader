<script context="module" lang="ts">
  // Unique SVG mask id per loader instance (two loaders can share a page).
  let bookLoaderMaskCount = 0;
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  /** Display mode: rotating flavor lines, or real stage + progress. */
  export let mode: 'flavor' | 'debug' = 'flavor';
  /**
   * Kanji traced by the brush animation. The ink layer renders this same
   * glyph through a stroke-order mask, so the animation always overlaps the
   * translucent image beneath it (mask regions cover 本).
   */
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

  const maskId = `astryx-bookloader-mask-${(bookLoaderMaskCount += 1)}`;

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
    <span
      class="astryx-bookloader-ink"
      style="mask-image: url(#{maskId}); -webkit-mask-image: url(#{maskId});">{kanji}</span
    >
    <svg class="astryx-bookloader-maskdef" aria-hidden="true" focusable="false">
      <defs>
        <mask
          id={maskId}
          maskUnits="objectBoundingBox"
          maskContentUnits="objectBoundingBox"
          x="-0.2"
          y="-0.2"
          width="1.4"
          height="1.4"
        >
          <!-- Regions calibrated against Klee One's rendered metrics
            (objectBoundingBox fractions of the mark). Each stroke paints in
            full, crossings included, exactly like classic stroke-order
            animation: later strokes overpaint earlier ones invisibly, so no
            notches or splits. Order: top bar, vertical, left-falling,
            right-falling, bottom bar last. -->
          <!-- b1 keeps its edge pad: Klee One's bar top edge is uneven and
            needs the coverage; the pad's transient stub reads as brush
            pressure during the 0.35s wipe, while a gap would never leave. -->
          <rect
            class="bm b1"
            x="0.17"
            y="0.33"
            width="0.70"
            height="0.04"
            rx="0.03"
            fill="#fff"
            stroke="#fff"
            stroke-width="0.02"
          />
          <rect
            class="bm b2"
            x="0.27"
            y="0.64"
            width="0.48"
            height="0.075"
            fill="#fff"
            stroke="#fff"
            stroke-width="0.02"
          />
          <rect
            class="bm b3"
            x="0.48"
            y="0.02"
            width="0.03"
            height="0.94"
            rx="0.035"
            fill="#fff"
            stroke="#fff"
            stroke-width="0.02"
          />
          <g transform="translate(0.50,0.40) rotate(133.4)">
            <rect
              class="bm b4"
              x="0"
              y="-0.035"
              width="0.50"
              height="0.07"
              rx="0.035"
              fill="#fff"
              stroke="#fff"
              stroke-width="0.02"
            />
          </g>
          <g transform="translate(0.52,0.40) rotate(42.4)">
            <rect
              class="bm b5"
              x="0"
              y="-0.035"
              width="0.47"
              height="0.07"
              rx="0.035"
              fill="#fff"
              stroke="#fff"
              stroke-width="0.02"
            />
          </g>
          <rect
            class="bm b5foot"
            x="0.76"
            y="0.62"
            width="0.20"
            height="0.14"
            fill="#fff"
            stroke="#fff"
            stroke-width="0.02"
          />
        </mask>
      </defs>
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

  /* Full-color copy of the same glyph, revealed through the stroke-order
     mask below so the ink always sits exactly on the translucent image. */
  .astryx-bookloader-ink {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Klee One', 'Noto Serif JP', serif;
    font-weight: 600;
    font-size: 5.5rem;
    line-height: 1;
  }

  /* Zero-size only: display:none would break the mask reference. */
  .astryx-bookloader-maskdef {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }

  .bm {
    opacity: 1;
    animation-duration: 3.4s;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  /* 本 stroke order: top horizontal, vertical, left-falling, right-falling,
     bottom horizontal last. Each stroke paints in full, crossings included,
     growing along its brush direction (scale transforms with fill-box
     origins); later strokes overpaint earlier ones invisibly. The snap-back
     hides inside the mark fade (see astryx-ink-settle). */
  .b1,
  .b2,
  .b4,
  .b5 {
    transform-box: fill-box;
    transform-origin: left center;
  }
  .b3 {
    transform-box: fill-box;
    transform-origin: center top;
  }
  .b1 {
    animation-name: astryx-wipe-b1;
  }
  .b2 {
    animation-name: astryx-wipe-b2;
  }
  .b3 {
    animation-name: astryx-drop-b3;
  }
  .b4 {
    animation-name: astryx-wipe-b4;
  }
  .b5 {
    animation-name: astryx-wipe-b5;
  }
  .b5foot {
    animation-name: astryx-fade-b5foot;
  }

  @keyframes astryx-wipe-b1 {
    0%,
    4% {
      transform: scaleX(0);
    }
    14%,
    96% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
    }
  }
  @keyframes astryx-drop-b3 {
    0%,
    16% {
      transform: scaleY(0);
    }
    28%,
    96% {
      transform: scaleY(1);
    }
    100% {
      transform: scaleY(0);
    }
  }
  @keyframes astryx-wipe-b4 {
    0%,
    30% {
      transform: scaleX(0);
    }
    39%,
    96% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
    }
  }
  /* Final harai flicks out faster than the pressed strokes above. */
  @keyframes astryx-wipe-b5 {
    0%,
    44% {
      transform: scaleX(0);
    }
    56%,
    96% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
    }
  }
  @keyframes astryx-fade-b5foot {
    0%,
    50% {
      opacity: 0;
    }
    60%,
    96% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes astryx-wipe-b2 {
    0%,
    58% {
      transform: scaleX(0);
    }
    70%,
    96% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
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
    .bm {
      animation: none;
    }
    .astryx-bookloader-mark {
      opacity: 1;
    }
    .bm {
      opacity: 1;
    }
  }
</style>
