<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { Button, IconButton } from '@custom-ereader/ui';
  import type { LookbackMetrics } from './lookback-types';

  export let metrics: LookbackMetrics;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  const TOTAL_SLIDES = 8;
  const SLIDE_DURATION_MS = 6000;

  let currentSlide = 0;
  let isPaused = false;
  let progressPercent = 0;
  let copiedText = false;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let startTime = Date.now();
  let elapsedBeforePause = 0;
  let pointerDownTimestamp = 0;

  $: currentYearLabel = metrics.targetYear === 'all' ? 'All-Time' : String(metrics.targetYear);

  function formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function startTimer() {
    clearTimer();
    startTime = Date.now();
    elapsedBeforePause = 0;
    progressPercent = 0;

    timerInterval = setInterval(() => {
      if (isPaused) return;
      const elapsed = Date.now() - startTime + elapsedBeforePause;
      progressPercent = Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100);

      if (elapsed >= SLIDE_DURATION_MS) {
        nextSlide();
      }
    }, 50);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function pauseTimer() {
    if (isPaused) return;
    isPaused = true;
    elapsedBeforePause += Date.now() - startTime;
  }

  function resumeTimer() {
    if (!isPaused) return;
    isPaused = false;
    startTime = Date.now();
  }

  function handlePointerDown() {
    pointerDownTimestamp = Date.now();
    pauseTimer();
  }

  function handlePointerUp() {
    resumeTimer();
  }

  function nextSlide() {
    if (currentSlide < TOTAL_SLIDES - 1) {
      currentSlide += 1;
      startTimer();
    } else {
      // Last slide: stop auto-advance
      clearTimer();
      progressPercent = 100;
    }
  }

  function prevSlide() {
    if (currentSlide > 0) {
      currentSlide -= 1;
      startTimer();
    } else {
      startTimer();
    }
  }

  function goToSlide(idx: number) {
    currentSlide = idx;
    startTimer();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dispatch('close');
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      nextSlide();
    } else if (e.key === 'ArrowLeft') {
      prevSlide();
    }
  }

  function handleZoneClick(e: MouseEvent) {
    if (Date.now() - pointerDownTimestamp > 250) {
      return;
    }
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width * 0.35) {
      prevSlide();
    } else {
      nextSlide();
    }
  }

  async function copySummary() {
    const lines = [
      `📖 My Reading Lookback (${currentYearLabel})`,
      `⭐ Persona: ${metrics.primaryArchetype.name} ${metrics.primaryArchetype.badge}`,
      `⏱️ Total Time: ${formatSeconds(metrics.totalReadingTimeSeconds)}`,
      `🔤 Characters: ${metrics.totalCharactersRead.toLocaleString()}`,
      `📅 Active Days: ${metrics.activeReadingDays} (${metrics.consistencyPercentage}% consistency)`,
      `🔥 Longest Streak: ${metrics.longestStreakDays} days`,
      `🏆 Books Completed: ${metrics.booksCompleted} of ${metrics.booksStarted}`,
      `⛰️ Drop-off Cliff: Most likely to stop at ${metrics.dropOffAnalysis.medianDropOffPercentage}%`,
      metrics.topProfile
        ? `📱 Device: ${metrics.topProfile.profileName} (${metrics.topProfile.percentage}%)`
        : '',
      metrics.numberOneBook ? `🥇 #1 Book: ${metrics.numberOneBook.title}` : ''
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copiedText = true;
      setTimeout(() => {
        copiedText = false;
      }, 2500);
    } catch {
      // Ignore clipboard failure
    }
  }

  onMount(() => {
    startTimer();
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    clearTimer();
    window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<!-- Fullscreen Story Overlay Container -->
<div
  class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md select-none overflow-hidden"
  role="dialog"
  aria-label="Reading Lookback Story"
>
  <!-- Story Frame (Mobile Aspect Ratio Card on Desktop, Fullscreen on Mobile) -->
  <div
    class="relative w-full h-full sm:max-w-md sm:max-h-[860px] sm:rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden text-white"
    role="region"
    aria-label="Story Card"
    on:pointerdown={handlePointerDown}
    on:pointerup={handlePointerUp}
  >
    <!-- Dynamic Gradient Background Based on Slide -->
    <div
      class="absolute inset-0 transition-all duration-700 pointer-events-none -z-10 {currentSlide ===
      0
        ? 'bg-gradient-to-br from-indigo-900 via-purple-950 to-zinc-950'
        : currentSlide === 1
          ? 'bg-gradient-to-br from-blue-900 via-cyan-950 to-zinc-950'
          : currentSlide === 2
            ? 'bg-gradient-to-br from-rose-950 via-amber-950 to-zinc-950'
            : currentSlide === 3
              ? 'bg-gradient-to-br from-emerald-950 via-teal-950 to-zinc-950'
              : currentSlide === 4
                ? 'bg-gradient-to-br from-violet-950 via-indigo-950 to-zinc-950'
                : currentSlide === 5
                  ? 'bg-gradient-to-br from-amber-950 via-yellow-950 to-zinc-950'
                  : currentSlide === 6
                    ? 'bg-gradient-to-br from-fuchsia-950 via-purple-950 to-zinc-950'
                    : 'bg-gradient-to-br from-indigo-950 via-zinc-900 to-zinc-950'}"
    ></div>

    <!-- Header: Story Progress Bars & Close Button -->
    <div class="relative z-20 pt-3 px-4 pb-2 space-y-2">
      <div class="flex items-center gap-1.5 w-full">
        {#each Array(TOTAL_SLIDES) as _, idx}
          <div
            class="h-1 flex-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
            role="button"
            tabindex="0"
            on:click|stopPropagation={() => goToSlide(idx)}
            on:keydown|stopPropagation={(e) =>
              (e.key === 'Enter' || e.key === ' ') && goToSlide(idx)}
          >
            <div
              class="h-full bg-white rounded-full transition-all duration-75"
              style="width: {idx < currentSlide
                ? '100%'
                : idx === currentSlide
                  ? `${progressPercent}%`
                  : '0%'};"
            ></div>
          </div>
        {/each}
      </div>

      <div class="flex items-center justify-between pt-1">
        <div class="text-xs font-semibold tracking-wider uppercase text-white/70">
          {currentYearLabel} Recap • {currentSlide + 1} of {TOTAL_SLIDES}
        </div>
        <button
          type="button"
          class="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer text-sm"
          on:click|stopPropagation={() => dispatch('close')}
          aria-label="Close Story"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Slide Tap Navigation Zones (Invisible Left/Right Overlays) -->
    <div
      class="absolute inset-0 z-10 cursor-pointer"
      on:click={handleZoneClick}
      role="presentation"
    ></div>

    <!-- Slide Content Area -->
    <div
      class="relative z-[15] flex-1 flex flex-col justify-center px-6 sm:px-8 py-8 pointer-events-none"
    >
      {#if currentSlide === 0}
        <!-- Slide 0: Intro -->
        <div class="space-y-6 text-center animate-fade-in">
          <div class="text-6xl sm:text-7xl animate-bounce">📖</div>
          <div class="space-y-2">
            <span
              class="px-3 py-1 text-xs font-semibold tracking-widest uppercase rounded-full bg-white/10 text-white/80"
            >
              Lookback Recap
            </span>
            <h2
              class="text-3xl sm:text-4xl font-extrabold tracking-tight break-words [overflow-wrap:anywhere]"
            >
              Your {currentYearLabel} in Reading
            </h2>
          </div>
          <p class="text-base text-white/70 max-w-xs mx-auto break-words [overflow-wrap:anywhere]">
            Every character, late-night chapter, and book finished. Here is your story.
          </p>
          <div class="pt-4 text-xs text-white/40">Tap screen to explore</div>
        </div>
      {:else if currentSlide === 1}
        <!-- Slide 1: Volume & Immersion -->
        <div class="space-y-6 text-center">
          <div class="text-5xl">⏳</div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Time & Volume
            </span>
            <h2 class="text-2xl sm:text-3xl font-bold break-words [overflow-wrap:anywhere]">
              You immersed for
            </h2>
          </div>

          <div class="py-4 space-y-1 bg-white/5 rounded-2xl border border-white/10 p-4">
            <div class="text-4xl sm:text-5xl font-black text-blue-400">
              {formatSeconds(metrics.totalReadingTimeSeconds)}
            </div>
            <div class="text-sm text-white/80">
              across <strong class="text-white">{metrics.activeReadingDays} active days</strong>
            </div>
          </div>

          <div class="space-y-1 text-sm text-white/70">
            <div>
              Totaling <strong class="text-white text-base"
                >{metrics.totalCharactersRead.toLocaleString()}</strong
              > characters read.
            </div>
            <div class="text-xs text-white/50">
              Averaging ~{metrics.averageReadingSpeedCharsPerHour.toLocaleString()} chars/hr.
            </div>
          </div>
        </div>
      {:else if currentSlide === 2}
        <!-- Slide 2: Drop-Off Cliff -->
        <div class="space-y-6 text-center">
          <div class="text-5xl">⛰️</div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Drop-off Cliff
            </span>
            <h2 class="text-2xl sm:text-3xl font-bold break-words [overflow-wrap:anywhere]">
              Where You Give Up
            </h2>
          </div>

          {#if metrics.dropOffAnalysis.hasDropOffData}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
              <div class="text-xs text-white/60">Most likely to set a book down at:</div>
              <div class="text-5xl font-black text-amber-400">
                {metrics.dropOffAnalysis.medianDropOffPercentage}%
              </div>
              <div class="text-xs text-white/70">
                Peak abandonment cliff in the {metrics.dropOffAnalysis.modalDropOffBracket} range.
              </div>
            </div>
            <p class="text-xs text-white/60 max-w-xs mx-auto break-words [overflow-wrap:anywhere]">
              Knowing your drop-off cliff helps you recognize when you are entering the danger zone
              of a story!
            </p>
          {:else if metrics.booksCompleted === metrics.booksStarted && metrics.booksStarted > 0}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
              <div class="text-3xl">🏆</div>
              <div class="text-xl font-bold text-emerald-400">100% Completion!</div>
              <div class="text-xs text-white/70">
                You did not abandon a single book you opened this period.
              </div>
            </div>
          {:else}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
              <div class="text-3xl">🌱</div>
              <div class="text-base font-bold text-amber-300">Building Habits</div>
              <div class="text-xs text-white/70">
                Drop-off cliff analysis unlocks once more than 2 books are left unfinished.
              </div>
            </div>
          {/if}
        </div>
      {:else if currentSlide === 3}
        <!-- Slide 3: Device Sanctuary -->
        <div class="space-y-6 text-center">
          <div class="text-5xl">📱</div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-teal-300">
              Device Sanctuary
            </span>
            <h2 class="text-2xl sm:text-3xl font-bold break-words [overflow-wrap:anywhere]">
              Where You Read Most
            </h2>
          </div>

          {#if metrics.topProfile}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
              <div class="text-xs text-white/60">Your favorite reading sanctuary:</div>
              <div
                class="text-3xl font-black text-teal-300 truncate"
                title={metrics.topProfile.profileName}
              >
                {metrics.topProfile.profileName}
              </div>
              <div class="text-xl font-bold text-white/90">
                {metrics.topProfile.percentage}% of all reading time
              </div>
            </div>
          {:else}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4">
              <div class="text-sm text-white/70">Single device immersion throughout the year.</div>
            </div>
          {/if}

          <div class="space-y-2 max-w-xs mx-auto text-xs text-left">
            {#each metrics.profileBreakdown as prof (prof.profileId)}
              <div class="flex justify-between text-white/80">
                <span
                  class="truncate max-w-[180px] flex items-center gap-1.5"
                  title={prof.profileName}
                >
                  <span aria-hidden="true">
                    {prof.profileIcon === 'desktop'
                      ? '💻'
                      : prof.profileIcon === 'mobile'
                        ? '📱'
                        : prof.profileIcon === 'tablet'
                          ? '📟'
                          : '🔖'}
                  </span>
                  <span class="truncate">{prof.profileName}</span>
                </span>
                <span class="font-bold">{prof.percentage}%</span>
              </div>
            {/each}
          </div>
        </div>
      {:else if currentSlide === 4}
        <!-- Slide 4: Chronotype Rhythm -->
        <div class="space-y-6 text-center">
          <div class="text-5xl">
            {metrics.peakTimeCategory === 'Night Owl'
              ? '🌙'
              : metrics.peakTimeCategory === 'Early Bird'
                ? '🌅'
                : '☀️'}
          </div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-purple-300">
              Reading Chronotype
            </span>
            <h2 class="text-2xl sm:text-3xl font-bold break-words [overflow-wrap:anywhere]">
              You are a {metrics.peakTimeCategory}
            </h2>
          </div>

          <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
            <div class="text-xs text-white/60">Peak reading hour:</div>
            <div class="text-4xl font-black text-purple-300">
              {metrics.hourlyDistribution[metrics.peakReadingHour]?.label || 'Evening'}
            </div>
            <div class="text-xs text-white/70">
              Your most productive and uninterrupted immersion happens during this window.
            </div>
          </div>
        </div>
      {:else if currentSlide === 5}
        <!-- Slide 5: Number One Book -->
        <div class="space-y-6 text-center">
          <div class="text-5xl">🥇</div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Top Milestone
            </span>
            <h2 class="text-2xl sm:text-3xl font-bold break-words [overflow-wrap:anywhere]">
              Your #1 Book
            </h2>
          </div>

          {#if metrics.numberOneBook}
            <div class="py-6 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-3">
              <h3
                class="text-xl sm:text-2xl font-black text-amber-300 truncate"
                title={metrics.numberOneBook.title}
              >
                {metrics.numberOneBook.title}
              </h3>
              <div class="flex justify-center items-center gap-3 text-xs text-white/80">
                <span>{formatSeconds(metrics.numberOneBook.readingTimeSeconds)}</span>
                <span>•</span>
                <span>{metrics.numberOneBook.charactersRead.toLocaleString()} chars</span>
              </div>
              <div class="pt-1">
                <span
                  class="px-3 py-1 text-xs font-bold rounded-full {metrics.numberOneBook.completed
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/10 text-white/80'}"
                >
                  {metrics.numberOneBook.completed
                    ? 'Completed 🏆'
                    : `${Math.round(metrics.numberOneBook.maxProgress * 100)}% progress`}
                </span>
              </div>
            </div>
          {:else}
            <p class="text-sm text-white/60">No books recorded yet.</p>
          {/if}
        </div>
      {:else if currentSlide === 6}
        <!-- Slide 6: Persona Finale -->
        <div class="space-y-6 text-center">
          <div class="text-6xl sm:text-7xl animate-pulse">
            {metrics.primaryArchetype.badge}
          </div>
          <div class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-pink-300">
              Your Reading Identity
            </span>
            <h2
              class="text-3xl sm:text-4xl font-black text-white break-words [overflow-wrap:anywhere]"
            >
              {metrics.primaryArchetype.name}
            </h2>
          </div>

          <div class="py-4 bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2">
            <div class="text-sm font-semibold text-pink-300 italic">
              "{metrics.primaryArchetype.tagline}"
            </div>
            <p class="text-xs sm:text-sm text-white/80 break-words [overflow-wrap:anywhere]">
              {metrics.primaryArchetype.description}
            </p>
          </div>
        </div>
      {:else}
        <!-- Slide 7: Recap Snapshot & Share Card -->
        <div class="space-y-4 text-center pointer-events-auto">
          <div class="space-y-0.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              Recap Summary
            </span>
            <h2 class="text-2xl font-black break-words [overflow-wrap:anywhere]">
              {currentYearLabel} Highlights
            </h2>
          </div>

          <!-- Mini Summary Card -->
          <div
            class="bg-white/10 rounded-2xl p-4 border border-white/20 space-y-2.5 text-xs text-left"
          >
            <div class="flex items-center justify-between border-b border-white/10 pb-2">
              <span class="text-white/60">Persona:</span>
              <span class="font-bold text-white flex items-center gap-1">
                <span>{metrics.primaryArchetype.badge}</span>
                <span>{metrics.primaryArchetype.name}</span>
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-white/60">Total Time:</span>
              <span class="font-bold text-white"
                >{formatSeconds(metrics.totalReadingTimeSeconds)}</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span class="text-white/60">Characters:</span>
              <span class="font-bold text-white"
                >{metrics.totalCharactersRead.toLocaleString()}</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span class="text-white/60">Active Days / Streak:</span>
              <span class="font-bold text-white"
                >{metrics.activeReadingDays}d / {metrics.longestStreakDays}d streak</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span class="text-white/60">Drop-off Cliff:</span>
              <span class="font-bold text-amber-300"
                >{metrics.dropOffAnalysis.medianDropOffPercentage}%</span
              >
            </div>
            {#if metrics.topProfile}
              <div class="flex items-center justify-between">
                <span class="text-white/60">Top Device:</span>
                <span class="font-bold text-white truncate max-w-[160px]"
                  >{metrics.topProfile.profileName}</span
                >
              </div>
            {/if}
          </div>

          <div class="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              size="md"
              class="w-full font-bold shadow"
              on:click={copySummary}
            >
              {copiedText ? '✓ Copied to Clipboard!' : '📋 Copy Summary'}
            </Button>

            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                class="flex-1 text-white border-white/30 hover:bg-white/10"
                on:click={() => goToSlide(0)}
              >
                Replay
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="flex-1 text-white border-white/30 hover:bg-white/10"
                on:click={() => dispatch('close')}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer Controls (Prev / Next Buttons) -->
    <div
      class="relative z-20 px-6 py-4 flex items-center justify-between text-xs text-white/50 border-t border-white/5"
    >
      <button
        type="button"
        class="min-h-[44px] px-4 py-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer flex items-center {currentSlide ===
        0
          ? 'invisible'
          : ''}"
        on:click|stopPropagation={prevSlide}
      >
        ← Previous
      </button>

      <span>{currentSlide + 1} / {TOTAL_SLIDES}</span>

      <button
        type="button"
        class="min-h-[44px] px-4 py-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer flex items-center {currentSlide ===
        TOTAL_SLIDES - 1
          ? 'invisible'
          : ''}"
        on:click|stopPropagation={nextSlide}
      >
        Next →
      </button>
    </div>
  </div>
</div>
