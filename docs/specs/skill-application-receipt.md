# Skill-application receipt - requirements spec

Status: accepted and built (ADR-0038). The gate is `check-skill-receipt.mjs`, the log is
`docs/skill-receipts/log.jsonl`, the coupling map is `judge-arch/assets/skill-receipt.config.json`, and the
tests are `test/skill-receipt.test.mjs`. Plain language, no em or en dashes (house style). This spec is written
by applying the repo's own skills to itself; the sections below include the receipt for this document, a
pattern selection, the four architecture questions, a threat model, and an evidence ledger, because that is
what this repo asks of a significant design. The design claims below were marked `inferred` while this was a
spec; the gate and its discriminating tests now make them `proven` (see ADR-0038 and the test file).

---

## Receipt for this spec (dogfooding: which skills shaped this document)

This is itself a skill-application receipt, which doubles as a worked example of the format. A human must
review this spec against its reasoning; this receipt does not prove the design is correct.

| Skill | Status | What was pulled, and where it landed in this spec |
|------|--------|---------------------------------------------------|
| enterprise-architecture-standards | applied | single-owner data rule -> the receipt log is the one owner of "what was applied" (section 4, Q2). Resilience -> fail-closed gate (section 5g). |
| pattern-selector | applied | named the design as a Specification/Validator over an append-only audit log, driven by policy-as-data; declined a bespoke per-skill checker and a database (section "Design pattern selection"). |
| architectural-decision-records | applied | this spec feeds ADR for the receipt system (section 10); the four questions are recorded (section "The four questions"). |
| skeptical-audit | applied | every claim carries an evidence state + limitation (section "Evidence and skeptical assessment"); the honest limit is stated up front (section 2) and printed in the receipt itself. |
| owasp-secure-coding-bdd | applied | threat-modeled the gate parsing an untrusted receipt + untrusted diff filenames; path-traversal and injection called out, with the env-safe diff pattern reused (section "Threat model"). |
| verifiable-quality-gates | applied | the gate ships with discriminating, mutation-verified tests (section 9); fail-closed throughout. |
| bdd-comprehensive-testing | applied | the gate, when built, gets a @security Gherkin scenario for a crafted-receipt attempt (threat model + section 10). |
| comprehensive-test-strategy | applied | the test list in section 9 covers happy path, each fail-closed path, and the discrimination cases. |
| judge-arch | applied | the design is run through the four questions (own section) before it is built. |
| universal-accessibility-wcag, universal-browser-device-support, usability-ux-universal-design | not-applicable | this is an internal gate and a design doc, no user-facing UI surface. |
| release-deployment-safety, sre-operational-readiness, compliance-data-lifecycle | not-applicable | no deploy, no runtime service, no personal or regulated data in a spec doc. |

---

## 1. Problem

Selection (a skill's `description` triggers it) and the always-on directive (relevant skills are required to be
considered) raise the odds the right skill fires. Neither makes the agent SHOW, per skill, what it pulled, why,
and where it applied it. So "did it actually apply the usability skill on this feature?" stays unknowable, and a
reviewer has nothing structured to audit against the diff. The receipt converts that into a required,
structured, reviewable declaration, then a human reviews the work against the receipt and the diff.

## 2. Honest limit (stated up front, and printed in the receipt)

A gate can enforce that the receipt EXISTS, is COMPLETE (covers every skill), is WELL-FORMED, and is GROUNDED
(its citations point at real skill text and at files actually in the change). A gate CANNOT verify the receipt
is TRUE (that the agent genuinely applied the guidance) or that the application was GOOD. That is irreducible,
the same limit behind usability and pattern-quality. So the receipt is the agent's self-report, and **a human
must review the work.** The receipt carries that line verbatim, plus a reviewer attestation field. The grounding
checks make a hollow or fabricated receipt mechanically detectable; they do not make a shallow-but-grounded one
impossible, which is why the human review is mandatory.

## 3. Scope

- One receipt per change (per PR), covering every applied-per-change skill: the 16 (13 engineering + 3
  requirements). `bootstrap` is tooling, not a per-change discipline, so it is excluded (open decision 8a).
- Append-only and tamper-evident, like `docs/arch-reviews/log.jsonl`.

## 4. Receipt format

Append-only JSONL at `docs/skill-receipts/log.jsonl`, one entry per change, keyed by a change ref, mirroring the
arch-review log:

```
{
  "change": "<branch or short description, matches the PR>",
  "date": "YYYY-MM-DD",
  "author": "<who/what produced the change>",
  "humanReviewed": { "by": "<name>", "date": "YYYY-MM-DD" } | null,
  "skills": {
    "<skill-name>": {
      "status": "applied" | "not-applicable",
      "why": "<reasoning; for not-applicable, why it does not apply>",
      "what":   "<guidance pulled>",                          // applied only
      "where":  ["<file in the diff>", ...],                   // applied only
      "anchors":["<skill-name>/SKILL.md#a-real-heading", ...], // applied only
      "quotes": ["<a short exact snippet from the cited section>", ...] // applied only
    }
  }
}
```

Plus a verbatim human-review banner on the file: "This receipt is the agent's self-report. A human must review
the work against the diff. It does not prove the work was done or done well."

## 5. Anti-hallucination design (structural grounding, enforced by the gate)

`check-skill-receipt.mjs` (dependency-free, fail-closed, discriminating test) verifies, for the change:

a. **Completeness.** Every one of the 16 skills has an entry with a valid `status`. A missing skill fails. This
   kills "it never even considered usability."
b. **Anchor existence.** Every `applied` entry's `anchors` resolve: the skill file exists and the cited heading
   is really in it. A fabricated section fails.
c. **Quote match.** Every `applied` entry's `quotes` actually appear in the cited skill file (a run of at least
   N exact words, the OWASP verbatim gate in reverse: prove you read it). A fabricated quote fails.
d. **Diff binding.** Every `applied` entry's `where` files are in the actual change diff (CI passes the
   changed-file list, like routing). Claiming you applied a skill to a file not in the change fails.
e. **Routing coupling.** If a routing surface rule fires (for example a UI change), the corresponding skill(s)
   must be `applied`, not `not-applicable`. Removes the escape of marking everything not-applicable.
f. **Human-review attestation present.** The banner line is present and `humanReviewed` is a required field a
   human fills; the gate does not fabricate its truth.
g. **Fail-closed** on a missing/malformed receipt, unknown skill, invalid status, empty required field; and the
   committed log must be a clean append to the base revision.

Net: to pass, a receipt must name real skill sections, quote them accurately, and point at files really in the
change, applied-not-N/A on every triggered surface. You cannot fabricate it without doing the reading. It still
does not prove the work is good: human review.

## 6. Enforcement model

- **Required by the contract now:** the always-on directive, every skill's Definition of done, the PR template.
- **Gate ships now,** runnable + discriminating-tested (in `npm test`).
- **The diff-driven, merge-blocking CI job is DEFERRED** to the techfleetnetwork CI/CD release (per the "no new
  CI checks right now" decision), like routing and review-coverage. The engine is enforced in-repo; the
  auto-block is wired later.

## 7. How it fits the other skills

- **Routing (ADR-0031):** routing says WHICH artifact a change-type must ship; the receipt says WHAT the agent
  pulled from each skill. Coupling (5e) ties them.
- **judge-arch:** the human review half; the receipt is the structured input a reviewer audits against the diff.
- **skeptical-audit:** receipt entries are evidence-bound; the banner is the named limitation.

## Design pattern selection (pattern-selector)

Forces: many disciplines, one change; need a per-skill record that is auditable, tamper-evident, and
grounded in reality; must not duplicate what the routing or per-skill gates already own.

Chosen: a **Specification / Validator** (`check-skill-receipt`) over an **append-only audit log** (the receipt
JSONL), driven by **policy as data** (the routing-coupling map in a config file). This matches the repo's
existing gate shape (routing, arch-review-coverage, verbatim) so it composes and stays dependency-free.

Declined: a bespoke per-skill checker (16 near-duplicate checks: duplication, drifts); a database or service
(no runtime, overkill, breaks the offline rule); embedding the record in commit messages (not structured,
not queryable). Trade-off: the validator proves grounding, not truth; the real guarantee is validator plus
human review, not the pattern. Verified by: the discriminating tests in section 9.

## The four questions (judge-arch) on this design

1. **Boundary.** The gate lives in the enforcement family (`judge-arch/scripts/` or a sibling), next to routing
   and arch-review-coverage; the receipt LOG is a doc artifact under `docs/skill-receipts/`. Logic is not in a
   skill body.
2. **Data ownership.** The receipt log is the single owner of "what was applied per change"; the routing-coupling
   config is the single owner of the surface-to-skill map. No fact is stored twice.
3. **Dependency direction.** The gate reads the receipt, the skill files, and a passed-in changed-file list.
   No web, no database, no request or session. It reuses `routing.yml`'s env-safe way of passing the diff.
4. **Error handling.** Fail-closed (exit 2) on missing, malformed, or incomplete input; append-only history is
   verified against the base revision; nothing is swallowed.

## Threat model (owasp-secure-coding-bdd)

The gate parses an UNTRUSTED receipt (authored by the agent) and UNTRUSTED diff filenames (from the PR):

- Receipt is JSON data: parse and validate, never eval or exec.
- Quote match reads skill files and does a string containment check: no injection, no exec.
- Diff filenames are passed through `env`, not interpolated into a shell (reuse the `routing.yml` fix for the
  GitHub script-injection class).
- **Anchor resolution is the real risk:** a crafted `anchors` path (for example `../../../etc/passwd`) could
  escape the skills dir. The gate MUST resolve anchors only within `.claude/skills/` and reject any path that
  normalizes outside it (path-traversal defense). Quote files are read only from a resolved in-skills path.
- The gate, when built, ships a `@security` Gherkin scenario (per the owasp BDD mandate) for a crafted-receipt
  attempt: a traversal anchor and a fabricated quote must both be rejected.

## Evidence and skeptical assessment (required)

| Claim | State | Source | Limitation |
|------|-------|--------|-----------|
| A gate can enforce the receipt is complete, well-formed, and grounded | inferred | the sibling gates (routing, verbatim, evidence-contract) already do analogous presence/resolution/quote checks | not built yet; this is a design claim until the gate + tests exist |
| The gate cannot verify the work is true or good | documented | the irreducible judgment limit, same as usability and pattern-quality; stated across this repo | which is exactly why human review is mandatory |
| Quote match detects a fabricated quote | inferred | modeled on `check-verbatim` which detects runs of N shared words | an accurate quote from a real section still does not prove the guidance was applied well |
| Diff binding detects a claim about a file not in the change | inferred | the routing gate already consumes the changed-file list | depends on CI passing an accurate diff; a file in the diff for another reason could be cited |
| Routing coupling removes the "mark everything not-applicable" escape | inferred | reuses the routing surface rules | only covers surfaces someone has encoded; a novel surface is not forced |

A human must review the work; this receipt and this spec are self-reports, grounded, not proven.

## 8. Decisions (locked 2026-10-12 by mdenner)

a. **Exclude `bootstrap`** from the receipt (it is the installer, not a per-change discipline). The gate
   derives the skill set from `.claude/skills/` minus `bootstrap`.
b. **Quote match: a run of >= 8 exact words, >= 1 quote per `applied` skill**, and the quote must appear in
   the cited skill file. This is the strongest grounding (OWASP-verbatim-gate in reverse).
c. **`not-applicable` entries carry only a `why`** (no anchors/quotes/where).
d. **Routing-coupling map (starter):** UI change -> universal-accessibility-wcag + usability-ux-universal-design
   + universal-browser-device-support; auth/input/secrets -> owasp-secure-coding-bdd; any behavior change ->
   bdd-comprehensive-testing + comprehensive-test-strategy; schema or architectural decision ->
   architectural-decision-records. A triggered surface forces `applied`, not `not-applicable`. Each gap found
   later becomes one more rule.
e. **Derive the skill set from `.claude/skills/`** (accurate by construction), excluding `bootstrap`.
f. **One receipt entry per PR, keyed on the branch**, matching the arch-review log convention.

## 9. Discriminating tests the gate must carry

1. A complete, grounded receipt -> pass (exit 0).
2. A missing skill entry -> fail.
3. An `applied` entry citing a non-existent anchor -> fail.
4. An `applied` entry whose quote is not in the cited skill -> fail.
5. An `applied` entry naming a file not in the diff -> fail.
6. A triggered routing surface marked `not-applicable` -> fail (coupling).
7. A traversal anchor (path outside `.claude/skills/`) -> fail closed (threat model).
8. Invalid status / unknown skill / empty required field / missing or malformed receipt -> fail closed (exit 2).
9. A non-append-only edit to the log -> fail.
Each proven to discriminate (mutation-verified where feasible), per verifiable-quality-gates.

## 10. Deliverables (when built)

- `docs/specs/skill-application-receipt.md` (this spec, finalized).
- `check-skill-receipt.mjs` + `assets/skill-receipt.config.json` (the coupling map) + `docs/skill-receipts/log.jsonl`
  (seeded with this change's own receipt).
- `test/skill-receipt.test.mjs` (section 9).
- A `@security` scenario for the crafted-receipt case.
- Wiring: always-on directive line, each skill DoD line, PR template checklist item.
- An ADR for the receipt system.
- README: a short section + the receipt in the "how a skill gets chosen and enforced" flow.

---

## 11. Per-task receipts outside a repo (ADR-0097, issue #177)

The receipt above is one entry per pull request. Work done in a folder that is not a git repo never has a PR,
so it never gets a checked receipt. In the audited session a receipt from the day before was copied unchanged
into every build, and the free-form receipts that were written could not be checked. The per-task receipt fixes
this: one grounded entry per task, stored outside the work folder, tied to the hashes of the files the task
changed. It reuses the same grounding logic (a quote of at least 8 exact words, verbatim under a real heading of
the cited skill), extracted into `receipt-grounding.mjs` so the PR gate and the per-task gate decide "grounded"
the same way.

### Schema (one JSON object per line)

```
{
  "task_id": "<stable id for this task>",
  "session_id": "<the agent session>",
  "created_at": "<ISO timestamp>",
  "changed_files": [ { "path": "<repo- or work-relative path>", "sha256": "<hash at task time>" } ],
  "skills": [
    {
      "name": "<skill>",
      "verdict": "applied" | "not-applicable" | "waived",
      "heading": "<a real heading slug in the skill's SKILL.md>",   // applied
      "quote": "<>= 8 exact words from under that heading>",        // applied
      "skill_file_sha256": "<hash of the installed SKILL.md read>", // applied (optional but checked when present)
      "files": [ "<paths in the change this skill was applied to>" ],// applied
      "why": "<reasoning>", "what": "<guidance pulled>",            // optional, carried into export
      "waiver": { "reason": "", "approver": "", "expires": "YYYY-MM-DD" } // waived
    }
  ],
  "checkers": [ { "command": "<checker run>", "exit": 0, "output_sha256": "<hash of its output>" } ]
}
```

### Store

`~/.claude/esk/receipts/<session_id>.jsonl`, outside any work folder so a cleaned Temp cannot lose it.
Append-only, one file per session, so two sessions in the same folder never overwrite each other.

### The gate (`task-receipt.mjs check`)

Reuses the grounding logic of `check-skill-receipt` and refuses a task's receipt (exit 2, which blocks the task
from ending) when: the file is empty; a file the task changed is not covered (full check, never a sample); a
recorded file hash differs from the file's current hash (stale or copied); an `applied` quote is not verbatim
under its cited heading of the installed skill; the recorded `skill_file_sha256` does not match the installed
SKILL.md; an `applied` entry points at a file outside the change; a required skill in the selection is not
`applied`; or a waiver is missing or expired. A valid, grounded receipt whose hashes match the current files is
accepted. `task-receipt.mjs export` turns the per-task entries into the section-4 PR format when the work later
becomes a pull request.

### Honest limit

Same as section 2: a grounded per-task receipt proves real quotes, the right files, and current hashes. It does
not prove the work was good. A human still reviews. And like the PR gate, turning "accepted" into "the task
cannot end" is the finish-check hook's job (issue #174), which must itself fail closed because Claude Code hooks
fail open by default.
