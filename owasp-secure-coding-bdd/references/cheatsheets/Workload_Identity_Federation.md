# Workload Identity Federation

## What it is

How a CI/CD pipeline gets cloud access without storing a long-lived cloud key. The platform mints a short-lived
signed OIDC token that describes the job, the cloud provider checks it against a trust policy, and only then hands
back temporary credentials. This is the per-sheet guidance from the OWASP Workload Identity Federation Cheat
Sheet, condensed to the controls that hold and the attacks they stop. It covers OIDC federation for deployment
jobs; secrets that cannot be replaced this way belong in the Secrets Management guidance.

## The attack it stops

A reusable cloud key sitting in a pipeline is a standing target: anyone who reads it keeps cloud access until
someone notices and rotates it. Federation removes that stored key, but it opens its own failure modes. A trust
policy that only names a shared CI/CD issuer can let other tenants in. Wildcard matching can admit any repository,
branch, or job. Validating the token against the right issuer but forgetting to scope permissions hands a job an
administrative role. And because issued cloud credentials have their own lifetime, they can outlive the job and be
replayed if they leak into logs, caches, or artifacts.

## Controls

In the cheat sheet's order:
1. **Know the two policies that must both hold.** The token proves which job is asking, but validating it against
   the trusted issuer does not grant access. Set a **trust policy** for which external workloads may receive
   credentials, and a separate **permissions policy** for which resources and operations those credentials allow.
   A narrow trust policy cannot undo an over-powered deployment role. Use the provider's own federation
   integration; do not build a token validator inside the pipeline.
2. **Pin the exact issuer, audience, and subject.** Configure the precise `iss`, expected `aud`, and allowed `sub`
   or equivalent job attributes, and have the provider verify the signature and validity period along with them.
   Use the real claims your job emits and the provider's documented matching rules.
3. **Restrict to your organization, repository, and context.** Trusting only a shared issuer can admit other
   tenants, so narrow to the intended org, repo or project, and deployment context. Prefer immutable,
   non-reusable org and repo identifiers over names someone else could later claim.
4. **Allow only the branches, environments, or workflows you need.** Avoid wildcards that let in every repo or job
   context. Confirm which claims the provider can actually enforce as policy conditions, because a claim appearing
   in a token does not mean it is usable in the trust policy.
5. **Require review for deployment workflow changes.** Protect the trusted workflow files with required reviews,
   following the repository-hardening guidance.
6. **Lock down deployment environments.** Once an environment is trusted, decide which people may run against it
   and which branches or tags are permitted to ship to it. GitHub Actions leaves the branch out of its default
   environment-scoped subject, so align with whatever subject format you configured and enforce the branch limit
   via environment protection rules or another condition the provider supports.
7. **Grant least privilege, and split prod from non-prod.** Give the deployment only the cloud operations and
   resources it needs, and use separate identities and trust rules for production versus non-production. Keep the
   federation configuration and permission administration out of ordinary deployment roles, so a compromised job
   cannot widen its own access.
8. **Enable token requests only where needed.** Switch on OIDC token requests solely for the jobs that actually
   require cloud access. Under GitHub Actions, the job-level `id-token: write` setting authorizes the job to ask
   for a token and confers no cloud permissions on its own.
9. **Keep credential lifetimes short, and do not assume they auto-expire.** Request the shortest lifetime the
   provider supports that still fits the job. Issued cloud credentials have their own expiry and do not
   necessarily stop working when the job or its OIDC token ends.
10. **Treat the OIDC token and the credentials as secrets.** Do not log either one, write it into an artifact or
    cache, or hand it off to jobs that have no business with it. Once a migration is confirmed, retract the old
    static keys and purge any pipeline copies so they cannot be used to route around the federation restrictions,
    per the secret-lifecycle guidance.
11. **Test the boundaries before production.** Run the allowed deployment, and confirm that unauthorized repos,
    branches, and job contexts cannot get production credentials and that the authorized job cannot reach resources
    beyond its permissions. Repeat after any change to trust policies, claim formats, or workflow config.
12. **Monitor and prepare to respond.** Switch on cloud audit logging for token-exchange events and for any use of
    the roles or service accounts involved, review which identity attributes actually get captured, and tie them
    back to CI/CD run records, because complete attribution does not happen on its own. Raise alerts on identities
    you did not expect and on edits to federation trust or permissions. Stay ready to stop fresh credential
    issuance and clamp down on ones already handed out, bearing in mind that tearing down a trust relationship will
    not on its own terminate active sessions, and leave room for policy propagation delay.

## @security scenario

```gherkin
@security @owasp:workload-identity @usecase:scoped-oidc-trust
Scenario: Cloud federation refuses an OIDC token from an untrusted branch
  Given a cloud role whose trust policy pins the issuer, audience, repository, and allowed branch
  When a job from a different branch or repository presents its OIDC token to request production credentials
  Then the provider refuses to issue credentials because the token's subject and claims do not match the trust policy
  And the permissions policy separately limits the credentials to only the resources the deployment needs
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps federation safe is the pair of policies enforced by the cloud provider: a trust policy that
issues credentials only to the exact issuer, audience, repository, branch, and subject you named, and a separate
permissions policy that caps what those credentials can touch. The `@security` scenario proves one untrusted
branch is turned away; the provider-enforced trust and permissions scoping is what keeps every other repo, branch,
and job from minting production access. A test is a check; the two scoped policies the provider enforces are the
guarantee.

## Sources

- OWASP Workload Identity Federation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Workload_Identity_Federation_Cheat_Sheet.html>, retrieved 2026-10-11): the trust-boundary model, the split between trust and permissions policies, the issuer/audience/subject and org/repo/branch restrictions, the least-privilege and short-lifetime credential handling, and the verification, monitoring, and incident-response steps summarized above. `[documented]`
