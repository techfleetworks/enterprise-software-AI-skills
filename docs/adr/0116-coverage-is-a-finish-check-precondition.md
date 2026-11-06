---
status: "accepted"
date: 2026-11-06
decision-makers: mdenner
---

# 0116 - Coverage is a finish-check precondition, authorized through Claude's permission layer

ADR-0115 built `esk-genesis --check`, a read-only verdict a consumer can wire into its OWN CI. ADR-0110
designed the org-wide bot that would push the gates onto every repo, but it is an org actor that cannot live
in this repo. Both left the same hole open (issue #203 gap 2): a repo that adopted the skills but never wired
`--check` into CI, and never got genesis'd, is still un-gated and nothing in Claude's own layer notices. This
ADR closes that hole where the work actually happens: the agent's session. It makes gate coverage a fail-closed
precondition inside `finish-check`, so a file-changing Claude task in an adopted repo cannot end silently while
the repo is un-gated or drifted.

## Context and Problem Statement

- `[observed]` `always-on/finish-check.mjs` is a `Stop`/`SubagentStop` hook that already holds a file-changing
  task until its skills-formula proof exists, fails closed, and escalates after `ESK_BLOCK_CAP` blocks. It is
  the one place in Claude's own layer that can block a turn from ending.
- `[observed]` `esk-genesis --check` (ADR-0115) owns the verdict "is this repo covered and current": exit `0`
  covered, `1` un-gated or drifted, `2` cannot assess (fail closed). Nothing re-derives that fact.
- `[observed]` A consumer wires `--check` into CI only if someone remembers to. `always-on/README.md` records
  the honest limit: "No single path covers every session," and a machine that never adopted the repo is reached
  by nothing it commits. So coverage was left to discretion exactly where discretion fails.
- `[inferred]` The guarantee must bind the agent's own work without re-deriving "covered" and without nagging
  repos that never opted in. Re-deriving coverage would be the two-owners drift the architecture gate exists to
  stop; nagging unrelated repos would train operators to rip the hook out, which removes the guarantee
  everywhere.

## Considered Options

- **Option 1: make coverage a precondition inside `finish-check`** that delegates the verdict to
  `esk-genesis --check`, scoped to adopted repos, waivable by the operator, and subject to the existing
  block-cap escalation.
- **Option 2: a new standalone `Stop` hook** dedicated to coverage.
- **Option 3: a `SessionStart` nudge only** (the shape of the existing `enforcement-nudge.mjs`).
- **Option 4: leave it to the org bot (ADR-0110).**

## Decision Outcome

Chosen: **option 1**. Coverage joins the same `missing[]` list every other finish-check precondition uses, so
it inherits the block path, the fail-closed behavior, and the loop-safety escalation with no new control flow.

- `[proven]` **Adoption gate (finish-check owns "should this repo have gates").** The coverage check fires only
  when the repo shows an in-repo opt-in signal: a repo-level `.claude/.esk-installed` marker (written by
  `esk-init`, so "someone turned the skills on in THIS repo") or a `.github/workflows/enterprise-gates.yml`
  (the travelling gates were adopted). A repo with neither returns no coverage problem, so a machine with a
  user-level enforce install never nags an unrelated repo. This is orchestration, not a second coverage owner:
  it decides WHETHER to ask, not what "covered" means.
- `[proven]` **Verdict (delegated to the one owner).** When the adopted repo has no `gate-manifest.json` at all,
  finish-check reports it un-gated directly (a coarse, source-free precondition: there is nothing to verify). When
  a manifest is present, finish-check runs `esk-genesis --check` and maps its exit: `0` passes, `1` is a drift
  block, `2` or a spawn error is a fail-closed block. It prefers the repo's OWN mirrored `esk-genesis` when
  present (so the verdict matches what the repo's own CI would show), else its sibling copy.
- `[proven]` **Authorization through Claude's own layer.** The block clears two ways, both existing permission
  structures. The agent runs `esk-genesis --yes`, which installs the gates; running the installer is a tool call
  the human approves through Claude Code's normal permission prompt (or a pre-authorized auto mode stands in for
  it). Or the OPERATOR records a coverage waiver. The agent cannot clear its own block by waiving: a waiver
  counts only from the separate operator waivers file, `by:"operator"` with a reason (the same
  agent-cannot-self-waive property, and the same honest limit, as every other finish-check waiver, ADR-0101).
- `[proven]` **Waiver lifetime.** A coverage waiver carries an optional `date` and lapses after
  `ESK_COVERAGE_WAIVER_TTL_DAYS` (default 30; `0` means never). A one-time "ship it anyway" cannot silently
  become permanent: the block returns when the waiver lapses. A missing or unparseable `date` with a non-zero
  TTL fails toward enforcement (the waiver does not count).
- `[proven]` **Fail-closed and loop-safe.** Any error computing coverage is a block, not a skip. Coverage
  problems ride the existing escalation: after `ESK_BLOCK_CAP` blocks the turn ends with a recorded
  "shipped with these still missing" message naming the coverage gap, so the agent never wedges and the operator
  sees a loud, recorded "shipped ungated" decision rather than a silent pass.

Option 2 was rejected because a second `Stop` hook would duplicate finish-check's block, fail-closed, and
escalation logic. Option 3 was rejected because a nudge is advisory: it cannot hold a turn, which is the whole
ask. Option 4 was rejected because the bot cannot live in this repo and does not bind the agent's session where
the change is being made; the two are complementary, not substitutes.

### Consequences

- Good, because `[proven]` an adopted repo's un-gated or drifted state now holds the agent's turn in Claude's
  own layer, with one owner of "covered," no nag on unrelated repos, and a humane operator escape.
- Good, because the change reuses finish-check's block, waiver, escalation, and the existing `esk-genesis --check`
  verdict; it adds one precondition, not a new subsystem.
- Neutral: coverage is checked per file-changing task end. The cost is one `existsSync` plus, only when a
  manifest is present, one `esk-genesis --check` spawn.
- Bad, because the guarantee binds Claude-driven work only. A human editing with raw `git` outside a Claude
  session is not held; that is the same scope limit as every finish-check precondition, stated below.

### Confirmation

`test/finish-check-coverage.test.mjs` (discriminating, mutation-proven: neutering the coverage check to a no-op
reds the un-gated, drift, and fail-closed cases); `features/always-on/coverage-precondition.feature` (executed
by `npm run test:bdd`, driving the real finish-check against gated, ungated, adopted, waived, and unenrolled
fixtures); and the fresh-context judge-arch review recorded in `docs/arch-reviews/entries/`.

## What this does not fix, said plainly

- `[documented]` It binds Claude-driven, file-changing work. A human (or a non-Claude agent) committing with raw
  `git` outside a session is not held. The server-side required check (the bot, ADR-0110, or a wired
  `esk-genesis --check`) is what covers that path; this is the session-layer half.
- `[documented]` The one irreducible human act remains: someone must turn the skills on in the repo or on the
  machine (`esk-init --enforce`, or adopt the gates). An un-enrolled machine has no local block. That single act
  is the authorization the whole guarantee rests on, by design, not a gap to be automated away.
- `[documented]` A waiver's `by:"operator"` marker is enforced by reading a separate operator file, not by
  physically preventing the agent from writing one (`.claude` is agent-writable, ADR-0101). A forged waiver is
  made visible by `session-setup` listing every waiver in effect, not prevented. OS-level managed settings are
  the stronger tier (`always-on/README.md`).
- `[documented]` The drift half rides `esk-genesis --check`, whose verdict depends on install topology: when the
  repo's own mirrored installer is used the verdict is "installed gates match this repo's committed manifest";
  when only the sibling copy is available the verdict can fold in "behind the installing clone's version." The
  un-gated (absent) half is source-free and has no such dependence. A repo that wants the strict same-version
  verdict mirrors its skills (`esk-init --skills`).
