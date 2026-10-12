# The review log & the coverage gates

> Load this reference when appending a review record, or when installing/understanding the two
> review-side gates. SKILL.md → "Storing reviews permanently" has the summary; this is the schema, the
> append-only contract, and exactly what each gate reads and fails on.

A review is a durable receipt, not throwaway output — the evidence that the change was examined, and the
history of what the architecture has been held to. It mirrors the tamper-evident audit-logging
discipline from `compliance-data-lifecycle` `[documented]`.

## Location & the two views

- **`docs/arch-reviews/log.jsonl`** — canonical, machine-readable: one JSON object per review, one line
  each (JSON Lines). The gates read this file; it is the source of truth.
- **`docs/arch-reviews/<date>-<scope>.md`** — a human-readable companion **generated from** the
  `.jsonl` entry, never hand-kept in parallel. One source of truth, so the two can't drift.

## One log entry — schema

```jsonc
{
  "date": "2026-10-10",
  "change": "PR #417",                    // commit SHA or PR ref the review covers
  "scope": ["src/services/refund.ts",     // every changed CODE file — the matrix rows
            "src/domain/loyalty.ts"],
  "matrix": {                             // file → question → { verdict, evidence }
    "src/services/refund.ts": {
      "boundary":       { "verdict": "cleared", "evidence": "refund workflow lives here; handler only calls refundService.refund() — routes/refund.ts:12" },
      "ownership":      { "verdict": "finding", "evidence": "writes loyalty.points directly — refund.ts:41 (owned by loyalty.ts)" },
      "dependency":     { "verdict": "cleared", "evidence": "rg -n -i '\\b(req|res|session)\\b' src/services/refund.ts → no matches" },
      "error-handling": { "verdict": "cleared", "evidence": "email failure routed to queue.onFinalFailure=report — refund.ts:58" },
      "over-engineering":  { "verdict": "n/a",     "evidence": "no new abstraction introduced" },
      "under-engineering": { "verdict": "cleared", "evidence": "no duplicated block; logic extracted to service" }
    },
    "src/domain/loyalty.ts": { "boundary": { "verdict": "cleared", "evidence": "..." }, "ownership": { "...": "..." } }
  },
  "findings": [
    {
      "title": "Refund service writes loyalty points it does not own",
      "question": "ownership",            // @question value
      "severity": "high",                 // @severity value
      "file": "src/services/refund.ts",
      "whatBreaks": "two writers of loyalty.points; balances disagree, bug surfaces far from the write",
      "evidence": "refund.ts:41 `account.points -= order.points`; owner is loyalty.ts:awardPoints()",
      "smallestFix": "call loyaltyService.reverse(orderId); remove the direct write"
    }
  ],
  "grepCommands": [
    "rg -n -i '\\b(request|response|session|cookie|req\\.|res\\.)\\b' src/services src/domain  → refund.ts: none",
    "rg -n -U 'catch\\s*\\{\\s*\\}' src/services src/domain  → none"
  ],
  "archGate": "pass",                     // result of `node scripts/arch-gate.mjs --changed`
  "verdict": "1 finding"                  // "PASS" only when every cell is cleared/n-a with evidence
}
```

Verdict values per cell: `finding` · `cleared` · `n/a`. Every `cleared` and every `n/a` carries a
non-empty evidence/reason (a `cleared` with no source is the lazy-clear the gate rejects — SKILL
non-negotiable #10). Tag vocabulary (`question`, `severity`) is the one taxonomy from SKILL.md
"Categorization"; the gate enforces it.

## Append-only & tamper-evident

- Entries are **only appended** — a prior entry is never edited or deleted.
- The committed `log.jsonl` must be a **clean append** to the base revision: `git diff` of the file vs
  the merge-base changes only by added trailing lines; any edit to an existing line fails the gate.
  Git history is the backing record.
- The `.md` view is regenerated from `.jsonl`; it is never the source and never edited directly.

## `check-arch-review-coverage` — proves a complete review was recorded

Reads `docs/arch-reviews/log.jsonl`, finds the record whose `change`/`scope` matches this change, and
**fails closed** unless all hold. It does **not** judge whether the verdicts are *correct* — only that a
complete, evidenced review exists (see "The honest limit"). Fail-closed conditions:

1. **No matching record** for the change → fail.
2. **A changed code file missing from `scope`/`matrix`** (not every row present) → fail.
3. **Any of the four questions missing** for a covered file (boundary · ownership · dependency ·
   error-handling), plus over/under-engineering where flagged relevant → fail.
4. **Any cell with no `verdict`** → fail.
5. **Any `finding` cell OR any `cleared` cell with an empty/absent evidence source** → fail (the
   lazy-clear catch, #10).
6. **Any finding missing or mis-valued `@question`/`@severity`** (outside the controlled vocabulary) →
   fail.
7. **`grepCommands` not recorded as run** → fail.
8. **The log is not a clean append** (an existing entry was edited/deleted) → fail.

Like the BDD coverage gate, it takes the **changed-file list via an argument/env var** (not only
`git`), so its own discriminating test can feed it a known file set. Ships with a faithful fixture and a
discriminating test: no-op the check and its test must go red (`verifiable-quality-gates`) `[documented]`.

## `check-arch-rules-discriminate` — proves the mechanical layer actually detects

The mutation-test for the reviewer (SKILL non-negotiable #12). It keeps a **planted-violation fixtures
set — one per question**:

- **boundary:** a business rule placed inside a route handler/component.
- **ownership:** one fact written in two tables / a total mirrored next to its rows.
- **dependency:** a `request`/`response`/session object referenced in domain code.
- **error-handling:** a `catch` that returns `null` / is empty.

It runs `arch-gate` (with a config) plus the grep-battery against the fixtures and **fails the build if
any planted violation is not flagged** — a slip-through means detection has silently rotted, or a gate
was no-opped (which makes the gate's *own* test fail). The planted cases `arch-gate` **cannot yet**
catch are exactly the backlog for the encode ratchet (SKILL #11 / mechanism #1): a measurable map of
what judgment still has to carry. It ships with its own discriminating test.

## The honest limit (restated)

These two gates prove a **complete, evidenced review was recorded** and that the **mechanical floor
detects** — not that the reviewer's judgment is infallible. A reviewer can still `cleared` a real
violation, or miss a smell no rule describes; that residual is attacked by the five mechanisms in
SKILL.md "Shrinking the judgment gap" (ratchet, mutation-test, evidence-on-clear, adversarial second
pass, escaped-defect loop), not eliminated. "Structurally impossible" means impossible to skip, sample,
or silently clear — see SKILL.md "The honest limit". `[documented]`
