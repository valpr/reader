# JPDB Reader Integration

In addition to Yomitan, Valpr Reader includes native support for the **[jpdb.io](https://jpdb.io)** browser extension (jpdb-browser-reader).

---

## How It Works

When reading Japanese text with the jpdb extension installed:

1. Hovering or clicking over words displays the native `#jpdb-popup` element.
2. Valpr Reader's reading tracker detects the popup's appearance and visibility styles.
3. The reading tracker automatically:
   - Increments your **lookup count** for today's session.
   - Records the lookup in your **hourly reading telemetry**.
   - Bypasses the auto-pause timer while the popup is visible (if **Dictionary Popup Detection** is enabled).

---

## Configuration

Unlike Yomitan, the jpdb extension typically renders its popup directly into the document body (`#jpdb-popup`) without closed shadow roots, so no advanced security flags need to be toggled.

### To enable integration in Valpr Reader:

1. Open **Settings > Statistics**.
2. Make sure **Enable Reading Tracker** is toggled **ON**.
3. Under **Tracker Auto-Pause**, select either `Default` or `Strict`.
4. Toggle **Dictionary Popup Detection** **ON**.
