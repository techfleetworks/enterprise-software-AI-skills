# Responsive Layout & Input Modalities

One codebase, every screen size and every way of pointing at it.

## Fluid, mobile-first layout

- **Start from the smallest supported width** and add complexity upward. It's easier to
  expand a working narrow layout than to cram a desktop layout into a phone.
- **Fluid over fixed.** Use relative units (`%`, `rem`, `fr`, `ch`, `vw/vh` with care),
  `min()`/`max()`/`clamp()`, Flexbox and Grid. Avoid fixed pixel widths that overflow
  small screens.
- **Content-driven breakpoints.** Add a breakpoint where *the content* starts to look
  bad, not at "iPhone width." Device-specific magic numbers break on the next device.
- **Container queries** where supported let a component respond to *its own* space rather
  than the viewport — better for reusable components (feature-detect / fall back to media
  queries).
- **No horizontal scrolling or clipped content** at the smallest supported width. Test
  at ~320–360px explicitly.

## The viewport and safe areas

Always set the viewport meta so the page uses device width instead of a zoomed-out
desktop render:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- **Never** add `maximum-scale=1` or `user-scalable=no` — disabling zoom breaks
  low-vision users (also a WCAG failure).
- Handle notches/rounded corners with `env(safe-area-inset-*)` and
  `viewport-fit=cover` when you draw edge-to-edge.
- The classic mobile `100vh` bug (dynamic browser chrome) — prefer `100dvh`
  (dynamic viewport height) where supported, with a `vh` fallback.

## Input modalities — support all of them

Never assume a mouse. A single UI is used by touch, trackpad, mouse, keyboard, and
stylus — often on the same device.

- **Pointer events / device-agnostic handlers.** Prefer `click` and Pointer Events over
  mouse-only events so touch and stylus work without separate code paths.
- **Hit-target size.** The WCAG AA floor is modest — WCAG 2.2 **SC 2.5.8 Target Size
  (Minimum)** requires **24×24 CSS px** (or 24px spacing). 44×44 is *not* the AA
  baseline: that's WCAG 2.1 **SC 2.5.5 Target Size (Enhanced)** = AAA, and Apple's HIG
  touch guidance. So meet 24×24 as the minimum, and design toward ~44 (AAA / Apple HIG)
  with spacing, so fingers — not just cursors — can hit comfortably.
- **No hover-only affordances.** Anything revealed on `:hover` must also be reachable by
  tap and keyboard focus — touch has no hover, and a hover menu is invisible on a phone.
  Use `@media (hover: hover)` to *add* hover niceties, not to gate essential actions.
- **Keyboard operability.** Every control reachable and operable by keyboard, with a
  visible `:focus-visible` ring, in a logical tab order. (Deep detail in
  `universal-accessibility-wcag`.)
- **No dependence on precise gestures.** Provide a simple alternative to drag,
  long-press, multi-finger, or hover-and-hold interactions.

## Respect the user's declared preferences

Users and their OS tell you what they need — honor it:

- `prefers-reduced-motion: reduce` → cut or tone down non-essential animation/parallax.
- `prefers-color-scheme` → support light and dark rather than forcing one.
- `prefers-contrast` → strengthen contrast when asked.
- **Text scaling / zoom** → use relative units so a user zooming to 200% (or bumping OS
  font size) reflows content instead of clipping or overlapping it.

## Images & media

- Responsive images (`srcset`/`sizes`, `<picture>`) so phones don't download desktop-
  sized assets. Lazy-load below the fold (`loading="lazy"`).
- Always set width/height (or `aspect-ratio`) to reserve space and prevent layout shift.
- Media queries and fluid sizing so embeds/video scale within their container.
