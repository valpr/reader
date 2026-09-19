# Reader Settings Reference

Access via: **Settings > Reader** (`/settings/reader`)

This section controls reader typography, display physics, page navigation, layout modes, and progress indicators.

---

## 1. Profiles & Typography

Settings under this section are **profile-bound**. Changes apply to the currently active profile (e.g., Desktop, Mobile, Tablet, E-Reader, or your custom profile).

- **Active Profile:** Switch between built-in hardware profiles or custom profiles.
- **Font Family:** Select the default Japanese font. Pre-configured for high-quality CJK fonts like _Noto Serif JP_, _Noto Sans JP_, and _Shippori Mincho_.
- **Font Size:** Base reading font size in pixels (10px–48px). Defaults: Mobile 17px, Desktop 20px, E-Reader 20px, Tablet 22px.
- **Line Height:** Spacing multiplier between lines of Japanese text (1.0x–2.5x). Defaults: Mobile 1.55x, Desktop 1.65x, Tablet 1.70x, E-Reader 1.60x.
- **Letter Spacing:** Additional tracking space between individual characters (in rem).
- **Font Weight:** Typography stroke weight (100–900). Default is 400 (regular) for LCD devices and **500 (medium)** for E-Reader to improve contrast on reflective E-Ink Carta screens.
- **Vertical Font Kerning (`vkrn`):** Enables OpenType `vkrn` font kerning tables. Automatically tightens Japanese punctuation (`「」`, `、`, `。`) in vertical reading mode.
- **Writing Mode:** Toggle between **Vertical (`vertical-rl`)** (traditional Japanese right-to-left columns) and **Horizontal (`horizontal-tb`)**.
- **Columns:** Number of columns per screen page in paginated mode. `0` = Auto (columns adjust based on screen width), `1` = Single column, `2` = Dual columns.
- **Margins (First Dimension / Second Dimension):** Outer padding around the reading canvas in pixels.
- **Max Dimension (Second Dimension):** Caps column height (or line width in horizontal mode). Set to 900px on Tablet to maintain traditional _bunkobon_ paperback line lengths.

---

## 2. Interaction & Gestures

- **Page Turn Buttons:** Display on-screen previous/next page chevron buttons.
- **Tap-to-Turn Edge Zones:** Tap the left or right edges of the screen to advance or rewind pages.
- **Swipe Threshold:** Distance in pixels required to register a page-turn swipe gesture (15px for responsive LCDs, 20px for low-refresh E-Ink panels).
- **Keep Screen Awake (Wake Lock):** Prevents the device screen from dimming or locking while a book is open.
- **Fullscreen Mode:** Automatically enters browser fullscreen when opening the reader.

---

## 3. Layout & Pagination

- **Layout Mode:**
  - **Paginated:** Discrete page flips with snap boundaries.
  - **Continuous:** Smooth scrolling layout (ideal for web novels).
- **Wheel Page Flip Lock:** Prevents accidentally flipping pages when moving the mouse scroll wheel.
- **Custom Anchor Dragging Pause:** Automatically pauses reading statistics while adjusting the reading baseline anchor.
- **Confirm on Tab Close:** Prompts for confirmation when closing or refreshing the tab if unsaved changes exist.

---

## 4. Checkpoints & Autosave

- **Disable Auto-Save Sync:** Prevents local autosave updates from immediately syncing to Google Drive or OneDrive. Checkpoints remain safely recorded on your device.
- **Rolling Position Checkpoints:** Records rolling position snapshots so you can undo accidental jumps or fast scrolls.
- **Checkpoint Interval:** Seconds stopped on a page without scrolling before saving a rolling checkpoint (1–30s).
- **Maximum Stored Checkpoints:** Number of rolling autosaves to keep in memory before pruning older entries (2–20).

---

## 5. Progress Indicators

Control what reading metrics appear in the reader header and footer bars:

- **Character Position:** Displays current character count and total book characters (e.g. `12,450 / 84,200`).
- **Overall Progress Percentage:** Shows total book completion percentage (e.g. `15%`).
- **Chapter Characters Read:** Shows characters read within the current section or chapter.
- **Chapter Progress Percentage:** Shows progress percentage within the current chapter.
