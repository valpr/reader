# Agent Instructions & Codebase Guidelines

Guidelines and architectural constraints for working in **reader** (based on ッツ Reader).

---

## 1. Git Workflow

- **Branches**: Open PRs from dedicated branches (`feat/*`, `fix/*`, `chore/*`, `refactor/*`).
- **Commits**: Follow Conventional Commits (enforced by Husky and commitlint).

---

## 2. UI Component Library (`@custom-ereader/ui`)

- Check `packages/ui/src/index.ts` for existing Astryx components before building ad-hoc UI or Tailwind controls.
- If a missing design-system element is needed, implement and export it in `packages/ui` first, then import into `apps/web`.
- Use semantic theme tokens (`var(--astryx-...)` / `data-astryx-theme`) rather than arbitrary hex values.

---

## 3. Architecture & State Pitfalls

- **Svelte 5 Legacy Mode**: Run-time is Svelte 5, but the codebase uses Svelte 4 legacy syntax. **Never use Svelte 5 runes** (`$state`, `$derived`, `$props`, `$effect`, snippets).
- **RxJS Stores**: Global state lives in `apps/web/src/lib/data/store.ts` using `$` suffixed `BehaviorSubject` stores.
  - Svelte templates: auto-subscribe via `$storeName$`.
  - TS/Services: read with `.getValue()`, write with `.next(...)`.
  - **Store reads must be lexically visible in markup**: never hide a `$store$` read inside an `isX()` helper called from `{#if}`/`{@const}`/`{#each}` (e.g. `{@const selected = isTagSelected(tag)}` with the store read inside the function will not re-evaluate). Pass store values as explicit args instead (e.g. `isTagSelected($libraryFilters$?.tags, tag)`).
- **IndexedDB (`books-db`)**: Schemas are append-only. Never modify historical versions (`books-db-v*.ts`); add migrations via `database.service.ts`.
- **Reader Matrix**: Reader changes must support both layout modes (paginated, continuous) and orientations (horizontal, vertical-rl). Always check `$verticalMode$` for coordinates, margins, and gesture math.
- **Cloud Sync**: Local items (e.g., `isAutosave: true`) must never dirty `lastModified` sync timestamps or sync to Drive/OneDrive.

---

## 4. Verification & Testing

Required pre-submit gate (blocking in CI via the `smoke` job in `.github/workflows/ci.yml`):

- **Typecheck & Build**: `pnpm -F web check` and `pnpm -F web build`.
- **Formatting/Linting**: `pnpm -F web lint` (or ensure Prettier/ESLint pass).
- **Smoke E2E**: `pnpm -F web test:smoke` (curated subset, runs against port 5174; `chromium` desktop specs + `mobile` Pixel 9 specs). Must pass before opening a PR. Full suite (`pnpm -F web exec playwright test`) runs nightly via `.github/workflows/e2e.yml` and on demand.
  - Smoke subset (basic functionality + icon visibility): `app`, `library-filters`, `book-tags`, `book-card-menu`, `reader-header`, `tooltips`, `manage-storage-sources` (chromium) + `mobile/manage-cards`, `mobile/manage-dialog`, `mobile/manage-header`, `mobile/reader-header` (mobile).
  - Targeted mapping: header/search/filter change → `library-filters`; tags → `book-tags`; book menu/cards → `book-card-menu` (+ `mobile/manage-*`); reader header/controls → `reader-header` (+ `mobile/reader-header`); icon buttons/tooltips → `tooltips`; source filter/cloud entry → `manage-storage-sources`.
  - **Visual-state assertions**: toggle/filter PRs must assert the control's own state (`aria-checked`/`aria-selected`, active-filter count, checked classes), not just downstream results; multi-select popovers must assert they stay open after each toggle.
  - When writing new reader tests, always use `apps/web/tests/fixtures/book-fixture.ts` to seed IndexedDB. Avoid hardcoded timeouts; use Playwright `waitFor` assertions.
  - Use `--project=chromium` or `--project=mobile` to run a single project locally during iteration.

### 4.1 Mobile gate (Pixel 9, 412x915)

Every dialog, new page, or responsive change needs a case in `apps/web/tests/mobile/` (Pixel 9 `mobile` project) reusing the shared helpers in `apps/web/tests/helpers/mobile-assertions.ts`:

- Assert no horizontal overflow (`scrollWidth <= innerWidth`) at 412px and at narrow 360px width.
- Assert dialogs fit fully inside the viewport and the primary footer action is visible, enabled, and tappable.
- Prefer `tap()` over `click()` where touch semantics matter; keep footer actions reachable with the keyboard open.

Mobile CSS rules:

- Use dynamic viewport units with a fallback (`max-h-[90vh] max-h-[90dvh]`), never bare `100vh`.
- Every dialog surface/wrapper needs `max-h` + `overflow-y-auto`; use fluid widths (`w-full max-w-...`), never fixed widths like `w-64`.
- Honor `env(safe-area-inset-*)` padding, keep touch targets >= 44px, and keep suggestions/dropdowns reachable inside scrolling containers.

### 4.2 Dialog text containment

Dialog content must contain its text at 360–412px widths without spilling past the surface:

- **App-generated text** (labels, dates, source lists, descriptions, errors): wrap with `break-words` + `[overflow-wrap:anywhere]` (the latter catches unbreakable timestamps/URLs/tokens).
- **User/outside-generated text** (book titles, tags, filenames, profile/theme names, emails): `truncate` + `min-w-0` + `title=` tooltip with the full text.
- Never use fixed-width children (`w-64`, `max-w-xs`) inside dialog content; use `w-full max-w-full`. Flex/grid children need `min-w-0` (flex items default to `min-width: auto` and won't shrink).
- The shell (`dialog-template.svelte` content wrapper) already applies `min-w-0` + `overflow-wrap: anywhere` as a backstop — per-dialog classes above are still required so truncation/tooltips behave correctly.
- Mobile specs for dialogs must seed a long unbroken string (e.g. 40+ char title) and assert no descendant overflows the dialog.

---

## 5. Reader Profile Defaults

There are **four distinct built-in device profiles** in [`profile-types.ts`](apps/web/src/lib/data/profiles/profile-types.ts). They are intentionally separate because display physics, viewing distance, and input ergonomics differ fundamentally across device classes.

| Profile          | ID                | Font | Line Height | Columns  | Key differences                                                                                                                                             |
| ---------------- | ----------------- | ---- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC / Desktop     | `default-desktop` | 20px | 1.65        | 0 (auto) | Mouse/keyboard, no tap-edge, wake lock off                                                                                                                  |
| Mobile / Phone   | `default-mobile`  | 17px | 1.55        | 1        | Closest viewing distance → smaller font, swipe threshold 15px, wake lock on                                                                                 |
| Tablet           | `default-tablet`  | 22px | 1.70        | 1        | High-DPI LCD, wide bezel → 24px margin, swipe threshold 15px, wake lock on                                                                                  |
| E-Reader / E-Ink | `default-ereader` | 20px | 1.60        | 1        | E-Ink physics → fontWeight 500 (stroke boost), 10px margin, swipe threshold 20px, forced light theme, pinned header, no tap-edge, avoid mid-sentence breaks |

**Rationale for key values:**

- **Font size hierarchy (Mobile 17 < Desktop 20 = E-Reader 20 < Tablet 22):** Calibrated to visual angle at each device's typical viewing distance. Phones are held at ~25 cm; tablets at ~45 cm; E-Ink often propped further.
- **fontWeight 500 on E-Reader:** E-Ink Carta panels are reflective, ~15:1 contrast vs. LCD ~1000:1. Medium weight makes kanji stroke density legible without front-light blooming.
- **enableVerticalFontKerning: true (all profiles):** Noto Serif/Sans JP ship full `vkrn` OpenType tables; modern Blink/WebKit apply them at near-zero cost and tighten Japanese punctuation spacing in vertical text.
- **Wake lock on Mobile & Tablet:** Reading a Japanese page (300–500 chars + lookups) routinely exceeds the OS 30-second idle timer. Desktop monitors have longer native timeouts.
- **swipeThreshold 20px on E-Reader:** Low-refresh E-Ink (~10 Hz) shows ghost streaks on drag; a higher threshold forces deliberate taps rather than accidental swipes.
- **firstDimensionMargin 24px on Tablet, 10px on E-Reader:** Slim-bezel tablets need digital breathing room for thumb grip; E-Ink devices have wide physical plastic borders that already provide clearance.
- **secondDimensionMaxValue 900px on Tablet:** Prevents column height from exceeding ~42 characters on large-screen tablets, matching traditional bunkobon paperback line lengths.
- **keepReaderHeaderVisible: true, enableTapEdgeToFlip: false, avoidPageBreak: true on E-Reader:** The auto-hiding top bar floats over the first lines of text; pinning reserves its own space (no overlap, no auto-hide). E-Readers have physical page-turn buttons so edge tap zones only waste margin space. Page turns are expensive full E-Ink refreshes, so pages end at sentence boundaries.

**Adding or changing a default profile value:**

1. Edit the relevant `default*Settings` constant in `profile-types.ts`.
2. If removing or renaming a profile, bump `PROFILES_SCHEMA_VERSION` in `profile-manager.ts` and add a migration branch inside `ensureDefaultProfiles()` — existing users' localStorage will be updated on next load.
3. Update the profile description string and E2E assertions in `reader-profiles.spec.ts` (font size visibility checks, profile name locators).
4. If adding a new `ProfileIconType`, also update: `getIcon()` in `settings-reader-profiles.svelte`, the icon/template `Select` options in both Create and Rename modals, and the emoji ternary chains in `lookback-dashboard.svelte` and `lookback-story-player.svelte`.
