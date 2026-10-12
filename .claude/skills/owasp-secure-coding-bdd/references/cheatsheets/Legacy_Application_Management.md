# Legacy Application Management

## What it is

How to reduce the risk of an outdated application that an organization still depends on and cannot
easily replace, by wrapping it in controls instead of rewriting it. This is the per-sheet guidance
from the OWASP Legacy Application Management Cheat Sheet, condensed to the hardening practices that
hold when no modern alternative is yet in place.

## The attack it stops

The failure here is a system that stays in service long after it stopped being safe. A legacy
application may be past end-of-life, so no vendor patches arrive and a known flaw stays exploitable.
It may be built on technology few staff still understand, so no one can fix problems when they
appear. It may speak old formats or protocols that your security monitoring cannot read, so attacks
against it go unseen. Left alone, such an application becomes the soft entry point an attacker uses to
reach the rest of your network. The practices here shrink that exposure and keep the old system
watched and contained until it can be retired.

## Controls

Because no single fix works for every legacy system, the cheat sheet gives a set of hardening areas
to apply as they fit.

- **Inventory and asset management.** Know what you have. Document each legacy application with its
  version, age, and configuration, the hosts and networks needed to reach it, the services running on
  its infrastructure, and where relevant the physical location and access rules for its servers. A
  formal SBOM helps when the application leans on third-party dependencies.
- **Risk assessment and threat modeling.** Understand the specific threats each application and its
  components pose, informed by threat modeling and a standard framework such as the NIST Risk
  Management Framework. As an informal gauge, ask what data it holds and the impact if that data
  leaked, whether it or its dependencies have known and exploitable flaws, how critical its uptime is
  to the business, and whether compromising it would let an attacker reach other sensitive systems.
- **Authentication and authorization.** Treat every legacy system as high risk and apply least
  privilege hard. Put it behind network controls such as a restricted subnet or IP allow-listing, and
  air-gap it where needed. Trim the feature set available to users, disabling risky or administrative
  functions. Require every user to be authenticated, by the application or an identity provider, and
  require authentication to the hosting network too, for example a VPN. Close ports the application
  does not need and lock the rest down with firewall rules. Where possible, stand up an intermediary
  service, such as a separate set of APIs, so most users never touch the legacy application directly.
- **Vulnerability management.** Scan regularly with a standard assessment tool such as Nessus or
  Qualys on an automatic schedule, and where code is available add SAST for the codebase and SCA for
  dependencies. When tools do not fit, fall back to manual host-configuration review and code review.
  Apply patches for confirmed flaws where you can, prioritizing by the application's exposure and
  criticality, the flaw's impact and exploitability, and signs of active exploitation, using the CISA
  Known Exploited Vulnerabilities catalog as one input. A CVE helps track a flaw but does not by
  itself set its priority. When patching is not possible, tighten the access controls above instead.
- **Data storage.** Encrypt the application's data at rest and in transit wherever you can. When a
  legacy system only speaks an old plaintext protocol, apply the strictest possible network controls
  around it, which may mean temporary or permanent air-gapping.
- **Ensuring maintainability.** Keep the in-house know-how alive. Train more than one person to
  troubleshoot and reconfigure the application, so one departure does not leave you stranded. Have
  staff document processes and write troubleshooting guides for common failures. Where needed, teach a
  core group enough of the old language to keep the system running.
- **Change management.** Aim to migrate off the unmaintainable system to something modern and
  resilient. Plan around the budget and timeframe you can realistically get, whether migration
  expertise exists or can be hired, and how urgent the move is given the risk. Write a plan, formal or
  not, with concrete steps, an expected completion date, and a clear business and security case, and
  consult the people who run and use the system so the plan is realistic.
- **Continuous monitoring and incident response.** Watch legacy systems especially closely and
  respond fast. When their logs do not fit your monitoring tools, build custom APIs to reshape the log
  data into an ingestible format, or use scripts to generate reports that flag indicators of
  compromise. Stay alert to unusual network traffic and activity surges. Make sure your incident
  responders prioritize these critical systems, document emergency procedures and escalation contacts
  in a playbook ahead of time, and fit it all inside a broader business-continuity plan.

## @security scenario

```gherkin
@security @owasp:legacy-app @usecase:network-containment
Scenario: A legacy application is unreachable except through controlled access
  Given a legacy application past end-of-life that cannot yet be replaced
  And it is hosted in a restricted subnet behind an IP allow-list
  When an unauthenticated host outside the allow-list tries to reach it
  Then the connection is refused at the network layer
  And every allowed request comes from an authenticated user through the VPN
```

This scenario is the canonical copy. When you apply this sheet to real infrastructure, add it to the
repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios
permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same
place as every other Gherkin scenario. For containment, the check can assert the allow-list and
authentication rules hold against both an in-scope and an out-of-scope caller, so a loosened rule
fails the build.

## The real guarantee

The thing that actually protects an unpatchable system is the containment around it: least-privilege
network access, required authentication, a reduced feature set, close monitoring, and a real plan to
retire it. The `@security` scenario proves one out-of-scope caller is refused; the layered controls and
the migration plan are what keep the old system from becoming an open door. A test is a check; the
containment and the planned replacement are the guarantee.

## Sources

- OWASP Legacy Application Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Legacy_Application_Management_Cheat_Sheet.html>, retrieved 2026-10-11): the hardening areas (inventory and asset management, risk assessment and threat modeling, authentication/authorization, vulnerability management, data storage, maintainability, change management, continuous monitoring and incident response). `[documented]`
