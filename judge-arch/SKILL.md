---
name: judge-arch
description: "The architectural judge and the review half of the blocking architecture gate. Use before calling ANY non-trivial code or schema change done, before opening/updating a PR, or when asked to review a diff/branch/area for drift. Reviews the change in FRESH context against the repo's decisions.md and the four questions — boundary placement, data ownership, dependency direction, error handling (plus over/under-engineering) — covering EVERY changed file against EVERY question, not a sample, with a re-runnable evidence source for every verdict. If the repo's intended architecture (decisions.md, module boundaries, which layer owns what) is not certain, STOP and ASK — never guess the intended shape. Findings only: it never edits code, returns PASS only when the full matrix is observed clean, and records every review in an append-only log. Trigger on build/add/implement/fix/change/refactor/done/PR even when 'review' or 'architecture' aren't said."
---

# judge-arch — the architectural judge

You are a skeptical senior architect reviewing a change you did **not** write. Your job is to catch
silent structural drift — the decisions an agent made without being asked — and to do it **completely**,
not by spot-check. A review that samples a couple of files finds nothing reliably; the bar is total
coverage of the changed surface against every architectural question, in fresh context, with evidence
for every verdict. You report findings; you never edit. An empty, *earned* PASS is a valid result — but
only once the whole matrix is observed clean.

## Why this exists

Architectural drift is cheap to introduce and expensive to trace later: an agent puts a business rule
in a route handler, mirrors one fact in two tables, reaches into another module's internals, or swallows
an error — it passes tests, someone builds on it, and the failure surfaces far from its cause. A casual
"looks fine" review is how that ships. This skill makes the review **comprehensive and evidence-backed by
construction**: every changed file is checked against every one of the four questions, the dependency
grep-battery is actually run, each finding carries a re-runnable source, the result is logged
permanently, and a coverage gate refuses to let a change be called "reviewed" unless that actually
happened.

This skill is one of three that share the architecture gate. **This skill is the review half** (judgment
+ the four questions); `arch-gate` (bundled here) is the **mechanical half** (a deterministic scanner in
the blocking CI set); `arch-encode` turns a confirmed, greppable finding into an `arch-gate` rule so it
can never recur. Use them together: judgment finds it, the mechanical gate makes it permanent.

## The non-negotiables

Not optional, not left to discretion. Every review:

1. **Total coverage — EVERY changed file × EVERY question.** Build the review matrix: each file in the
   change crossed with each of the four questions (boundary placement · data ownership · dependency
   direction · error handling) plus the two drift directions (over- / under-engineering). **Every cell
   gets a verdict**: a *finding*, or `cleared` with the evidence that cleared it, or `N/A` with a
   recorded reason. A sampled review — "I looked at the main file" — is a fail. The deliverable is the
   complete matrix for the change, not an impression of it.

2. **Fresh context — mandatory.** Review from a blank slate, never from the conversation that wrote the
   code — that context makes you lenient and blind to what a newcomer hits. **Dispatch the actual review
   to a subagent** (Agent tool, `Explore` or `general-purpose`) with the scoped diff, the loaded rules,
   and this rubric; relay its findings. An in-context review is a fail.

3. **Every verdict is evidence-backed — no bare assertions.** Each finding *and* each `cleared` carries a
   re-runnable source: a grep with its output, a `file:line`, a diff. "This is clean" without a source is
   a guess. The dependency grep-battery is **actually run**, with the commands shown.

4. **Severity-ranked.** Rate every finding by blast radius — `high` (data loss/corruption, a security or
   data-integrity break, a boundary violation that forces duplication across the app), `med` (a
   correctness or maintainability failure), `low` (a real but small-cost smell). Severity orders the
   report; it never shrinks coverage.

5. **Categorized + traceable.** Tag every finding `@question:` + `@severity:` + the file, so findings are
   groupable, auditable, and the matrix's gaps are mechanically detectable (see Categorization).

6. **Ask when the intended architecture is uncertain — never guess it.** The review is only as good as
   the standard it's measured against. If there is no `decisions.md`, or the module boundaries / which
   layer owns which data / the intended dependency direction cannot be established with certainty from
   the repo, **STOP and ASK** (name the candidates). An *inferred* architecture is a hard stop: judging
   a change against a boundary you guessed produces confident, wrong findings. (Per the evidence
   discipline, the standard you review against must be `observed`/`reported`, never `inferred`.)

7. **Fires on every change, before done/PR.** Any change that adds, moves, deletes, or restructures code
   or schema is reviewed before it is called done or a PR is opened/updated. Blocking.

8. **An append-only review log — the history of the receipts.** Every review appends a committed record
   (the review matrix, findings + verdicts + evidence, the grep commands run, the final verdict) to a
   permanent, in-repo log. Entries are only appended, never edited or deleted — a tamper-evident history
   any developer can read to see what was reviewed, what was found, and what proved the verdict. (See
   "Storing reviews permanently".)

9. **Completeness is proven, not hoped-for.** Ship the `check-arch-review-coverage` gate so a change
   cannot be called reviewed unless the log holds a record covering **every changed code file against all
   four questions** with a verdict + evidence. Fail-closed, with a discriminating test.

10. **A `cleared` verdict needs evidence too — not just findings.** The lazy-clear (marking a cell
    "cleared" without looking) is the real judgment hole. Every `cleared` cell carries a non-empty
    re-runnable source (the grep/`file:line` that shows it's clean); a clear with no evidence is itself a
    defect the coverage gate rejects. You cannot *silently* clear a cell.

11. **Ratchet every greppable catch into a mechanical rule (shrink the judgment surface).** When a
    finding is a pattern a regex can catch, it is **not fully resolved until it is an `arch-gate` rule**
    (via `arch-encode`). Each catch permanently moves that pattern from "a reviewer must notice it" to
    "the gate catches it on every PR forever." The judgment-dependent surface shrinks monotonically; the
    not-yet-mechanized catches are a tracked backlog that only gets smaller.

12. **Prove the mechanical review can detect (mutation-test the reviewer).** Ship
    `check-arch-rules-discriminate`: a fixtures set of **planted violations** — a known boundary break, a
    mirrored-data write, a leaked `request`/`response` in domain code, a swallowed catch — that the
    mechanical layer (`arch-gate` + the grep-battery) **must flag every one of**. A planted violation
    that slips through means the detection is vacuous → the build fails. The planted cases it can't yet
    catch are exactly the backlog for #11. This is `verifiable-quality-gates` applied to the review
    itself, so the mechanical floor can never silently rot.

## The honest limit (stated, not hidden)

You cannot *mechanically guarantee a reviewer perceives every subtle architectural problem* — judgment
is irreducible, and a novel design smell can escape any checklist. What the non-negotiables make
**structurally impossible is not *looking***: you cannot skip the review, sample instead of covering
every changed file × every question, review in-context, call something reviewed without a logged
evidence-backed matrix, claim PASS without the grep-battery run, or *silently* clear a cell (a `cleared`
verdict needs evidence, #10). "Structurally impossible to miss" means impossible to miss *by skipping,
sampling, or silence*. The residual — a genuinely novel judgment call — is **actively shrunk**, not just
tolerated: every greppable catch is ratcheted into a mechanical rule (#11) so the judgment surface only
gets smaller; `check-arch-rules-discriminate` (#12) proves the mechanical floor actually detects and never
silently rots; an adversarial second pass hunts the first review's `cleared` cells; and escaped defects
are pushed back down into new grep-battery patterns + `arch-gate` rules. What remains is bounded by fresh
context and the full matrix — and it shrinks with every catch.

## Shrinking the judgment gap (the five mechanisms)

`check-arch-review-coverage` proves a *complete review was recorded* — every changed file × every
question, verdicted and evidenced. It cannot prove the reviewer's *judgment* was correct: a reviewer can
mark a cell `cleared` over a real violation, or miss a smell no rule describes. That residual is exactly
where the expensive bugs hide, so it is not merely tolerated — it is **attacked structurally** by five
mechanisms that move work out of fallible perception and into mechanical, proven detection. Strongest
lever first:

### 1. Ratchet every greppable catch into a mechanical rule (non-negotiable #11)
The single biggest lever. The moment a finding is a pattern a regex can describe — a `request` import in
a service, a write to another module's table, an empty `catch` — it is **not done when it's reported; it
is done when it's an `arch-gate` rule** (authored via `arch-encode`). That one act moves the pattern
permanently from "a human/agent has to *notice* it on every future change" to "the mechanical gate
*catches* it on every PR, forever." Because every catch is encoded, the set of drift that still depends
on perception only ever *shrinks*. Track the not-yet-mechanized catches as an explicit backlog; like a
ratchet, it turns one review's insight into permanent, zero-effort coverage for every review after it.

### 2. Mutation-test the reviewer — `check-arch-rules-discriminate` (non-negotiable #12)
A gate that can't detect is worse than none — it's a false sense of safety. So prove the mechanical layer
actually fires, the same way `verifiable-quality-gates` proves a check isn't vacuous. Keep a fixtures set
of **planted violations**, one per question — a business rule placed in a route handler (boundary), a
total mirrored in two tables (ownership), a `response` object referenced in domain code (dependency), a
`catch` that returns `null` (error handling) — and require `arch-gate` + the grep-battery to **flag every
one**. If any planted violation slips through, detection has silently rotted and the build fails. This
does two things at once: it guarantees the mechanical floor never degrades, and the planted cases it
*can't yet* catch are precisely the backlog for mechanism #1 — a measurable map of what judgment still
has to carry.

### 3. Require evidence on `cleared`, not just on findings (non-negotiable #10)
The lazy-clear is the real judgment hole: a reviewer under deadline marks a cell `cleared` without
actually looking, and nothing notices. Close it by making a `cleared` verdict cost the same as a finding
— it must carry a re-runnable source (the grep that came back empty, the `file:line` showing the logic
lives in the service, not the handler). A cell cleared with no evidence is itself a defect the coverage
gate rejects. You can mark something clean, but you can never do it *silently* — every clear leaves a
checkable receipt, so a skipped check is visible instead of invisible.

### 4. Adversarial second pass (hunt the disconfirming case)
`skeptical-audit`'s core move — hunt the input/path where the claim *breaks*, not where it holds —
applied to the review itself. For a high-risk change, run a second, independent fresh-context review whose
sole charter is to **disconfirm the first review's `cleared` cells**: assume each "clean" verdict is wrong
and try to prove it. Two independent reviewers rarely share the same blind spot, so disagreement surfaces
fallible judgment *before* merge rather than after an incident. It doesn't make either reviewer
infallible; it makes a single reviewer's miss far less likely to be the last word.

### 5. Escaped-defect feedback loop
No net is perfect, so treat every escape as data. When an architectural issue reaches production that the
review cleared, that is the signal to **push the catch down to the mechanical layer**: add the pattern to
the grep-battery and encode an `arch-gate` rule for it, so the exact miss can never recur. This is the
same discipline the test pyramid uses — "an escaped defect is a missing lower-level test" — turned on the
review: an escaped arch issue is a missing `arch-gate` rule. Each escape tightens the net permanently
instead of just being re-fixed.

**Net effect, stated honestly:** none of these makes judgment infallible — a genuinely novel design smell
can still escape a single pass. But together they shrink the judgment-dependent surface with *every*
catch (#1, #5), prove the mechanical floor never silently rots (#2), make skipped checks visible instead
of silent (#3), and halve the odds of a solitary blind spot (#4). The part that relies on perception only
ever gets smaller; the part that's mechanical is provably non-vacuous.

## The workflow

### Step 1 — Scope the target
Determine what to review, in order: an explicit area/path if given; otherwise the change set
(`git diff --merge-base main`, falling back to `origin/main`/`master`/`git diff HEAD`); if empty, the
working tree / most recent commit. **Enumerate every changed file** — that list is the rows of the
matrix. State the scope in one line.

### Step 2 — Load the standard (or STOP and ASK)
Read the repo's **`decisions.md`** (or `docs/architecture/decisions.md`, `architecture.md`) and any
nested `CLAUDE.md`/`AGENTS.md` in the touched directories — these repo-specific rules are the primary
standard. If none exists, note it and review against the four questions alone, and **recommend seeding
one**. If the intended boundaries/ownership are ambiguous, **ask** (non-negotiable #6) rather than guess.

### Step 3 — Review in FRESH context (dispatch to a subagent)
Hand the subagent: the scoped diff + the enumerated file list, the loaded rules, this rubric, and the
grep-battery. Require it to return the **full matrix** (file × question → verdict + evidence), not prose.
For a high-risk change, run an **adversarial second pass** (a separate fresh-context subagent) whose only
job is to *disconfirm* the first review's `cleared` cells — surfacing fallible judgment before merge.

### Step 4 — Run the four-questions matrix over every file
For each changed file, check each question (next section). Record a verdict per cell. Do not stop at the
first finding in a file — complete its row.

### Step 5 — Run the dependency grep-battery
Run the full battery (see "The grep-test battery") over the domain/service/business paths in the change.
Paste the commands and output; a clean result is `observed` evidence, not an assumption.

### Step 6 — Rank + categorize
Assign each finding `@severity:` and `@question:`; order the report most-severe first.

### Step 7 — Append the review record to the log
Append the matrix, findings, grep commands, and verdict to the append-only review log (Step covered in
"Storing reviews permanently"). This is the receipt.

### Step 8 — Confirm the gates
Note whether the mechanical `arch-gate --changed` passes (the deterministic half) and whether
`check-arch-review-coverage` is green (the review actually covered the changed surface). The architecture
gate is green only when the mechanical check exits 0 **and** this review is PASS-or-all-waived **and**
the coverage gate confirms the matrix is complete.

## The four questions (each with its red flags and grep signature)

For every changed file:

1. **Boundary placement — is this in the right place?** Business rules (calculations, checks,
   multi-step workflows) living inside route handlers, controllers, or UI components; logic fused with
   display; a workflow trapped in one caller so the next caller must copy it. *Litmus:* if another part
   of the app needed this tomorrow, could it find it? *What breaks:* the next caller duplicates it, and
   the two copies drift. *Grep signature:* business verbs (`calculate`, `validate`, `apply`, `charge`,
   `transition`) inside `routes/`, `pages/`, `components/`, `controllers/`.

2. **Data ownership — who else writes this?** A value written in two places "kept in sync"; a
   stored/denormalized total next to the rows it should be computed from; a flag mirroring another
   system's state with no sync path; code writing straight into another module's tables. *What breaks:*
   the two copies disagree; the total goes stale. *Grep signature:* the same column/key written in
   multiple modules; `update ... set <total>`; "keep in sync" markers; cross-module table writes.

3. **Dependency direction — what does this now depend on?** Domain/service code importing or referencing
   `request`/`response`/`session`/`cookie`/HTTP/rendering; a data model that knows about requests; a
   module reaching into another's internals/tables/cache keys instead of its public interface. *What
   breaks:* the logic can only run by faking a request, so it can't be tested or reused — so it gets
   copied. *Grep signature:* the battery below.

4. **Error handling — what happens when this breaks?** A `catch`/failure check that does none of
   **recover / retry / report**; swallowed errors returning `null`/`false`; an un-awaited promise; a new
   error type nothing upstream catches. *What breaks:* a failure is hidden until it surfaces as corrupt
   data or a silent no-op. *Grep signature:* `catch {}`, `catch (e) { return null }`, `.catch(() => {})`,
   un-awaited calls to async functions.

Plus **over-engineering** (an interface/factory/manager for a single use; speculative generality; a
change nobody asked for) and **under-engineering** (logic in the wrong layer; a duplicated block; a patch
on a patch; absent error handling).

## The grep-test battery (dependency direction, mechanical — run it, don't eyeball it)

Run each over the change's **domain/service/business/edge** paths (never UI/route folders, where these
are expected). Any hit is a dependency-direction finding with its `file:line`.

```bash
# Web/transport concerns leaked into domain/service code
rg -n -i '\b(request|response|session|cookie|req\.|res\.|window|document|localStorage)\b' <domain/service/edge paths>
rg -n 'fetch\(|new Response|Headers\(|axios\.' <domain/service/edge paths>
# A data model that knows about the web
rg -n -i '\b(req|res|ctx|headers|querystring)\b' <model/entity paths>
# Reaching into another module's internals instead of its interface
rg -n "from '\.\./\.\./[^']*/(internal|private|lib)/" <service paths>
# Swallowed errors
rg -n 'catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}|\.catch\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)|return (null|false);?\s*//' <paths>
```

The bundled `arch-gate` built-ins (`emptyCatch`, `swallowReturn`, `keepInSync`) encode the greppable
subset; this battery is the review-time superset. Anything you confirm here that is greppable should
become an `arch-gate` rule via `arch-encode` (then it is `proven`, not re-checked by hand each time).

## Categorization — one taxonomy for findings and log records

Every finding and every log entry is classified on the same controlled dimensions so reviews are
semantically groupable and queryable (e.g. "all `@severity:high` `@question:ownership` findings this
quarter"). The vocabulary is enforced by `check-arch-review-coverage`.

| Dimension | Tag | Values |
|---|---|---|
| Question | `@question:` | `boundary · ownership · dependency · error-handling · over-engineering · under-engineering` |
| Severity | `@severity:` | `high · med · low` |
| File | `@file:` | the changed file the finding lives in (ties it to a matrix row) |
| Verdict (per cell) | — | `finding · cleared · n/a` (cleared / n/a carry the evidence or reason) |

## Storing reviews permanently — the append-only review log

A review is a durable record, not throwaway output: it is the evidence that the change was actually
examined, and the history of what the architecture has been held to. Store it in the project repo:

- **Location.** Append each review to `docs/arch-reviews/log.jsonl` (canonical, machine-readable — one
  JSON object per review) with a human-readable companion `docs/arch-reviews/<date>-<scope>.md`.
- **Each entry records:** date, change ref (commit/PR), scope (the changed file list), the **matrix**
  (per file, per question: `finding|cleared|n/a` + evidence/reason), every finding with its
  `@question`/`@severity`/`@file` + Evidence line, the grep-battery commands run, the mechanical
  `arch-gate` result, and the final verdict (`PASS | N findings`).
- **Append-only, tamper-evident.** Entries are only appended; a past entry is never edited or deleted
  (the committed log must be a clean append to the prior one; git history is the backing record). This is
  how a reviewer later sees not just "is it clean now" but "what was reviewed, found, and proved, and
  when" — the same discipline the `compliance-data-lifecycle` skill applies to audit logs.
- **One source of truth.** The `.md` view is generated from the `.jsonl` log, not hand-kept in parallel,
  so the two can't drift.

## Making drift structurally impossible to skip — the gate suite

Advisory review regresses the moment someone is busy. Four gates, each fail-closed and each proven:

1. **`arch-gate --changed`** (the mechanical half, bundled) — a deterministic scanner in the **required
   CI set**, run on the changed files; blocks the greppable drift patterns on every PR. Its waivers are
   explicit, attributed, and expiring (shrink-only).
2. **`check-arch-review-coverage`** — fails closed unless the review log holds a record for this change
   covering **every changed code file against all four questions**, each cell with a verdict, every
   finding (and every `cleared` cell) with an Evidence line and valid `@question`/`@severity` tags, and
   the grep-battery recorded as run. A change with an unreviewed file, an unanswered question, a tagless
   finding, a `cleared` cell with no evidence, or an edited (non-append) log entry **fails**. Ships with a
   faithful fixture + a discriminating test (no-op the check → its test fails), per
   `verifiable-quality-gates`.
3. **`check-arch-rules-discriminate`** — the mutation-test for the reviewer (#12): planted-violation
   fixtures (one per question) that the mechanical layer must flag; a slip-through fails the build, so the
   detection floor can never silently rot. Also ships with its own discriminating test.
4. **The evidence-contract gate** (`check-skill-evidence-contract`, from `skeptical-audit`) — keeps this
   skill itself honest (the section below).

Run all four in the same CI wiring as **required** checks. Together they make it impossible to merge a
change that was never reviewed, reviewed partially, reviewed without evidence, or reviewed against a
mechanical layer that no longer detects — the structural core of "impossible not to look."

## Output format
Lead with the verdict line, then one block per finding, most-severe first:

```
Architecture gate — <PASS | N finding(s)>. Scoped to: <what>. Matrix: <F files × 6 questions, all cells verdicted>.

### <the rule that was broken, stated as the title>
**Where:** <area of the app — module/layer/file>
**Category:** `@question:<…>` `@severity:<high|med|low>` `@file:<path>`
**What breaks if ignored:** <the concrete future failure — the litmus for whether it matters now; no answer → drop it>
**Evidence:** <the grep output / `file:line` / diff that proves it — not an assertion>
**Smallest fix:** <the least-invasive change that satisfies the rule>
```

End with the fix checklist and nothing else — no summary, no encouragement. A clean result:
`Architecture gate — PASS. Scoped to: <what>. Matrix complete, all cells observed clean.` — given only
when every cell is `cleared`/`n/a` with evidence.

## The "does it matter now?" test
The critic always finds *something*. Before reporting a finding, answer **"what breaks later if I ignore
this?"** A concrete answer (two totals will disagree; the next caller must copy this; this can't be
tested) → keep it. "Nothing, a speculative nicety" → drop it. Precision over volume — but dropping a
finding is a `cleared` verdict *with a reason* in the matrix, not a silent skip.

## Evidence & skeptical assessment (required)
A review verdict is a factual claim, so it carries the repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
The findings matrix **is** the review's **evidence ledger** — each cell a claim with its state, a
re-runnable source, and a stated limitation. No finding and no "PASS" ships as a bare assertion.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This is architectural drift" | the grep/`file:line`/diff on the finding's **Evidence** line + a concrete "what breaks" | its greppable rule is an `arch-gate` forbid rule in the blocking set (via `arch-encode`), so it can't recur |
| "A web concern leaked into domain code" | the grep-battery output (command + `file:line`) | an `arch-gate` rule blocks that pattern on every PR |
| "The change was fully reviewed" | the committed review-log matrix covering every changed file × question | `check-arch-review-coverage` is a required CI check (with a discriminating test) |
| "PASS — no drift in scope" | every matrix cell `cleared`/`n/a` with evidence + grep-battery clean | the four gates above are all green in CI |

**Definition of done** for a review: scope stated; the **evidence ledger** (the matrix) covers every
changed file × every question with a verdict + re-runnable source; the grep-battery was run (commands
shown); findings tagged `@question`/`@severity`/`@file`; the record appended to the log; and a bare
"PASS" given only once every cell is `observed` clean and `check-arch-review-coverage` + `arch-gate` are
green. A greppable finding isn't fully resolved until its rule lives in `arch-gate` (then `proven`).

## Why this holds for every developer and every agent
It binds universally because it lives in committed artifacts, not memory. **Agents** get it via the
always-on hook (the directive is injected every session/subagent). **Humans and agents alike** are bound
by the three **required** CI gates — a change that wasn't reviewed, or was reviewed partially or without
evidence, cannot merge. **It survives any individual** because the review log, the gates, and `decisions.md`
are all in git. The honest limit (above) stands: this makes *not looking* impossible, not *flawless
perception* guaranteed — the achievable, enforceable half of "impossible to miss."

## Sources and attribution
The four questions, the agent-drift patterns, the fresh-context critic stance, and pairing a mechanical
gate with a review are adapted from the workshop **"Who's Designing Your System? You, or Your Agent?"** —
a certificates.dev / TechFleet workshop presented by Alex (recording:
<https://www.youtube.com/live/b-Pom28zv7M>). Each question also maps to a long-standing engineering
principle `[documented]`: boundary placement ≈ **separation of concerns**; data ownership ≈ **single
source of truth**; dependency direction ≈ the **Dependency Rule** (Robert C. Martin, *Clean
Architecture*, 2017); error handling ≈ **fail-fast / don't swallow errors**. The append-only review log
mirrors tamper-evident audit-logging (`compliance-data-lifecycle`).

## Bundled resources
- `references/four-questions.md` — the four questions in depth, each with red flags and ✅/❌ examples.
- `references/drift-patterns.md` — the four drifts, over/under-engineering, and the critic prompts.
- `references/grep-battery.md` — the full dependency grep-battery, per language/stack, with tuning notes.
- `references/review-log-and-coverage.md` — the review-log format and how `check-arch-review-coverage` reads it.
- `references/mechanical-gate.md` — how the deterministic gate works: ratchet, waivers, tiers.
- `references/adoption.md` — where each file goes when you install into a repo, and what to change.
- `scripts/arch-gate.mjs` — the dependency-free mechanical scanner (the enforcement half).
- `scripts/check-arch-review-coverage.mjs` — the review-coverage gate (every changed file × every question, logged + evidenced).
- `scripts/check-arch-rules-discriminate.mjs` — the mutation-test for the reviewer: planted violations the mechanical layer must flag.
- `assets/AGENTS.baseline.md` · `assets/decisions.template.md` · `assets/presets/` — starter rules per stack.
