# WCAG Principles & Conformance

## What WCAG is

The **Web Content Accessibility Guidelines** are the international standard for digital
accessibility (also the basis for legal requirements like the ADA in practice, Section 508
in the US, and EN 301 549 / the European Accessibility Act in the EU). Target **WCAG 2.2**,
the current version, which adds several success criteria over 2.1 (notably around focus,
dragging, target size, and authentication).

## The four principles — POUR

Every requirement rolls up to one of four principles. If content fails any, someone is
excluded:

- **Perceivable** — users can perceive the information: text alternatives for images,
  captions/transcripts for media, sufficient contrast, content that adapts to zoom/reflow,
  and meaning not carried by color alone.
- **Operable** — users can operate the interface: full keyboard access, enough time, no
  seizure-inducing flashes, ways to navigate and find content, adequate target sizes.
- **Understandable** — users can understand it: readable text, predictable behavior,
  clear labels, and input assistance (error identification and correction help).
- **Robust** — it works with current and future user agents and assistive technologies:
  valid markup and correct programmatic name/role/value/state.

## Conformance levels

- **Level A** — the minimum; failing these blocks entire groups of users. Non-negotiable
  floor.
- **Level AA** — the **standard conformance target** for virtually all products and the
  bar referenced by most laws and policies. *This is the default bar for this skill.*
- **Level AAA** — the highest; not required (or always achievable) for whole sites, but
  apply specific AAA criteria where feasible and high-value (e.g. higher contrast, more
  context help).

**Conformance is all-or-nothing per level and per page/flow:** to claim AA, a page must
meet all A *and* all AA criteria — one failure breaks conformance for that flow.

## The success criteria you'll touch most (cite these)

Referencing the criterion number makes "accessible" concrete and reviewable:

- **1.1.1** Non-text Content — text alternatives for images/icons/controls.
- **1.3.1** Info and Relationships — structure conveyed in markup (labels, headings, table
  headers), not just visually.
- **1.4.1** Use of Color — color is never the *only* way meaning is conveyed.
- **1.4.3 / 1.4.11** Contrast — 4.5:1 text (3:1 large text), 3:1 UI components & graphics.
- **1.4.4 / 1.4.10** Resize Text / Reflow — usable at 200% zoom and 320px width.
- **1.4.13** Content on Hover or Focus (AA, added in 2.1) — hover/focus-triggered content
  (tooltips, popovers) is dismissable, hoverable, and persistent.
- **2.1.1 / 2.1.2** Keyboard / No Keyboard Trap — everything operable by keyboard; you can
  always tab away.
- **2.4.3 / 2.4.7** Focus Order / Focus Visible — logical order and an always-visible focus
  indicator.
- **2.4.11** Focus Not Obscured (Minimum) (AA, new in 2.2) — the focused element isn't
  hidden behind sticky headers/footers.
- **2.5.3** Label in Name (A, added in 2.1) — a control's accessible name contains its
  visible label text (so voice control can target it by what's shown).
- **2.5.7** Dragging Movements (AA, new in 2.2) — any drag action has a single-pointer
  alternative (tap/click), not drag-only.
- **2.5.8** Target Size (Minimum) (AA, new in 2.2) — interactive targets at least **24×24
  CSS px** or 24px spacing (design toward ~44 px for comfort; 44×44 is the AAA 2.5.5
  Enhanced / Apple HIG figure, not the AA floor).
- **3.2.6** Consistent Help (A, new in 2.2) — help mechanisms appear in the same relative
  order across pages.
- **3.3.1 / 3.3.2 / 3.3.3** Error Identification / Labels or Instructions / Error
  Suggestion — labeled fields, errors in text, and how to fix them.
- **3.3.7** Redundant Entry (A, new in 2.2) — don't ask users to re-enter information they
  already gave in the same session.
- **3.3.8** Accessible Authentication (Minimum) (AA, new in 2.2) — don't force a cognitive
  test (e.g. transcribe a code) with no accessible alternative; allow paste/password managers.
- **4.1.2 / 4.1.3** Name, Role, Value / Status Messages — components expose correct
  semantics; dynamic updates are announced. (Note: the former **4.1.1 Parsing** was
  *removed / made obsolete in WCAG 2.2* — valid markup still matters, but it is no longer a
  scored criterion.)

## How to use this

Don't memorize all ~55 A and AA criteria (that count is the A + AA total; AAA adds more) —
internalize POUR, keep this list of common ones handy, and check the full normative text
(and the "Understanding" + "Techniques" documents) for the specific criterion when a change
is unusual. Always cite the criterion you're satisfying or the one a finding violates.

> **Source note:** SC numbers, names, and levels above are verified against W3C
> *What's New in WCAG 2.2* (w3.org/WAI/standards-guidelines/wcag/new-in-22/, retrieved
> 2026-10-10) and the WCAG 2.2 Recommendation. New in 2.2: 2.4.11, 2.4.12, 2.4.13, 2.5.7,
> 2.5.8, 3.2.6, 3.3.7, 3.3.8, 3.3.9; 4.1.1 Parsing was removed. 2.5.3 and 1.4.13 date from
> WCAG 2.1.
