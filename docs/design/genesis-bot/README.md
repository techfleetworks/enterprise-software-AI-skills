# The genesis bot: make every repo covered, without being asked

The design for the org-wide automation that closes **gap 2**: a repository that never ran `esk-genesis`
still has no gates, and nothing committed in one repo can install or enforce anything in another. ADR-0109
closed gap 1 (the upstream manifest is now complete, so a gate cannot silently escape it). This is the
other half: getting that complete, enforced set *onto every eligible repo in the org* with no human
remembering to run the installer per repo.

## Status: designed, not shipped yet

This document and ADR-0110 are the design. **No bot code is in this repo, and none can be:** the bot is
an org-level actor that must live in a governance repo and be granted org permissions a human has to
approve once (see "The one human step that cannot be automated away"). What ships here is the design, the
decision record, and the one buildable change the bot depends on (`esk-genesis --check`, specified below
but not yet implemented). The build lands in the governance repo, tracked by issue #203 (gap 2).

## The problem, stated plainly

`esk-genesis` already installs the gates into a consumer repo from the upstream manifest, scaffolds the CI
workflow and the ruleset, verifies hashes, and is idempotent and safe by default. `[observed]`
`.claude/skills/bootstrap/scripts/esk-genesis.mjs`. But it only acts on a repo **when a human runs it in
that repo**. So:

- A new repo nobody onboarded gets no gates. It can merge anything.
- A repo that was onboarded months ago, then drifted (someone deleted the workflow, or a newer manifest
  shipped tighter gates), silently falls behind.

No file in this repo can fix that, because a commit in repo A has no authority over repo B. `[inferred]`
The thing that can act across repos is an actor with org-level permission that runs on its own schedule.
That actor is the bot.

## What it does

The bot is a **reconciliation loop**, the same shape as a thermostat or a Kubernetes controller. It holds
one desired state ("every eligible repo in the org has the current gates installed and enforced"), and on
a schedule it compares every repo against that desired state and does the smallest thing that closes each
gap. It is not triggered by a person asking. It runs unprompted and keeps running, so coverage is a
standing property of the org, not a thing someone has to remember.

One pass does this, per repo:

1. **List** every repository in the org (skipping archived repos and an opt-out list).
2. **Check** each one: is the current gate set installed, and is it enforced? This is a read-only question
   answered by `esk-genesis --check` (specified below).
3. **Reconcile** only the repos that are behind: run the existing `esk-genesis` installer to add or update
   the gates on a branch, and open a pull request. It never commits straight to the default branch.
4. **Enforce** where it can: on a public repo it marks the gate check required so an un-gated change
   cannot merge. On a private repo on the free plan it cannot require a check, so the gates run and report
   but do not block (see "The enforcement ceiling").
5. **Report**: write a status line per repo (covered / drifted / un-gated / opted out) so the gap is
   visible even where it cannot be blocked.

## What kind of bot it is

Two pieces, each doing one job:

- **A GitHub App** supplies the bot's *identity and permission*. It is installed once on the org by an
  admin, requests least-privilege scopes (read repo metadata, write repo contents and pull requests,
  administer branch protection), and hands out **short-lived, per-repo tokens that the org can revoke**.
  It is chosen over a human's personal access token on purpose (see "Why a GitHub App, not a PAT").
- **A scheduled GitHub Actions workflow** supplies the bot's *heartbeat*. A daily `cron` in the governance
  repo wakes the loop, authenticates as the App, and runs the pass above. This is the backbone; it needs
  no server and no standing infrastructure, only the org's own CI minutes.

The bot is a **driver, not a rebuild.** The hard part (install gates correctly, scaffold the workflow and
ruleset, verify hashes, stay idempotent, refuse to stomp a repo's own enforcement) already lives in
`esk-genesis`. `[observed]` The bot wraps that tool across many repos; it does not re-implement install
logic. One owner of "how a repo gets gated" stays `esk-genesis`.

## Where it lives

In a **central governance repo** the org controls (for example `techfleetworks/.github` or a dedicated
`esk-governance`). That is where the scheduled workflow is defined and where the App's installation is
managed. The bot runs on the org's own GitHub Actions, so no new host must be operated, patched, or paid
for. The upstream skills repo (this one) stays the *source of truth* for the manifest and the gates; the
governance repo is the *actor* that distributes them. Those are deliberately two different repos: the
thing that defines the gates and the thing that has permission to push them to everyone are separate
concerns, so a compromise of one is not automatically the other.

## How it works

```
   this repo (enterprise-software-AI-skills)
   the single source of truth: manifest + gates
                     |
                     |  published release (gate-manifest.json + pinned gate scripts)
                     v
   +-----------------------------------------------------------+
   |  GENESIS BOT                                              |
   |    - GitHub App  (identity, least-privilege, revocable)  |
   |    - scheduled workflow in a governance repo (daily cron)|
   +-----------------------------------------------------------+
                     |
                     |  for each repo in the org
                     v
         check: is it covered and current?   (esk-genesis --check, read-only)
                     |
          +----------+-----------+
          |                      |
      already covered        behind / un-gated
          |                      |
        skip            open / update a pull request   (esk-genesis installer)
                                 |     (never merged unreviewed)
                     +-----------+-----------+
                     |                       |
                  public                  private
             make the check          checks run, but
               required              advisory only (free plan)
                     |                       |
                     +-----------+-----------+
                                 |
                                 v
                    write a status report (the standing signal)
```

## The pieces, in detail

### `esk-genesis --check` (the decision function, to be built)

Today the installer's dry run exits 0 even when work is pending. `[observed]`
`.claude/skills/bootstrap/scripts/esk-genesis.mjs` (the dry-run path returns success). A reconciliation
loop needs a *read-only predicate* it can branch on: "is this repo covered and current, yes or no."

`--check` is that predicate. It inspects a repo without changing it and exits:

- `0` covered: the current manifest's gates are installed and (where possible) enforced.
- non-zero drifted or un-gated: something is missing, stale, or weakened.

It is the bot's decision function in step 2. The same mode doubles as a per-repo CI drift signal (a repo
can run `--check` in its own CI to notice it has fallen behind) and as the basis for a session-start
reminder that reads the current project. This is the one piece of buildable code this design depends on,
and it is small and self-contained. It must reuse the installer's existing resolution and hash-verification
logic rather than re-deriving which gates belong there, so there is still one owner of that fact.

### The installer, driven across repos

For a repo that `--check` reports as behind, the bot runs the existing `esk-genesis` installer with
`--yes` on a branch and opens a PR. Two hard rules:

- **It never passes `--adopt-existing`.** `[observed]` `esk-genesis` refuses a foreign manifest unless
  `--adopt-existing` is given, exactly so it does not stomp a repo that runs its own enforcement
  (`esk-genesis.mjs`, the manifest-provenance guard). The bot must honor that refusal, not override it. A
  repo the bot cannot safely adopt is reported for a human to look at, not forced.
- **It never merges its own PR.** The bot opens or updates the pull request; a human or CODEOWNERS merges
  it. This is a supply-chain safety boundary: an actor with org-wide write that could also self-merge could
  push arbitrary change everywhere at once. Opening a PR keeps a human in the loop on every repo the bot
  touches, and costs only review latency, not coverage.

### Enforcement: public vs private

`[observed]` `esk-genesis.mjs` prints a free-plan caveat: required status checks via rulesets block merges
only on **public** repos; a private repo needs a paid plan to require a check. So the bot's reach has a
ceiling it must state, not hide:

- **Public repo:** the bot installs the gates *and* marks the gate check required. An un-gated change
  cannot merge. Full enforcement.
- **Private repo (free plan):** the bot installs the gates and they run in CI and report, but it cannot
  make them required, so a determined author can still merge around them. The gates are advisory there.
  The status report makes that state visible so it is a known, named limit rather than a false sense of
  safety. Full private enforcement is a plan upgrade, not a code change.

## Why it is built this way

- **A central actor is the only thing that can close gap 2**, because nothing inside one repo has
  authority over another. `[inferred]` The cross-repo guarantee has to come from an actor with org
  permission, which is the bot.
- **A driver, not new code.** `esk-genesis` already owns correct, idempotent, safe-by-default install.
  `[observed]` Re-implementing that in the bot would be a second owner of the same logic, the exact
  data-ownership drift the architecture gate exists to stop. The bot reuses it.
- **A GitHub App, not a PAT** (see next section).
- **A schedule first; a webhook is optional.** A daily cron needs no running server and reconciles the
  whole org, including repos created while no one was watching. A webhook (react the instant a repo is
  created) is faster but needs a standing endpoint to operate and secure, so it is deferred as an
  optimization on top of the sweep, not a prerequisite.
- **It opens a PR; it does not auto-merge.** Keeps a human on every change an org-wide-write actor makes.
- **It states the private-repo ceiling** instead of implying universal enforcement.

## Why a GitHub App, not a PAT

A personal access token is tied to one human, carries that human's broad access, does not expire on its
own, and vanishes when that person leaves. A GitHub App is a first-class org actor: it requests only the
scopes it needs, issues **short-lived tokens scoped to one repo at a time** that the org can revoke
centrally, and keeps working regardless of staff changes. For an actor that holds org-wide write, least
privilege and central revocation are the safer foundation. `[inferred]` from GitHub's documented App vs
PAT permission model; confirm the exact scope list against GitHub's current docs at build time.

## The one human step that cannot be automated away

Nothing in a repo, and no agent, can grant itself org permissions. An org admin must **install the GitHub
App on the organization once** and approve its scopes. That is the irreducible human step. It is also the
*only* one: after that single approval, the schedule runs the loop unprompted, forever, with no further
human action except reviewing and merging the PRs the bot opens. The design does not pretend this step
away; it isolates it to one deliberate, auditable act.

## What this does not do, said plainly

- **It does not exist yet.** This is a design. `[documented]`
- **It cannot enforce on private repos on the free plan.** It installs and runs the gates there, but they
  are advisory until the org is on a plan that allows required checks on private repos. `[observed]`
  (`esk-genesis.mjs` free-plan caveat.)
- **It does not auto-merge.** Coverage still waits on a human merging each PR. By design. `[documented]`
- **It will not adopt a repo running its own enforcement.** It honors `esk-genesis`'s refusal of a foreign
  manifest and reports such repos instead of forcing them. `[observed]` `[documented]`
- **`--check` is specified here but not built.** It is the one code dependency, and it lands with the bot.
  `[documented]`
- **The webhook path (instant coverage on repo creation) is deferred.** The daily sweep covers the same
  repos a day later with no standing infrastructure. `[documented]`

## What has to be built (the work tracked by #203)

1. `esk-genesis --check`: the read-only covered/drifted predicate, reusing the installer's resolution and
   hash logic. (In this repo's `bootstrap` skill.)
2. The GitHub App: registration, least-privilege scopes, one-time org install. (Governance repo + org
   admin.)
3. The scheduled workflow: the daily reconciliation pass (list, check, reconcile, enforce, report).
   (Governance repo.)
4. The status report surface: the per-repo coverage signal. (Governance repo.)
5. Optional, later: the webhook path for instant coverage on repo creation.

See ADR-0110 for the decision and its alternatives.
