# Defining the Support Matrix & Targeting

You can't be "universally compatible" against an undefined target. The matrix turns a
vague goal into a testable, tool-readable contract.

## What the matrix covers

- **Rendering engines, not just brands.** There are three that matter: **Blink**
  (Chrome, Edge, most Android browsers, Electron), **WebKit** (Safari on macOS, and —
  critically — *every* browser on iOS, since all iOS browsers use WebKit), and **Gecko**
  (Firefox). Testing "Chrome and Edge" is testing Blink twice. Cover all three engines.
- **Versions.** How far back you support (e.g. last 2 major versions, or a market-share
  threshold). Older = more fallbacks and polyfills = more cost. Make it explicit.
- **Devices & viewports.** Smallest supported width (commonly ~320–360px), through
  tablet, up to large desktop. Portrait and landscape. High-DPI ("retina") screens.
- **Input modalities.** Touch, mouse/trackpad, keyboard, stylus/pen — and hybrids
  (touchscreen laptops, tablets with keyboards).
- **Network & CPU tier.** The slowest device/connection you commit to supporting (the
  p75 user, not the developer's machine).

## Encode it once: `browserslist`

Put the browser target in a single `browserslist` config (in `package.json` or
`.browserslistrc`). Autoprefixer, transpilers (Babel/SWC), and bundlers all read it, so
your CSS prefixing, JS transpilation, and polyfill decisions come from **one source of
truth** instead of drifting apart.

```
# .browserslistrc — example, tune to your product's analytics
> 0.5%
last 2 versions
not dead
iOS >= 15
```

Prefer data-driven queries (`> 0.5%`, `last 2 versions`, `not dead`) over hand-listing
versions. Check what a config resolves to with `npx browserslist`.

## Prefer Baseline features

**Baseline** (the web-platform status signal maintained across browser vendors)
classifies features as *Widely available* (safe across the current + prior major
versions of all engines), *Newly available* (works in the latest of all engines but not
older ones), or *Limited*. Rule of thumb:

- **Widely available** → use freely.
- **Newly available** → use *with* a `@supports`/capability fallback (some users are on
  older versions).
- **Limited / not Baseline** → treat as progressive enhancement only, never load-bearing.

Check feature support against current compatibility data (e.g. the MDN/`caniuse`
compatibility tables) rather than memory — support changes constantly.

## The matrix is a product decision

Supporting more/older environments costs real engineering time (fallbacks, polyfills,
test lanes). That's a trade-off for the product owner, informed by *your* audience's
actual analytics — not a default and not the developer's personal browser habits. Write
the decision down (an ADR is a good home for it) so it's revisited deliberately as the
floor rises, letting you *delete* fallbacks and polyfills that are no longer needed.

## Anti-patterns

- No matrix at all ("support everything") — untestable, so nothing is actually verified.
- Listing brands, not engines — "works in Chrome + Edge" ignores WebKit/Gecko entirely.
- A matrix in a wiki that tooling can't read — it drifts from what the build actually
  targets. Encode it in `browserslist`.
- Never lowering the floor — carrying polyfills and hacks for browsers no one uses.
