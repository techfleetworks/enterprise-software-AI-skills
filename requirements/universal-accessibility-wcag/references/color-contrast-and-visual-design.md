# Color, Contrast & Visual Design for Accessibility

Low-vision users, color-blind users (~8% of men), older users, and anyone in bright
sunlight all depend on sufficient contrast and non-color cues.

## Contrast ratios (WCAG 1.4.3 AA / 1.4.11)

- **Normal text**: at least **4.5:1** against its background.
- **Large text** (≥ 24px, or ≥ 18.66px bold): at least **3:1**.
- **UI components & graphical objects** (input borders, icons, focus rings, chart lines,
  the parts of a graphic you must perceive): at least **3:1** (1.4.11).
- **AAA** (apply where feasible): 7:1 normal / 4.5:1 large (1.4.6).

Measure it — don't eyeball. Use a contrast checker on the actual foreground/background
pairs, including text over images/gradients (add a scrim/overlay if needed) and text on
brand colors. Contrast is computed from the *rendered* colors, so check disabled,
hover, and dark-mode variants too.

## Never rely on color alone (WCAG 1.4.1)

If color is the only thing distinguishing meaning, color-blind and screen-reader users
miss it. Always pair color with a second cue:

- **Form errors**: red border **and** an error icon **and** text ("Email is required"),
  not just a red outline.
- **Status** (success/warning/error, online/offline): color **and** an icon/label/shape.
- **Charts/graphs**: color **and** patterns/labels/direct annotations; don't force users
  to match a color-only legend.
- **Links in body text**: distinguishable from surrounding text by more than color
  (underline them).
- **Required fields**: mark with text/`*`+legend and `required`, not color.

## Zoom, reflow & text spacing

- **Resize text to 200%** without loss of content or function (1.4.4) — use relative units
  (`rem`/`em`), not fixed `px` that clip when scaled.
- **Reflow** at 320 CSS px wide (≈400% zoom on desktop) with no horizontal scrolling for
  reading content (1.4.10) — one-dimensional scrolling only. This overlaps directly with
  responsive design (`universal-browser-device-support`).
- **Text spacing** (1.4.12): layout survives users overriding line-height, letter/word
  spacing, and paragraph spacing — don't clip text in fixed-height boxes.

## Motion, animation & flashing

- **Reduced motion**: honor `prefers-reduced-motion: reduce` — cut parallax, auto-playing
  motion, and large transitions that can trigger vestibular disorders.
- **No more than three flashes per second** (2.3.1) — flashing content can cause seizures.
- **Pause/stop/hide** for anything auto-playing, moving, or auto-updating that lasts more
  than ~5 seconds (2.2.2) — carousels, tickers, animations.
- **Don't autoplay audio**; if you must, provide an obvious control.

## General visual-design rules

- Don't disable pinch-zoom (no `user-scalable=no` / `maximum-scale=1`).
- Keep line length readable (~66–80 chars) and line-height comfortable (~1.5 body).
- Ensure focus indicators themselves meet 3:1 contrast against adjacent colors.
- Test the whole UI in a color-blindness simulator and in both light and dark themes.
