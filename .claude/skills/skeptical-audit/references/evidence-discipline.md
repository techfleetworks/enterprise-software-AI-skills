# The evidence discipline — the shared contract every skill depends on

This is the **single, canonical contract** for how every skill in this repo backs a factual claim. It is
owned here once so it cannot drift; other skills **link** to it rather than restating it. It makes the
discipline this repo used to audit *itself* — an evidence state, a re-runnable source, a named
limitation, and an adversarial "hunt the disconfirming case first" pass — a universal, enforced
requirement, not an opt-in nicety.

> `skeptical-audit/SKILL.md` is the full method (the skeptic's loop, banned moves, examples);
> `references/evidence-states.md` is the states in depth + the worked audit + the recovery protocol.
> This file is the **contract**: the taxonomy, the required ledger, and the per-skill obligation that
> `check-skill-evidence-contract` enforces.

## 1. The evidence-state taxonomy (strongest → weakest)

| State | Means | How it is earned |
|---|---|---|
| **`proven`** | Mechanically guaranteed to keep holding — a committed, **discriminating** test or CI gate enforces it on every future change. The only state that survives regression *by construction*. | A gate exists, is in the required/blocking set, and has a discriminating test (no-op the check → its test fails), per `verifiable-quality-gates`. |
| **`observed`** | You ran it and saw the result **this session**. | Attach the exact command + output + exit code / query + rows / `file:line` / hash + timestamp. |
| **`inferred`** | A deduction from `observed` facts. | Name the facts and say it is a deduction (don't launder `documented`/`inferred` premises into fact). |
| **`documented`** | A doc, spec, comment, or config asserts it (intent, not running reality). | Cite path + section/line, or URL + retrieval date + the quoted line. |
| **`reported`** | A person or third-party tool stated it. | Attribute the source; it's a claim, not a fact. |
| **`not-assessed`** | You did not check. **Never a pass** — a gap stated out loud. | Name the measurement that would upgrade it. |

### The promotion rule
You may move **down** this list for free; moving **up** requires a **new measurement**. Specifically:
`documented`/`reported`/`inferred` → `observed` needs you to actually run it this session; **`observed`
→ `proven` needs a committed, discriminating gate** that keeps it true on every change. "It's probably
right" is never a promotion.

## 2. The required output — the evidence ledger

No skill reports a load-bearing verdict without appending a ledger (template + worked example in
`evidence-states.md`):

```
| Claim (falsifiable) | State | Source (re-runnable) | Limitation (not checked) |
```

Plus, for each load-bearing claim, a **Conformance vs adequacy** line (does it follow the rule *and*
does the rule deliver the outcome?), and an **Open gaps** list — the `not-assessed` rows restated as the
next measurements.

## 3. The adversarial loop (run before emitting any verdict)

1. Write the claim as **one falsifiable sentence**.
2. **Hunt the disconfirming input/path/environment first** — not the one where it works.
3. **Measure** (command + exit code / query / diff / `file:line` / hash / URL + date).
4. **Tag the state + the limitation**; split conformance from adequacy.
5. If you couldn't measure it, **downgrade** — never reach for a hedge-word.

**Teaching example (a confirming probe hides what a disconfirming probe exposes):** the audit that
built this repo nearly filed "ReDoS not reproduced" for `arch-gate.mjs` because its first probe used
*unterminated* `/*` comments (ran in 0.1 ms). The disconfirming probe — balanced `/* x */` pairs + a
trailing char forcing the final `}` to fail — hung **>5 s on ~400 bytes**, confirming catastrophic
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
proof map), and (c) requires the **evidence ledger** in the skill's Definition of done. Link, don't
copy — one owner, per the repo's data-ownership rule. The `check-skill-evidence-contract` gate
(`skeptical-audit/scripts/`) fails the build for any non-exempt skill missing these, and a shrink-only
allowlist tightens to 100% as each skill adopts the contract.
