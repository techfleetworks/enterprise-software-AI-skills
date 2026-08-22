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
- **2.1.1 / 2.1.2** Keyboard / No Keyboard Trap — everything operable by keyboard; you can
  always tab away.
- **2.4.3 / 2.4.7** Focus Order / Focus Visible — logical order and an always-visible focus
  indicator.
- **2.4.11** Focus Not Obscured (2.2) — the focused element isn't hidden behind sticky
  headers/footers.
- **2.5.8** Target Size (Minimum) (2.2) — interactive targets at least 24×24 px (design
  toward ~44 px for comfort).
- **3.3.1 / 3.3.2 / 3.3.3** Error Identification / Labels or Instructions / Error
  Suggestion — labeled fields, errors in text, and how to fix them.
- **3.3.8** Accessible Authentication (2.2) — don't force a cognitive test (e.g. transcribe
  a code) with no accessible alternative.
- **4.1.2 / 4.1.3** Name, Role, Value / Status Messages — components expose correct
  semantics; dynamic updates are announced.

## How to use this

Don't memorize all ~55 AA criteria — internalize POUR, keep this list of common ones
handy, and check the full normative text (and the "Understanding" + "Techniques"
documents) for the specific criterion when a change is unusual. Always cite the criterion
you're satisfying or the one a finding violates.
