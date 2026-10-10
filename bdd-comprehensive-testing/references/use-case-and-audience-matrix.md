# Authoring the full use-case set and the use-case × audience matrix

The deliverable is a grid: every use case crossed with every audience, each cell either a written
Gherkin scenario or a recorded `N/A: <reason>`. This file is how you build that grid without
guessing and without skipping cells. The method is **Example Mapping** (Matt Wynne) —
<https://cucumber.io/docs/bdd/example-mapping/> `[documented]`, retrieved 2026-10-10.

## Step 1 — Establish the audiences with certainty (or STOP and ASK)

An audience is a distinct kind of actor who hits the behavior. Common ones: `anonymous`,
`authenticated`, `admin`, `api-consumer`, `internal`, `partner`, `assistive-tech`, plus any
domain-specific roles. The list anchors every row of the matrix, so it must be **observed/reported,
never inferred**:

- **Observed** — the user stated it, or you verified it in the repo: routes, role/permission
  checks, auth config, an existing audience list in `features/bdd-index.json`.
- **Inferred** — you reasoned "there's probably an admin." This is a **hard stop**. Do not proceed.

```
# ❌ never — infer and proceed
"This is a refund flow, so it's probably customers + admins." → start writing

# ✅ always — ask, list candidates, wait
"Before I write scenarios I need the exact audiences. Candidates I can see:
 customer, admin, api-consumer, guest. Which of these hit this change, and any I missed?"
```

Getting the audience wrong silently ships untested paths for real users — that is why uncertainty is
a stop, not a default. Record the confirmed list; it is the row axis.

## Step 2 — Enumerate every use case (happy + every non-happy class)

For the changed behavior, list the happy path and then one entry per non-happy class. The classes
are the `@category` vocabulary — the same values `check-bdd-tags` enforces:

| `@category:` | What it covers |
|---|---|
| `happy` | the intended success path |
| `edge` | unusual-but-valid inputs/conditions near a limit |
| `error` | a downstream/system failure surfaces correctly |
| `boundary` | exactly at a min/max/first/last value |
| `negative` | invalid input is rejected cleanly |
| `adverse` | hostile/malformed/abusive input |
| `concurrency` | double-submit, race, simultaneous writers |
| `permission` | denied actor is refused (and cannot even see it) |
| `empty-overflow` | nothing at all, or past capacity |
| `timeout` | a dependency hangs or the operation exceeds its budget |

**No class is skipped for being common or "obvious."** Think like an adversary and like a confused
first-time user, not only like the author. Example Mapping makes this concrete: break the story into
its **rules**, then write **examples** under each rule, and park **open questions** — every example
becomes a candidate use case.

## Step 3 — Assign @severity (the ISTQB impact axis)

Rate each use case by how badly its failure would break performance, UX, architectural standards,
security, confidentiality, or the integrity of the codebase/product: `@severity:critical | high |
medium | low`. This is the **impact** axis of risk-based testing — ISTQB defines a risk's level as
*impact × likelihood* and lists "order of testing activities according to risk" among its uses
(ISTQB Glossary, "risk level", <https://glossary.istqb.org/> `[documented]`, retrieved 2026-10-10).
Severity captures impact; teams wanting finer ordering may also weigh likelihood.

**Prioritize by severity, never gate by it.** Write and review the highest-severity scenarios first
and make them the loudest signals in CI — but a low-severity case is still written out in full, just
ranked lower. Severity never reduces coverage.

## Step 4 — Build the matrix as a grid

Cross every use case (rows: happy + each non-happy class) with every confirmed audience (columns),
carrying each cell's severity. Each cell resolves to exactly one of:

- a **written Gherkin scenario** (the deliverable — see `gherkin-and-frameworks.md`), or
- a recorded **`N/A: <reason>`** — a deliberate, visible gap, e.g. `N/A: guests cannot reach the
  admin refund flow`.

```
Use case \ Audience        customer            admin               api-consumer        guest
refund-happy-path          scenario @high      scenario @high      scenario @high      N/A: no refund rights
refund-past-window (neg)   scenario @high      scenario @high      scenario @high      N/A: cannot reach flow
refund-double (concurrency)scenario @critical  scenario @critical  scenario @critical  N/A: cannot reach flow
refund-denied (permission) —                   —                   —                   scenario @critical
refund-downstream (error)  scenario @critical  scenario @critical  scenario @critical  N/A: cannot reach flow
```

Order the work critical-first, but **every non-N/A cell must still be written**. A token sample is a
fail; listing cases without writing them is a fail; a plan is a fail. The complete grid — scenarios
plus recorded N/As — is the bar.

## Gaps are deliberate and visible, not silent

Every empty cell carries a reason, and `check-bdd-coverage` fails closed when a declared audience has
no scenario, when a feature has only happy-path scenarios, or when a changed behavior has no scenario
at all (see `bdd-gates.md`). The matrix is not advice — it is mechanically enforced.

## Sources (retrieved 2026-10-10)

- **Example Mapping** (method for enumerating the case set): Matt Wynne / Cucumber —
  <https://cucumber.io/docs/bdd/example-mapping/> `[documented]`.
- **Severity / risk level** (impact axis): ISTQB Glossary, "risk level" —
  <https://glossary.istqb.org/> `[documented]`.
