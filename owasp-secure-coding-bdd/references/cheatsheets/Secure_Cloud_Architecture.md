# Secure Cloud Architecture

## What it is

The design patterns that make a cloud system secure before any code runs: how to analyze risk, where to put
public versus private components, where to draw trust boundaries, which security tooling to attach, and who owns
which layer under the shared responsibility model. This is the per-sheet guidance from the OWASP Secure Cloud
Architecture Cheat Sheet (aimed at medium-to-large enterprise systems), condensed to the controls that hold and
the attack they stop.

## The attack it stops

A flat cloud design lets one foothold reach everything. If a database sits on a public subnet, an attacker finds
it directly from the internet. If components trust each other just because they share an account, a single
compromised service walks straight into the next. If object storage is public, anyone with the URL reads the
data and maps your environment for the next move. If no one knows which security layer is yours versus the
provider's, a gap goes unpatched because each side assumes the other owns it. Segmentation, explicit trust
checks, private storage, and clear ownership are what keep one break from becoming total.

## Controls

The cheat sheet walks through these design decisions:

1. **Risk analysis, threat modeling, and attack-surface review.** Before building, work out what threats the
   app faces, how likely each is, where it could be attacked, and what the business loses if it falls. Security
   budget is finite, so spend it where the risk is.
2. **Object storage access, from safest to least safe.**
   - *IAM access:* reach storage through a service that authenticates with a workload identity or federated role
     holding short-lived credentials, never an embedded long-term key; scope permissions to only the needed
     operations. Fine for sensitive data when done right.
   - *Signed URLs:* hand out cryptographically signed, time-limited URLs for direct file access. Use only for
     low-sensitivity data, since anyone holding the URL gets in anonymously, and custom signing code can be a
     injection point. Set expiry deliberately.
   - *Public storage:* avoid it except for genuinely public, non-sensitive files. Treat anything left here as
     already leaked, and know it gives attackers free reconnaissance.
3. **VPCs and subnets.** Carve the network into a VPC with public and private subnets. Public subnets hold
   internet-facing pieces (front-end apps, load balancers, carefully built bastions). Private subnets hold
   databases, backend servers, and anything too sensitive to expose. Route internet traffic into private
   components only through the public tier, so soft backends never face the internet directly.
4. **Trust boundaries.** Wherever two components with different trust levels meet, make an explicit
   authentication and authorization decision. Do not grant trust just because a component is internal or shares
   an owner (per NIST SP 800-207). Choose the level deliberately:
   - *No trust:* every component re-verifies with the auth service; for very high-risk systems; secure but slow,
     complex, and costly.
   - *Full trust:* nothing is verified internally; do not use this when there is anything worth protecting, as
     user input flows unchecked into critical components.
   - *Some trust (typical):* a gateway does shared authentication, while each service still enforces its own
     authorization using resource or business context, blocks paths that skip the gateway, and uses its own
     least-privileged identity to reach storage.
5. **Security tooling.**
   - *Web Application Firewall:* attach a WAF at entry points (load balancers, API gateways) as the first line
     against payloads like XSS and SQLi. Use provider base rule sets, then add custom rules (route filtering,
     tech-specific protections, rate limits on sensitive APIs).
   - *Logging and monitoring:* log request outcomes against an allow-listed schema (method, route, status,
     correlation ID, non-secret actor), excluding credentials, tokens, cookies, and sensitive bodies; carry
     trace IDs through the request; mask PII. Monitor with anomaly alerts (4xx/5xx spikes, unusual
     CPU/memory/storage, abnormal DB or invocation counts), failed health checks, deploy errors, and cost
     cutoffs, all tuned to an environment baseline.
   - *DDoS protection:* start with WAF rate limits and route blocking; add a managed provider product (such as
     AWS Shield or Cloud Armor) when risk and criticality justify it.
6. **Shared responsibility model.** Know exactly which layers you own versus the provider, and mind the gaps.
   - *IaaS:* the provider runs the infrastructure; you own nearly everything above it (OS, networking controls,
     app, data, auth). Most control, most cost and maintenance.
   - *PaaS:* you own app auth, the application code, and external data; the provider secures the containers, OS,
     and some networking. Easier to run, but with platform limits and compatibility constraints.
   - *SaaS:* the provider owns almost the whole stack; you handle only configuration, some access control, and
     integration trust. Lowest effort, least control and visibility; ask vendors for compliance attestations.
   - *Self-managed tooling:* the more self-managed a service, the more upkeep falls to you. Automate version and
     image updates and schedule time to refresh stale resources. Confirm which security tasks (auth, logging,
     code security, third-party patching) remain yours even on managed services.

## @security scenario

```gherkin
@security @owasp:cloud-architecture @usecase:private-backend-isolation
Scenario: A database in a private subnet rejects direct internet access
  Given a VPC with a public subnet for the web tier and a private subnet for the database
  When an attacker on the internet tries to reach the database endpoint directly
  Then the connection is refused because no public route exists to the private subnet
  And the database is reachable only through the authenticated application tier
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually contains a cloud breach is the architecture itself: private subnets keep sensitive
systems off the internet, explicit trust boundaries force a real auth decision at each hop, and clear ownership
closes the gaps where no one is patching. The `@security` scenario proves one backend stays unreachable from
outside; the network design and the trust checks are what keep every sensitive component contained. A test is a
check; the segmented network and explicit trust boundaries are the guarantee.

## Sources

- OWASP Secure Cloud Architecture Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Secure_Cloud_Architecture_Cheat_Sheet.html>, retrieved 2026-10-11): risk analysis, the object-storage access options, VPC and subnet segmentation, the trust-boundary levels, WAF/logging/monitoring/DDoS tooling, and the IaaS/PaaS/SaaS shared responsibility model. `[documented]`
