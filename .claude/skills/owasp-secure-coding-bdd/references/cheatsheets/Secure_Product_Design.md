# Secure Product Design

## What it is

Secure product design makes security an explicit choice baked into a product from the start and refined as it
grows, so what ships meets the security level the organization expects. It runs through two moments: inception,
when a product is first imagined or reworked, and design, the ongoing agile work that happens next to the code.
The baseline is to ship safe defaults, keep the attack surface small, and fail back to those well-understood
defaults. This is the per-sheet guidance from the OWASP Secure Product Design Cheat Sheet, condensed to the
principles and the gap they close.

## The attack it stops

When security is bolted on after a product is built, the shape of the system already works against you: broad
default permissions, a wide attack surface, single points of failure, and components chosen with no thought to
how they could be abused. Patches then fight the architecture instead of fixing it, and an attacker exploits a
design decision that no later code change can undo. Deciding security up front, and revisiting it each
iteration, closes the gap between what the product needs to resist and what its structure actually allows.
Over-building security wastes money, and under-building it can be ruinous, so the point is the right level for
this product, chosen on purpose.

## Controls

Apply the sheet's principles and focus areas:
1. **Least privilege and separation of duties.** Give each user and component only the access the job needs and
   nothing more, and split a sensitive process across people so no one person controls it end to end.
2. **Defense in depth.** Stack independent layers of control so one failure does not expose the asset, and so
   incidents are caught and answered quickly.
3. **Zero trust.** Treat every user, device, and network as unproven, even inside your own perimeter;
   authenticate and authorize each request, and keep watching activity after access is granted.
4. **Security in the open.** Expect code to be visible, write it with the security consequences in mind, test
   for weaknesses, use safe tooling, and bring in security expertise.
5. **Set the context.** Work out where the product sits in the organization, who uses it, what data it holds,
   and its risk profile. Use threat modeling during design and a business impact assessment during inception to
   set the right product security level, so you neither over- nor under-engineer.
6. **Vet the components.** Choose libraries and external services from a known-good catalog (your golden path or
   paved road), threat-model those choices, and weigh the commercial side too (licensing, maintenance, usage
   limits).
7. **Design the connections.** Decide how the product is reached and how it links to its parts and services,
   where data lives and how it is read, and where tiers, data, or whole environments must stay separate for the
   required security level or for different tenants. Intentionally having no connection is a valid choice.
8. **Write secure code.** Validate input types, formats, lengths, and business rules (and use parameterized
   queries for SQL values, since validation does not replace parameterization); handle errors without leaking
   detail; use strong authentication and authorization; protect data in transit and at rest with crypto; apply
   least privilege in the code and its host; manage memory safely or use safer languages; keep secrets out of
   source and in secure storage; test for weaknesses during and before release; audit and review the code; and
   keep it current with fixes. Add plausibility checks at every tier and write unit and integration tests that
   prove each modeled threat is mitigated.
9. **Configure it securely.** Enforce least privilege and layered controls, be secure by default with minimal
   manual setup, encrypt and correctly back up and retain sensitive data, fail into a secure state, use secure
   protocols like HTTPS, patch regularly or run maintained images, and keep a rehearsed incident response plan.

## @security scenario

```gherkin
@security @owasp:product-design @usecase:secure-defaults-and-fail-secure
Scenario: A new service ships locked down by default and fails into a safe state
  Given a service being designed with a defined product security level
  When it is deployed with no manual hardening applied
  Then every account and component holds only the minimum access its task requires
  And an unexpected failure leaves the service denying access rather than exposing data
  And the chosen security decisions are recorded against the threat model for the service
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so the default-posture check runs as a blocking autotest in the same place as every other
Gherkin scenario.

## The real guarantee

What actually protects the product is the design decision made on purpose up front: safe defaults, a small
attack surface, least privilege, layered controls, and a fail-secure posture, all sized to the product's real
risk. The `@security` scenario proves the deployed defaults are locked down and failure denies access; the
deliberate design choice behind them is what keeps the structure from working against you later. A test is a
check; the secure design decision is the guarantee.

## Sources

- OWASP Secure Product Design Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html>, retrieved 2026-10-11): the inception and design processes, the security principles (least privilege and separation of duties, defense in depth, zero trust, security in the open), and the focus areas (context, components, connections, code, configuration) summarized above. `[documented]`
