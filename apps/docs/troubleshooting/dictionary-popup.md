# Troubleshooting Dictionary Popup & Lookup Detection

If your Yomitan or JPDB popups are causing the reading tracker to pause unexpectedly, or if your lookup count remains at zero, follow this troubleshooting guide.

---

## Symptom 1: Reading Tracker Pauses When Yomitan Opens

### Cause

When using **Strict** auto-pause, the reader pauses the timer whenever the reading canvas loses focus. Interacting with an extension popup transfers focus away from the main window. If Valpr Reader cannot detect the popup in the DOM, it treats the interaction as standard focus loss and pauses the tracker.

### Fix

1. Open **Yomitan Settings**.
2. Enable the **Advanced** toggle in the bottom left corner.
3. Scroll down to **Security**.
4. **Turn OFF** `Use a secure container around popups`.
5. _(Optional)_ Leave `Use secure popup frame URL` **ON** (this does not cause issues).
6. Return to Valpr Reader and refresh the page (`F5` or `Ctrl+R`).

```
Yomitan Settings
 └─ Advanced (toggle ON)
     └─ Security
         ├─ Use a secure container around popups: [ OFF ] ❌
         └─ Use secure popup frame URL:          [ ON  ] ✅
```

---

## Symptom 2: Lookups Are Not Being Counted (Lookup Count is 0)

### Cause

Valpr Reader tracks dictionary lookups by observing DOM mutations on `.yomitan-popup`, `.yomitan-float`, and `#jpdb-popup`.

If you look up words but the **Dictionary lookups** metric in your statistics remains at 0:

- The popup element is hidden behind Yomitan's closed Shadow DOM (`Use a secure container around popups` is enabled).
- Yomitan is set to render popups in an **External Window** rather than in-page.
- You are reading on a browser or platform where extension content scripts are blocked on local origins.

### Fix

1. Verify that `Use a secure container around popups` is **OFF** in Yomitan.
2. In Yomitan Settings, verify that **Popup display mode** is set to **In-page** (or default floating popup).
3. Verify that Valpr Reader's reading tracker is active:
   - Go to **Settings > Statistics**.
   - Verify that **Enable Reading Tracker** is **ON**.
   - Note that lookups are tracked whenever a popup opens while reading a book.

---

## Symptom 3: Dictionary Detection Setting is Missing in Settings

### Cause

In **Settings > Statistics**, the **Dictionary Popup Detection** toggle only appears if **Tracker Auto-Pause** is active (set to `Default` or `Strict`).

If Tracker Auto-Pause is set to `Off`, the reader never automatically pauses on focus loss, so popup auto-pause suppression is not needed.

---

## Still Having Issues?

- **Hard Refresh:** After changing Yomitan settings, perform a hard refresh (`Ctrl+F5` or `Cmd+Shift+R`) on your reader tab to reload the content scripts.
- **Extension Permissions:** Ensure Yomitan has permission to run on all sites, or specifically on your reader domain/origin.
- **Check Logs:** Open the browser developer console (`F12`). If you inspect the page while Yomitan is open, you should be able to locate `.yomitan-popup` or `.yomitan-float` directly under `<body>`. If you only see `#shadow-root (closed)`, the secure container setting is still active.
