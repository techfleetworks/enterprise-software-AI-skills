---
name: compliance-data-lifecycle
description: 'Use whenever a feature handles personal data, regulated data, or must satisfy audit and compliance requirements, and whenever building or changing how data is stored, migrated, retained, backed up, or recovered. Covers SOC 2 and ISO 27001 control mapping, GDPR and CCPA/CPRA and other consumer privacy laws (data-subject and consumer rights, consent, minimization, DPIA), tamper-evident audit logging, data classification plus retention and deletion, and the data lifecycle at scale: safe schema and data migrations, backups, and disaster recovery (RTO/RPO). Trigger proactively on "PII," "personal data," "GDPR," "CCPA," "CPRA," "HIPAA," "SOC 2," "ISO 27001," "audit," "compliance," "consent," "data retention," "right to be forgotten," "data deletion," "backup," "disaster recovery," "RTO," "RPO," "migration," or handling user or customer data, even without those words. Pairs with owasp-secure-coding-bdd (security controls) and release-deployment-safety (migration mechanics).'
---

# Compliance and Data Lifecycle

## Why this exists

Two things quietly block software from being enterprise-ready. It cannot prove it handles data lawfully
and safely (compliance and privacy), and it treats data as an afterthought (migrations, retention,
recovery). Enterprise buyers require a SOC 2, ISO 27001, or privacy posture, and its absence is a
deal-blocker, not a nice-to-have. The data also outlives the code: a schema migration, a retention
rule, or a backup gap can cause irreversible loss or a regulatory breach. This skill bakes compliance
and a disciplined data lifecycle into how features are built, so "handles data" means "handles data
lawfully, auditably, and recoverably."

This is the governance and data half that complements `owasp-secure-coding-bdd` (which enforces the
security controls these frameworks require) and `release-deployment-safety` (which owns the mechanics
of zero-downtime migrations). This skill adds the why and the what: compliance obligations, privacy
rights, auditability, retention, and recovery guarantees.

## The main idea

**Know what data you hold, why you are allowed to hold it, how long you keep it, who can touch it, how
you would prove all of that to an auditor, and how you would get it back if it is lost.** If you cannot
answer those six for a feature that touches data, the feature is not done.

Two honest frames sit under that. First, the laws differ by name but agree on the obligations.
Rather than coding to one statute, build to the shared duties that recur in GDPR, the US state laws,
and the rest: a lawful basis and a plain notice, executable data-subject or consumer rights,
minimization, retention limits with real deletion, extra care for sensitive data, and an opt-out of
sale or sharing. Then cite the specific law. Second, a recorded control is not a correct control. A
gate can prove a retention period is written down; whether it is lawful and defensible is judgment for
review and counsel. Say which is which.

## The workflow

### Step 1: Classify the data the feature touches

Read `references/data-classification-and-retention.md`. Before anything else, identify:
- Is there **personal data** (PII), **sensitive personal data** (health, biometric, financial, and in
  newer laws neural data and precise geolocation, which carry extra rules), or **regulated data** (PCI
  cardholder data, PHI)?
- What is the **classification** (public, internal, confidential, restricted)?
- Data classification drives every downstream control: encryption, access, logging, retention, and
  residency.
- **Mechanical gate:** keep a committed **data map** (the inventory this step requires) and run
  `scripts/check-untagged-pii.mjs --map <data-map.json> <schema-dir>` in CI. It fails the build when a
  PII-looking column (`email`, `ssn`, `dob`, `phone`) exists in the schema with no classification in
  the map, so "add a column, classify it later (never)" cannot happen. A name that only looks like PII
  is resolved by declaring it `not-personal`, which records the decision instead of hiding it.

### Step 2: If personal data is involved, apply privacy by design

Read `references/privacy-gdpr-ccpa.md`. Build in the obligations the consumer privacy laws share.

**The durable duties (true across GDPR, the US state laws, and the international regimes):**
- **Lawful basis and purpose limitation.** Collect only for a stated, lawful purpose, and do not
  repurpose silently. GDPR Article 6 names six bases (consent, contract, legal obligation, vital
  interests, public task, legitimate interests); pick and record one per purpose. China's PIPL does
  not accept legitimate interest, so there consent or contract carries the load.
- **Data minimization.** Collect and keep the least data needed. The cheapest data to protect is data
  you never collected. This is a core GDPR principle (Article 5) that now appears in nearly every law.
- **A plain-language notice** that states what you collect, why, how it is used, who receives it, and
  the rights available.
- **Consent where required**, granular, revocable, and logged, and honor withdrawal. Sensitive data
  and children's data usually need explicit or verifiable parental consent.
- **Data-subject and consumer rights**, designed so they are actually executable (including across
  backups and downstream systems): access and export (portability), correction, deletion (the "right
  to be forgotten"), and restriction or opt-out.
- **An opt-out of the sale or sharing of personal data**, including honoring a browser opt-out signal
  (the Global Privacy Control) where the law requires it.
- **A DPIA** (Data Protection Impact Assessment) for high-risk processing.
- **Data residency and cross-border transfer** controls (adequacy decisions, standard contractual
  clauses, binding corporate rules, or the EU-US Data Privacy Framework).

**The response clocks differ, so design to the strictest one you are subject to:** GDPR is one month
(extendable by two further months for complex or numerous requests, with notice). California's
CCPA/CPRA is 45 calendar days (extendable to 90 with notice) for access, deletion, and correction, and
an opt-out of sale or sharing must be honored as soon as feasible and no later than 15 business days.
Brazil's LGPD is 15 days.

**Sensitive personal information gets stricter handling.** Under CCPA/CPRA it is a defined subset
(government IDs, account logins with credentials, precise geolocation, message contents, genetic and
biometric data used to identify a person, and data on health, sex life, race, religion, or union
membership), and a consumer can direct that it be used only for limited purposes. Newer amendments add
categories such as neural data and children's data.

**The landscape is broad and moving, so build portable, not per-state.** As of early 2026 roughly
twenty US states have their own comprehensive consumer privacy laws, with more taking effect each year
(the IAPP US State Privacy Legislation Tracker is the live source; treat any fixed count as dated).
Common applicability thresholds are on the order of 100,000 consumers a year, or 25,000 consumers plus
more than half of revenue from selling data. Internationally the same shape recurs in the UK GDPR,
Brazil's LGPD, Canada's PIPEDA and Quebec Law 25, China's PIPL, India's DPDP Act, South Korea's PIPA,
Japan's APPI, Australia's Privacy Act, and South Africa's POPIA. Meeting the shared duties above, then
checking the few local specifics (response clock, sensitive categories, transfer rules, breach
window), covers most of them.

### Step 3: Map the feature to compliance controls

Read `references/compliance-frameworks.md`. Identify which controls the work must satisfy (SOC 2 Trust
Services Criteria, ISO 27001 Annex A, and sector rules like HIPAA or PCI DSS if relevant) and make them
real in the implementation, not just documented:
- Access control and least privilege (delegate mechanics to `owasp-secure-coding-bdd`).
- Change management (delegate to `release-deployment-safety`: reviewed, traceable deploys).
- Audit logging (Step 4).
- Encryption in transit and at rest.
- Vendor and subprocessor management for any third party touching the data, with a data-processing
  agreement and the controller-versus-processor roles written down.

Produce **evidence** as a byproduct (logs, approvals, config). Auditors want proof, not promises.

### Step 4: Add tamper-evident audit logging for sensitive actions

Read `references/audit-logging.md`. For any access to or change of sensitive or regulated data, and any
privileged action, record an **audit log**: who, what, when, from where, before and after (or a
reference), and the outcome. Audit logs must be tamper-evident (for example a hash chain), retained per
policy, access-controlled, and must never themselves hold secrets or unnecessary PII. This is distinct
from operational logging (in `sre-operational-readiness`); an audit log is a compliance artifact.

### Step 5: Define retention and deletion, and make deletion real

Back to `references/data-classification-and-retention.md`:
- Every data category gets a **retention period** tied to its purpose and lawful basis; delete or
  anonymize when it expires. Keeping data forever is a liability and often unlawful (the GDPR storage
  limitation principle). Some records must instead be kept for a set term: audit logs under PCI DSS,
  health records under HIPAA, and a compliance or business-continuity tier often held for seven years
  or more.
- **Mechanical gate:** run `scripts/check-retention-basis.mjs --map <data-map.json>` in CI. It fails
  the build when any personal-data entry in the map has no lawful basis or no retention period, so a
  field cannot be classified and then left with no decision about why it is held or when it goes. A
  placeholder (`tbd`, `n/a`) does not count; a `not-personal` entry is exempt.
- **Deletion must propagate**: the primary store, caches, search indexes, backups (or a documented
  backup-expiry approach), logs, analytics, and downstream and third-party systems. Deleting from a
  backup is usually impractical, so the honest approach is a documented backup retention window after
  which the data ages out, stated in the deletion design.
- Prefer **anonymization or pseudonymization** where the data keeps analytical value but identity is
  not needed. True anonymization takes the data out of scope; pseudonymization does not, because it can
  be re-linked.

### Step 6: Make data changes safe and recoverable

Read `references/safe-data-migrations-and-dr.md`:
- **Migrations**: backward-compatible (expand and contract, with the mechanics in
  `release-deployment-safety`), but here add the data-integrity and auditability lens: validate row
  counts and invariants before and after, keep the migration reversible or backed up, and log it as a
  change. A rollback that drops an object loses data written since; rename instead.
- **Backups**: automated, encrypted, access-controlled, and **restore-tested** on a schedule. An
  untested backup is not a backup, and replication and RAID are not backups, because both copy a bad
  write or a corruption to every copy.
- **Disaster recovery**: define **RPO** (the most data you can afford to lose) and **RTO** (the most
  downtime you can accept) per system, design replication, backup, and failover to meet them, and run
  DR drills. Know your data-loss window: asynchronous replication loses the in-flight writes on a
  failover.

### Step 7: Encode compliance and data guarantees as tests

Add scenarios (tagged `@compliance` and `@data-lifecycle`) to the BDD suite so these cannot silently
regress:

```gherkin
  @compliance
  Scenario: User data export includes all personal data on request
    Given a user requests a data export
    When the export is generated
    Then it contains all personal data held for that user across primary and derived stores

  @compliance
  Scenario: Deletion request removes personal data everywhere it propagated
    Given a user requests account deletion
    When the deletion is processed
    Then their personal data is removed or anonymized in the database, search index, and caches
    And backups are scheduled to expire the data per the retention policy

  @compliance
  Scenario: Access to a sensitive record is audit-logged
    Given an admin views a customer's payment details
    Then an audit log entry records the admin identity, record id, timestamp, and source IP

  @data-lifecycle
  Scenario: Migration preserves row counts and key invariants
    Given a data migration transforms the "orders" table
    When the migration completes
    Then the row count matches the pre-migration count and no order total changed
```

### Step 8: Never let compliance work cause an outage or a lockout

Deletion, retention purges, access tightening, and key rotation are exactly the operations that cause
accidental data loss or self-lockout. Run the lockout and accidental-deletion check from
`owasp-secure-coding-bdd` before executing any of them, and take a verified backup before an
irreversible deletion.

## Mechanical gate

This skill ships two structural gates, each with a discriminating test. They share one source of truth,
the committed data map.

- `scripts/check-untagged-pii.mjs` (ADR-0010) fails the build when a PII-looking schema column is not
  classified in the data map, so a personal column cannot be added and left unclassified. Its test is
  `test/untagged-pii.test.mjs`.
- `scripts/check-retention-basis.mjs` (ADR-0021) fails the build when a personal-data entry in the map
  has no lawful basis or no retention period, so a classified field cannot sit with no decision about
  why it is held or when it is deleted. A placeholder does not count; `not-personal` is exempt. Its
  test is `test/retention-basis.test.mjs`.

Both gates check that a decision is recorded, not that it is correct. Whether a lawful basis is the
right one, a retention period is defensible, or deletion truly propagated everywhere is judgment for
`judge-arch`, for the `@compliance` scenarios, and for counsel. Say honestly which properties are gated
mechanically and which rest on review.

## Before you call it done

- You can answer the six questions in The main idea for every data element the change touches.
- `check-untagged-pii` is green: every PII-looking column is classified in the data map.
- `check-retention-basis` is green: every personal entry in the map has a lawful basis and a retention
  period (or is `not-personal`).
- Personal data has a lawful basis, a plain notice, and executable data-subject or consumer rights
  (access, deletion, correction, portability, opt-out), designed to the strictest response clock you
  are subject to and to propagate across backups and downstream systems.
- Sensitive actions are audit-logged to a tamper-evident store; data changes are reversible or backed
  up; backups are restore-tested; RPO and RTO are defined and met.
- The evidence ledger below is filled in: each compliance claim has a state and a re-runnable source,
  and the central claim ("a deletion request removes this data everywhere") is at `observed`, not
  `inferred`.

## Reference files

| Topic | File |
|---|---|
| SOC 2, ISO 27001, HIPAA/PCI, control mapping, evidence, continuous compliance | `references/compliance-frameworks.md` |
| GDPR, CCPA/CPRA, other consumer laws, data-subject rights, consent, minimization, DPIA, residency | `references/privacy-gdpr-ccpa.md` |
| Tamper-evident audit logging: what and how to log, retention, access | `references/audit-logging.md` |
| Data classification, retention schedules, deletion and anonymization propagation | `references/data-classification-and-retention.md` |
| Safe data migrations (integrity and audit), backups, restore testing, RTO/RPO, DR | `references/safe-data-migrations-and-dr.md` |
| Mechanical gate: PII-column-without-classification linter (data-map enforcement) | `scripts/check-untagged-pii.mjs` |
| Mechanical gate: missing-lawful-basis-or-retention linter (data-map enforcement) | `scripts/check-retention-basis.mjs` |

## Evidence & skeptical assessment (required)

Every "this is compliant / this data is handled lawfully and recoverably" statement is a factual claim,
so it follows the repo's evidence discipline (canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
A compliance posture is an **evidence ledger**: each obligation is a claim with a state and a
re-runnable source, never a bare assertion. Hunt the disconfirming case first (where does personal data
survive a deletion request?) before you sign off.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "Every personal column is classified" | `check-untagged-pii` runs clean on the schema in CI | the gate is a blocking CI check on every PR |
| "Every personal field has a lawful basis and a retention" | `check-retention-basis` runs clean on the data map in CI | the gate is a blocking CI check and the retention periods are reviewed |
| "A deletion request removes the data everywhere" | the `@compliance` deletion scenario passes across primary, index, and cache | the scenario runs against real stores and the backup-expiry window is documented and tested |
| "A data export returns all of a user's personal data" | the `@compliance` export scenario passes across primary and derived stores | it runs against the real export path, not a fixture |
| "Sensitive access is audit-logged, tamper-evident" | the `@compliance` audit scenario shows the entry written | the audit store is append-only or hash-chained and access-controlled |
| "We can recover within RPO/RTO" | a restore test meets the targets once | DR drills meet RPO and RTO on a schedule, with the data-loss window measured |

**Definition of done:** the ledger covers every obligation the change needs with a verdict and a
re-runnable source; a claim that could be measured (does deletion propagate, does the restore meet RTO)
is `observed` or `proven`, never `inferred`; and no "compliant" verdict is given while the central
deletion-propagation claim is below `observed`. A green data-map gate is necessary, not sufficient, and
"a basis is recorded" is never the same as "the basis is lawful."

## Why this holds for every developer and every agent

It binds everyone because the gates, the scenarios, and the data map live in CI and git, not in memory.
Agents get the discipline through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by `check-untagged-pii`
and `check-retention-basis` (blocking gates that fail an unclassified column or an undecided personal
field) and by the `@compliance` and `@data-lifecycle` scenarios in the shared suite. It survives any one
person because the gate scripts, the reference files, the data map, and the scenarios all live in the
repo. The honest limit: the gates prove a classification, a basis, and a retention are recorded, not
that they are lawful or that deletion truly propagated. Those rest on the scenarios, on `judge-arch`,
and on counsel, and a missed obligation becomes a new scenario or a new map requirement so the gap
closes the next time.

## Sources and attribution

- Regulation (EU) 2016/679 (GDPR), read via gdpr-info.eu (a mirror of the official text), retrieved
  2026-10-12: the Article 5 principles (lawfulness, purpose limitation, minimization, accuracy, storage
  limitation, integrity and confidentiality, accountability), the six Article 6 lawful bases, the
  Chapter 3 data-subject rights (Articles 12 through 22, including access, erasure, portability, and
  objection), and the one-month response time extendable by two further months in Article 12(3).
  `[documented]`
- California Attorney General, "California Consumer Privacy Act (CCPA)"
  (<https://oag.ca.gov/privacy/ccpa>), retrieved 2026-10-12: the consumer rights as amended by the CPRA
  (know, delete, correct, opt out of sale or sharing including a global privacy control, limit use of
  sensitive personal information, non-discrimination), the definition of sensitive personal
  information, the 45-day response (extendable to 90), and the 15-business-day opt-out. `[documented]`
- Secure Privacy, "Privacy Laws 2026" (<https://secureprivacy.ai/blog/privacy-laws-2026>), retrieved
  2026-10-12, used as a secondary editorial tracker (it flags its own inconsistencies): the roughly
  twenty US states with comprehensive laws by 2026, common applicability thresholds, the 2026
  California amendments (cybersecurity audits, risk assessments, new sensitive categories), and
  Global Privacy Control adoption. Treat any fixed state count as dated; the IAPP US State Privacy
  Legislation Tracker is the live source. `[reported]`
- Global Law Lists, "International Lawyer's Guide to Data Privacy Laws 2026"
  (<https://globallawlists.org/insights/international-lawyers-guide-data-privacy-laws-2026-navigating-50-plus-jurisdictions>),
  retrieved 2026-10-12, secondary editorial: the shape shared across UK GDPR, Brazil LGPD (15-day
  response), Canada PIPEDA and Quebec Law 25, China PIPL (no legitimate-interest basis, data
  localization), India DPDP Act, South Korea PIPA, Japan APPI, Australia Privacy Act, and South Africa
  POPIA, and the common obligations (lawful basis, notice, rights, minimization, retention, transfer
  controls, breach notification, sensitive-data consent). `[reported]`
- Integrated Connections, LLC, "General Data Protection Regulation (GDPR) Compliance Manual," revision
  original, 10 February 2021 (a real controlled-document compliance manual, read in full from the
  provided PDF): the operational structure of a GDPR program, that is, a legal-basis register,
  controller and processor roles and third-party processor agreements, a data retention and disposal
  schedule, DPIAs, privacy-by-design, and documented data-subject-rights procedures (consent and
  notice, access, portability, rectification and erasure, restriction, and objections and automated
  decision-making). `[documented]`
- Laine Campbell and Charity Majors, *Database Reliability Engineering*, 1st edition, O'Reilly, 2017
  (copyright 2018; ISBN 978-1-491-92594-2): a backup is only real if the restore is tested; replication
  and RAID are not backups; RTO and RPO as the recovery time and the data-loss window; data
  classification drives encryption and key lifecycle; audit logging of configuration, privilege, and
  data-change events; and an offline tier for multi-year compliance retention. `[documented]`
- The ISO/IEC 27001 and 27701 standards themselves are paywalled and were not read, so the ISO-mapping
  guidance here is grounded in the free SOC 2 Trust Services Criteria and the NIST control families and
  is stated as such rather than cited to ISO text. `[not-assessed]`
