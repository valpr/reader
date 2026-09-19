# Reader

> A customized, browser-based e-book reader optimized for Japanese language reading, EPUBs, and popup dictionary extensions (Yomitan, etc.).

[![Deploy to GitHub Pages](https://github.com/valpr/reader/actions/workflows/pages.yml/badge.svg)](https://github.com/valpr/reader/actions/workflows/pages.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)

**Live Reader:** [https://valpr.github.io/reader/](https://valpr.github.io/reader/)

This repository is a personalized fork of the excellent [ttu-ttu/ebook-reader](https://github.com/ttu-ttu/ebook-reader).

---

## Why Does This Exist?

1. **Keep Improving ttu-reader**: While the original [ttu-reader](https://github.com/ttu-ttu/ebook-reader) is an outstanding reading platform, upstream updates have slowed down.
2. **Open to the Community**: Kept completely open so anyone can benefit from these enhancements, borrow features, or fork and adapt it for their own workflows.
3. **Better Daily Reading Experience**: Building my personal wish list and fixing other problems/glitches that I've had during my reading experience.

---

## Changelog: Changes from Base ttu-reader

### Reading & Bookmarks

- **Multi-Bookmark Support**: Create and manage unlimited bookmarks per book without overwriting your current reading position.
- **Smart Auto-Naming & Notes**: Bookmark titles suggest the chapter name and progress percentage (e.g., `Chapter 3 (42%)`), with support for custom labels and personal notes.
- **Color Tags & Margin Indicators**: Organize bookmarks with color tags and jump back from markers in the margin.
- **Slide-Out Bookmark Drawer**: View, edit, sort, and jump between bookmarks from a dedicated panel (`Shift+B` to create, `Shift+R` to open).
- **Automatic Place Saving**: Your place is saved as you read, so you can pick up where you left off even after an accidental scroll or reload.
- **Smart Resume**: Opening a book jumps to your latest bookmark or autosave, so you never lose your spot.
- **Calligraphy Loading Screen**: A hand-drawn `本` character draws itself stroke-by-stroke while books open, replacing generic spinners. Loading feedback appears instantly when opening or downloading a book.

### Library Management

- **All Books in One Place**: See books from this device and the cloud together. Local books show up right away.
- **Search, Filter & Progress**: Find books by title, narrow by reading progress (Unread, In Progress, Completed), and combine filters. In-progress books always stay visible, and progress wraps neatly on small screens.
- **Book Tags**: Tag books with up to 10 labels each (e.g. `fantasy`, `studying`). Tags sync across devices, offer autocomplete suggestions, and support AND filtering (a book must carry every selected tag).
- **Per-Book Menu**: Check details, upload, download, or delete right from each book.
- **Safer Deleting**: Clear confirmations explain what will be removed, and your reading stats are kept.
- **Filter by Source**: Quickly narrow the library to one storage location.

### Reading Statistics & Lookback

- **Always-On Reading Telemetry**: Characters read, reading time, and dictionary lookups are tracked per hour and per device profile, with double-counting guards across day rollovers and navigation.
- **Year-in-Review Lookback**: A Spotify-Wrapped-style dashboard and auto-playing story player summarize your year: total characters, reading speed, active days, longest streak, top books, and year-over-year comparisons.
- **Reading Archetypes**: Earn personas based on your habits — Vocab Hunter, Light Novel Binger, Night Owl, Early Bird, Marathon Reader, Story Finisher, Habitual Master, and Literary Explorer.
- **Chronotype & Peak Hours**: See when you read most (early bird, afternoon, evening, night owl) with an hourly breakdown of characters, time, and lookups.
- **Drop-Off Insights**: Learn where you tend to set books aside, with analysis gated on sustained reading history so casual browsing doesn't skew the results.
- **Fair Unlock Rules**: The recap unlocks after 3 finished books across 3+ reading days, so early stats stay honest.

### Cloud Sync

- **Sync Across Devices**: Your settings, place, bookmarks, tags, and reading stats follow you between devices.
- **Progress-Safe Downloads**: Downloading a cloud book preserves your existing reading progress instead of resetting it.
- **Quiet Background Sync**: Syncing happens in the background, including when you close a book. Completion messages only appear for actions you triggered, so reconnects don't spam toasts or flicker book cards.
- **Simple Reconnects**: An expired login shows a small banner instead of a pop-up, so you can reconnect without losing your spot.
- **Clear Status Messages**: Short messages confirm what just synced and where.

### Settings & Profiles

- **Tabbed Settings with Live Preview**: Settings are organized in tabs with a preview of how your text will look.
- **Shareable Settings Links**: Each settings page has its own link so you can jump straight to what you need.
- **Four Device Profiles**: Tuned defaults for PC/Desktop, Mobile/Phone, Tablet, and E-Reader/E-Ink — covering font size, margins, swipe sensitivity, wake lock, and E-Ink contrast (medium font weight for reflective Carta panels). Reader Profiles is the default settings landing page.
- **Self-Saving Profiles**: Reading profiles save automatically as you change them, including custom profiles tracked separately in stats.
- **Factory Reset**: Start fresh with one option that clears local data and restores defaults. Cloud files stay safe and come back when you reconnect.

### Mobile & Small Screens

- **Phone-Friendly Throughout**: Library filters, stats headers, sync cards, dialogs, and search popovers all fit 360–412px widths with no horizontal overflow, tappable 44px+ targets, and safe-area padding.
- **Responsive Toolbars**: Reader and stats headers collapse lower-priority controls into an overflow (`⋯`) menu on narrow screens.

---

## Live Deployment

The reader is automatically built and deployed to GitHub Pages on every push to `main`:

**URL:** [https://valpr.github.io/reader/](https://valpr.github.io/reader/)

---

## Local Development

### Prerequisites

- **Node.js**: v20 or higher (v24 recommended)
- **pnpm**: v9 or higher

### Getting Started

1. **Clone the repository:**

   ```bash
   git clone [https://github.com/valpr/reader.git](https://github.com/valpr/reader.git)
   cd reader
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Start the local development server:**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Build for production:**

   ```bash
   pnpm build
   ```

   The static production output will be generated in `apps/web/build/`.

---

## Acknowledgements & License

- Original project and architecture by [ttu-ttu](https://github.com/ttu-ttu/ebook-reader).
- Distributed under the [BSD-3-Clause License](LICENSE).
