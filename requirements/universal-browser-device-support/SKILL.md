---
name: universal-browser-device-support
description: Use for ANY frontend/UI change — HTML, CSS, JavaScript, components, layouts — to make it work correctly and bug-free across every supported browser and device, not just the one it was written on. Covers defining a support matrix, feature detection and progressive enhancement (never user-agent sniffing), responsive layout, input modalities (touch/mouse/keyboard/stylus), cross-browser CSS/JS quirks and fallbacks, low-end-device performance, and automated cross-browser/device testing wired into CI. Trigger proactively on "works on my machine," "broken in Safari/Firefox/Edge," CSS layout, responsive, mobile, tablet, touch, viewport, breakpoint, polyfill, vendor prefix, "looks different in," or any code that renders in a browser — even without those words.
---

# Universal Browser & Device Support

## Why this exists

"It works on my machine" is the single most expensive lie in frontend engineering.
A change that renders perfectly in the developer's Chrome-on-a-fast-laptop can be
broken in Safari, unusable on a 360px phone, invisible to a stylus user, or
janky on a three-year-old Android. Users don't file bugs — they leave. This skill
makes cross-browser, cross-device correctness a *property of how the code is written
and tested*, not something a QA pass discovers later (or a user does, in production).

The goal is not "test more browsers at the end." It is to write code that is
**correct by construction** across environments — standards-based, feature-detected,
responsive, and progressively enhanced — and then to *prove* it with automated tests
across a real matrix.

## The core principle

**Build on the standard, detect the capability, degrade gracefully, and verify on the
real matrix.** Every environment gets a working experience; better environments get a
better one. You never assume a browser, a screen size, an input device, or a network.
If a feature might be missing, you detect it and provide a fallback — you never sniff
the user agent and branch on a brand string.

## The workflow

### Step 1: Define the support matrix — decide before you code

Read `references/support-matrix-and-targeting.md`. You cannot be "universally
compatible" against an undefined target. Establish and commit a matrix:

- **Browsers/engines**: the three rendering engines (Blink, WebKit, Gecko) and the
  versions you support — expressed as a `browserslist` config so tooling, transpiling,
  and autoprefixing all read the same source of truth.
- **Devices/viewports**: smallest supported width (commonly ~320–360px) up to large
  desktop; phone / tablet / desktop; portrait and landscape.
- **Input modalities**: touch, mouse/trackpad, keyboard, stylus — and hybrids.
- **Baseline**: prefer web features that are **Baseline / Widely available**; anything
  newer needs a fallback or a feature query.

The matrix is a product decision, not a guess. Write it down; CI enforces it.

### Step 2: Write standards-first, feature-detected code

Read `references/feature-detection-progressive-enhancement.md`. The rules:

- **Semantic HTML is the floor.** A real `<button>`, `<a href>`, `<form>`, `<label>`
  works everywhere and gives you behavior for free. (Overlaps with
  `universal-accessibility-wcag`.)
- **Progressive enhancement**: the core task must work with baseline HTML/CSS; JS and
  advanced CSS *enhance* it. If the enhancement fails to load, the task still completes.
- **Feature-detect, never UA-sniff.** Use `@supports` in CSS and capability checks
  (`if ('IntersectionObserver' in window)`, `'geolocation' in navigator`) in JS. Branching
  on a browser brand/version string is banned — it rots, lies (spoofing), and misses
  engines you didn't list.

### Step 3: Make layout responsive and input-agnostic

Read `references/responsive-layout-and-input-modalities.md`. Cover:

- **Fluid, mobile-first layout** with modern CSS (Flexbox/Grid, `clamp()`, container
  queries where supported) and content-driven breakpoints — not device-specific pixel
  magic numbers.
- **The viewport meta tag** and safe-area insets; never disable user zoom.
- **Every interactive target works by touch, mouse, and keyboard.** Adequate hit-target
  size (~44×44px), no hover-only affordances, `:focus-visible` states, pointer events
  over mouse-only events.
- **Respect user/system settings**: `prefers-reduced-motion`, `prefers-color-scheme`,
  text scaling, and OS-level zoom.

### Step 4: Handle known cross-browser CSS/JS differences deliberately

Read `references/cross-browser-css-and-js.md`. Don't discover engine differences in
production:

- **Autoprefix** via the build (driven by `browserslist`) — don't hand-write vendor
  prefixes.
- **Feature queries + fallbacks** for anything not yet Baseline; provide the older
  property first, then the enhanced one.
- **Polyfill only what the matrix needs**, loaded conditionally, and remove polyfills
  when the floor rises.
- Know the recurring gotchas (date/time parsing, `100vh` on mobile, Safari input/scroll
  quirks, form-control styling limits, font rendering) and code around them.

### Step 5: Don't forget the low-end device

A modern flagship hides performance sins. Test on a throttled CPU and slow network
(the p75 device, not yours). Ship less JavaScript, lazy-load, and keep the main thread
free so the experience holds on the *slowest* supported device, not the fastest.
(Deep performance work lives in a performance skill if present; this skill's bar is:
the supported low-end device must remain usable.)

### Step 6: Prove it — automated cross-browser/device testing in CI

Read `references/cross-browser-device-testing.md`. "I checked it in Chrome" is not
proof. Add:

- **Cross-engine end-to-end tests** run against Chromium, WebKit, and Firefox.
- **Responsive/emulation tests** at the smallest and a representative set of viewports,
  touch and non-touch.
- **Visual regression** snapshots per engine/viewport to catch layout drift.
- A **CI gate**: the matrix runs on every PR (or pre-merge), and a break in *any*
  supported engine/viewport fails the build. Real-device cloud testing for a final pass
  on hard-to-emulate hardware.

### Step 7: Confirm before calling it done

- [ ] Support matrix defined and encoded in `browserslist` (+ committed).
- [ ] Core task works with semantic HTML before JS/enhancement (progressive enhancement).
- [ ] No user-agent sniffing anywhere; capabilities are feature-detected.
- [ ] Layout is fluid from the smallest supported width up; no horizontal scroll or
      clipped content at 320–360px.
- [ ] Every control works by touch, mouse, and keyboard; targets are large enough;
      no hover-only actions.
- [ ] `prefers-reduced-motion` / `prefers-color-scheme` / text-scaling respected.
- [ ] Non-Baseline features have `@supports`/capability fallbacks; polyfills scoped to
      the matrix.
- [ ] Verified usable on a throttled low-end device + slow network.
- [ ] Cross-engine + responsive + visual-regression tests run in CI and block merge on
      any supported-environment failure.

## What disciplined teams do that this encodes

- Treat the **support matrix as a committed contract**, shared by build tooling and tests.
- **Feature-detect, never brand-detect** — the code survives new browser versions.
- **Progressive enhancement** so a failed script or unsupported feature degrades to a
  working baseline instead of a blank screen.
- **Automated cross-engine + visual-regression testing in CI**, not manual spot checks.
- Optimize for the **p75 device and network**, not the developer's machine.

## How this relates to the other requirements skills

- `universal-accessibility-wcag` — semantic HTML, keyboard operability, reduced-motion,
  and target size are shared foundations; do both together on any UI change.
- `usability-ux-universal-design` — a layout that breaks on a phone or a slow device is a
  usability failure as much as a compatibility one.

## Reference files

| Topic | File |
|---|---|
| Defining the support matrix, `browserslist`, Baseline, targeting decisions | `references/support-matrix-and-targeting.md` |
| Feature detection, `@supports`, capability checks, progressive enhancement, no UA sniffing | `references/feature-detection-progressive-enhancement.md` |
| Responsive/fluid layout, viewport, breakpoints, touch/mouse/keyboard/stylus, user preferences | `references/responsive-layout-and-input-modalities.md` |
| Cross-browser CSS/JS quirks, autoprefixing, fallbacks, scoped polyfills, known gotchas | `references/cross-browser-css-and-js.md` |
| Cross-engine e2e, responsive emulation, visual regression, real-device cloud, CI gating | `references/cross-browser-device-testing.md` |

## Sources & further reading

Grounded in long-standing web-standards practice. Verify feature support and Baseline
status against current data (it changes constantly) rather than any snapshot here.

- **MDN Web Docs** — HTML/CSS/JS reference and browser-compatibility tables
  (developer.mozilla.org).
- **Can I use** — per-feature support across browsers/versions (caniuse.com).
- **Baseline** (W3C WebDX Community Group / web.dev) — "Widely available" vs "Newly
  available" feature status (web.dev/baseline).
- **Browserslist** — the shared target config read by Autoprefixer, Babel/SWC, and
  bundlers (github.com/browserslist/browserslist).
- **W3C / WHATWG** — the HTML, CSS, and DOM specifications the standards-first approach
  builds on.
- **Playwright** — cross-engine (Chromium/WebKit/Firefox) end-to-end testing
  (playwright.dev).
- Progressive enhancement & feature detection are established practice documented on MDN
  and in the broader web-standards community.
