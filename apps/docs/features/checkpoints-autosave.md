# Rolling Checkpoints & Autosave

One of the common frustrations with digital reading is losing your place due to an accidental swipe, rapid trackpad scroll, or unintentional chapter navigation. Valpr Reader solves this with **Rolling Position Checkpoints**.

---

## What Are Rolling Checkpoints?

Unlike a standard single bookmark that constantly overwrites your location, Valpr Reader maintains a rolling buffer of recent reading locations:

- **Trigger Condition:** Whenever you stop scrolling or flip to a page and remain there for the checkpoint delay (default: **3 seconds**), the reader captures a silent snapshot of your exact character position.
- **Rolling History:** Keeps between **2 and 20** recent checkpoints (configurable in settings). Older entries are pruned automatically as you advance.
- **Instant Place Recovery:** If you accidentally fling your trackpad, jump to a table of contents chapter, or lose your spot, you can open the reading menu and revert to any of your recent checkpoints with a single click.

---

## Configuration Settings

In **Settings > Reader > Checkpoints & Autosave**, you can customize behavior:

### 1. Rolling Position Checkpoints

Toggles the creation of rolling historical checkpoints on or off.

### 2. Checkpoint Interval (1–30s)

The number of seconds you must stop on a page before a position is recorded as a checkpoint. Setting this to 3–5 seconds ensures rapid page flipping does not pollute your checkpoint history.

### 3. Maximum Stored Checkpoints (2–20)

How many recent checkpoints are preserved in memory and storage before older ones are recycled.

### 4. Disable Auto-Save Sync

When enabled, rolling position checkpoints record **locally only** and do not update your remote cloud sync position. This prevents accidental page turns on one device from altering your synchronized reading spot on other devices until you deliberately bookmark or advance.

---

## Custom Anchor Point Dragging

For long Japanese web novels and continuous scroll layouts:

- You can drag the custom anchor point on the screen to reposition where your reading baseline is calculated.
- Valpr Reader automatically pauses the reading tracker timer while dragging the anchor point so your reading speed metrics are not skewed.
