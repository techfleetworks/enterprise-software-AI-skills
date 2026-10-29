# The evidence discipline - the shared contract every skill depends on

This is the **single, canonical contract** for how every skill in this repo backs a factual claim. It is
owned here once so it cannot drift; other skills **link** to it rather than restating it. It makes the
discipline this repo used to audit *itself* - an evidence state, a re-runnable source, a named
limitation, and an adversarial "hunt the disconfirming case first" pass - a universal, enforced
requirement, not an opt-in nicety.

> `skeptical-audit/SKILL.md` is the full method (the skeptic's loop, banned moves, examples);
> `references/evidence-states.md` is the states in depth + the worked audit + the recovery protocol.
> This file is the **contract**: the taxonomy, the required ledger, and the per-skill obligation that
> `check-skill-evidence-contract` enforces.

## 1. The evidence-state taxonomy (strongest → weakest)

| State | Means | How it is earned |
|---|---|---|
| **`proven`** | Mechanically guaranteed to keep holding - a committed, **discriminating** test or CI gate enforces it on every future change. The only state that survives regression *by construction*. | A gate exists, is in the required/blocking set, and has a discriminating test (no-op the check → its test fails), per `verifiable-quality-gates`. |
| **`observed`** | You ran it and saw the result **this session**. | Attach the exact command + output + exit code / query + rows / `file:line` / hash + timestamp. |
| **`inferred`** | A deduction from `observed` facts. | Name the facts and say it is a deduction (don't launder `documented`/`inferred` premises into fact). |
| **`documented`** | A doc, spec, comment, or config asserts it (intent, not running reality). | Cite path + section/line, or URL + retrieval date + the quoted line. |
| **`reported`** | A person or third-party tool stated it. | Attribute the source; it's a claim, not a fact. |
| **`not-assessed`** | You did not check. **Never a pass** - a gap stated out loud. | Name the measurement that would upgrade it. |

### The promotion rule
You may move **down** this list for free; moving **up** requires a **new measurement**. Specifically:
`documented`/`reported`/`inferred` → `observed` needs you to actually run it this session; **`observed`
→ `proven` needs a committed, discriminating gate** that keeps it true on every change. "It's probably
right" is never a promotion.

## 2. The required output - the evidence ledger

No skill reports a load-bearing verdict without appending a ledger (template + worked example in
`evidence-states.md`):

```
| Claim (falsifiable) | State | Source (re-runnable) | Limitation (not checked) |
```

Plus, for each load-bearing claim, a **Conformance vs adequacy** line (does it follow the rule *and*
does the rule deliver the outcome?), and an **Open gaps** list - the `not-assessed` rows restated as the
next measurements.

## 3. The adversarial loop (run before emitting any verdict)

1. Write the claim as **one falsifiable sentence**.
2. **Hunt the disconfirming input/path/environment first** - not the one where it works.
3. **Measure** (command + exit code / query / diff / `file:line` / hash / URL + date).
4. **Tag the state + the limitation**; split conformance from adequacy.
5. If you couldn't measure it, **downgrade** - never reach for a hedge-word.

**Teaching example (a confirming probe hides what a disconfirming probe exposes):** the audit that
built this repo nearly filed "ReDoS not reproduced" for `arch-gate.mjs` because its first probe used
*unterminated* `/*` comments (ran in 0.1 ms). The disconfirming probe - balanced `/* x */` pairs + a
trailing char forcing the final `}` to fail - hung **>5 s on ~400 bytes**, confirming catastrophic
backtracking. A weak input is a false-negative trap; every empirical claim must use an input strong
enough to trigger the failure.

## 4. The rule: no verdict without a ledger

No skill may output **"done / secure / tested / safe / fixed / passes / fits / complete"** without the
ledger attached and its central claim at `observed` or `proven` (or an explicit `not-assessed` + what
would upgrade it). A verdict pitched above its evidence is the exact failure this repo exists to prevent.

## 5. The per-skill obligation (what `check-skill-evidence-contract` enforces)

Every `SKILL.md` must carry a section titled exactly:

```
## Evidence & skeptical assessment (required)
```

that (a) **links to this contract** (`skeptical-audit/references/evidence-discipline.md`), (b) states
the skill's own central claims and the measurement that earns each `observed`/`proven` (a claim →
proof map), and (c) carries the **evidence ledger** in its Definition of done. Link, don't
copy - one owner, per the repo's data-ownership rule. The `check-skill-evidence-contract` gate
(`skeptical-audit/scripts/`) mechanically enforces that the section is present, the contract link
RESOLVES on disk, and the ledger phrase is there; it does NOT verify that the claim -> proof map is real
or sound, which stays a judge-arch and human review. A shrink-only allowlist tightens to 100% as each
skill adopts the contract.

## 6. "fixed" and "verified" mean something specific (do not use them loosely)

Two of the words from section 4 carry a defined bar. Saying them without the record is the smoke the
`claim-lint` rules below raise.

- **Fixed.** A defect is **fixed** only when a committed test is **red on the code before the fix, green
  after it, and red again when the fix is reverted**. Each of the three runs is recorded with its command
  and exit code. The red-on-revert run is what proves the test can detect the fix being lost; without it,
  "fixed" is `not-assessed`, never a pass. Red-on-revert proves the test detects the regression, not that
  the fix is complete.
- **Verified.** A claim is **verified** only when a **re-runnable command, its exit code, and an output
  hash** are in the receipt. "I verified it" with nothing another person can re-run is `reported`, not
  `observed`.
- **A green suite proves only the cases it contains.** A claim backed by a passing suite names the cases
  that cover it and lists the input shapes it does **not** check as `not-assessed`. A suite that passes
  while an untested shape is broken is the trap (an event with a full day, month, and year answered
  "UNKNOWN" while 75 cases stayed green).
- **An unexplained pass is not a fix.** If a test that was failing now passes and no edit was aimed at it,
  revert each edit in turn and name the one that turns it red again. Until then the pass is `not-assessed`.
- **A HIGH review finding blocks "done".** Work is not `done` while a `judge-arch` HIGH (or critical)
  finding is open. Fix it, or record an operator waiver (reason, approver, expiry), first.

These are enforced as smoke alarms by `claim-lint`: `fixed`/`resolved` need a revert record; an agent's
`verified` claim ("I verified", "we verified", "verified that") needs a command + exit + hash record or at
least an inline evidence state; a suite-backed claim needs its cases + not-checked shapes; and `done` is
flagged while an open HIGH is named in the same report. The receipt bar for `verified` is still the full
command + exit + hash (the smoke alarm is deliberately lenient, catching only the bare word with no
grounding at all). From the structured review log, `judge-arch/scripts/check-open-high-findings.mjs` blocks
"done" over an open HIGH. A smoke alarm is not a judge: it catches the loose word, not the subtle gap, so
the loop above still owns the subtle ones.

## 7. Mistakes before and around a claim (not only in the claim itself)

The discipline reaches the decisions made before a claim is written, and how a claim is framed.

- **Observe who owns a behavior before building on it.** Before you build on "module A handles Y", search
  for the owner of Y and run Y through the system; record the observed owner (`file:line` plus the run
  output) in the plan. An ownership assumption with no observed-owner record is a guess, not a fact.
- **Declare the headline before you measure.** Name the headline metric and its cut before measuring, then
  report every cut with what each one counts. Headlining the most favorable number after the fact is
  cherry-picking, even when every number is real.
- **Every downgrade names its next step.** Lowering a claim's state is the deliverable, but it names the
  measurement that would raise it and who will take it, and it is not the last line of the work.
- **"Done" needs a mostly-observed majority.** A status row whose evidence is mostly inferred cannot be
  marked done. Show "N of M observed" instead, and re-check the inferred records before claiming done.
- **A comparison needs a measurement.** "A is safer / better / more reliable than B", or calling something
  "the primary control", is a claim: it carries an evidence state and a cited measurement, or it is not
  asserted.

`claim-lint` raises each of these as a smoke alarm (an ownership assertion with no owner record or state;
a downgrade with no next step; a headlined "most favorable" cut; "done" while the `N observed` and `N
inferred` counts stated with the claim show inferred in the majority; an unmeasured "safer/better than"
comparison). The receipt and the fresh-context review still own whether the judgment behind each was sound.
