# Combinatorial testing (covering arrays)

Some defects appear only when two or more inputs take particular values at the same time. Testing each input
on its own, or on a hand-picked grid, misses them. Combinatorial testing covers every combination of a chosen
size with a small, measured set of tests instead of all of them. The standard reference is NIST SP 800-142,
*Practical Combinatorial Testing* (<https://doi.org/10.6028/NIST.SP.800-142>).

## When to use it

Reach for it when a defect comes from inputs acting together, not from one input alone:

- A bug that only shows up for a specific pairing (a secret value and a later "keep that secret" instruction;
  a browser and a locale; a payment method and a currency; a feature flag and a user role).
- A function with several parameters whose values interact.
- A configuration space (OS by version by driver by setting) too large to test in full.

The reason it works is the interaction rule from NIST SP 800-142: in the empirical data they summarize, most
failures are triggered by a single value or by two values interacting, and the share keeps rising through
about three to six interacting values, after which new failures are rare. So testing all t-way combinations
for a small t (often 2 or 3) catches the large majority of interaction defects with far fewer tests than
trying every full combination. This does not test one input alone less; a covering array of strength 2 already
includes every single value.

Do not reach for it when the inputs do not interact (test those independently), or when the real risk is
volume or timing rather than value combinations (use load, soak, or concurrency testing instead).

## How to list the inputs and their values

1. **List the factors.** Each input that can vary is a factor: a parameter, a config option, an environment
   choice, a class of the input (for example "name punctuation": none, period, comma).
2. **List each factor's values (its levels).** Use equivalence classes, not every possible value: for an age
   field, `negative`, `0`, `typical`, `max`, `over-max`, not 0 through 120. Keep the set small and meaningful.
3. **Write it down as factor to values**, the shape `coverage-measure.mjs` reads:

   ```json
   { "os": ["win", "mac", "linux"], "auth": ["password", "sso"], "role": ["admin", "member"] }
   ```

The quality of the test set is capped by this list: a value class you never list is never covered, so the
hard thinking is here, not in the tool.

## How to choose a strength t

`t` is how many factors must be covered in every combination:

- **t = 1** (each value appears at least once): the floor; catches single-value defects only.
- **t = 2 (pairwise)**: every pair of values across every pair of factors appears together at least once. This
  is the common default and catches the large majority of interaction defects per NIST SP 800-142.
- **t = 3 and up**: use for higher-assurance or safety-relevant systems, or when you have evidence that
  three-way interactions matter. The cost rises with t, so raise it on purpose, not by default.

State the strength you chose and why. "Pairwise (t=2), because the defect was a two-input interaction" is a
complete answer; "we tried a few combinations" is not.

## How to build a covering array

You do not build it by hand. A tool generates a small set of rows that covers every t-way combination:

- **NIST ACTS** (Automated Combinatorial Testing for Software): the reference generator from the SP 800-142
  authors (<https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software>). Free for download.
- **PICT** (Pairwise Independent Combinatorial Testing), Microsoft's open-source tool
  (<https://github.com/microsoft/pict>): a factors-and-values model file in, a covering array out, with support
  for constraints and seeding.
- Many test frameworks have a pairwise or all-pairs library for the same job in-process.

Feed the tool your factors and values and the strength; it returns the rows to run.

## How to measure and report the share of combinations covered

Do not assume a test set is a covering array; measure it. `scripts/coverage-measure.mjs` reads a plan (the
factors, the strength, and the rows you actually ran) and reports the share of t-way combinations those rows
cover:

```
node .claude/skills/comprehensive-test-strategy/scripts/coverage-measure.mjs plan.json --strength 2
```

It prints `covered of total` and the percentage, exits 0 when every targetable combination is covered (a real
covering array of that strength), exits 1 when some are uncovered (and samples the gaps), and fails closed
(exit 2) on a bad plan or a row with an undeclared value. Report the measured share, not "we covered the
combinations": a hand-picked 5 by 5 grid often covers far less than 100 percent of the pairs, and the number
is the evidence.

## How to handle rules about which values can go together

Some combinations cannot occur (a `linux` OS with an `ie11` browser; a `guest` role with an `admin` action).
These are constraints. Handle them, do not let them distort the result:

- Give the constraints to the generator (ACTS and PICT both take them) so it never emits an impossible row.
- Exclude the same forbidden combinations from the measurement, so a covering array is not marked incomplete
  for a combination the system forbids. `coverage-measure.mjs` takes an optional `constraints` list (partial
  assignments that cannot occur) and removes any target combination that matches one from the denominator.

A constraint you forget to model shows up as an impossible test row or as a coverage gap you cannot close;
either way, model it explicitly rather than ignoring the measurement.

## The companion rule: the checker that reads the results must itself be tested

A covering array only helps if the check that decides pass or fail on each row is correct. A leak checker, a
grader, or an output-comparison script is an oracle, and an oracle with its own bugs makes "0 found" meaningless.
See the skill's SKILL.md (Step 6, "Trust only a tested checker (the oracle rule)"): any pass/fail checker ships
its own unit tests first, covering value variants, one value found inside a larger one, and empty input.

## Sources

- D. Richard Kuhn, Raghu N. Kacker, Yu Lei, *Practical Combinatorial Testing*, NIST Special Publication 800-142,
  October 2010 (<https://doi.org/10.6028/NIST.SP.800-142>): covering arrays, t-way testing, the interaction rule
  that most failures are triggered by a few interacting values, and the measurement of combinatorial coverage.
  `[documented]`
- NIST Automated Combinatorial Testing for Software (ACTS)
  (<https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software>): the reference covering-array
  generator. `[documented]`
- Microsoft PICT (<https://github.com/microsoft/pict>): an open-source pairwise and t-way generator with
  constraint support. `[documented]`
