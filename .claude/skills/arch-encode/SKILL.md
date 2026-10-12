---
name: arch-encode
description: Turn an architectural mistake into a durable, enforceable rule. Use right after catching drift, a repeated bad pattern, or a review finding you want to stop recurring, or whenever someone says "add a rule so this never happens again." Writes the rule as a specific negative code example in the correct file (the nearest scoped AGENTS.md, or the repo's decisions.md), wires it into the mechanical gate when it is checkable, then proves the rule holds by reverting the bad change, clearing context, and re-running the original task. Also prunes bloated or contradictory rule files.
---

# arch-encode: write rules that actually hold

## Why this exists

Architectural characteristics decay. Teams agree on a boundary or a dependency rule, and then it quietly erodes as people bypass it under deadline. Building Evolutionary Architectures names this directly: such characteristics "often accidentally degrade over time" (Ford, Parsons, Kua, Sadalage, 2nd ed., Ch 1). A note in a document does not stop the decay. A stored rule influences behavior, it does not enforce it. It makes a violation less likely, not impossible.

So this skill does two things when a mistake is caught: it writes the rule in a form that is hard to misread, and where the rule is checkable, it backs the rule with a mechanical check so a violation cannot merge. A vague rule is worse than none. It costs context every session and catches nothing.

## The main idea

A rule you can check mechanically is the goal. Building Evolutionary Architectures calls this a fitness function: "any mechanism that provides an objective integrity assessment of some architectural characteristic(s)" (Ch 2). It makes "the basis for those decisions explicit and testable" (Ch 1) instead of a matter of opinion. When a problem surfaces during work (an "emergent" fitness function in the book's terms), the advice is to turn it into a check and "add them aggressively," and "just like unit tests, fitness functions become part of the team's codebase" (Ch 2). An `arch-gate` rule is exactly that: a fitness function for your architecture.

The example beats the principle. "Prefer thin controllers" matches nothing. A specific negative example with a glob can be enforced.

## The steps

### 1. State the rule as a specific negative code example

Turn the mistake into the smallest concrete rule, written as a prohibition with a bad-then-good pair from this codebase:

```
### Data access never lives in a component
// bad, inside a UI component
const { data } = await db.from('orders').select()
// good, go through the owning hook or service
const orders = useOrders()
```

Avoid rules like "prefer thin controllers," "keep layers separate," or "try to reuse." They match everything and nothing. Good rules split cleanly: "files in `services/` must not import from the UI framework or reference `window` or `document`."

### 2. Put the rule where the code lives

Place it at the right altitude, not all in the root file:
- A rule about one folder or kind of file goes in a nested `AGENTS.md` in that folder, so it loads only when the agent works there.
- A cross-cutting decision goes in the repo's `decisions.md`.
- A truly universal rule goes in the root `AGENTS.md`. Keep it lean; it loads every session.

Never auto-generate a rules file from the codebase or a prompt. Add one line at a time, and prune what you add.

### 3. Wire it into the mechanical gate if it is checkable

If the rule can be stated as "pattern X must not appear in glob Y," add it to the repo's architecture-gate config so CI enforces it, not just prose. The config is `arch-gate.config.json` at the repo root, read by `judge-arch/scripts/arch-gate.mjs`. In this repo it is wired live: `npm run check:architecture` runs the gate against the whole repo, and that command is a required, blocking CI step (ADR-0015). After you add a rule, run `npm run check:architecture` and confirm it reports the planted violation and then passes once the code is fixed. A rule that can be mechanical should be. That is the difference between "less likely" and "cannot merge." The book's point: a monitor or a doc is not a fitness function until it has an objective, pass-or-fail outcome (Ch 2), and fitness functions run in CI and the deployment pipeline so they execute on every change to the system (Ch 2).

### 4. Prove the rule holds (the test loop, do not skip)

Adding a rule and assuming it works is how rule files fill with dead prose. Test it:
1. Revert the offending change so the code is back to before the mistake.
2. Clear context. Re-test in a fresh session, not the one that just discussed the fix. An agent that just talked it through will "pass" from the conversation, not from the rule.
3. Re-run the original task word for word against the new rule set.
4. If the agent now gets it right, keep the rule. If not, the rule is too vague or misplaced. Tighten it or move it closer to the code, and repeat.

### 5. Prune while you are here

Before finishing, scan the file you edited:
- Contradictions, such as "keep controllers thin" vs "do not create extra classes." Two rules that fight get resolved at random. Reconcile them.
- Bloat and duplication. Merge overlapping rules and delete ones that are no longer true. More rules means less attention on each. A short file of concrete, tested rules beats a long vague one.

## Mechanical gate

arch-encode does not ship its own gate; its product is a rule inside the repo's `arch-gate` (`judge-arch/scripts/arch-gate.mjs` reading the root `arch-gate.config.json`, run by `npm run check:architecture`), which is the fitness function that fails CI when the banned pattern appears. A greppable rule is only finished when it lives there. A rule that is genuinely a judgment call (is this abstraction premature?) cannot be a gate rule; it stays in prose and is caught by a `judge-arch` review. Say which kind each rule is.

## Before you call it done

Report, as the run's output and its **evidence ledger**:
- The exact rule text added, and which file it went in and why that altitude.
- Whether it was wired into the mechanical gate (an `arch-gate` rule) or is prose for `judge-arch`.
- The result of the test loop: held, or needed tightening (and what you changed).
- Any contradictions or duplicates you reconciled while pruning.

A rule is not done until the test loop has run. A greppable rule is not done until it is an `arch-gate` rule.

## Reference files

| Topic | File |
|---|---|
| Example-beats-principle, negative rules, altitude, pruning | `references/writing-rules.md` |
| The revert, clear-context, re-run test loop in detail | `references/testing-a-rule.md` |

## Evidence & skeptical assessment (required)

"This rule will stop the mistake" is a claim, so it follows the repo's evidence discipline (the contract is in [`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)). The run's output is the **evidence ledger**: it records the rule, where it went, whether it was mechanized, and the result of the test loop, so no rule is trusted on assumption.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This rule stops the mistake" | the test loop: revert, clear context, re-run, and the agent now gets it right | the rule is an `arch-gate` forbid rule that fails CI on the banned pattern |
| "The rule is specific, not vague" | it has a bad-then-good example and a glob, and it fails cleanly on the violation | `check-arch-rules-discriminate` (judge-arch) shows the gate flags a planted violation |
| "The rule file is healthy" | contradictions and duplicates were reconciled in this edit | the file stays short and every rule is concrete and tested |

**Definition of done:** the rule is written as a specific negative example at the right altitude; it is wired into `arch-gate` if it is checkable (or marked as a `judge-arch` judgment rule if not); the test loop has run and the result is recorded; the file was pruned; and the output (the evidence ledger) states all of this. A greppable rule reaches `proven` only when it lives in `arch-gate`.

## Why this holds for every developer and every agent

It binds everyone because the rules live in committed files and gates, not memory. Agents get the discipline through the always-on hook, which lists this skill in `always-on/enterprise-skills-always-on.md`. A mechanized rule is enforced by `arch-gate` in CI, so people and agents alike cannot merge the banned pattern. The rules survive any one person because `arch-gate.config.json`, `decisions.md`, and the scoped `AGENTS.md` files are all in git. The honest limit: a rule that is a judgment call cannot be mechanized, so it relies on a `judge-arch` review. Every rule that can be greppable should be moved into the gate, which shrinks what rests on judgment over time.

## Sources and attribution

- Neal Ford, Rebecca Parsons, Patrick Kua, Pramod Sadalage, *Building Evolutionary Architectures*, 2nd ed., O'Reilly 2023 (ISBN 978-1-492-09754-9): the fitness-function concept ("an objective integrity assessment of some architectural characteristic(s)"), emergent fitness functions added on observed misbehavior, fitness functions living in the codebase, and fitness functions executing in CI and the deployment pipeline (Ch 1-2). `[documented]`
- The rule-authoring guidance (the example beats the principle, negative and specific rules, placing a rule at the right altitude, and the revert then clear-context then re-run test loop) is adapted from the workshop "Who's Designing Your System? You, or Your Agent?", a certificates.dev / TechFleet workshop presented by Alex (<https://www.youtube.com/live/b-Pom28zv7M>). `[documented]`
