# Reader Device Profiles

Valpr Reader features a **Device Profiles engine**. Unlike conventional readers where typography and layout settings are global, profiles allow you to switch instantly between optimized configurations calibrated for different physical screens, viewing distances, and input ergonomics.

---

## Built-In Default Profiles

Valpr Reader ships with **four distinct hardware profiles**. These are intentionally separate because display physics, viewing distance, and ergonomic grip differ fundamentally across device classes:

| Profile              | ID                | Font Size | Line Height | Columns  | Margin | Key Differences                                                                  |
| :------------------- | :---------------- | :-------- | :---------- | :------- | :----- | :------------------------------------------------------------------------------- |
| **PC / Desktop**     | `default-desktop` | 20px      | 1.65        | Auto (0) | 16px   | Mouse/keyboard navigation, no tap-edge paging, wake lock off                     |
| **Mobile / Phone**   | `default-mobile`  | 17px      | 1.55        | 1        | 16px   | Closest viewing distance, smaller font, 15px swipe threshold, wake lock on       |
| **Tablet**           | `default-tablet`  | 22px      | 1.70        | 1        | 24px   | High-DPI LCD, wider 24px thumb bezel margin, wake lock on, 900px column ceiling  |
| **E-Reader / E-Ink** | `default-ereader` | 20px      | 1.60        | 1        | 10px   | E-Ink contrast boost (font weight 500), 20px swipe threshold, forced light theme |

---

## Engineering & Physical Rationale

Every default value in the profile matrix is mathematically calibrated to device physics:

### 1. Font Size Hierarchy (Mobile 17px < Desktop 20px = E-Reader 20px < Tablet 22px)

- **Phone (~25 cm viewing distance):** Handheld close to the face. 17px provides high information density without causing eye strain.
- **Desktop (~60–75 cm viewing distance):** Fixed monitor distance. 20px ensures kanji radicals remain distinct without leaning forward.
- **Tablet (~45 cm viewing distance):** Tablets are held further away than phones or placed in lap stands. 22px accommodates the wider visual angle.
- **E-Reader (~30–40 cm viewing distance):** 20px strikes the ideal balance for 300 DPI E-Ink screens.

### 2. Font Weight 500 on E-Reader (Stroke Boost)

Standard LCD displays boast contrast ratios exceeding 1000:1 with high-brightness backlights. In contrast, reflective E-Ink Carta panels provide around **15:1 contrast**.

- Standard regular font weight (400) can appear thin or washed out under ambient light.
- Setting `fontWeight: 500` (Medium) injects extra stroke weight into complex kanji characters, preserving clarity and legibility without needing to crank up battery-draining front lights.

### 3. Vertical Font Kerning (`vkrn`) Enabled on All Profiles

Japanese fonts such as _Noto Serif JP_, _Noto Sans JP_, and _Shippori Mincho_ contain dedicated OpenType `vkrn` tables. Modern rendering engines apply these kerning metrics at near-zero CPU cost. This tightens uneven spacing around brackets (`「」`), full-width punctuation (`、`, `。`), and quotation marks in vertical text.

### 4. Display Wake Lock on Mobile & Tablet

Reading an intensive page of Japanese literature (300–500 characters plus multiple dictionary lookups) routinely takes 45 to 90 seconds—exceeding the standard 30-second mobile OS screen sleep timer.

- Wake lock is **enabled** on Mobile and Tablet to prevent screen dimming while reading.
- Wake lock is **disabled** on Desktop where native OS sleep timers are much longer.

### 5. Swipe Threshold: 15px vs. 20px

- **Mobile & Tablet (15px):** 60Hz/120Hz capacitive touchscreens respond instantly, so a nimble 15px swipe threshold feels natural.
- **E-Reader (20px):** Low-refresh E-Ink panels (~10–15 Hz) exhibit ghosting artifacts during dragging gestures. A higher 20px threshold forces deliberate swipes rather than accidental micro-drags.

### 6. Margins: Tablet (24px) vs. E-Reader (10px)

- **Tablets:** Modern slim-bezel tablets leave almost no physical frame for your thumbs. The 24px digital margin prevents thumbs from covering text.
- **E-Readers:** Devices like Kindle, Kobo, and Boox already feature wide physical plastic bezels. A tight 10px margin maximizes usable screen real estate.

### 7. Column Height Limit (900px on Tablet)

Without a constraint, full-screen vertical text on a 12.9" tablet would result in lines exceeding 60–70 characters. The `secondDimensionMaxValue: 900px` setting caps column height to approximately **42 characters**, faithfully matching the standard line length of traditional Japanese _bunkobon_ (文庫本) paperbacks.

---

## Managing Profiles

### Selecting an Active Profile

1. Navigate to **Settings > Reader > Profiles**.
2. Click on any profile card to activate it immediately.
3. The reader interface and all reader windows will re-render with the new profile's typography, margins, and controls.

### Creating a Custom Profile

1. In the Profiles section, click **+ New Profile**.
2. Choose a starting template (Desktop, Mobile, Tablet, or E-Reader).
3. Name your profile and pick an icon.
4. Adjust font size, line height, margins, and custom CSS as desired.

### Profile Roaming & Cloud Sync

When cloud synchronization is enabled (Google Drive or OneDrive), custom profiles roam across your devices. You can read on your desktop using your tuned `default-desktop` configuration and pick up seamlessly on your mobile phone with `default-mobile`.
