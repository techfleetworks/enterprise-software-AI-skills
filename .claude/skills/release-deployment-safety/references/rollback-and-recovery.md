# Rollback & Recovery

The question to answer *before* every deploy: **how do I undo this in under 5 minutes?**

## Rollback mechanisms (fastest to slowest)
- **Feature flag flip** - instant, no redeploy. The preferred kill switch for behavior.
- **Blue-green cutover back** - reroute traffic to the still-warm previous environment.
- **Redeploy previous immutable artifact** - because you built once and kept the artifact,
  you can redeploy the exact previous version by tag/SHA. Keep the last N artifacts.
- **Roll forward** - if rollback is unsafe (e.g. after a contract migration), ship a fix
  forward fast. This is why small, frequent deploys matter: forward fixes are small.

## Safe vs. unsafe rollback
- Rollback is **safe** when the schema/data is backward-compatible (expand/contract
  guarantees this). Old code can run against the current DB.
- Rollback is **unsafe** after a destructive/contract migration - the structure the old
  code needs is gone. Mitigations: never contract until the new version is proven; keep a
  restorable backup before any destructive step; prefer roll-forward.
- Decouple: deploy the code, but if a migration has already contracted, treat rollback as
  a data-recovery operation, not a redeploy.

## Break-glass procedure
Document, before the incident, the manual override when automation fails:
- Who can execute it and how they get access (and how that access is audited).
- Exact commands / console steps to force traffic to the last-good version.
- How to disable the failing component entirely if partial rollback isn't possible.

## Backups & recovery objectives
- Define **RPO** (max acceptable data loss) and **RTO** (max acceptable downtime) per
  system, and design backups/replication to meet them.
- **Test restores regularly** - an untested backup is a hope, not a backup. Restore drills
  belong in the calendar.
- For destructive migrations, take a point-in-time backup immediately before, and confirm
  it's restorable.

## DORA metric: recovery time (precisely named)
Recovery time is one of the four DORA keys. The name has shifted, and the shift matters:
older DORA material called it **Time to Restore Service**; recent *State of DevOps* reports
call it **Failed deployment recovery time** - scoped to recovering from a *failed
deployment*, not to every incident. "MTTR" (mean time to recovery/repair/restore) is a looser
industry alias that usually spans *all* incidents, so don't treat it as a synonym or you'll
average two different populations together. [documented]

Optimize it by making rollback fast and rehearsed, not by trying to never fail: feature flags +
immutable, redeployable artifacts + practiced procedures. Report the **median and p90**, not the
mean (recovery times are heavily skewed), and read the current *State of DevOps* report for the
performance-tier bands rather than quoting a fixed "under an hour" - the tier thresholds are
revised each year.

*Source:* Google Cloud / DORA - "DORA's software delivery metrics: the four keys" and the annual
*State of DevOps* report, dora.dev (retrieved 2026-10-10). [documented]

## Before-you-deploy checklist
- [ ] Rollback mechanism identified and achievable in < 5 min
- [ ] Rollback is safe given any migrations already applied (or roll-forward plan exists)
- [ ] Previous artifact retained and redeployable by tag/SHA
- [ ] Backup taken before any destructive/irreversible step
- [ ] Break-glass steps documented and access available
- [ ] Monitoring/alerts in place to detect a bad deploy within minutes (see
      `sre-operational-readiness`)
