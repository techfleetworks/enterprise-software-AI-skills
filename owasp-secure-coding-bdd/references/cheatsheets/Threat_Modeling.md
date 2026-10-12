# Threat Modeling

## What it is

A structured, repeatable way to look at a system from an attacker's point of view early in design: model what
you are building, find the threats that apply to it, decide what to do about each, and then check your work.
It is maintained alongside the system, not done once, and works best as a normal step in the development
lifecycle rather than an add-on. This is the per-sheet guidance from the OWASP Threat Modeling Cheat Sheet,
condensed to the practice it describes and the gap it closes.

## The attack it stops

The failure here is an attack through a weakness no one ever considered, because the team never sat down and
asked what could go wrong with this specific design. When threat modeling is skipped, security gets bolted on
after the system is in production, where flaws are far more expensive to find and fix. A spoofed token, a
tampered database write, logs edited to hide an intruder, a leaked user table, an account flooded offline, a
JWT edited to raise a role: each of these is a threat that maps to a design decision, and each goes unaddressed
when the design is never examined adversarially. Modeling the system and walking its trust boundaries,
data flows, and entry points up front is what surfaces these threats while they are still cheap to design out.

## Controls

The cheat sheet frames the work around four questions and four phases, in order:
1. **Ask the four questions.** What are we working on? What can go wrong? What are we going to do about it? Did
   we do a good enough job? These drive the four phases below.
2. **Model the system (what are we building).** Usually with a data flow diagram drawn on a whiteboard or a
   diagramming tool and saved so the team can update it; use a high-level view plus detailed component diagrams
   for complex systems. The model must clearly show the trust boundaries, data stores, data flows, processes, and
   the external actors that touch it, since these are the likely attack points. Brainstorming
   can complement DFDs, especially when less technical people join, to build shared terminology and surface key
   processes.
3. **Adapt for cloud-native and hybrid systems.** Account for the shared responsibility split between provider
   and customer, managed services and APIs, multi-tenant and identity-federation concerns, and dynamic
   infrastructure (IaC, serverless, containers), plus cloud components like virtual networks, IAM roles, and
   storage buckets, and any data-residency or compliance limits.
4. **Identify and rank threats (what can go wrong).** Use STRIDE as a prompt: Spoofing (violates
   authentication), Tampering (integrity), Repudiation (accounting), Information Disclosure (confidentiality),
   Denial of Service (availability), and Elevation of Privilege (authorization). Walk the six categories across
   each component, data flow, and trust boundary, brainstorm with the team, and record what each threat
   touches. Rank threats roughly by likelihood times impact, noting both are hard to compute and that fix
   effort may also belong in the priority.
5. **Pick the right technique for the scope.** Start with STRIDE for a technical design; add another method when
   the scope needs a different lens: attack trees for a single high-value attacker goal or multi-step path,
   misuse or abuse cases for abuse of a valid workflow, LINDDUN for privacy harms, PASTA to connect business
   objectives to application threats, OCTAVE for organization-wide asset risk, and VAST for application plus
   operational models across many teams. Do not pile on methods for show; state why each one fits and note what
   it leaves uncovered.
6. **Respond to every threat (what we will do about it).** Choose a response per threat: mitigate (lower its
   likelihood), eliminate (drop the feature causing it), transfer (shift contractual or financial
   responsibility, remembering a transfer does not by itself reduce likelihood or harm, so record who owns the
   leftover controls and residual risk), or accept (when none of the others fit the business constraints, with
   the reason written down). Turn agreed mitigations into concrete, actionable security requirements and keep
   these decisions current as the system changes.
7. **Review and validate (did we do a good enough job).** Have all stakeholders, not just dev and security,
   confirm the model matches the system, that threats were found, that each has an agreed response, that
   mitigations reduce risk to an acceptable level, that the model is documented and stored for those who need
   it, and that the mitigations can actually be tested and measured.
8. **Work with the development team.** Expect challenges: developers may lack security depth, the process can be
   slow and complex under delivery pressure, and cross-team communication can be weak. Address these by
   inviting security specialists into modeling sessions, running regular tailored security training, adopting
   tools that simplify and automate the work, and building a culture where threat modeling is a normal part of
   the lifecycle rather than extra burden.

## @security scenario

```gherkin
@security @owasp:threat-modeling @usecase:stride-tampering-coverage
Scenario: An identified tampering threat has a tested mitigation before release
  Given a data flow diagram with a trust boundary between the client and the orders service
  When STRIDE review identifies a Tampering threat where a client can alter an order total
  Then the threat has a recorded response mapped to a server-side integrity check on the order total
  And that mitigation is expressed as a security requirement with a test that proves a tampered total is rejected
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.
Link each scenario back to the threat it covers so the model, its mitigation, and its executable proof stay
connected as the system changes.

## The real guarantee

What actually prevents the un-modeled attack is the maintained threat model: a current view of the system, its
threats found adversarially, a chosen response for each, and a test that proves the mitigation holds. The model
is what makes the overlooked threat visible while it is still a design choice; the wired-in test is what keeps
the mitigation from silently regressing. The `@security` scenario proves one identified threat is mitigated and
checked; the living threat model and its tested responses are what cover the rest. A test is a check; the
maintained threat model and the mitigations it drives are the guarantee.

## Sources

- OWASP Threat Modeling Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html>, retrieved 2026-10-11): the four questions and four phases, system modeling with DFDs and brainstorming, cloud-native considerations, the STRIDE categories and ranking, choosing among STRIDE, attack trees, misuse/abuse cases, LINDDUN, PASTA, OCTAVE and VAST, the mitigate/eliminate/transfer/accept responses, the review-and-validation checklist, and working with the development team. `[documented]`
