# Data & Storage Settings Reference

Access via: **Settings > Data** (`/settings/data`)

This section controls local IndexedDB persistence, storage quotas, connected cloud providers, EPUB sanitization, and background sync replication.

---

## 1. Storage Persistence & Cache

- **Persistent Storage:** Requests browser persistence permission (`navigator.storage.persist()`). Prevents mobile browsers and desktop operating systems from clearing your offline library when disk space runs low.
- **Cache Storage Data:** Caches storage data in memory to reduce database round-trips and latency. Recommended **ON** when using cloud-synced libraries. _(Note: Changes made in another tab may require a page reload to become visible)._

---

## 2. Storage Sources

Connect and manage where your books and metadata are stored:

- **Browser Storage:** Local IndexedDB storage on this specific device. Always available offline.
- **Google Drive:** Connects to your Google Drive to store books, progress, bookmarks, and telemetry.
- **Microsoft OneDrive:** Connects to your Microsoft OneDrive to store library data.
- **Local Folder (File System Access):** Connects directly to a local directory on your computer (Chromium desktop browsers only).

---

## 3. EPUB Import & Sanitization

- **EPUB Fix Mode:** Adjusts how malformed EPUB HTML tags are sanitized on import. Some publishers export non-standard self-closing tags (`<p/>`, `<a/>`) that break browser rendering:
  - **Off:** No structural XML alterations.
  - **Anchor Only (Recommended):** Corrects self-closing anchor tags only.
  - **All Tags:** Auto-closes all non-void self-closing elements.
- **Cloud Book Open Action:** Determines whether opening a book stored on Google Drive or OneDrive downloads a temporary copy into browser memory or caches it permanently in IndexedDB.

---

## 4. Background Sync & Replication

- **Auto-Replication:**
  - **Off:** Synchronization runs only when manually initiated.
  - **On Save:** Automatically syncs changes whenever a bookmark or progress checkpoint is stored.
  - **Periodic (Interval):** Background sync runs at fixed time intervals.
- **Conflict handling:** Normal sync always merges both sides together — there are no persistent overwrite or direction controls. Overwrite exists only as the one-shot **Sync Recovery** actions below.

## 5. Sync Recovery

One-shot fix for divergent devices. Each action asks `Are you sure…?` with a destructive confirm and cannot be undone:

- **Make cloud match this device:** Replaces the cloud copy with this device. Anything on the cloud that is not on this device is permanently deleted.
- **Make this device match cloud:** Erases this device and copies from the cloud. Anything on this device that was never synced is permanently lost.

---

## 6. Danger Zone

- **Clear All Data & Reset Reader:** Permanently deletes all local books, reading progress, statistics, goals, custom profiles, and settings from this browser and restores factory defaults. _(Cloud files on Google Drive and OneDrive are preserved)._
