<script lang="ts">
</script>

<section
  class="astryx-dialog-surface mdc-elevation--z24 rounded-xl bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] text-[var(--astryx-color-fg-primary,#18181b)] border border-[var(--astryx-color-border-subtle,transparent)] p-6 transition-colors shadow-2xl w-full max-w-[calc(100vw-3rem)] max-h-[85vh] max-h-[85dvh] flex flex-col overflow-hidden"
  {...$$restProps}
>
  <h2
    class="weight-medium mb-5 text-xl text-[var(--astryx-color-fg-primary,#18181b)] min-w-0 break-words shrink-0"
  >
    <slot name="header" />
  </h2>
  <div
    class="text-[var(--astryx-color-fg-secondary,#52525b)] min-w-0 max-w-full [overflow-wrap:anywhere] flex-1 min-h-0 overflow-y-auto"
  >
    <slot name="content" />
  </div>
  {#if $$slots.footer}
    <footer
      class="shrink-0 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--astryx-color-border-subtle,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] px-6 pb-6 pt-4"
    >
      <slot name="footer" />
    </footer>
  {/if}
</section>
