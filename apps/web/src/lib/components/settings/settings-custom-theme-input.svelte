<script lang="ts">
  import type { CustomThemeValue, ThemeOption } from '$lib/data/theme-option';
  import { Card, Slider } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let description: string = '';
  export let attribute: keyof ThemeOption;
  export let values: CustomThemeValue;

  const dispatch = createEventDispatcher<{
    color: { attribute: keyof ThemeOption; value: string };
    alpha: { attribute: keyof ThemeOption; value: number };
  }>();

  function handleColorChange(event: Event) {
    const target = event.target as HTMLInputElement;

    dispatch('color', { attribute, value: target.value });
  }

  function handleAlphaSlider(event: CustomEvent<{ value: number }>) {
    dispatch('alpha', { attribute, value: event.detail.value });
  }
</script>

<Card variant="surface" padding="sm" class="w-full max-w-full min-w-0">
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex min-w-0 items-baseline gap-2">
      <span
        class="min-w-0 flex-1 break-words text-sm text-[var(--astryx-color-fg-primary,#18181b)] [overflow-wrap:anywhere]"
        title={description ? `${label} — ${description}` : label}
      >
        <span class="font-medium">{label}</span>
        {#if description}
          <span class="font-normal text-[var(--astryx-color-fg-secondary,#52525b)]">
            · {description}</span
          >
        {/if}
      </span>
      <span
        class="shrink-0 font-mono text-xs text-[var(--astryx-color-fg-muted,#71717a)]"
        aria-label="{label} current value {values.rgbaExpression}"
      >
        {values.hexExpression}
      </span>
    </div>
    <div class="flex min-w-0 items-center gap-3">
      <label
        for="theme-color-{attribute}"
        class="relative flex h-11 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--astryx-color-border-default,#e4e4e7)]"
        style="background-color: {values.rgbaExpression}"
        title="Pick {label} color"
      >
        <span class="sr-only">Pick {label} color</span>
        <input
          id="theme-color-{attribute}"
          type="color"
          class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={values.hexExpression}
          on:change={handleColorChange}
          aria-label="{label} color"
        />
      </label>
      <div class="min-w-0 flex-1">
        <Slider
          label="Opacity"
          size="sm"
          min={0}
          max={1}
          step={0.01}
          value={values.alphaValue}
          valueFormatter={(v) => `${Math.round(v * 100)}%`}
          on:change={handleAlphaSlider}
          on:input={handleAlphaSlider}
        />
      </div>
    </div>
  </div>
</Card>
