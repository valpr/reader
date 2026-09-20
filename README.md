# Reader

> A customized, browser-based e-book reader optimized for Japanese language reading, EPUBs, and popup dictionary extensions (Yomitan, etc.).

[![Deploy to GitHub Pages](https://github.com/valpr/reader/actions/workflows/pages.yml/badge.svg)](https://github.com/valpr/reader/actions/workflows/pages.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)

**Live Reader:** [https://valpr.github.io/reader/](https://valpr.github.io/reader/)  
**Documentation:** [https://valpr.github.io/reader/docs/](https://valpr.github.io/reader/docs/)

This repository is a personalized fork of the excellent [ttu-ttu/ebook-reader](https://github.com/ttu-ttu/ebook-reader).

---

## Why Does This Exist?

1. **Keep Improving ttu-reader**: While the original [ttu-reader](https://github.com/ttu-ttu/ebook-reader) is an outstanding reading platform, upstream updates have slowed down.
2. **Open to the Community**: Kept completely open so anyone can benefit from these enhancements, borrow features, or fork and adapt it for their own workflows.
3. **Better Daily Reading Experience**: Building my personal wish list and fixing other problems/glitches that I've had during my reading experience.

---

## Highlights & Changes from Base ttu-reader

> For full guides, feature walkthroughs, and architectural details, visit the **[Documentation Site](https://valpr.github.io/reader/docs/)** or see the [Differences from Native ttsu](https://valpr.github.io/reader/docs/guide/differences-from-ttsu) guide.

### Reading & Bookmarks

- **Multi-Bookmark Drawer**: Unlimited bookmarks with chapter auto-naming, notes, and margin markers.
- **Continuous Reading Safety**: Rolling autosave checkpoints and smart resume to latest bookmark.
- **Japanese Typography**: Hand-drawn stroke-by-stroke calligraphy loader and vertical font kerning (`vkrn`).

### Library Management

- **Unified Library**: Browse local browser and cloud storage together in a single grid.
- **Search & Multi-Tag Filters**: Title search, reading progress filters, and multi-tag AND filtering with autocomplete.
- **Per-Book Actions**: Detail inspection, single-book cloud download/upload, and source filtering.

### Reading Statistics & Lookback

- **Always-On Telemetry**: Granular hourly tracking for characters read, reading time, and Yomitan/JPDB dictionary lookups.
- **Year-in-Review Recap**: Spotify-Wrapped-style lookback story player, reading speed metrics, and reader personas.

### Cloud Sync

- **Silent Multi-Cloud Replication**: Automatic background synchronization via Google Drive and Microsoft OneDrive.
- **Progress-Safe Downloads**: Cloud book downloads merge cleanly without overwriting local progress.

### Settings & Hardware Profiles

- **Hardware-Calibrated Profiles**: Dedicated defaults for Desktop, Mobile, Tablet, and E-Reader/E-Ink (with medium font weight contrast boost).
- **Tabbed Settings**: Live reading preview and deep-linkable URLs for direct settings navigation.

### Mobile & Small Screens

- **Responsive Ergonomics**: Zero horizontal overflow at 360–412px, ≥44px touch targets, and collapsible overflow toolbars.

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
