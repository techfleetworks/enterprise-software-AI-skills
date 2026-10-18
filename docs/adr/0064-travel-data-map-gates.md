---
status: "accepted"
date: 2026-10-18
decision-makers: mdenner
---

# The data-map pair travels: untagged-pii forces declaration, retention-basis enforces basis and retention

## Context and Problem Statement

Two compliance gates share one consumer-provided artifact, a data map (`data-map.json`): `check-untagged-pii`
scans SQL schema and flags any PII-looking column that is not classified in the map, and
`check-retention-basis` reads the map and requires every declared personal entry to carry a lawful basis and a
retention period. Both are tier-2: they need a consumer config. As written, both **required** `--map` and
failed closed (exit 2) when it was absent, and `untagged-pii` also failed closed on zero `.sql` files. That is
the wrong default for a gate that travels and runs over a whole consumer tree: a consumer that has not written
a data map yet, or has no SQL, would see a confusing exit 2 rather than a useful result.

The chosen tier-2 model (this program's decision) is optional config with a safe default: a clean consumer is
green, and a gate reds only when there is something real to fix or configure.

## Decision

Make both gates travel with an **optional `--map`** (absent or not-yet-created is treated as an empty map),
and give each the safe default that fits what it checks. The two defaults are deliberately asymmetric, because
the two gates play different roles:

- **untagged-pii is strict-by-default.** An absent/empty map means every PII-looking column is *undeclared*,
  so the gate flags it (exit 1): the "declare your PII" red that forces a data inventory to exist. This is not
  fail-open: a missing map yields *more* findings, never fewer. It also gains `--allow-empty` (a whole-repo
  scan with no `.sql` passes), a repeatable cwd-anchored `--ignore <relpath>`, and the shared `IGNORE_DIRS`
  set (so test fixtures with intentionally PII-named columns do not false-red). Manifest `invoke`:
  `["--allow-empty","--ignore","scripts/ci","--map","data-map.json","."]`.
- **retention-basis is a no-op-by-default.** An absent/empty map has no declared personal entries, so there is
  nothing to check and the gate passes (exit 0). It reads only the map (no tree scan), so its `invoke` is just
  `["--map","data-map.json"]`. This is not a weakening: the gate that *forces* PII to be declared is
  untagged-pii; once a field is in the map, retention-basis requires its basis and retention.

Together: untagged-pii makes you put every PII column in `data-map.json`; retention-basis then makes each of
those entries state why you hold it (GDPR Art 6) and when it is deleted (Art 5(1)(e)). A map file that *is*
present but malformed JSON still fails closed in both (a real error, not an absent map). Both are marked
`// bootstrap-v2-gate: <id>`, listed in the manifest with normalized sha256 (ADR-0058), test, `lane: required`
and the `invoke` above; their `invoke` is frozen for consumers by the provenance binding (ADR-0061). Their
tests resolve the gate dual-path and are in the CONSUMER-TESTS meta-test.

## Consequences

* The travelling set is now eight gates (eleven manifest gates total). Verified end to end: genesis a fresh
  consumer with clean application code and all eleven gates pass; add a `.sql` with an undeclared `email`
  column and untagged-pii goes red; declare it in `data-map.json` and it passes; give the entry a class but no
  basis/retention and retention-basis goes red.
* Honest behavior to expect: a consumer that genesis'es the gates and already has a SQL schema with user
  tables gets an immediate untagged-pii red listing its PII-looking columns. That is the intended
  "configure-me" signal, not a false positive, and it clears once the columns are declared (a one-time data
  inventory). A consumer with no SQL stays green.
* Honest limitation: the PII signal is a tunable name heuristic over column names, line-oriented SQL only (a
  single-line `CREATE TABLE` or a non-SQL ORM schema is out of scope). It errs toward flagging; the map is
  where the truth is recorded, including a table-qualified `not-personal` to record a reviewed false positive.
* Honest limitation: like the other travelling gates, test directories are skipped, so a PII column that lives
  only under a `test`/`spec` directory is not checked. Real schema lives in `migrations/`/`db/`.
