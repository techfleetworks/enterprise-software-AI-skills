# Secrets Management

## What it is

How to store, hand out, rotate, and retire the credentials an application needs (API keys, database passwords,
SSH keys, certificates) so they do not leak and, when one does, the damage is small and quickly contained. This
is the per-sheet guidance from the OWASP Secrets Management Cheat Sheet, condensed to the controls that hold and
the attack they stop.

## The attack it stops

Secrets hard-coded in source, scattered through config files, printed in build logs, or passed as plain
environment variables are the easiest win an attacker gets: one leaked database password or cloud key can open
every system that trusts it, and shared secrets make it impossible to tell where the leak came from. A key that
never rotates stays useful to the thief for years; one with no revocation path cannot be shut off at all. A
central vault that hands out short-lived, least-privilege, audited secrets and rotates them automatically is
what keeps a single exposure from becoming a full breach.

## Controls

Grouped as the cheat sheet groups them:
1. **Pick a solution that stays up.** Both people in an incident and applications at startup may need credentials
   fast, and under heavy load, so the service must be reliable enough to serve that traffic.
2. **Centralize and standardize.** Route secrets through a managed solution (one, or a few with a standard way to
   interact), cover their whole lifecycle plus authentication, authorization, and accounting, and make it
   obvious what each secret is for and where to find it. Even with one central tool, its own master credential
   must be kept in a separate backup store.
3. **Apply least privilege to access.** Anyone who can read or change a secret becomes a way it can leak, so
   engineers should not have access to every secret. The solution must offer fine-grained, per-object access
   controls.
4. **Automate the handling.** Cut human contact with raw secrets: run a secrets pipeline for creation and
   rotation, prefer dynamic secrets that are minted fresh per session with a short lease and revoked when done
   (note that restarting an app does not revoke stolen credentials; the backing service must expire them), and
   automate rotation of static secrets. Build rotation so a safe handover happens (create, set, test, finish),
   and when a rotation function runs per step, read the pending value from the version the request token names
   rather than a stale local copy.
5. **Protect secrets in memory where it matters.** In sensitive settings, shrink the window a secret sits in
   memory. Drive the effort from a threat model, since full protection against attacks like Rowhammer or
   Meltdown needs physical isolation. In .NET and Java avoid immutable types like strings for secrets; use byte
   or char arrays you can overwrite, zero the memory after use, and consider memory encryption.
6. **Audit every access tamper-proof.** Log who asked for a secret and for what, whether it was approved, when
   and by whom it was used, when it expired, any reuse of expired secrets, any auth errors, every update, and
   admin actions, in logs resilient to tampering and with correct, synchronized timestamps.
7. **Manage the secret lifecycle.** Generate new secrets securely with minimum privileges and deliver them over
   a secure or side channel. Rotate regularly so stolen credentials expire fast (user passwords are the
   exception, rotated only on suspected compromise). Revoke secrets (and certificates) when no longer needed or
   possibly exposed, and set expirations so consumers must check a secret is still active before trusting it.
8. **Encrypt secrets in transit, always.** Never send a secret in clear text; TLS is universal, so there is no
   reason to skip it.
9. **Plan for downtime and break-glass.** Expect the secrets service to be unavailable sometimes. Keep tested,
   automated, encrypted backups on restricted storage, test restores, and keep emergency break-glass credentials
   in a separate secondary store, backed up and routinely tested.
10. **Enforce policies and keep metadata.** Apply organization-wide rules for password complexity and approved
    algorithms through the central tool. Store metadata for each secret (when and by whom and what it was
    created, consumed, rotated, or deleted; who owns it; its purpose; its type; when to rotate it) so you are not
    locked in to one vendor.
11. **Handle federation tokens with care.** OIDC lets an app delegate login to an identity provider but does not
    by itself remove phishing, credential stuffing, or weak passwords, so choose an IdP with strong controls and
    phishing-resistant methods like WebAuthn. Keep protecting issued tokens and client credentials; OIDC does
    not replace other secrets such as database passwords.
12. **Harden the CI/CD pipeline.** Treat CI/CD as production: patch it, monitor security events, give developers
    least privilege, keep secrets out of pipeline output and debug sessions, block shell access to runners, and
    require review before a pipeline can be created.
13. **Place CI/CD secrets deliberately.** Secrets can live in the CI/CD tool's own secret store, in a dedicated
    secrets manager the pipeline authenticates to, or be fetched by the consumer itself so the pipeline never
    holds them. Wherever they sit, keep no single wide-blast "big secret," know who can view or alter them,
    rotate them, log and alert on extraction or misuse, and make sure a fork does not copy them.
14. **Attribute and scope CI/CD credentials.** Give the tooling its own service accounts scoped to just the
    secrets and services a job needs, rotate those credentials and expire them after a job, and keep every
    pipeline run traceable to the person who defined or triggered it. Keep CI/CD logs queryable for at least 90
    days.
15. **Use designated solutions in the cloud.** Prefer the provider's secrets service (AWS Secrets Manager, GCP
    Secret Manager, Azure Key Vault) or a cloud-agnostic tool for multi-cloud. Choose between server-side
    encryption (the provider decrypts before handing over) and client-side encryption (stays encrypted until the
    consumer decrypts, giving end-to-end protection). Bring-your-own-key gives more control but adds complexity,
    so use it only when your threat model demands it.
16. **Lock down cloud IAM.** Secrets are only as safe as the identity layer, so harden the whole IAM setup: no
    open pass-role or unrestricted role-creation privileges, tight control over what can impersonate a service
    account, and access scoped so no principal can read every secret at once. Watch for API or service limits
    that could let you DoS yourself.
17. **Inject secrets into containers safely.** Prefer orchestrator-mounted volumes or an in-memory fetch by a
    sidecar over environment variables, and never bake secrets into the image with `ENV` or `ARG`. Only expose
    secrets over the channel between the container and its deployment unit, never through shared external
    mechanisms, and encrypt the orchestrator's secret store.
18. **Put guardrails and monitoring in place.** Write access policies that limit who and what can read or write a
    secret, separate production and development secrets, and continuously monitor who accesses each secret, from
    which IP, and how, alerting on anything abnormal. Make the solution easy for developers to adopt, or they
    will fall back to insecure habits.
19. **Encrypt the stored secrets well.** Use an algorithm that gives both confidentiality and integrity, such as
    AES-256 in GCM or ChaCha20-Poly1305, and keep up with current key-length guidance. Do not store the
    encryption keys next to the secrets unless the keys are themselves encrypted (envelope encryption); see the
    Key Management guidance for key storage.
20. **Detect secrets before they ship.** Run secret-detection tools (such as detect-secrets), scan early at the
    developer and pre-commit stage, treat secrets as part of the threat model, and tune signatures to the secret
    types you actually use. Keep documentation on how secrets are rotated, who owns them, their dependencies, and
    the impact if exposed.
21. **Respond fast to exposure.** Have a rehearsed incident plan: revoke the exposed secret right away, rotate in
    a new one (automated and not human-readable), delete the old one everywhere including code and logs, and log
    the secret's full history (who had access, when it was used, when it was last rotated) for the responders.

## @security scenario

```gherkin
@security @owasp:secrets-management @usecase:no-hardcoded-secret
Scenario: An application loads credentials from a vault, never from source
  Given an application that needs a database credential
  When the application starts and requests the credential
  Then it receives a short-lived secret from the central secrets manager over TLS
  And no credential is hard-coded in the source, baked into the image, or passed as a plain environment variable
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps a leak small is the central, audited vault handing out short-lived, least-privilege secrets
over TLS, backed by automatic rotation and a revocation path: the secret is never in the code to steal, it
expires before a thief gets far, and a compromise can be shut off and traced. The `@security` scenario proves
one credential comes from the vault and is absent from the source; the central ownership, the short lease, the
rotation, and the revocation are what make every secret recoverable from exposure. A test is a check; the
managed lifecycle of the secret is the guarantee.

## Sources

- OWASP Secrets Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html>, retrieved 2026-10-11): the general secrets-management practices (high availability, centralization, least-privilege access, automation and dynamic secrets, memory handling, auditing, lifecycle, TLS, backup and break-glass, metadata, token security), plus the CI/CD, cloud, container, implementation, encryption, detection, and incident-response controls summarized above. `[documented]`
