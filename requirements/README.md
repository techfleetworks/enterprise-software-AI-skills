# Requirements — Universal Quality Skills

A grouped set of **portable, vendor-neutral agent skills** that make any codebase work
for *everyone, everywhere*: every browser and device, for people of every ability, and in
a way that's genuinely easy to use. Where the top-level engineering skills answer "is this
built, secured, tested, and operable correctly?", these answer **"can anyone actually use
what we built — on any device, with any ability, without a manual?"**

Same format as every other skill in this repo: each folder has a `SKILL.md`
(YAML frontmatter + Markdown) and a `references/` folder read on demand.

## The skills

| Skill | What it enforces | Triggers on |
|---|---|---|
| [`universal-browser-device-support`](universal-browser-device-support/) | Bug-free rendering and behavior across every supported browser engine and device | Any HTML/CSS/JS/UI change, responsive layout, "broken in Safari," mobile/touch, polyfills |
| [`universal-accessibility-wcag`](universal-accessibility-wcag/) | WCAG 2.2 AA conformance so people using a keyboard, screen reader, or magnifier aren't locked out | Forms, images, color/contrast, focus, keyboard, ARIA, screen readers, "a11y" |
| [`usability-ux-universal-design`](usability-ux-universal-design/) | User-friendly, intuitive design for the widest range of people and situations | New UI/flows, navigation, onboarding, empty/error states, microcopy, "is this confusing?" |

## How they layer

They build on each other — do them in this order on any UI change:

1. **`universal-browser-device-support`** — the thing must *render and function* correctly
   wherever the user is (engine, screen size, input device, network).
2. **`universal-accessibility-wcag`** — it must be *possible to use* for people with
   disabilities. This is the non-negotiable floor and, in most places, the law.
3. **`usability-ux-universal-design`** — on top of possible-and-compatible, it must be
   *effortless and approachable* for anyone, regardless of ability, literacy, or context.

They deliberately overlap and cross-reference: semantic HTML, keyboard operability, target
size, reduced-motion, and responsive reflow show up in all three because they serve
compatibility, accessibility, and usability at once.

## Using them

Identical to the rest of the repo — drop a `<skill-name>/` folder into your skills
directory, point rules-based tools at the `SKILL.md`, or feed it to any model as context.
Each skill's `description` is written as *when to use this* so agent tooling can auto-load
it. See the [root README](../README.md) for full install instructions.
