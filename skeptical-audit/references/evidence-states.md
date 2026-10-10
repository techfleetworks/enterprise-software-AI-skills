# Evidence states, the ledger, and a worked audit

Read this when a claim is load-bearing enough that getting the state wrong would mislead someone, or
when you need the full ledger template and a concrete end-to-end example.

## 1. The six states, in depth

| State | Means | How you earn it | Fails when |
| --- | --- | --- | --- |
| `proven` | A committed, **discriminating** test or CI gate keeps it true on **every future change** | Wire the check into the required/blocking set and give it a discriminating test (no-op the check → its test fails), per `verifiable-quality-gates` | The gate isn't blocking, or its test still passes when the check is no-opped (vacuous) — then it's only `observed` |
| `observed` | You executed it and saw the result **this session** | Run the command / probe / query; keep the raw output + exit code + timestamp | You *recall* seeing it, or saw it in a prior session — that is `reported` |
| `inferred` | A deduction from `observed` facts | State the facts and that this is a deduction | The premises were themselves `inferred` or `documented` — say so; don't launder them into fact |
| `documented` | A doc, spec, comment, or config asserts it | Cite the path + section/line | You treat intent as running reality — docs drift from code |
| `reported` | A person or third-party tool stated it | Attribute the source | You drop the attribution and it reads as your own `observed` fact |
| `not-assessed` | You did not check | Name what you'd run to check it | You let it read as a pass. `not-assessed` is a gap stated out loud, never a tick. |

**The promotion rule:** you may only move *down* this list for free (proven → observed → the weaker
states), never *up*. Moving up takes a new measurement: `documented`/`reported`/`inferred` → `observed`
means actually running it this session; **`observed` → `proven` means a committed, discriminating gate**
that keeps it true on every change. Promoting `documented` to `observed` because "it's probably right"
is the exact failure this skill prevents.

## 2. Conformance vs adequacy — why both

- **Conformance**: it matches the rule, spec, or pattern. Measurable against the written standard.
- **Adequacy**: the rule actually produces the outcome the standard was *for*.

They diverge constantly:
- RLS policies *exist* on every table (conformance: `observed`) but one policy's `USING (true)`
  makes it a no-op (adequacy: fails — the row filter lets everything through).
- A retry wrapper is *present* (conformance) but retries a non-idempotent write (adequacy: fails —
  it double-charges).
- A backup job *runs nightly and exits 0* (conformance: `observed`) but no restore was ever tested
  (adequacy: `not-assessed` — an untested backup is a hope, not a recovery plan).

Report them on two lines. Collapsing them turns "it follows the standard" into a false "it is safe."

## 3. The ledger template (copy-paste)

```
## Evidence ledger — <subject>, <date>

| Claim (falsifiable)            | State        | Source (re-runnable)                         | Limitation (not checked)              |
| ------------------------------ | ------------ | -------------------------------------------- | ------------------------------------- |
|                                | observed     | `cmd` → <result>, exit 0 @<ts>               |                                       |
|                                | inferred     | from rows 1–2 above                          | deduction, not probed                 |
|                                | documented   | <path>:§/line                                | not verified against runtime          |
|                                | reported     | <who/what> said, <date>                      | unverified by me                      |
|                                | not-assessed | —                                            | run <measurement> to upgrade          |

### Conformance vs adequacy (load-bearing claims only)
- <claim>: conforms (observed) · adequacy not-assessed — <why>

### Open gaps (the not-assessed rows, as next measurements)
1. <measurement to run>
2. <measurement to run>
```

## 4. A full worked audit — "Is the `/export` endpoint safe to ship?"

**Tempting one-liner (do not ship):** "Yes — it's authed and the tests pass."

**After the skeptic's loop:**

```
## Evidence ledger — /export endpoint, 2026-10-08

| Claim                                              | State        | Source                                                                 | Limitation                                   |
| -------------------------------------------------- | ------------ | ---------------------------------------------------------------------- | -------------------------------------------- |
| Route requires an authenticated session            | observed     | `rg -n "requireAuth" src/routes/export.ts` → line 12; test "401 when anon" passes (`npm test -t export` exit 0) | only the happy-path + anon case are tested   |
| Caller can only export their own org's rows         | not-assessed | —                                                                      | no test for cross-org access; needs a request as org B for org A's id |
| Response excludes PII columns                        | documented   | `select` list in export.ts:40 omits `ssn`,`dob`                         | not observed against a live row — a `select *` elsewhere could re-add them |
| Endpoint handles a 2M-row export without timeout     | not-assessed | —                                                                      | needs a load probe; current tests use 3 rows |
| Suite is green                                       | observed     | `npm test` exit 0, 142/0/3 @14:40Z (log attached)                      | adequacy: coverage of export.ts is 61% (`observed` via `--coverage`) |

### Conformance vs adequacy
- Authz: conforms (auth is present + anon is blocked, observed) · adequacy NOT established — the
  authorization check (own-org-only) is the actual security property and it is not-assessed.

### Open gaps
1. Add + run a cross-org access test (request org B session → GET export for org A id → expect 403).
2. Load-probe with a 2M-row fixture; measure p95 latency and timeout behavior.
3. Assert PII exclusion against a live row, not just the select list.
```

**Verdict you can actually defend:** "Authentication is `observed`. **Authorization** — the property
that matters for a data export — is `not-assessed`, so this is **not** cleared to ship. Two
measurements (gaps 1–2) would clear it." That is more useful, and more honest, than "it's authed and
tests pass."

## 5. Overstatement-recovery protocol

When a reviewer sends it back, or you notice your own overreach:

1. **Name the specific overclaim** — "I wrote 'no other references exist'; I had only grepped `src/`,
   not the generated client or other repos."
2. **Correct inline** — edit the claim where it lives and restate its true state (`not-assessed` for
   the surfaces you skipped). An appendix correction a reader can miss does not count.
3. **Attach the raw bundle** — scripts, exact commands, raw stdout/stderr with exit codes, hashes,
   timestamps. The correction must itself be verifiable.
4. **Do not re-argue.** If you cannot produce the measurement now, the honest outcome is a downgrade,
   not a defense. Re-litigating a claim you can't measure is how trust erodes twice.

The goal is not to never be wrong — it is to be *cheaply correctable*, because every claim already
carries the evidence that lets someone check it.
