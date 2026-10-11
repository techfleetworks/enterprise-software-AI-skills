# Microservices Based Security Architecture Documentation

## What it is

A way to gather the security-relevant facts about a microservice system so you can threat model it, enforce least
privilege, and find data leaks. This is the per-sheet guidance from the OWASP Microservices based Security Arch Doc
Cheat Sheet, condensed to the inventories it tells you to collect and the review work they feed.

## The attack it stops

A spread-out microservice system hides its own weak spots. Normal architecture docs rarely say which service may
reach which database, what scopes each service truly needs, where sensitive data lands, or which endpoints face the
outside. When nobody has written those facts down, services get far more access than their job requires, so one
compromised service becomes a path into stores it never needed; sensitive records flow into caches or queues that
nobody classified; and whole endpoints go untested because no one knew they existed. The cheat sheet closes those
blind spots by making you record the pieces and their connections before an attacker maps them for you.

## Controls

Collect these inventories, then use them to drive the security reviews. Follow the source order.

1. **List each application-functionality service.** Record a unique name or ID, a short note on the business job it
   does, a link to its code repository, its owning team, its API definition (and the security scheme that guards
   each endpoint, such as the scopes or API keys a caller must present), a link to its architecture diagram or
   notes, and a link to its runbook.
2. **List each infrastructure service.** These cover shared concerns such as authentication, authorization, service
   registration and discovery, logging, security monitoring, and the API gateway. Record a unique name or ID, a
   short description, a code repository link where one applies, and a link to its documentation (API definition and
   operating guidance).
3. **List each data storage.** Record a unique name or ID and the software behind it, for example PostgreSQL,
   Redis, or Apache Cassandra.
4. **List each message queue.** Messaging platforms carry asynchronous traffic between services. Record a unique
   name or ID and the software behind it, for example RabbitMQ or Apache Kafka.
5. **List each data asset.** Start with the items that matter from a security view, such as user information or
   payment data. Record a unique name or ID, a protection level (for example PII or confidential), and any
   clarifying notes.
6. **Map service-to-storage relations.** For each pairing, record the service ID, the storage ID, and the access
   kind (for example read, or read and write).
7. **Map synchronous service-to-service calls.** For each pairing, record the calling service ID, the called
   service ID, the protocol or framework in use (for example HTTP with REST or SOAP, Apache Thrift, or gRPC), and a
   short note on why they talk and which assets move between them.
8. **Map asynchronous service-to-service flows.** For each pairing, record the publishing service ID, the
   subscribing service ID, the message queue ID, and a short note on the purpose and the assets that move.
9. **Map asset-to-storage relations.** For each pairing, record the asset ID, the storage ID, and whether that
   store is the authoritative source for the asset or merely a cache.
10. **Draw the architecture.** Turn the blocks and relations above into a call graph or data flow diagram, by hand,
    with a modeling tool, or with a text format such as the DOT graph language.
11. **Feed the inventories into secure development work.** The collected facts support, each with its own supporting
    sections: attack surface analysis (which endpoints to test); data leakage analysis (which flows carry sensitive
    assets); justifying trust boundaries and the flows that cross them, fed into a system model with the identities,
    enforcement points, and in-transit protections marked; reviewing the high-level architecture and its remote
    dependencies; confirming shared security controls are centralized and reused rather than duplicated or missing;
    defining the least privilege each service needs; identifying and classifying sensitive data; and confirming
    every component is documented by the business or security role it fills. Treat the inventories as inputs only:
    check each control against the deployed configuration and behavior, because a written record does not prove the
    running system enforces it.

## @security scenario

```gherkin
@security @owasp:microservices-arch @usecase:least-privilege-lateral-movement
Scenario: A compromised service cannot reach a store outside its recorded grants
  Given the architecture inventory lists each service with its minimal scopes and storage grants
  When an attacker who controls a low-value service calls a database not listed in that service's grants
  Then the request is refused because the service holds only its documented least-privilege credentials
  And the attempt is recorded by the shared security monitoring infrastructure service
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The inventories are a map, not a wall. Writing down that a service needs only read access to one store does nothing
on its own; what protects the system is the running deployment handing each service only those credentials and the
resource server refusing anything beyond them. The `@security` scenario proves one over-reach is blocked; the
enforced least-privilege grant is what blocks every over-reach. The documentation makes the gaps visible so you can
close them, but the cheat sheet says it plainly: a record does not verify enforcement. An inventory is a check; the
enforced grant in the live system is the guarantee.

## Sources

- OWASP Microservices based Security Arch Doc Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Microservices_based_Security_Arch_Doc_Cheat_Sheet.html>, retrieved 2026-10-11): the building-block and relation inventories, the graphical presentation step, and the mapping of collected data to secure-development reviews (attack surface, data leakage, trust boundaries, least privilege, data classification). `[documented]`
