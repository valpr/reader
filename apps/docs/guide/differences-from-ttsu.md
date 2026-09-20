# Differences from Native ッツ Reader (ttsu)

**Valpr Reader** is an enhanced, modernized fork of the beloved **ッツ Reader (ttu-reader)**. While retaining full compatibility with Japanese e-books (EPUB, HTMLZ, TXT) and the core reading engine, Valpr Reader introduces substantial architectural upgrades, cross-device synchronization, reading telemetry, multi-bookmark management, and specialized hardware profiles.

Here is a comprehensive summary of what has been added or redesigned compared to native ttsu.

---

## 1. Multi-Device Reader Profiles

- **Native ttsu:** Offers a single global set of reader settings stored in the browser. Switching between reading on a 4K desktop monitor, a smartphone, a tablet, or an E-Ink device requires manually tweaking font size, margins, line height, and gestures every time.
- **Valpr Reader:** Ships with **four built-in, hardware-calibrated device profiles**:
  - **Desktop / PC** (`default-desktop`): Auto columns, 20px font, 1.65 line height, wake lock off.
  - **Phone / Mobile** (`default-mobile`): Single column, 17px font, 1.55 line height, 15px swipe threshold, wake lock on.
  - **Tablet** (`default-tablet`): Single column, 22px font, 1.70 line height, 24px margin, 900px column height restraint (~42 characters to replicate traditional bunkobon line lengths).
  - **E-Reader / E-Ink** (`default-ereader`): Medium font weight (`fontWeight: 500`) stroke boost for reflective 15:1 contrast Carta panels, 10px margins, 20px swipe threshold to prevent ghost streaks.
- **Self-Saving & Management:** You can create, rename, duplicate, and delete custom profiles. Profiles save automatically as you adjust sliders.
- **Cloud Sync:** Profiles automatically synchronize across your devices via cloud storage.
- **Factory Reset:** Start fresh with a one-click reset that clears local state and restores defaults without deleting cloud files.

::: tip Detailed Guide
Read more about viewing distances, margin math, and E-Ink stroke boost in the [Reader Profiles Guide](/guide/reader-profiles).
:::

---

## 2. Multi-Bookmark Support & Reading Navigation

- **Native ttsu:** Supports only a single active reading position per book. Setting a new bookmark overwrites your previous location.
- **Valpr Reader:** Introduces comprehensive multi-bookmark management:
  - **Unlimited Bookmarks:** Save multiple points of interest per book without altering your current reading progress.
  - **Smart Auto-Naming & Notes:** Bookmark titles automatically suggest the chapter name and progress percentage (e.g. `Chapter 3 (42%)`), with full support for custom labels and personal notes.
  - **Color Tags & Margin Indicators:** Categorize bookmarks with color tags and jump back to marked spots via clickable visual indicators in the margin.
  - **Slide-Out Bookmark Drawer:** Access, edit, sort, and jump between bookmarks from a dedicated panel (`Shift+B` to create, `Shift+R` to open).
  - **Rolling Autosave Checkpoints:** Automatically logs rolling local position checkpoints after staying on a page for a configurable duration (default 3 seconds), keeping your place even after accidental scrolls or page reloads.
  - **Smart Resume:** Opening a book automatically jumps to your latest bookmark or autosave.
  - **Hand-Drawn Calligraphy Loader:** A hand-drawn `本` character animates stroke-by-stroke while books open or download, replacing generic loading spinners.

::: tip Checkpoints Guide
Learn how rolling checkpoints isolate autosaves from remote sync in the [Checkpoints & Autosave Guide](/features/checkpoints-autosave).
:::

---

## 3. Unified Library Management

- **Native ttsu:** Displays only books loaded into the current browser's IndexedDB.
- **Valpr Reader:** Unifies all books across devices and storage backends:
  - **All Books in One Place:** Browse local browser books and cloud-stored books together in a single grid. Local books remain available instantly offline.
  - **Search & Progress Filtering:** Search books by title, filter by reading status (Unread, In Progress, Completed), and combine filters. Progress labels wrap neatly on small screens.
  - **Book Tags:** Assign up to 10 tags per book (e.g. `fantasy`, `studying`). Tags sync across devices, offer autocomplete suggestions, and support AND filtering (requiring all selected tags).
  - **Per-Book Actions Menu:** Inspect book metadata, upload to cloud, download locally, reset progress, or delete directly from the card options menu.
  - **Safer Deletions:** Confirmation prompts clearly explain what will be removed while preserving your reading telemetry and stats history.
  - **Source Filter:** Filter the library by storage backend (Local Browser, Google Drive, OneDrive).

---

## 4. Robust Multi-Source Cloud Synchronization

- **Native ttsu:** Operates primarily as an offline, single-browser reader. Moving books or progress between devices requires manual database exports or basic sync scripts.
- **Valpr Reader:** Introduces first-class **Google Drive** and **Microsoft OneDrive** integration:
  - **Automatic Background Replication:** Progress, bookmarks, tags, reading statistics, goals, and profiles sync silently in the background (including when closing a book).
  - **Progress-Safe Downloads:** Downloading a cloud book to a local device preserves existing local reading progress rather than resetting it.
  - **Conflict Resolution Merge Modes:** Configurable merge strategies (Local, Remote, or Entry-by-Entry merge) for reading telemetry and goals.
  - **Unobtrusive Reconnect Banners:** Expired cloud sessions display a clean, non-blocking reconnect banner at the top of the library instead of interrupting with pop-up modals.
  - **Clear Status Messages:** Short, non-intrusive status messages confirm what synced without spamming toasts or causing card flickering.

::: tip Cloud Sync Guide
Learn how to set up Google Drive and OneDrive in the [Cloud Sync Guide](/features/cloud-sync).
:::

---

## 5. Reading Telemetry & Lookback Dashboard

- **Native ttsu:** Records basic cumulative reading time and character counts.
- **Valpr Reader:** Expands reading statistics into a comprehensive telemetry engine:
  - **Always-On Telemetry:** Characters read, active reading time, and dictionary lookups are tracked per hour and per device profile, with double-counting guards across day rollovers and page navigation.
  - **Dictionary Lookup Counting:** Automatically tracks Yomitan and JPDB lookups and calculates lookup density (lookups per 1,000 characters).
  - **Chronotype & Peak Hours:** Breaks down your reading habits across a 24-hour clock to identify when you are most active (Early Bird, Afternoon, Evening, Night Owl).
  - **Drop-Off Insights:** Analyzes where you tend to set books aside, gated on sustained reading history so casual browsing does not skew analytics.
  - **Year-in-Review Lookback:** A Spotify-Wrapped-style recap and auto-playing story player summarizing:
    - Total characters read, reading speed (characters per minute), active days, and longest streak.
    - Top books carousel with detailed rank, progress, and speed breakdowns.
    - Year-over-year comparative progress deltas.
    - **Reader Archetypes:** Personas earned based on your habits — _Vocab Hunter_, _Light Novel Binger_, _Night Owl_, _Early Bird_, _Marathon Reader_, _Story Finisher_, _Habitual Master_, and _Literary Explorer_.
    - **Fair Unlock Rules:** Recap unlocks after 3 finished books across 3+ reading days to ensure early data remains meaningful.

::: tip Lookback Guide
Read the full analytics breakdown in the [Reading Statistics & Lookback Guide](/features/lookback-stats).
:::

---

## 6. Dictionary Popup Detection (Yomitan & JPDB)

- **Native ttsu:** When using aggressive auto-pause (Strict mode), clicking or hovering over a popup dictionary pauses the reading timer because the main reading window loses focus.
- **Valpr Reader:** Actively observes the DOM for active Yomitan (`.yomitan-popup`) and JPDB (`#jpdb-popup`) containers:
  - **Auto-Pause Suspension:** Keeps the reading session active while you read definitions in dictionary popups.
  - **Lookup Instrumentation:** Automatically increments session and daily lookup counters whenever a new popup opens.
  - **Compatibility Notice:** Requires Yomitan's `"Use a secure container around popups"` setting to be turned **OFF** so that the reader can detect the popup element.

---

## 7. Typography & Japanese OpenType Kerning

- **Native ttsu:** Standard CSS vertical text orientation.
- **Valpr Reader:**
  - **Vertical Font Kerning (`vkrn`):** Enabled by default across all profiles. Tightens Japanese punctuation (brackets, commas, quotes) in vertical text layouts at near-zero performance cost using modern OpenType tables (_Noto Serif JP_, _Shippori Mincho_).
  - **E-Ink Contrast Boost:** Medium font weight (`fontWeight: 500`) boosts stroke density without blooming front-lights on reflective Carta panels.
  - **Bunkobon Proportions:** Tablet profile constrains column height to 900px (~42 characters) to match Japanese paperback line lengths.

---

## 8. Mobile-First & Responsive Ergonomics

- **Native ttsu:** Desktop-centric dialogs and toolbars that can overflow on narrow phone viewports.
- **Valpr Reader:**
  - **Tested at 360px & 412px Viewports:** Every dialog, bottom sheet, and menu is strictly asserted to contain text without horizontal overflow (`scrollWidth <= innerWidth`).
  - **Touch Targets:** All interactive controls maintain ≥44px touch targets with dynamic viewport height fallbacks (`max-h-[90vh] max-h-[90dvh]`) and safe-area insets (`env(safe-area-inset-*)`).
  - **Collapsible Responsive Toolbars:** Reader and statistics headers collapse secondary controls into an overflow (`⋯`) menu on narrow mobile screens.

---

## 9. Modern UI & Deep-Linkable Architecture

- **Native ttsu:** Monolithic Svelte 3/4 single-page application.
- **Valpr Reader:** Built on **SvelteKit**, **Vite**, and the **Astryx UI Design System** (`@custom-ereader/ui`):
  - **Tabbed Settings with Live Preview:** Settings organized in logical tabs with a live preview showing how font and spacing changes affect Japanese text.
  - **Deep-Linkable Settings URLs:** Jump directly to specific tabs (e.g. `/settings/profiles`, `/settings/data`, `/settings/statistics`).
  - **Unified Theming:** Semantic design tokens with support for Light, Dark, and E-Ink high-contrast modes.
