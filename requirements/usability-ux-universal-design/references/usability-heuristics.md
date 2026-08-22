# The Usability Heuristics (Applied)

The ten established usability heuristics are the fastest, cheapest way to find usability
defects — an expert can review a design against them before a single user sees it. Treat a
violation as a bug. Here's each one, with what it means in practice.

1. **Visibility of system status.** Always keep the user informed about what's going on,
   with timely feedback. Show loading/progress, confirm that an action worked ("Saved"),
   indicate current location (active nav, breadcrumbs). *Never* leave the user staring at a
   frozen screen wondering if their click registered.

2. **Match between system and the real world.** Speak the user's language — words,
   concepts, and conventions they know, not internal/technical jargon. Order things the way
   they expect (real-world logic). "Trash," not "Deallocate object."

3. **User control and freedom.** People make mistakes and need a clearly marked
   "emergency exit." Provide **undo** and **redo**, easy cancel, and a way back out of any
   state without penalty. Don't trap users in flows they can't escape.

4. **Consistency and standards.** The same word/action/element means the same thing
   everywhere in your product, and you follow **platform and industry conventions** (a link
   is underlined, the logo goes home, the primary button is on the same side). Don't make
   users learn a new convention when a familiar one exists.

5. **Error prevention.** Even better than good error messages: eliminate error-prone
   conditions in the first place. Use constraints, good defaults, and confirmations for
   consequential actions. Disable/guard the invalid, format-as-you-type, and check before
   committing. (See `error-prevention-and-recovery.md`.)

6. **Recognition rather than recall.** Minimize memory load by making objects, actions, and
   options **visible**. The user shouldn't have to remember information from one part of the
   interface to another. Show recently used items, keep entered data visible, offer
   pickers/suggestions instead of "type the exact code."

7. **Flexibility and efficiency of use.** Serve both novices and experts — accelerators
   (keyboard shortcuts, saved presets, bulk actions) that speed up experts without getting
   in beginners' way. Let people tailor frequent actions.

8. **Aesthetic and minimalist design.** Interfaces shouldn't contain information that is
   irrelevant or rarely needed — every extra element competes for attention and dilutes the
   important ones. Prioritize ruthlessly; remove, hide, or defer the rest.

9. **Help users recognize, diagnose, and recover from errors.** Error messages in plain
   language (no codes), that precisely state the problem *and* constructively suggest a
   solution, placed where the problem is. (See `content-and-plain-language.md`.)

10. **Help and documentation.** Ideally the system is usable without docs, but provide
    help that's easy to search, focused on the user's task, lists concrete steps, and isn't
    too large — contextual help beats a manual.

## How to use them

Run a **heuristic evaluation**: walk the key flows and, at each screen, ask whether any
heuristic is violated. It's most effective with 2–3 reviewers (each finds different issues).
Log findings with the heuristic they break and a severity, then fix the severe ones first.
This catches the majority of usability problems for almost no cost — do it *before*
usability testing so you don't burn sessions on obvious defects.
