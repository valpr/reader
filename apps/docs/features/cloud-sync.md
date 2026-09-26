# Cloud Synchronization

Valpr Reader allows you to synchronize your library, reading positions, bookmarks, reading telemetry, goals, and reader profiles between all your devices using **Google Drive** or **Microsoft OneDrive**.

---

## Supported Cloud Providers

- **Google Drive:** Stores your reading data and books in an isolated application folder (`Valpr Reader`) in your personal Drive storage.
- **Microsoft OneDrive:** Stores your reading data and books in your OneDrive personal cloud.

---

## Setting Up Cloud Sync

### 1. Google Drive Setup

1. Go to **Settings > Data > Storage Sources**.
2. Click **Connect Google Drive**.
3. If prompted for an OAuth Client ID, you can use the default provided ID or supply your own Google Cloud Console Client ID.
4. Authorize Valpr Reader to access its dedicated folder in your Drive.
5. Once connected, your books and sync metadata will begin synchronizing.

### 2. OneDrive Setup

1. Go to **Settings > Data > Storage Sources**.
2. Click **Connect OneDrive**.
3. Sign in to your Microsoft Account and grant permissions.
4. Valpr Reader will create a secure storage folder in your OneDrive.

---

## How Background Synchronization Works

- **Automatic Replication:** Synchronization runs in the background. Progress updates and checkpoints are saved locally first, then debounced and sent to the cloud.
- **Offline-First:** You never lose reading progress if your internet connection drops. All changes are queued in browser IndexedDB and reconciled once you reconnect.
- **Smart Conflict Resolution:**
  - **Reading Position:** Automatically takes the latest reading position timestamp.
  - **Bookmarks, Tags, Statistics, Goals, Profiles:** Normal sync always merges both sides together, so changes from every device are kept.
  - **Profiles:** Custom device profiles are synchronized so your tuned layouts roam automatically between devices.

---

## Sync Recovery (Settings > Data)

Normal sync never throws anything away. Sync Recovery is the one-shot exception for when your devices have diverged and you want one side to win:

- **Make cloud match this device (Push):** Replaces the cloud copy with this device. Anything on the cloud that is not on this device is permanently deleted. Use after cloud-side data loss.
- **Make this device match cloud (Pull):** Erases this device and copies from the cloud. Anything on this device that was never synced is permanently lost.

Both actions ask `Are you sure…?` first, with a red destructive confirm button (`Replace cloud copy` / `Erase this device`). Reading position always keeps the newest change from either side. This cannot be undone.

---

## Privacy & Security

Valpr Reader interacts **only** with the files and folders it creates. It never reads, modifies, or accesses any other files in your Google Drive or OneDrive. All communication occurs directly between your browser and the cloud provider API; no third-party intermediary servers ever see your reading data or credentials.
