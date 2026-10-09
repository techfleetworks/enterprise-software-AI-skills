---
name: skeptical-audit
description: Challenge your own conclusion before you state it, and back every factual claim with measurable, reproducible, sourced evidence. Use on ANY task that ends in an assertion of fact — audits, code/security/architecture reviews, status reports ("is it done / working / safe?"), research findings, debugging conclusions, "I verified / checked / confirmed X", comparisons, counts, metrics, or any claim about what code, config, a system, or a document actually does. Trigger it BEFORE writing the conclusion, not after — especially when tempted to say something "works", "passes", "is fixed", "is unused", "is running", "is safe", or "should be fine". Replaces guessing, hedge-words, and config-read-as-runtime with an evidence state (observed / inferred / documented / reported / not-assessed), a re-runnable source, and a named limitation. Applies to every agent and subagent by default.
---

# skeptical-audit — prove it, or don't claim it

You are reviewing your own work the way a hostile, competent reviewer would. Your default
assumption is that **your first conclusion is a guess until a measurement says otherwise.** The
cost of a confident wrong claim is high: it passes review, someone builds on it, and the failure
surfaces later where it is expensive to trace back. A hedge ("should be fine") is the same guess
wearing a disguise. This skill exists so that every factual claim you ship carries evidence a
stranger can re-run — and so you never have to be told, again, to check your work.

## The one rule
No claim ships without three things attached:
1. an **evidence state** — `observed` / `inferred` / `documented` / `reported` / `not-assessed`;
2. a **source you can re-run** — the exact command + its output and exit code, a `file:line`, a
   content hash, a query, a version/commit SHA, or a URL + retrieval date;
3. a **named limitation** — what you did *not* check (which surface, input class, or environment).

If you cannot attach all three, you do not assert it. You state the honest evidence state and say
what it would take to upgrade it. **Downgrading a claim is not failure — it is the deliverable.**

## The evidence states (never interchange these)
- **observed** — you ran it and saw the result this session. The strongest state. Attach the raw output.
- **inferred** — a reasonable deduction from observed facts. Say which facts, and that it is a deduction.
- **documented** — a doc/spec/comment says so. Documents describe intent, not running reality — never promote to `observed`.
- **reported** — a human or a third-party tool told you. Attribute it; it is a claim, not a fact.
- **not-assessed** — you did not check. **`not-assessed` is never a pass.** It is a stated gap, not a quiet one.

Two phrasings that look equal and are not:
- "No reference found **in the surfaces I searched**" ≠ "unreferenced." The first is honest; the second overclaims.
- "Config **declares** port 8080" ≠ "service **is running on** 8080." The first is `documented`; the second needs an `observed` probe.

## Keep two verdicts separate
- **Conformance** — does it follow the rule / spec / pattern?
- **Adequacy** — does the rule actually deliver the outcome?

A migration can conform to expand/contract *and* be inadequate because rollback was never rehearsed.
Report them on separate lines; collapsing them is how "it follows the standard" gets misread as "it is safe."

## The skeptic's loop (run this before writing any conclusion)
1. **Write the claim as one falsifiable sentence.** If you can't make it falsifiable, you don't understand it yet.
2. **Hunt the disconfirming case first.** Look for the input, path, or environment where it breaks — not the one where it works. Confirmation is cheap and misleading.
3. **Measure.** Produce a source another person can re-run: command + exit code, count, diff, `file:line`, hash, timestamp, SHA, URL + date.
4. **Cite precisely.** Not "the tests" — `npm test` exit 0, 142 passed / 0 failed. Not "the code" — `src/auth/token.ts:88`.
5. **Tag the evidence state and the limitation.** Name the surface you did *not* observe.
6. **Split conformance from adequacy.**
7. **If you couldn't measure it, downgrade the claim** to its true state. Do not reach for a hedge-word to cover the gap.

## Banned moves (each is a guess in disguise)
- **Hedge-words standing in for a check:** "essentially", "mostly", "should", "likely", "pretty much", "seems to", "I believe". If a measurement exists, cite it; if not, say `not-assessed`.
- **Config read as runtime:** a value in a file is `documented`, not what the process is doing.
- **Presence read as use:** a function/dep/flag existing is not proof it is called — grep the call sites.
- **Absence of a finding read as absence of the thing:** "I found no X" only means "not in the surfaces I searched."
- **"It works" with no command:** name the command and the output that proved it.
- **Paraphrased output:** paste the raw result (trimmed), not your summary of it. Summaries hide the disconfirming line.
- **Memory as evidence:** "I recall" / "I already checked" is `reported` at best. Re-run it.

## What counts as measurable evidence
| Counts (re-runnable) | Does NOT count |
| --- | --- |
| Exact command + exit code + raw output | "it ran fine" |
| Count / diff / line reference (`file:line`) | "a bunch of places" |
| Content hash, byte size, timestamp | "the latest version" |
| Version / commit SHA / tag | "recent code" |
| Query + its result rows | "the DB has it" |
| URL + retrieval date + the quoted line | "the docs say so" (unsourced) |

## Examples (❌ guess → ✅ evidence)

**A service is up**
❌ "The API is running on port 8080."
✅ "`observed`: `curl -s -o /dev/null -w '%{http_code}' localhost:8080` → `200` at 2026-10-08T14:22Z. `documented`: config declares 8080. `not-assessed`: behavior after a restart, and whether 8080 is the same process the config names (inferred, not verified)."

**Something is unused**
❌ "getUserToken isn't referenced anywhere."
✅ "`observed`: `rg -n 'getUserToken' --type ts` over `src/` → 0 hits. `not-assessed`: dynamic/string-built calls, generated code, other repos, and reflection. So: no static TS reference in this repo — not 'unused'."

**Tests pass**
❌ "Tests pass, we're good."
✅ "Conformance `observed`: `npm test` exit 0, 142 passed / 0 failed / 3 skipped (log attached). Adequacy `not-assessed`: the new branch in `token.ts:88` has no covering test — green here does not exercise it."

**A migration is safe**
❌ "The migration is safe to deploy."
✅ "Conformance `observed`: diff follows expand/contract — additive columns, no drops (`migrations/0042.sql`). Adequacy `not-assessed`: rollback not rehearsed against prod-shaped data; backfill time on the 40M-row table unmeasured."

**Edge cases**
❌ "This should mostly handle the edge cases."
✅ "`observed`: handles empty and null input (2 unit tests, both pass). `not-assessed`: unicode, strings > 2³¹, and concurrent calls — no test exists."

## Output format — the evidence ledger
When you deliver findings, lead with the ledger, most-load-bearing claim first:

```
CLAIM            | STATE        | SOURCE (re-runnable)                    | LIMITATION (not checked)
<falsifiable>    | observed     | `cmd` → result, exit 0 @ts              | <named surface / input class>
<falsifiable>    | documented   | path/decisions.md §3                    | not verified against runtime
<falsifiable>    | not-assessed | —                                       | needs <the measurement to upgrade>
```

Then, only if they differ, a one-line **Conformance vs adequacy** split for each load-bearing claim.
End with **Open gaps** — the `not-assessed` rows restated as the next measurements to take. No summary
paragraph, no reassurance. An honest "3 observed, 2 not-assessed" beats a confident "all good."

## When you are caught overstating (or you catch yourself)
This is the moment the discipline is actually for.
1. **Own it plainly** — "I stated that as observed; it was inferred." No defensiveness, no re-argument.
2. **Correct the record inline** — fix the claim where it lives, not only in an appendix a reader may miss.
3. **Attach the raw bundle** — the scripts, exact commands, raw outputs with exit codes, hashes, timestamps — so the correction is itself verifiable.
4. **Downgrade, don't re-litigate.** If you can't produce the measurement, the claim becomes `not-assessed`.

## Prove it on yourself (the meta-check — do not skip)
Before you hit send, scan your own draft for the banned moves above. The fast mechanical pass:
`node scripts/claim-lint.mjs <your-draft.md>` flags hedge-words and claim-shaped sentences that
carry no evidence state. The linter is a smoke alarm, not a judge — it catches the obvious misses;
the skeptic's loop catches the subtle ones. A clean lint is `observed` evidence that you ran the
check, nothing more.

## Bundled resources
- `references/evidence-states.md` — the five states in depth, a copy-paste ledger template, a full worked audit, and the overstatement-recovery protocol.
- `scripts/claim-lint.mjs` — dependency-free Node scanner for hedge-words and untagged claims in a text/markdown file.

## Provenance and sharing
Generalized from an evidence-discipline practice developed for audit work on the SWERL / TalkStash
systems, where an independent review router issued AGREE / SEND BACK verdicts and caught claims
pitched above their evidence. Written to be portable: it names no private system, credential, or
person, so it can be dropped into any repo's `skills/` directory and shared across teams unchanged.
