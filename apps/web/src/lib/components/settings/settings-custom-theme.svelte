<script lang="ts">
  import type { ToggleOption } from '$lib/components/button-toggle-group/toggle-option';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import SettingsCustomThemeInput from '$lib/components/settings/settings-custom-theme-input.svelte';
  import { Button, Card, Input, Select } from '@custom-ereader/ui';
  import { customThemes$, theme$ } from '$lib/data/store';
  import { availableThemes, type CustomThemeValue, type ThemeOption } from '$lib/data/theme-option';
  import { createEventDispatcher, onMount } from 'svelte';

  export let selectedTheme: string | undefined = undefined;
  export let existingThemes: ToggleOption<string>[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  interface ThemeFieldMeta {
    key: keyof ThemeOption;
    label: string;
    description: string;
  }

  const THEME_FIELDS: ThemeFieldMeta[] = [
    {
      key: 'fontColor',
      label: 'Main text',
      description: 'Body copy rendered in the reading view'
    },
    {
      key: 'backgroundColor',
      label: 'Page background',
      description: 'Backdrop behind the book text'
    },
    {
      key: 'selectionFontColor',
      label: 'Selected text',
      description: 'Text color inside a text selection'
    },
    {
      key: 'selectionBackgroundColor',
      label: 'Selection highlight',
      description: 'Background behind selected text'
    },
    {
      key: 'hintFuriganaFontColor',
      label: 'Hidden furigana text',
      description: 'Blurred furigana when hints are hidden'
    },
    {
      key: 'hintFuriganaShadowColor',
      label: 'Hidden furigana shadow',
      description: 'Shadow / blur color for hidden furigana'
    },
    {
      key: 'tooltipTextFontColor',
      label: 'Footer & tooltip text',
      description: 'Page footer, dictionary popups and hints'
    }
  ];

  let customTheme: Record<keyof ThemeOption, CustomThemeValue> = {
    fontColor: { hexExpression: '#ffffff', alphaValue: 1, rgbaExpression: 'rgba(255,255,255,1)' },
    backgroundColor: {
      hexExpression: '#000000',
      alphaValue: 1,
      rgbaExpression: 'rgba(0,0,0,1)'
    },
    selectionFontColor: {
      hexExpression: '#ffffff',
      alphaValue: 1,
      rgbaExpression: 'rgba(255,255,255,1)'
    },
    selectionBackgroundColor: {
      hexExpression: '#ffffff',
      alphaValue: 1,
      rgbaExpression: 'rgba(255,255,255,1)'
    },
    hintFuriganaShadowColor: {
      hexExpression: '#ffffff',
      alphaValue: 1,
      rgbaExpression: 'rgba(255,255,255,1)'
    },
    hintFuriganaFontColor: {
      hexExpression: '#ffffff',
      alphaValue: 1,
      rgbaExpression: 'rgba(255,255,255,1)'
    },
    tooltipTextFontColor: {
      hexExpression: '#ffffff',
      alphaValue: 1,
      rgbaExpression: 'rgba(255,255,255,1)'
    }
  };

  let themeToCopy: string = existingThemes[0]?.id ?? '';
  let themeName = '';
  let nameError: string | false = false;

  $: isEditing = Boolean(selectedTheme && $customThemes$[selectedTheme ?? '']);
  $: dialogTitle = isEditing ? `Edit theme “${selectedTheme}”` : 'Create custom theme';
  $: themeStyle = `color: ${customTheme.fontColor.rgbaExpression}; background-color: ${customTheme.backgroundColor.rgbaExpression}`;
  $: selectionStyle = `color: ${customTheme.selectionFontColor.rgbaExpression}; background-color: ${customTheme.selectionBackgroundColor.rgbaExpression}`;
  $: baseOptions = existingThemes.map((theme) => ({ value: theme.id, label: theme.id }));

  onMount(() => {
    if (!selectedTheme) {
      return;
    }

    const existingThemeObject = $customThemes$[selectedTheme];

    if (!existingThemeObject) {
      return;
    }

    customTheme = getThemeData(existingThemeObject);
    themeName = selectedTheme;
  });

  function getThemeData(referenceObject: ThemeOption): Record<keyof ThemeOption, CustomThemeValue> {
    const result: any = {};
    const entries = [...Object.entries(referenceObject)];

    for (let index = 0, { length } = entries; index < length; index += 1) {
      const [key, value] = entries[index];
      const [r, g, b, a] = (value.match(/rgba\((.+)\)/)?.[1] || '0,0,0,1')
        .split(',')
        .map((x: string) => parseFloat(x.trim()));

      result[key as keyof ThemeOption] = {
        hexExpression: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
          .toString(16)
          .padStart(2, '0')}`,
        alphaValue: a,
        rgbaExpression: value
      };
    }

    return result;
  }

  function handleCopyTheme() {
    if (!themeToCopy) {
      return;
    }

    copyTheme(availableThemes.get(themeToCopy) || $customThemes$[themeToCopy]);
  }

  function handleColorValueChange(
    event: CustomEvent<{ attribute: keyof ThemeOption; value: string }>
  ) {
    const { attribute, value } = event.detail;
    const entry = customTheme[attribute];

    customTheme = {
      ...customTheme,
      ...{
        [attribute]: {
          hexExpression: value,
          alphaValue: entry.alphaValue,
          rgbaExpression: hexToRGB(value, entry.alphaValue)
        }
      }
    };
  }

  function handleAlphaValueChange(
    event: CustomEvent<{ attribute: keyof ThemeOption; value: number }>
  ) {
    const { attribute, value } = event.detail;
    const entry = customTheme[attribute];

    customTheme = {
      ...customTheme,
      ...{
        [attribute]: {
          hexExpression: entry.hexExpression,
          alphaValue: value,
          rgbaExpression: hexToRGB(entry.hexExpression, value)
        }
      }
    };
  }

  function handleNameInput() {
    if (nameError) {
      nameError = false;
    }
  }

  function handleSave() {
    const trimmedName = themeName.trim();

    if (!trimmedName) {
      nameError = 'Enter a name for this theme.';
      return;
    }

    if (availableThemes.has(trimmedName)) {
      nameError = 'This name is reserved for a built-in palette.';
      return;
    }

    if (!isEditing || trimmedName !== selectedTheme) {
      if ($customThemes$[trimmedName] && trimmedName !== selectedTheme) {
        nameError = 'A custom theme with this name already exists.';
        return;
      }
    }

    const newTheme: any = {};
    const entries = [...Object.entries(customTheme)];

    for (let index = 0, { length } = entries; index < length; index += 1) {
      const [key, value] = entries[index];

      newTheme[key] = value.rgbaExpression;
    }

    if (selectedTheme && selectedTheme !== trimmedName) {
      delete $customThemes$[selectedTheme];
    }

    $customThemes$ = { ...$customThemes$, ...{ [trimmedName]: newTheme } };
    $theme$ = trimmedName;
    dispatch('close');
  }

  function copyTheme(theme: Record<keyof ThemeOption, string> | undefined) {
    if (!theme) {
      return;
    }

    customTheme = getThemeData(theme);
  }

  function hexToRGB(h: string, alpha: number) {
    let r = '0';
    let g = '0';
    let b = '0';

    if (h.length === 4) {
      r = `0x${h[1]}${h[1]}`;
      g = `0x${h[2]}${h[2]}`;
      b = `0x${h[3]}${h[3]}`;
    } else if (h.length === 7) {
      r = `0x${h[1]}${h[2]}`;
      g = `0x${h[3]}${h[4]}`;
      b = `0x${h[5]}${h[6]}`;
    }

    return `rgba(${+r},${+g},${+b},${alpha})`;
  }
</script>

<DialogTemplate data-testid="theme-editor-dialog">
  <span slot="header" class="min-w-0 break-words [overflow-wrap:anywhere]">{dialogTitle}</span>
  <div slot="content" class="flex min-w-0 max-w-full flex-col gap-5">
    <section aria-labelledby="theme-copy-heading" class="flex min-w-0 flex-col gap-2">
      <h3
        id="theme-copy-heading"
        class="text-sm font-semibold text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        1. Start from an existing palette
      </h3>
      <p
        class="break-words text-xs text-[var(--astryx-color-fg-secondary,#52525b)] [overflow-wrap:anywhere]"
      >
        Copy colors from a built-in or custom palette, then fine-tune them below.
      </p>
      <div class="flex w-full max-w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <div class="min-w-0 flex-1">
          <Select label="Base palette" options={baseOptions} bind:value={themeToCopy} />
        </div>
        <Button
          variant="secondary"
          on:click={handleCopyTheme}
          disabled={!themeToCopy}
          aria-label="Copy colors from {themeToCopy || 'selected'} palette"
        >
          Copy colors
        </Button>
      </div>
    </section>

    <section aria-labelledby="theme-colors-heading" class="flex min-w-0 flex-col gap-2">
      <h3
        id="theme-colors-heading"
        class="text-sm font-semibold text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        2. Customize colors
      </h3>
      <p
        class="break-words text-xs text-[var(--astryx-color-fg-secondary,#52525b)] [overflow-wrap:anywhere]"
      >
        Tap a swatch to pick a color, then adjust its opacity. Changes update the live preview.
      </p>
      <div class="grid w-full max-w-full min-w-0 grid-cols-1 gap-2">
        {#each THEME_FIELDS as field (field.key)}
          <SettingsCustomThemeInput
            label={field.label}
            description={field.description}
            attribute={field.key}
            values={customTheme[field.key]}
            on:color={handleColorValueChange}
            on:alpha={handleAlphaValueChange}
          />
        {/each}
      </div>
    </section>

    <section aria-labelledby="theme-name-heading" class="flex min-w-0 flex-col gap-2">
      <h3
        id="theme-name-heading"
        class="text-sm font-semibold text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        3. Name & preview
      </h3>
      <Input
        label="Theme name"
        placeholder="e.g. Night sepia"
        helperText={isEditing
          ? 'Renaming creates a copy under the new name.'
          : 'Saved to your custom palettes and applied immediately.'}
        error={nameError}
        bind:value={themeName}
        on:input={handleNameInput}
      />
      <Card variant="flat" padding="md" class="w-full max-w-full min-w-0">
        <span
          class="mb-2 block text-xs font-medium text-[var(--astryx-color-fg-secondary,#52525b)]"
        >
          Live preview
        </span>
        <div
          class="flex min-h-[88px] w-full max-w-full min-w-0 flex-col justify-center gap-1 rounded-lg border border-[var(--astryx-color-border-default,#e4e4e7)] p-4 break-words [overflow-wrap:anywhere]"
          style={themeStyle}
          aria-label="Preview of reader colors"
        >
          <span class="text-2xl leading-none">ぁあ Reading preview</span>
          <span class="text-sm opacity-80">本文の色と背景の組み合わせを確認できます。</span>
          <span class="mt-1 inline-block w-fit rounded px-1 text-sm" style={selectionStyle}>
            Selected text preview
          </span>
        </div>
      </Card>
    </section>
  </div>
  <div slot="footer" class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button variant="ghost" on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary" on:click={handleSave}>
      {isEditing ? 'Save changes' : 'Create theme'}
    </Button>
  </div>
</DialogTemplate>
