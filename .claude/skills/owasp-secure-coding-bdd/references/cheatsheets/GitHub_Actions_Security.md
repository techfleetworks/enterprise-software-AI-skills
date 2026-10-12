# GitHub Actions Security

## What it is

How to stop attacker-controlled code from running inside your GitHub Actions workflows, where it could steal
secrets or abuse the `GITHUB_TOKEN`. This is the per-sheet guidance from the OWASP GitHub Actions Security Cheat
Sheet, condensed to the controls that hold and the attack they stop. It is aimed mostly at public repositories,
where anyone can fork and open a pull request.

## The attack it stops

The core danger is getting your workflow to execute code an outsider controls. Once that happens, several bad
outcomes follow: long-lived credentials (cloud keys, registry tokens) get printed to logs, sent to an outside
endpoint, or buried in an artifact; a `write`-scoped `GITHUB_TOKEN` is misused to rewrite repo contents or
releases; a poisoned cache is restored by a later privileged workflow and runs in that trusted context; or
repeated triggers burn money on paid services in a denial-of-wallet attack. Dangerous triggers like
`pull_request_target` and `workflow_run`, unpinned third-party actions, over-broad token permissions, and
unsanitized PR input are the usual ways attacker code gets in. The controls below shut those doors.

## Controls

In the cheat sheet's order:

1. **Treat the pipeline as critical production code.** It holds sensitive credentials and reach, so apply the
   full set of secure-development practices to it: threat modeling, secure code review, security validation, and
   penetration testing.
2. **Assume a breach will happen.** Write an incident-response plan with clear roles, communication, and
   escalation, and keep learning from public post-mortems of other projects.
3. **Turn on static analysis for workflows.** Enable CodeQL `actions` scanning (free for open-source repos) and
   add Zizmor for defense in depth, keeping both current. Run them on every relevant pull request as required
   status checks that block merges on high or critical findings, scan all workflows on a schedule, and track
   findings to closure. Standardize this across many repos with a shared reusable workflow.
4. **Harden repository settings.** Require approval for all external contributors (not just first-timers, which
   an attacker can bait with a harmless PR and then abuse), default the `GITHUB_TOKEN` to read-only, and enforce
   strong branch protection (required reviews, status checks, signed commits, CODEOWNERS approval). Use rulesets
   to require workflows to pass before merging.
5. **Restrict outbound traffic from hosted runners.** Use a tool such as Harden-Runner to watch and limit egress
   so secrets cannot be quietly exfiltrated.
6. **Be extra cautious with self-hosted runners.** Never attach them to public repos in the normal case, since a
   fork-and-PR gives an outsider code execution on your machine. If you must, apply full secure-development
   practices, require approval for all external contributors with per-run manual review, use ephemeral runners
   destroyed after each job, store no sensitive data on them, and keep them off sensitive networks.
7. **Segregate runners with groups and labels.** Keep high-privilege runners apart from low-privilege ones so a
   compromised or misconfigured workflow cannot reach sensitive resources. For example, separate image-build
   runners, restricted-network runners, and low-privilege lint/scan runners.
8. **Maintain curated shared workflows and actions.** Keep a central, security-reviewed set of workflows and
   actions and reuse them across repositories instead of copying ad-hoc ones.
9. **Prevent artifact poisoning.** Malicious content can enter through shared caches or stored dependencies and
   then run in a privileged context. Disable every form of caching in release and publishing workflows so you
   never reuse a tainted artifact or leak production secrets.
10. **Be careful with an AI assistant in the pipeline.** An assistant that reviews PRs or triages issues can be
    steered by prompt injection; if it holds secrets or a `write` token and untrusted users can trigger it, that
    leads to exfiltration or unauthorized actions. Give it only the minimum tools and actions it needs.
11. **Avoid dangerous triggers.** Steer clear of `pull_request_target`, which runs in the base repo's context
    with a `write` token and secrets, and never check out and run untrusted PR code there. Avoid `workflow_run`,
    which an attacker can chain to escalate privileges or poison downstream artifacts; use `workflow_call` with
    reusable workflows instead. Handle `issue_comment` with care because of its time-of-check/time-of-use gap and
    its ability to skip PR review: confirm the triggering actor is authorized and pin the checkout to a trusted
    commit SHA, or switch to label-based triggers that check out the exact reviewed SHA from
    `github.event.pull_request.head.sha`. Always check out by immutable full SHA, never a branch name or PR number.
12. **Use third-party actions safely.** Minimize them (prefer the GitHub API for your own logic), and vet each
    one's origin, author activity, contributor base, stability, and requested permissions. Pin every action and
    reusable workflow to a full commit hash and confirm the commit truly belongs to that org/repo to block
    impostor-commit and dependency-confusion attacks (the Zizmor `impostor-commit` rule automates this). Keep
    them updated with Dependabot or Renovate, and add a cooldown delay before adopting a new release so a
    compromised version has time to be caught.
13. **Minimize `GITHUB_TOKEN` permissions.** Set `permissions: {}` at the workflow level to drop everything by
    default, then grant only the specific permissions each job needs.
14. **Require approval for critical deployments.** Use GitHub environments with required-reviewer rules so named
    accounts must manually approve a production or other critical deploy before it runs.
15. **Sanitize user input.** Attacker-controlled context (such as a PR title) can inject commands into `run:`
    blocks, so pass any context through an intermediate environment variable rather than inlining it.
16. **Protect secrets.** Eliminate static credentials where you can and move to short-lived OIDC trusted
    publishing. If you cannot, never hardcode secrets, pass them at the step level rather than the job level,
    prefer environment-scoped secrets, and rotate them. Drop `secrets: inherit` when calling reusable workflows
    and pass only what is needed, and watch that a job's selected `environment` does not reintroduce other
    secrets. Mask non-secret sensitive values with `::add-mask::`, run secret scanning at the `pre-commit` and
    `pull-request` stages and fail on detection, and set `actions/checkout` with `persist-credentials: false`
    unless git operations need the token.

## @security scenario

```gherkin
@security @owasp:github-actions @usecase:prevent-secret-exfiltration
Scenario: A forked pull request cannot run privileged workflow code and steal secrets
  Given a public repository whose workflows default GITHUB_TOKEN to read-only and require approval for all external contributors
  When an attacker opens a pull request from a fork that tries to print a secret to the logs
  Then the workflow does not run automatically and waits for a maintainer to approve it
  And the token exposed to the fork is read-only with no secrets, so the attempt exfiltrates nothing
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario. Keep
the check beside the workflow files it defends, so loosening token scope or the contributor-approval setting
trips it before the change merges.

## The real guarantee

What actually prevents secret theft is the repository and workflow configuration: a default read-only token,
mandatory approval for external contributors, pinned actions, and `permissions: {}` narrowed per job, so even if
attacker code runs it has nothing worth stealing and nowhere to send it. The `@security` scenario proves one
fork cannot exfiltrate a secret; the locked-down token and approval settings are what hold for every fork. A
test is a check; the least-privilege configuration is the guarantee.

## Sources

- OWASP GitHub Actions Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the attack outcomes and the controls across static analysis, repository hardening, runner handling, artifact-poisoning prevention, safe triggers and third-party actions, token minimization, deployment approval, input sanitization, and secret protection. `[documented]`
