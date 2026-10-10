# Exploratory testing (the human layer automation can't replace)

Automated tests check what you *thought* to specify. Exploratory testing finds what you didn't — the
usability snags, confusing error messages, slow responses, design issues, and odd interactions that no
assertion was written for. It is a deliberate practice, not "clicking around," and it complements the
pyramid rather than competing with it.

## What it is
- **Unscripted, human, time-boxed exploration** of the real system with a **destructive mindset** —
  actively try to provoke failure and surprise, rather than confirm the happy path.
- Aimed at the classes of problem automation is bad at: usability, clarity of errors, perceived
  performance, visual/layout issues, and "this is technically correct but awful to use."
- **A REST API or CLI is a user interface too** — explore those, not just GUIs.

## How to run it
- **Schedule it on a regular cadence** (e.g. before a release, or a fixed weekly slot) — not once,
  not only when something smells wrong.
- Work from a lightweight **charter** (an area + a risk to probe), time-box the session, and take
  notes as you go.
- Pair it with **hallway / usability testing** and user showcases for "does this feel right?"
  judgments (ties to `usability-ux-universal-design`). Aesthetic/UX calls belong to humans, not
  screenshot assertions.

## Close the loop — turn findings into automated regressions
- **Every reproducible defect found becomes an automated test**, written at the **lowest layer that
  proves it** (push it down the pyramid — see `test-pyramid-and-types.md`), so it can never regress
  silently.
- **An escaped defect is feedback on pipeline maturity**: if exploration (or production) found a bug
  your automated suite missed, the gap is a missing lower-level test — add it, don't just fix the bug.

## What it is not
- Not a replacement for automated tests, and not a manual regression pass. Manual re-testing of the
  same paths every release is waste — automate those and spend human time exploring the unknown.

Source: Fowler/Vocke, *The Practical Test Pyramid*
(<https://martinfowler.com/articles/practical-test-pyramid.html>, retrieved 2026-10-10) `[documented]`.
