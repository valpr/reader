# Statistics & Tracker Settings Reference

Access via: **Settings > Statistics** (`/settings/statistics`)

This section controls session tracking, auto-pause behavior, Yomitan/JPDB dictionary integration, reading goals, and statistics sync conflict resolution.

---

## 1. Reading Tracker & Auto-Pause

- **Enable Reading Tracker:** Toggles the reading tracker system on or off. When disabled, the tracker icon in the reader header is hidden and no reading time or character progress is recorded.
- **Tracker Auto-Pause:**
  - **Off:** The tracker runs continuously once started and does not pause automatically.
  - **Default:** Automatically pauses reading time when the reader browser tab loses focus (e.g., switching to another application or browser window).
  - **Strict:** Aggressively pauses reading time on any focus loss or reader blur event.
- **Dictionary Popup Detection:**
  - Only visible when Tracker Auto-Pause is active (`Default` or `Strict`).
  - Counts Yomitan and JPDB vocabulary lookups and skips auto-pause while a dictionary popup is open.
  - ::: warning Yomitan Configuration Disclaimer
    Certain Yomitan settings can interfere with this setting. In **Yomitan Settings > Advanced > Security**, turn **OFF** `Use a secure container around popups` so the reader can inspect popup visibility (`Use secure popup frame URL` can stay on).
    :::
- **Autostart Delay:** Number of seconds without character count changes after which the tracker initially auto-starts when opening a book (`0` = disabled).
- **Tracker Idle Time:** Minutes without reader interaction before auto-pausing (`0` = disabled, max 720 minutes).
- **Subtract Idle Timeout from Reading Time:** When enabled, once an idle pause triggers, the idle duration is subtracted from your active reading time so idle periods do not artificially inflate your reading statistics.

---

## 2. Book Completion Actions

- **Open Tracker on Book Completion:** Automatically presents the reading statistics summary dialog when finishing the final page of a book.
- **Update on Book Completion:** Adds any remaining unread characters to your statistics when manually marking a book as completed.
- **Book Completion Date Recording:** Determines whether only the first completion date is preserved, or if subsequent re-reads update the completion timestamp.

---

## 3. Fast-Forward & Skip Thresholds

Detects when you are skimming or jumping through a book to avoid skewing reading speed calculations:

- **Fast Forward Threshold:** Positive characters passed in a single tick that triggers a threshold action (`0` = disabled).
- **Fast Backward Threshold:** Negative characters passed in a single tick that triggers a threshold action (`0` = disabled).
- **Skip Action:** Action executed when a threshold is exceeded:
  - **Ignore:** Discards the character delta from reading speed calculations.
  - **Reset Session:** Resets the current reading session speed calculation.

---

## 4. Tracking Day Boundaries & Sync Resolution

- **Day Start Hour (0–23):** Determines when a new tracking day starts. Reading activity before this hour counts toward the previous day. Ideal for night owls reading past midnight (e.g. set to `4:00 AM`).
- **Statistics Sync Conflict Mode:** Determines how reading statistics reconcile during cloud sync:
  - **Merge Entry-by-Entry (Recommended):** Combines reading sessions and character totals across devices.
  - **Overwrite:** Uses newest-timestamp-wins logic.
- **Reading Goals Sync Conflict Mode:** Determines whether daily goals merge entry-by-entry or replace completely.
- **Keep Reading Statistics on Book Delete:** Preserves your reading history and metrics even if you delete a book from your library.
- **Prune Orphan Statistics:** Cleans up historical records for deleted books that have no local or remote copies.
