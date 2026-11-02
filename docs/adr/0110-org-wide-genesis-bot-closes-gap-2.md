---
status: "proposed"
date: 2026-11-02
decision-makers: mdenner
---

# 0110 - An org-wide genesis bot closes gap 2, so a repo nobody onboarded still gets the gates

ADR-0109 made the upstream manifest complete: a gate can no longer silently escape it, so whatever
`esk-genesis` installs is the full, enforced set. But `esk-genesis` only acts on a repo when a human runs
it in that repo, so a repo nobody onboarded, or one that drifted after onboarding, still has no gates and
can merge anything. Nothing committed in one repo can install or enforce anything in another. This is gap 2,
tracked as issue 203.

## Context and Problem Statement

- `[observed]` `.claude/skills/bootstrap/scripts/esk-genesis.mjs` installs the manifest's gates, scaffolds
  the CI workflow and the ruleset, verifies hashes, and is idempotent; its dry run changes nothing and
  exits 0. It is correct, but it is a tool a person runs per repo.
- `[inferred]` A commit in repo A has no authority over repo B, so no file in this repo can make another
  repo adopt or keep the gates. The only thing that can act across repos is an actor holding org-level
  permission that runs on its own schedule.
- `[observed]` `esk-genesis.mjs` prints a free-plan caveat: a required status check via a ruleset blocks
  merges only on public repos; a private repo needs a paid plan to require a check. So any cross-repo
  enforcement has a stated ceiling on private repos.

## Considered Options

- **Option 1: a scheduled org-wide bot (a GitHub App plus a daily GitHub Actions cron in a governance
  repo) that reconciles every repo by driving the existing `esk-genesis`, opening a PR per behind repo.**
- **Option 2: a webhook-driven bot that reacts the instant a repo is created or changed.**
- **Option 3: a human runbook: onboard every repo by hand and re-run `esk-genesis` periodically.**
- **Option 4: do nothing beyond gap 1; accept that un-onboarded repos are un-gated.**

## Decision Outcome

Chosen: **option 1**, with the webhook of option 2 kept as a later optimization on top of it, not a
prerequisite. The full design is in `docs/design/genesis-bot/README.md`. The decision in one line: close
gap 2 with a reconciliation loop that holds "every eligible repo has the current gates installed and
enforced" as desired state and, on a schedule, drives the existing installer to close each gap.

- The bot is a **driver, not a rebuild**. `[observed]` `esk-genesis` already owns correct, idempotent,
  safe-by-default install; the bot wraps it across many repos and does not re-implement install logic, so
  there stays one owner of "how a repo gets gated". Re-implementing it would be the data-ownership drift
  the architecture gate exists to stop.
- Identity is a **GitHub App, not a personal access token**. `[inferred]` from GitHub's App vs PAT
  permission model: an App requests least-privilege scopes, issues short-lived per-repo tokens the org can
  revoke centrally, and survives staff changes; a PAT carries one human's broad, non-expiring access. For
  an actor with org-wide write, least privilege and central revocation are the safer foundation. Confirm
  the exact scope list against GitHub's current docs at build time.
- The heartbeat is a **daily scheduled GitHub Actions workflow** in a central governance repo (for example
  `techfleetworks/.github` or `esk-governance`), separate from this source-of-truth repo. It needs no
  standing server. The repo that *defines* the gates and the repo that *has permission to distribute* them
  are kept separate, so a compromise of one is not automatically the other.
- The bot **opens a PR and never self-merges**, and **never passes `--adopt-existing`**. `[observed]`
  `esk-genesis` refuses a foreign manifest without `--adopt-existing` precisely so it does not stomp a repo
  running its own enforcement; the bot honors that refusal and reports such repos for a human instead of
  forcing them. A human or CODEOWNERS merges every PR, keeping a person in the loop on every repo an
  org-wide-write actor touches.
- Enforcement follows the free-plan ceiling honestly: `[observed]` on a **public** repo the bot marks the
  gate check required (an un-gated change cannot merge); on a **private** repo on the free plan the gates
  run and report but cannot be made required, so they are advisory there. The status report makes that
  state visible rather than implying universal enforcement. Full private enforcement is a plan upgrade, not
  a code change.
- The bot's decision function is a new read-only **`esk-genesis --check`** mode: `[observed]` today the
  dry run exits 0 even when work is pending, so a reconciliation loop has no predicate to branch on.
  `--check` inspects a repo without changing it and exits 0 when covered and current, non-zero when drifted
  or un-gated. It must reuse the installer's existing resolution and hash-verification logic, not re-derive
  which gates belong there. It also doubles as a per-repo CI drift signal and the basis for a session-start
  reminder.

Option 2 (webhook-first) was rejected as the starting point because it needs a standing, secured endpoint
to operate, where the scheduled sweep needs only the org's own CI minutes and still covers repos created
while no one was watching (a day later). The webhook is kept as a latency optimization layered on the
sweep. Option 3 (human runbook) was rejected because it reintroduces exactly the "someone has to remember"
failure gap 2 is about; coverage would decay between runs. Option 4 (do nothing) leaves the defect-catching
gates off every un-onboarded repo, which defeats the point of making the manifest complete in ADR-0109.

### Consequences

- Good, because `[inferred]` coverage becomes a standing property of the org, reconciled on a schedule,
  rather than a thing a human has to remember per repo.
- Good, because the bot reuses `esk-genesis`, so there is one owner of install logic and the bot is small.
- Good, because least-privilege identity and no-self-merge bound the blast radius of an org-wide-write
  actor.
- Bad, because it does not exist yet and most of it must be built in a separate governance repo that this
  repo cannot hold (the bot is an org actor, and granting it permission is a human act).
- Neutral, because enforcement on private repos stays advisory on the free plan; that is a plan decision,
  not a limit of this design.

### Confirmation

`[documented]` No executable confirmation yet: this ADR is `proposed`, and the only in-repo artifact is
this design and the `--check` specification. When built, confirmation is: `esk-genesis --check` has a
discriminating test (a covered fixture exits 0, a drifted and an un-gated fixture exit non-zero, and the
test flips when the check is neutralized, per `verifiable-quality-gates`); and the bot's reconciliation
behavior is covered by system BDD in the governance repo (an un-gated repo gets a PR, a covered repo is
skipped, the bot never self-merges, the bot refuses to adopt a foreign manifest).

## What this does not fix, said plainly

- `[documented]` It is a design; no bot code exists, and none can live in this repo, because the bot is an
  org-level actor that must live in a governance repo and be granted org permission by a human.
- `[observed]` It cannot enforce on private repos on the free plan; the gates run and report there but are
  advisory until the org is on a plan that allows required checks on private repos.
- `[documented]` It does not auto-merge; coverage still waits on a human merging each PR, by design.
- `[observed]` `[documented]` It will not adopt a repo running its own enforcement; it honors
  `esk-genesis`'s refusal of a foreign manifest and reports such repos instead of forcing them.
- `[documented]` `esk-genesis --check` is specified here but not built; it is the one code dependency and
  lands with the bot.
- `[documented]` The one human step that cannot be removed is the org admin installing the GitHub App once;
  the design isolates it to that single auditable act rather than pretending it away.
- `[documented]` The webhook path (instant coverage on repo creation) is deferred; the daily sweep covers
  the same repos a day later with no standing infrastructure.
