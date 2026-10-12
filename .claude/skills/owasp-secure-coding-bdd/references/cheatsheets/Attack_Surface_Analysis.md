# Attack Surface Analysis

## What it is

A practical way to map every point where data or commands can enter or leave a system, plus the valuable data
those paths touch and the code meant to guard them, so you know which parts actually need security review and
when a change has opened new risk. It is run by architects and testers, but developers are expected to watch
the surface as they design and change code. This is the per-sheet guidance from the OWASP Attack Surface
Analysis Cheat Sheet, condensed to the practice it describes and the gap it closes.

## The attack it stops

The failure here is attack through a way in that nobody knew was exposed. When the full set of entry and exit
points is never mapped, review and testing get aimed at the parts the team happens to remember, and the rest
goes unchecked: an old backward-compatible protocol still listening, a forgotten admin interface, an unused
feature left enabled "just in case," a backup copy of code or data sitting unprotected. A single new web page,
a new upload endpoint, or a new role can quietly widen what an attacker can reach. Without a baseline of the
surface and a habit of re-checking it on every change, these additions ship without the threat assessment they
deserve, and the real deployed surface drifts away from the one anyone believes exists.

## Controls

The cheat sheet's approach, in order:
1. **Define what the surface includes.** It is the sum of all paths for data and commands in and out, the code
   that guards those paths (connection, authentication, authorization, logging, validation, encoding), all
   valuable data (secrets, keys, IP, critical business data, personal data and PII), and the code that guards
   that data (encryption, checksums, access auditing, integrity and operational controls).
2. **Overlay the user types.** Layer on the roles and privilege levels that can reach the system, authorized or
   not, and pay special attention to the two extremes: the anonymous unauthenticated visitor and the
   high-privilege admin.
3. **Group, count, then sample.** Sort attack points into buckets by risk (external- versus internal-facing),
   purpose, design, and technology; count how many of each type exist; pick representative cases per type; and
   concentrate the review there, so you can size the work without studying every single endpoint.
4. **Prioritize reachable components in cloud and microservice systems.** For loosely coupled, API-connected,
   independently scaling services, focus first on what is reachable from an attack source such as the public
   internet, keeping in mind components may sit behind proxies, load balancers, and ingress tiers and may scale
   up without warning; tools like Cilium Hubble and kubeshark help visualize Kubernetes and service-mesh
   surfaces.
5. **Map it from several angles.** Build a baseline from design docs read as an attacker would, from the source
   code, by listing entry and exit points (UI fields, cookies and request headers, APIs, databases, files,
   other local stores, inbound messages, runtime arguments), and break the thousands of points into types by function
   (login, admin, search, CRUD forms, workflows, transactional APIs, operational and monitoring interfaces,
   links to other systems). Identify the valuable data by interviewing developers and users and reading code.
6. **Scan and walk through to fill gaps.** Crawl web apps with a maintained dynamic tool such as ZAP, or export
   entry points from a WAF, and validate the picture by following real use cases (sign up, log in, search,
   place and change an order) through the code and data flow. Expect the first model to be rough and refine it
   over time. Attack surface analysis and threat modeling feed each other: a surface change should trigger
   threat modeling, and threat modeling sharpens the surface picture.
7. **Find and measure the high-risk areas.** Zero in on remote and especially internet-facing code, anonymous
   public access, web forms, files from outside the network, backward-compatible and custom interfaces, and all
   security code (crypto, authentication, authorization, session management); then note the compensating
   controls (network and application firewalls, intrusion detection or prevention). Methods like the Relative
   Attack Surface Quotient and the Carnegie Mellon attack-surface metric let you score the surface and watch it
   change, weighting elements by a damage-to-effort ratio.
8. **Keep the deployed surface honest.** Dead code, unused features, extra deployed versions, and old backups
   all enlarge the surface; use source control and strong change and configuration management so what is
   actually deployed matches the intended model, and protect backups as part of the surface.
9. **Manage changes incrementally.** On each change ask what changed, what is being done differently, and what
   holes it could open. More of the same (another field, another page on the same design and tech) barely moves
   the risk; something that fits no existing bucket needs a fuller assessment. Treat changes to sessions,
   authentication, password handling, authorization and roles, admin functions, encryption and secrets,
   validation, and major architecture or platform swaps as surface changes that must be reviewed.
10. **Watch the access model as roles grow.** When adding user types or privilege levels, overlay their access
    across data and functions and look for inconsistencies. A deny-by-default (positive) model makes mistakes
    easy to spot; an allow-by-default (negative) model demands much more care. Do this assessment periodically
    or per design phase, continuously in agile, and keep looking for ways to shrink the surface (fewer roles,
    not storing data you do not need, turning off unused features, adding operational controls like a WAF).

## @security scenario

```gherkin
@security @owasp:attack-surface @usecase:deprecated-endpoint-review
Scenario: A new external upload endpoint is gated behind attack-surface review
  Given a baseline attack-surface map that buckets all external entry points
  When a change adds a file-upload endpoint reachable from the internet
  Then the change is flagged as a new external-facing entry point that fits no existing bucket
  And it is blocked from release until a threat assessment and its guarding controls are recorded for that endpoint
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario. Keep
the baseline surface map in version control next to the code so the check can diff new entry points against it
on every change.

## The real guarantee

What actually limits exposure is the maintained surface map and the rule that any new or changed entry point
gets reassessed before it ships. The map is what makes an unknown way in visible; the per-change review is what
stops the deployed surface from quietly drifting past what the team has secured. The `@security` scenario
proves one new endpoint is caught and gated; the living surface map and its change gate are what catch the
next one. A test is a check; the maintained attack-surface map and the reassessment it triggers are the
guarantee.

## Sources

- OWASP Attack Surface Analysis Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Attack_Surface_Analysis_Cheat_Sheet.html>, retrieved 2026-10-11): the definition of the surface and overlaying user types, the group-count-sample method, cloud and microservice prioritization, mapping by entry/exit points and scanning and walk-throughs, measuring high-risk areas and the RSQ metric, keeping the deployed surface matching the model, and managing surface changes and the access model. `[documented]`
