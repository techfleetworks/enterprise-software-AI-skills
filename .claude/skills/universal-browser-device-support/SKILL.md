---
name: universal-browser-device-support
description: 'Use for ANY frontend or UI change (HTML, CSS, JavaScript, components, layouts) to make it work correctly across every browser and device in the committed support matrix, not just the one it was written on. Covers defining a support matrix, feature detection and progressive enhancement (never user-agent sniffing), responsive layout, input modalities (touch, mouse, keyboard, stylus), cross-browser CSS and JS quirks and fallbacks, low-end-device performance, and automated cross-browser and device testing wired into CI. Trigger proactively on "works on my machine," "broken in Safari/Firefox/Edge," CSS layout, responsive, mobile, tablet, touch, viewport, breakpoint, polyfill, vendor prefix, "looks different in," or any code that renders in a browser, even without those words.'
---

# Universal Browser and Device Support

## Why this exists

"It works on my machine" is the single most expensive lie in frontend engineering. A change that renders
perfectly in the developer's Chrome on a fast laptop can be broken in Safari, unusable on a 360px phone,
invisible to a stylus user, or janky on a three-year-old Android. Users do not file bugs; they leave.
This skill makes cross-browser, cross-device correctness a property of how the code is written and
tested, not something a QA pass discovers later (or a user does, in production).

The goal is not "test more browsers at the end." It is to write code that works across the committed
support matrix (standards-based, feature-detected, responsive, and progressively enhanced) and then to
prove it with automated tests across that matrix.

## The main idea

**Build on the standard, detect the capability, degrade gracefully, and verify on the real matrix.**
Every environment gets a working experience; better environments get a better one. You never assume a
browser, a screen size, an input device, or a network. If a feature might be missing, you detect it and
provide a fallback. You never sniff the user agent and branch on a brand string, because that rots, it
is spoofable, and it misses engines you did not list.

## The workflow

### Step 1: Define the support matrix, decide before you code

Read `references/support-matrix-and-targeting.md`. You cannot be "universally compatible" against an
undefined target. Establish and commit a matrix:

- **Browsers and engines**: the three rendering engines (Blink, WebKit, Gecko) and the versions you
  support, expressed as a `browserslist` config so tooling, transpiling, and autoprefixing all read the
  same source of truth.
- **Devices and viewports**: smallest supported width (commonly about 320 to 360px) up to large
  desktop; phone, tablet, desktop; portrait and landscape.
- **Input modalities**: touch, mouse or trackpad, keyboard, stylus, and hybrids.
- **Baseline**: prefer web features that are Baseline Widely available; a Newly available feature works
  across the core browsers but is younger, and anything less than that needs a fallback or a feature
  query. (Note the modern reality: on iOS in the EU, browsers are no longer all WebKit, so test the real
  engines, not an assumed one.)

The matrix is a product decision, not a guess. Write it down; CI enforces it.

### Step 2: Write standards-first, feature-detected code

Read `references/feature-detection-progressive-enhancement.md`. The rules:

- **Semantic HTML is the floor.** A real `<button>`, `<a href>`, `<form>`, `<label>` works everywhere
  and gives you behavior for free. (Overlaps with `universal-accessibility-wcag`.)
- **Progressive enhancement**: the core task must work with baseline HTML and CSS; JS and advanced CSS
  enhance it. If the enhancement fails to load, the task still completes.
- **Feature-detect, never UA-sniff.** Use `@supports` in CSS and capability checks
  (`if ('IntersectionObserver' in window)`, `'geolocation' in navigator`) in JS. Branching on a browser
  brand or version string is banned: it rots, it lies (spoofing), and it misses engines you did not
  list. This rule is enforced by a mechanical gate (see below).

### Step 3: Make layout responsive and input-agnostic

Read `references/responsive-layout-and-input-modalities.md`:

- **Fluid, mobile-first layout** with modern CSS (Flexbox, Grid, `clamp()`, container queries where
  supported) and content-driven breakpoints, not device-specific magic numbers.
- **The viewport meta tag** and safe-area insets; never disable user zoom.
- **Every interactive target works by touch, mouse, and keyboard.** Adequate hit-target size: WCAG 2.2
  SC 2.5.8 Target Size (Minimum) is AA at 24 by 24 CSS px (or 24px spacing); 44 by 44 is not the WCAG AA
  floor (that is SC 2.5.5 Target Size (Enhanced), AAA, and Apple's HIG). AA minimum 24 by 24; design
  toward about 44 for comfort. No hover-only affordances; use `:focus-visible` states and pointer events
  over mouse-only events.
- **Respect user and system settings**: `prefers-reduced-motion`, `prefers-color-scheme`, text scaling,
  and OS-level zoom.

### Step 4: Handle known cross-browser CSS and JS differences deliberately

Read `references/cross-browser-css-and-js.md`:

- **Autoprefix** via the build (driven by `browserslist`); do not hand-write vendor prefixes.
- **Feature queries and fallbacks** for anything not yet Baseline; provide the older property first,
  then the enhanced one.
- **Polyfill only what the matrix needs**, loaded conditionally, and remove polyfills when the floor
  rises.
- Know the recurring gotchas (date and time parsing, `100vh` on mobile, Safari input and scroll quirks,
  form-control styling limits, font rendering) and code around them with feature detection, not brand
  checks.

### Step 5: Do not forget the low-end device

A modern flagship hides performance sins. Test on a throttled CPU and slow network (the p75 device, not
yours). Ship less JavaScript, lazy-load, and keep the main thread free so the experience holds on the
slowest supported device, not the fastest. (Deep performance work lives in a performance skill if
present; this skill's bar is that the supported low-end device stays usable.)

### Step 6: Prove it, automated cross-browser and device testing in CI

Read `references/cross-browser-device-testing.md`. "I checked it in Chrome" is not proof. Add:

- **Cross-engine end-to-end tests** run against Chromium, WebKit, and Firefox (Playwright drives all
  three).
- **Responsive and emulation tests** at the smallest and a representative set of viewports, touch and
  non-touch.
- **Visual regression** snapshots per engine and viewport to catch layout drift.
- A **CI gate**: the matrix runs on every PR, and a break in any supported engine or viewport fails the
  build. Add real-device cloud testing for a final pass on hard-to-emulate hardware.

## Mechanical gate

`scripts/check-no-ua-sniffing.mjs` (ADR-0023) is the structural half of the Step 2 rule "feature-detect,
never UA-sniff." Point it at your source in CI. It fails the build on a read of `navigator.userAgent`,
`vendor`, `appVersion`, `platform`, or `userAgentData`, and on a line that both names a browser brand
and tests it (`.test(`, `.indexOf(`, `==`), so a brand-branch cannot merge by accident. It strips
comments first (a brand name in a comment is fine), and a reviewed exception (analytics capture, a
documented quirk workaround with a feature-detected fallback) is suppressed only with an inline
`// ua-sniff:ignore <reason>` on the line or the line above. It is a line linter, not a JS parser, so it
over-flags rather than hiding a sniff, and it cannot prove a fallback is correct. Its test is
`test/no-ua-sniffing.test.mjs`.

The rest of this skill (the committed matrix, progressive enhancement, responsive layout, cross-engine
testing) is enforced by `browserslist` plus the cross-engine CI suite and by `judge-arch`, not by a
single linter. Say which properties are gated mechanically and which rest on tests and review.

## Before you call it done

- Support matrix defined and encoded in `browserslist` (and committed).
- Core task works with semantic HTML before JS or enhancement (progressive enhancement).
- `check-no-ua-sniffing` is green: no user-agent brand-branching anywhere (or a reviewed line carries an
  inline reason); capabilities are feature-detected.
- Layout is fluid from the smallest supported width up; no horizontal scroll or clipped content at 320
  to 360px; every control works by touch, mouse, and keyboard; targets are large enough; no hover-only
  actions.
- `prefers-reduced-motion`, `prefers-color-scheme`, and text scaling respected.
- Non-Baseline features have `@supports` or capability fallbacks; polyfills scoped to the matrix.
- Verified usable on a throttled low-end device and slow network.
- Cross-engine, responsive, and visual-regression tests run in CI and block merge on any
  supported-environment failure.
- The evidence ledger below is filled in: each support claim has a state and a re-runnable source, and
  the central claim ("it works across the committed matrix") is at `observed`, not `inferred`.

## Reference files

| Topic | File |
|---|---|
| Defining the support matrix, `browserslist`, Baseline, targeting decisions | `references/support-matrix-and-targeting.md` |
| Feature detection, `@supports`, capability checks, progressive enhancement, no UA sniffing | `references/feature-detection-progressive-enhancement.md` |
| Responsive and fluid layout, viewport, breakpoints, touch/mouse/keyboard/stylus, user preferences | `references/responsive-layout-and-input-modalities.md` |
| Cross-browser CSS and JS quirks, autoprefixing, fallbacks, scoped polyfills, known gotchas | `references/cross-browser-css-and-js.md` |
| Cross-engine e2e, responsive emulation, visual regression, real-device cloud, CI gating | `references/cross-browser-device-testing.md` |
| Mechanical gate: the no-user-agent-sniffing linter | `scripts/check-no-ua-sniffing.mjs` |

## Evidence & skeptical assessment (required)

Every "this works across browsers and devices" statement is a factual claim, so it follows the repo's
evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
Compatibility is an **evidence ledger**: each supported environment is a claim with a state and a
re-runnable source, never "it looked fine in my browser." Hunt the disconfirming case first (which
engine or viewport is only assumed to work?) before you sign off.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "No code branches on the user agent" | `check-no-ua-sniffing` runs clean on the source in CI | it is a blocking CI check on every PR |
| "It works in WebKit and Gecko, not just Blink" | the cross-engine e2e suite passes on Chromium, WebKit, Firefox | that suite is a blocking CI gate and a break in any engine fails the build |
| "It works at the smallest supported width" | a responsive and visual-regression run passes at 320 to 360px | the viewport matrix runs in CI with visual snapshots per engine |
| "A missing feature degrades gracefully" | an `@supports` or capability fallback is shown to work with the feature off | progressive enhancement is tested with JS or the feature disabled |
| "It stays usable on a low-end device" | a throttled CPU and slow-network pass is recorded | a performance budget is enforced on the p75 device profile |

**Definition of done:** the ledger covers every environment the change needs with a verdict and a
re-runnable source; a claim that could be measured (does it render in WebKit, does it reflow at 320px)
is `observed` or `proven`, never `inferred`; and no "cross-browser" verdict is given while the central
"works across the committed matrix" claim is below `observed`. A green no-sniffing gate is necessary,
not sufficient, and Baseline status changes over time, so re-check it rather than trusting a snapshot.

## Why this holds for every developer and every agent

It binds everyone because the matrix, the gate, and the cross-engine suite live in CI and git, not in
memory. Agents get the discipline through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by `check-no-ua-sniffing`
(a blocking gate on brand-branching) and by the cross-engine and visual-regression CI gate. It survives
any one person because the `browserslist` config, the gate script, the reference files, and the test
suite all live in the repo. The honest limit: the gate proves there is no obvious UA sniff, not that the
app actually renders in every engine; that is what the cross-engine suite proves, and `judge-arch` and
real-device testing sit on top. An escaped cross-browser bug becomes a new test at the engine and
viewport that missed it.

## Sources and attribution

Grounded in the web platform's living standards and data, read this session. Feature support and
Baseline status change constantly, so re-check current data rather than any snapshot here.

- Web Platform Baseline (<https://web.dev/baseline>, retrieved 2026-10-12): the definitions of Newly
  available ("supported by all of the core browsers, and is therefore interoperable") and Widely
  available ("30 months have passed since the newly interoperable date"), and the core browser set
  (Chrome on desktop and Android, Edge, Firefox on desktop and Android, Safari on macOS and iOS). Baseline
  is defined by the WebDX Community Group. `[documented]`
- MDN Web Docs and the MDN Browser Compat Data project
  (<https://developer.mozilla.org/>, <https://github.com/mdn/browser-compat-data>): the per-feature
  cross-browser support tables, and the guidance on feature detection and `@supports`. `[documented]`
- Can I use (<https://caniuse.com/>): per-feature support across browser versions with real-world usage
  percentages. `[documented]`
- WHATWG HTML Living Standard (<https://html.spec.whatwg.org/multipage/>): the normative HTML the
  standards-first approach builds on. `[documented]`
- Browserslist (<https://github.com/browserslist/browserslist>): the shared target config read by
  Autoprefixer, Babel or SWC, and bundlers, so the matrix is one source of truth. `[documented]`
- Aaron Gustafson, "Understanding Progressive Enhancement," A List Apart, 2008
  (<https://alistapart.com/article/understandingprogressiveenhancement/>): the progressive-enhancement
  model (content, then presentation, then behavior). `[documented]`
- Ethan Marcotte, "Responsive Web Design," A List Apart, 2010
  (<https://alistapart.com/article/responsive-web-design/>): fluid grids, flexible media, and media
  queries as one responsive approach rather than separate device-specific sites. `[documented]`
- Apple, "Alternative browser engines" for iOS in the EU under the DMA
  (<https://developer.apple.com/support/alternative-browser-engines/>): iOS browsers are no longer all
  WebKit in the EU, so an engine must be tested, not assumed from the platform. `[documented]`
- Playwright (<https://playwright.dev/>): end-to-end testing driving Chromium, WebKit, and Firefox from
  one API, for the cross-engine CI gate. `[documented]`
