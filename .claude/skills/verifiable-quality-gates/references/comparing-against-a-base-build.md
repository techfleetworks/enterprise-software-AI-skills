# Comparing a change against a base build

A "no new failures" or "clean" verdict is itself a claim, and like any check it can be vacuous: it can
come from a comparison that was never able to find a failure. This file is the discipline for making a
before-and-after comparison that can actually fail, and the reference script that embodies it,
`scripts/compare-gate-runs.mjs`.

## The failure this prevents (observed)

In an audited session an agent compared a changed build against its base build and reported "0 new
failures, CLEAN". The script it used sorted gates by reading an `ok` field, falling back to a `passed`
field. The gate records had neither: their only fields were `cmd`, `discrimination_lines`, `exit`,
`gate`, `last_line`, and `seconds`. So every status read as empty, "passed in base, failed in changed"
could never be true, and the new-failure list could never be non-empty. The verdict was right only by
luck (a separate re-run by `exit` code found 0 new failures), not by proof.

In the same comparison a gate that was failing in BOTH builds got worse, going from 420 problems to
430. A pass-or-fail comparison cannot see that: both builds are "fail", so nothing changed as far as a
boolean is concerned, and 10 new problems rode in under a green "clean".

## The two rules

### 1. Compare only on fields proven present. A missing field is an error, not an empty status.

Before you compare, confirm the field you compare on exists on every record you must read. If it is
absent, stop with an error that names the field and print no count. An absent field read as "empty" and
then treated as "no change" is exactly how a comparison reports a clean it never checked.

```
# never: a status field that no record has, read as "unchanged"
status = rec.get("ok") or rec.get("passed")   # both absent -> status is None for every gate
if base_status == "pass" and changed_status == "fail": new_failures.append(gate)  # can never fire

# always: the field must be proven present, or it is a hard error
if status_field not in rec: die(f'status field "{status_field}" absent from {gate}; cannot compute pass/fail')
```

### 2. For gates red in both builds, compare per-case results or problem counts. Any increase is new.

A gate that fails in the base build can still get worse. Compare the per-case results, or at least a
problem count, for every gate that is red in both builds. Any increase is a new failure until it is
explained (a stated, reviewed reason) or fixed. This is only possible if the gate records keep more
than the last output line: they must keep the per-case results, or a count plus a hash of the case
list, so two runs can be compared case by case. A record that keeps only `last_line` cannot prove the
gate did not get worse, so `compare-gate-runs.mjs` reports such a both-red gate as UNVERIFIABLE and it
blocks a clean verdict rather than passing silently.

## The reference script

`scripts/compare-gate-runs.mjs` takes a base run and a changed run, each a JSON array of gate records,
and reports new failures and worsened gates:

```
node compare-gate-runs.mjs --base base.json --changed changed.json \
     [--status-field exit] [--pass-value 0] [--count-field problems] [--id-field gate]
```

- Exit 0 only when the comparison ran, every field it needed was present, and there are no new
  failures, no worsening, and no gate that vanished. Only then does it print the `0 new failures` line
  (with an output hash).
- Exit 1 for a new failure, a worsened red gate, a both-red gate whose worsening cannot be verified, or
  a gate present in the base run but dropped from the changed run (a silently removed or renamed gate is
  a false-clean vector, so it must be explained, never read as "no new failures").
- Exit 2 (fail closed) for bad arguments, unreadable or invalid input, a record with no id, the status
  field absent from a record it must read, or either run having zero gate records (a comparison that
  compared nothing cannot be clean, matching the repo's zero-scan-fails-closed idiom).

Its discriminating test (`test/compare-gate-runs.test.mjs`) proves it detects: rename the status field
to one no record has and it must error (not report clean); add one problem inside a red gate and it
must report it as new. A no-op that always exits 0 flips those cases from pass to fail.

## The claim rule

A "0 new failures" or "clean" claim may only cite a run of a comparison that was able to find a
failure. Cite the command, the exit code, and a hash of the output, so the claim is re-runnable and
cannot be the vacuous kind. A clean verdict with no such citation is `not-assessed`, never `proven`.

## Honest limits

- The comparison proves a gate did not newly fail or get worse on the records it was given. It does not
  prove the base run itself was complete, nor that the count field counts the right things.
- Per-case comparison needs the runner to record per-case results (or a count plus a case-list hash).
  If a gate only records a last line, the best this can do is flag it UNVERIFIABLE, which is the signal
  to make that gate record more.
