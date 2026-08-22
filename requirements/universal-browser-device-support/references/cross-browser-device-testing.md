# Cross-Browser & Cross-Device Testing (with CI gating)

"I checked it in Chrome" is not proof. Compatibility is only real when it's verified
across the matrix automatically, on every change.

## The layers of verification

1. **Cross-engine end-to-end tests.** Run your critical-journey e2e suite against all
   three engines — **Chromium, WebKit, and Firefox**. A modern e2e runner (e.g.
   Playwright) drives all three from one test codebase, including a real WebKit build
   (the closest you get to Safari without a Mac in CI).
2. **Responsive / emulation tests.** Run key flows at the **smallest supported width**
   and a representative set of viewports (phone portrait/landscape, tablet, desktop),
   with device emulation for touch, device-pixel-ratio, and reduced-motion.
3. **Visual regression.** Snapshot key screens per engine × viewport and diff against a
   baseline so silent layout drift (a wrapped button, a clipped label, a broken grid in
   WebKit only) fails the build instead of shipping.
4. **Real-device pass.** Emulators miss real hardware quirks (iOS Safari gestures,
   Android keyboards, notches, real touch latency). Use a device cloud (BrowserStack /
   Sauce Labs / LambdaTest or equivalent) or physical devices for a pre-release pass on
   the environments you can't emulate faithfully.

## Static and unit-level guards (cheap, run first)

- **Lint the matrix.** `eslint-plugin-compat` (or similar) flags JS APIs unsupported by
  your `browserslist`; `stylelint` with a no-unsupported-features rule does the same for
  CSS — catching incompatibilities before the code even runs.
- **Ensure prefixing/transpilation** are wired to `browserslist` so builds target the
  matrix automatically.

## Wire it into CI as a gate

- The **cross-engine + responsive suite runs on every PR** (or as a required pre-merge
  check). A failure in *any* supported engine or viewport **fails the build and blocks
  merge** — a WebKit-only break is a real break.
- Run the **heavier real-device / full-visual-regression** lane on a schedule or as a
  release gate if it's too slow for every PR — but never skip it before a release.
- Keep the matrix in sync with `browserslist`: when the support floor changes, the test
  matrix changes with it.

## Manual spot-checks that still matter

Automation can't judge everything. Before release, manually sanity-check the primary flow
on: a **real iOS Safari device**, a **real Android Chrome device**, a **throttled
low-end profile** (CPU 4–6×, slow 3G/4G), at **200% browser zoom**, and with
**reduced-motion / dark mode** on. These catch the "technically renders but feels broken"
class of issues emulators miss.

## What good looks like

- Every critical journey is a cross-engine automated test that gates merge.
- Visual regressions are caught by diff, not by a user.
- The support matrix, the build target, and the test matrix are the *same* list.
- A break in Safari/WebKit or on a 360px phone is a red build, not a production incident.
