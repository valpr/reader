# Yomitan Setup & Integration

[Yomitan](https://github.com/themoeway/yomitan) is a popular browser extension for popup dictionary lookups, term definitions, and Anki card creation. Valpr Reader is built from the ground up to integrate seamlessly with Yomitan for Japanese immersion.

---

## Key Integrations in Valpr Reader

Valpr Reader features deep two-way awareness of Yomitan:

1. **Auto-Pause Suspension:** When you pause to read a definition or add an Anki card, Valpr Reader detects the open Yomitan popup and prevents the reading tracker from pausing your session.
2. **Lookup Telemetry & Density:** Every unique term lookup in Yomitan is tallied in your reading statistics. The reader calculates your **Lookup Density** (lookups per 1,000 characters read) to gauge text complexity.
3. **Vocab Hunter Archetype:** High lookup volume contributes to the _Vocab Hunter_ reading badge in your annual/periodic Lookback report.

---

## Required Yomitan Configuration

::: danger Critical Setting: Disable "Use a secure container around popups"
For Valpr Reader to detect open popups and track vocabulary lookups, Yomitan must render its popup within the host page DOM.

1. Click the **Yomitan** extension icon and open **Settings** (`⚙`).
2. Scroll to the bottom and enable **Advanced settings** (toggle the toggle switch in the bottom-left corner).
3. Under the **Security** section:
   - **Turn OFF:** `Use a secure container around popups` ❌
   - **Can remain ON:** `Use secure popup frame URL` ✅
4. Reload the Valpr Reader tab.
   :::

### Why does this setting matter?

| Yomitan Setting                          | Value                 | Impact on Valpr Reader                                                                                                                                                               |
| :--------------------------------------- | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use a secure container around popups** | **OFF** (Recommended) | Valpr Reader can observe `.yomitan-popup` and `.yomitan-float`. Dictionary auto-pause suspension and lookup counting work perfectly.                                                 |
| **Use a secure container around popups** | **ON**                | Yomitan wraps the popup in a closed `ShadowRoot`. Scripts on the webpage cannot see the popup. Auto-pause will trigger immediately upon lookup, and lookups will **not** be counted. |
| **Use secure popup frame URL**           | **ON** or **OFF**     | Has **no effect** on detection. It can safely remain enabled for security.                                                                                                           |

---

## Recommended Yomitan Settings for Vertical Reading

When reading vertical Japanese text (`vertical-rl`), consider these Yomitan settings for the best experience:

- **Popup Display Mode:** Ensure display mode is set to **In-page** (default). External window mode cannot be tracked by the in-page reader.
- **Scan Delays:** Set scan delay to `50ms` or use modifier key scanning (e.g., hold `Shift` while hovering) to avoid triggering accidental popups during continuous page scrolling.
- **Theme Matching:** Set Yomitan's theme to match your Valpr Reader theme (Dark or Light) for cohesive visual immersion.

---

## Verifying Detection

To verify that your setup is working properly:

1. In Valpr Reader, go to **Settings > Statistics**.
2. Ensure **Tracker Auto-Pause** is set to `Strict` or `Default`.
3. Ensure **Dictionary Popup Detection** is toggled **ON**.
4. Open any book in the reader and start reading.
5. Hover over a Japanese word to trigger a Yomitan popup.
6. Open the reading tracker menu (clock icon) or check your Lookback dashboard: your lookup count should increase by 1.
