# Differences from Native ッツ Reader (ttsu)

**Valpr Reader** is an enhanced, modernized fork of the beloved **ッツ Reader (ttu-reader)**. While retaining full compatibility with Japanese e-books (EPUB, HTMLZ, TXT) and the core reading engine, Valpr Reader introduces substantial architectural upgrades, cross-device synchronization, reading telemetry, and specialized hardware profiles.

Here is a summary of what has been added or redesigned compared to native ttsu.

---

## 1. Multi-Device Reader Profiles

- **Native ttsu:** Offers a single global set of reader settings stored in the browser. Switching between reading on a 4K desktop monitor, a smartphone, a tablet, or an E-Ink device requires manually tweaking font size, margins, line height, and gestures every time.
- **Valpr Reader:** Ships with **four built-in, hardware-calibrated device profiles**:
  - **Desktop / PC** (`default-desktop`)
  - **Phone / Mobile** (`default-mobile`)
  - **Tablet** (`default-tablet`)
  - **E-Reader / E-Ink** (`default-ereader`)
- You can create, rename, duplicate, and delete custom profiles.
- Profiles can be exported, imported, and **automatically synced across devices** via cloud sync.

::: tip Detailed Guide
Read more about viewing distances, margin math, and E-Ink stroke boost in the [Reader Profiles Guide](/guide/reader-profiles).
:::

---

## 2. Robust Multi-Source Cloud Synchronization

- **Native ttsu:** Operates primarily as an offline, single-browser reader. Moving books or progress between devices requires manual database exports or basic sync scripts.
- **Valpr Reader:** Introduces first-class **Google Drive** and **Microsoft OneDrive** integration:
  - **Unified Library:** Browse local browser books and cloud-stored books in a single unified library view.
  - **Automatic Background Replication:** Progress, bookmarks, statistics, goals, and profiles automatically synchronize in the background.
  - **Smart Merge Modes:** Configurable conflict resolution strategies (Local, Remote, or Entry-by-Entry merge) for reading telemetry and reading goals.
  - **Offline Caching:** Read books seamlessly while disconnected using cached storage copies.

---

## 3. Reading Telemetry & Lookback Dashboard

- **Native ttsu:** Records basic cumulative reading time and characters read.
- **Valpr Reader:** Expands reading statistics into a comprehensive telemetry suite:
  - **Dictionary Lookup Counting:** Tracks how many words you look up in Yomitan and JPDB.
  - **Lookup Density:** Calculates lookups per 1,000 characters to gauge text difficulty.
  - **Hourly Distribution:** Breaks down reading time and lookup habits by hour of day (24-hour distribution).
  - **Longest Session Metrics:** Automatically tracks uninterrupted reading streaks.
  - **Lookback Dashboard:** A Spotify Wrapped-style recap featuring:
    - Total reading hours, characters, and lookup volume.
    - Reader archetypes (such as _Vocab Hunter_ for high lookup density).
    - Top books carousel with detailed rank, progress, and speed breakdowns.
    - Comparative progress deltas versus previous time periods.

---

## 4. Dictionary Popup Detection (Yomitan & JPDB)

- **Native ttsu:** When using aggressive auto-pause (Strict mode), clicking or hovering over a popup dictionary often pauses the reading timer because the main reading window loses focus.
- **Valpr Reader:** Actively observes the DOM for active Yomitan (`.yomitan-popup`) and JPDB (`#jpdb-popup`) containers:
  - **Auto-Pause Suspension:** Keeps the reading session active while you read definitions in dictionary popups.
  - **Lookup Instrumentation:** Automatically increments session and daily lookup counters whenever a new popup opens.
  - **Compatibility Notice:** Requires Yomitan's `"Use a secure container around popups"` setting to be turned **OFF** so that the reader can detect the popup element.

---

## 5. Rolling Autosave Checkpoints

- **Native ttsu:** Saves the current character position on page turns or intervals. Accidental gestures or fast-scrolling through a book can overwrite your actual reading location.
- **Valpr Reader:** Implements a rolling checkpoint buffer:
  - Automatically creates rolling local position checkpoints after staying on a page for a configurable duration (default 3 seconds).
  - Retains the last 2–20 checkpoints, allowing you to instantly revert to where you were before an accidental scroll or chapter jump.
  - **Autosave Sync Isolation:** Option to keep rolling checkpoints local without dirtying remote cloud sync timestamps.

---

## 6. Typography & Japanese OpenType Kerning

- **Native ttsu:** Standard CSS vertical text orientation.
- **Valpr Reader:**
  - **Vertical Font Kerning (`vkrn`):** Enabled by default across all profiles. Tightens Japanese punctuation (brackets, commas, quotes) in vertical text layouts at zero performance cost when using modern fonts like _Noto Serif JP_ or _Shippori Mincho_.
  - **E-Ink Contrast Boost:** E-Reader profile enforces `fontWeight: 500` (medium) to ensure legible kanji stroke density on reflective 15:1 contrast E-Ink Carta screens without front-light blooming.
  - **Bunkobon Column Restraints:** Tablet profile constrains column height to 900px (~42 characters), replicating the ergonomic line length of traditional Japanese paperback books.

---

## 7. Modern UI & Deep-Linkable Architecture

- **Native ttsu:** Monolithic Svelte 3/4 single-page application.
- **Valpr Reader:** Modernized with **SvelteKit**, **Vite**, and the **Astryx UI Design System** (`@custom-ereader/ui`):
  - Deep-linkable settings URLs (e.g. `/settings/reader`, `/settings/data`, `/settings/statistics`).
  - Fluid responsive drawers and bottom sheets for mobile devices.
  - Dark, Light, and E-Ink high-contrast themes.
