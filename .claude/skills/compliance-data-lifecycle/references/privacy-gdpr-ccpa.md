# Privacy Engineering (GDPR, CCPA & privacy-by-design)

Privacy is an engineering property, not a policy PDF. If the data model can't execute a
deletion or export request, no policy will save you.

## Core principles (GDPR Article 5, broadly shared)
- **Lawfulness, fairness, transparency** - have a lawful basis (consent, contract,
  legitimate interest, etc.); tell users what you do with their data.
- **Purpose limitation** - collect for a specific stated purpose; don't silently repurpose.
- **Data minimization** - collect and keep the least necessary. Uncollected data is the
  easiest to protect.
- **Accuracy** - let users correct data; keep it current.
- **Storage limitation** - retain only as long as needed (see
  `data-classification-and-retention.md`).
- **Integrity & confidentiality** - secure it (delegate to `owasp-secure-coding-bdd`).
- **Accountability** - be able to *demonstrate* compliance (records of processing, DPIAs).

## Data-subject rights - design so they're executable
GDPR (and similarly CCPA/CPRA) grant individuals rights you must be able to fulfill within a
**legal deadline** - the deadline is why these must be engineered, not handled manually:

- **GDPR:** respond "without undue delay and in any event within **one month** of receipt"
  (Art. 12(3)). You may extend by **two further months** for complex or numerous requests, but
  you must inform the subject of the extension (with reasons) **within the first month**; no
  permission is needed. [documented - GDPR Art. 12(3)]
- **CCPA/CPRA:** respond to a **verifiable consumer request** (the statutory term) within **45
  calendar days**; extendable
  **once by another 45** (90 total), with notice to the consumer. [documented - Cal. Civ. Code
  §1798.130(a)(2)] Confirm receipt within **10 business days**, and note that verification does not
  pause the 45-day clock. [documented - CCPA Regulations, 11 CCR §7021]

The rights themselves:
- **Access / portability** - export all personal data you hold on them, in a usable format.
  Requires knowing everywhere that data lives (primary DB, derived tables, search index,
  analytics, logs, third parties).
- **Rectification** - correct inaccurate data.
- **Erasure ("right to be forgotten")** - delete their data (with lawful exceptions). Must
  propagate everywhere (see deletion propagation in the retention reference).
- **Restriction / objection** - stop certain processing (e.g. marketing, profiling).
- **Automated-decision / profiling** transparency where applicable.

Design implication: model personal data so it can be **located, exported, and deleted by
subject**. Scattering PII across denormalized tables, logs, and third parties with no map is
what makes these requests impossible.

## Consent (where it's the lawful basis)
- **Granular** (per purpose), **freely given**, **unambiguous** (opt-in, not pre-ticked),
  and **as easy to withdraw as to give**.
- **Log consent**: what was consented to, when, which version of the notice - you must be
  able to prove it.
- Honor withdrawal promptly and propagate it (stop the processing everywhere).

## CCPA/CPRA specifics (California; similar US state laws proliferating)
- Rights to know, delete, correct, and **opt out of "sale"/sharing** of personal
  information. Provide a clear opt-out mechanism ("Do Not Sell or Share").
- **Who it covers:** a for-profit doing business in California that meets **any one** of three
  thresholds (as amended by the CPRA): (a) **> $25M** gross annual revenue in the prior calendar
  year (counted globally, not just CA); (b) buys, sells, or shares the personal information of
  **≥ 100,000** CA consumers or households; or (c) derives **≥ 50%** of annual revenue from
  selling or sharing consumers' personal information. [documented - Cal. Civ. Code §1798.140(d);
  note the CPRA raised the data-volume prong from the original CCPA's 50,000]
- Treat US personal data with equivalent care even below the thresholds; other state laws
  (e.g. Virginia, Colorado) carry their own.

## DPIA (Data Protection Impact Assessment)
For high-risk processing (large-scale sensitive data, systematic monitoring, new tech):
assess the risk to individuals and the mitigations *before* building. Document it - it's
both required and a good design forcing-function.

## Data residency & transfers
- Some data must stay in a region; cross-border transfers need a lawful mechanism (adequacy,
  SCCs). Know where your data (and your subprocessors' data) physically lives.
- Choose regions/subprocessors deliberately; flag when a feature would move regulated data
  across a border.

## Pseudonymization & anonymization
- **Pseudonymization** (replace identifiers with tokens; re-identification possible with a
  key) reduces risk but data is still "personal."
- **Anonymization** (irreversible) takes data out of scope - but true anonymization is hard
  (beware re-identification via combinations). Prefer it for analytics that don't need
  identity.

## Privacy-by-design defaults
- Default to the most privacy-protective setting.
- Minimize by default; justify each field collected.
- Separate identifiers from behavioral data where feasible.
- Don't log PII (see `audit-logging.md` and `owasp-secure-coding-bdd` logging).
