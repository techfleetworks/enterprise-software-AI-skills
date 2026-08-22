# Cross-Browser CSS & JS: Fallbacks, Prefixes, Polyfills, Gotchas

Engines differ. Handle the differences on purpose, in the build and in the code — not by
discovering them in a user's bug report.

## Autoprefix — don't hand-write vendor prefixes

Let the build add `-webkit-`/`-moz-` prefixes based on your `browserslist`. **Autoprefixer**
(usually via PostCSS) does this automatically and correctly, and *removes* prefixes no
longer needed as your floor rises. Hand-written prefixes go stale and get missed.

## Fallbacks for non-Baseline features

Provide the safe version first, then enhance:

```css
/* fallback */
.box { background: #1462b4; }
/* enhancement where the newer syntax is supported */
@supports (background: color-mix(in srgb, blue, white)) {
  .box { background: color-mix(in srgb, #1462b4, white 15%); }
}
```

The cascade means an unsupported later declaration is simply ignored, so ordering "old
then new" gives older browsers the old value and newer ones the new value — often no
`@supports` needed for simple property/value fallbacks.

## Polyfill only what the matrix needs

- Polyfill a *missing API*, load it **conditionally** (only when the capability check
  fails), and keep it scoped — don't ship a giant catch-all polyfill bundle to everyone.
- Transpilation (Babel/SWC) handles *syntax*; polyfills handle *missing runtime APIs*
  (e.g. `IntersectionObserver`, `structuredClone`, certain `Intl` features). Drive both
  from `browserslist` so they match your target.
- **Delete polyfills when the floor rises.** Carrying dead polyfills is a perf tax.

## Recurring cross-engine gotchas to code around

- **Date/time parsing.** Non-ISO date strings parse inconsistently across engines. Parse
  only ISO 8601, or use a date library; use `Intl.DateTimeFormat` for display.
- **`100vh` on mobile.** Includes the collapsing browser chrome → content jumps or gets
  cut off. Prefer `100dvh` with a `vh` fallback.
- **Form-control styling.** Native selects, checkboxes, radios, and date inputs style
  differently and are only partially customizable per engine; `accent-color` helps, but
  test appearance and don't rely on pixel-identical controls.
- **Scroll & overscroll.** Momentum scrolling, `position: sticky` edge cases, and
  `overscroll-behavior` differ, notably on iOS WebKit.
- **Font rendering.** Anti-aliasing and metrics differ across OSes; don't pixel-pin
  layouts to a specific font's rendering. Set `font-display` for web fonts to avoid
  invisible text while loading.
- **Focus behavior.** `:focus` vs `:focus-visible` support and default outlines vary —
  always provide an explicit visible focus style.
- **Event/quirk differences.** Passive listeners, `pointer` vs `touch` vs `mouse`, and
  clipboard/permission APIs vary — feature-detect and provide fallbacks.

## General rules

- **Reset/normalize** base styles so you start from a consistent baseline across engines.
- **Validate HTML/CSS.** Malformed markup is where engines diverge most; valid,
  well-formed markup renders far more consistently.
- **Test the actual engine, not a lookalike.** Chrome and Edge share Blink; verifying
  both proves nothing about WebKit or Gecko. See `cross-browser-device-testing.md`.
