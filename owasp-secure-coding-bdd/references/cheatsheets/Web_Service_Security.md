# Web Service Security

## What it is

How to harden a web service (SOAP and similar message-based APIs) against the attacks that target the
service layer: eavesdropping, forged callers, oversized or malicious payloads, and resource exhaustion. This is
the per-sheet guidance from the OWASP Web Service Security Cheat Sheet, condensed to the controls that hold and
the attacks they stop. The sheet stays framework-neutral, so the controls describe what to enforce rather than
one library's API.

## The attack it stops

A web service that trusts the network and its callers is wide open. Without encrypted transport, an attacker on
the path reads and rewrites traffic. Without caller authentication and per-request authorization, anyone who
reaches the endpoint can invoke sensitive methods and touch data they should never see. Without schema and
content checks, a crafted XML payload can trigger an entity-expansion bomb (the "billion laughs" attack), pull
in external entities (XXE), or smuggle a virus inside a SOAP attachment. And without size and rate caps, a flood
of large messages exhausts CPU and memory until the service stops answering legitimate requests.

## Controls

In the cheat sheet's order:
1. **Transport confidentiality.** Wrap every exchange that carries sensitive features, an authenticated
   session, or sensitive data in well-configured TLS, even when the message body is already encrypted, because
   TLS also adds integrity, replay defense, and proof of the server's identity.
2. **Server authentication.** Rely on TLS to prove the provider to the consumer. The client checks that the
   certificate comes from a trusted issuer, has not expired, has not been revoked, matches the service domain,
   and that the server actually holds the matching private key.
3. **User authentication.** Only use Basic Authentication over TLS, and prefer not to use it at all since it
   sends the secret base64-encoded in a header. Client-certificate auth over mutual TLS is the recommended
   option where it fits.
4. **Transport encoding.** Agree on a single SOAP encoding style and make the client and server both use it.
5. **Message integrity (data at rest).** Sign XML data with an XML digital signature using the sender's private
   key so the receiver can confirm both the content and the sender with the sender's certificate. Public-key
   encryption alone proves neither, since the public key is public.
6. **Message confidentiality.** Encrypt sensitive data with a strong cipher and an adequate key length. Use
   transport or message encryption in transit, and separate strong at-rest encryption for data that must stay
   confidential after it arrives.
7. **Authorization.** On every request, after authenticating the caller, check that it may call this method
   (coarse-grained) and reach this specific data (fine-grained). Add a challenge-response step to high-value
   operations such as password or email changes and payment or delivery details. Keep admin and management
   functions restricted to service administrators, ideally in a wholly separate application.
8. **Schema validation.** Validate SOAP payloads against their XSD. The schema should set a maximum length and
   permitted character set for every parameter, and define strong allow-list patterns for fixed-format fields
   such as zip codes or phone numbers.
9. **Content validation.** Check XML input for malformed entities, entity-expansion bombs, and external-entity
   attacks, and apply a strong allow-list.
10. **Output encoding.** Encode everything returned to clients so it is consumed as data, not script, following
    the cross-site-scripting prevention rules, since clients often render the output as HTML.
11. **Virus protection.** Scan files and attachments carried in SOAP messages, ideally inline before anything is
    written to disk, and keep the scanner's definitions current.
12. **Message size.** Cap SOAP message size at a sensible limit; a large or absent cap invites denial of service.
13. **Availability.** Limit the CPU, memory, open files, network connections, and spawned processes the service
    may use. Set request-rate and execution-time limits from tested capacity, tightening them for costly
    operations. For XML denial of service specifically, reject recursive and oversized payloads, guard against
    entity expansion, and refuse element names longer than a configured limit; the parser or schema validator
    should supply this, so build test cases that confirm it does.
14. **Endpoint security profile.** Treat WS-I Basic Profile conformance as an interoperability goal, not a
    security baseline; it allows conformant services with no countermeasures, so enforce the transport, auth,
    authorization, and resource controls above on your own.

## @security scenario

```gherkin
@security @owasp:web-service-security @usecase:xml-entity-expansion-dos
Scenario: A SOAP endpoint rejects an XML entity-expansion bomb
  Given a SOAP web service that validates payloads against its XSD
  When an attacker posts a message that defines nested entities expanding to gigabytes
  Then the parser refuses the payload before expansion and no large allocation occurs
  And the service stays responsive to legitimate requests
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps a hostile payload from crushing the service is the hardened parser plus the
enforced schema and size caps: the message is rejected before it can expand, pull in an external entity, or
allocate unbounded memory. The `@security` scenario proves one entity bomb is turned away; the parser
configuration and the XSD are what make every malformed payload safe. A test is a check; the parser and schema
limits are the guarantee.

## Sources

- OWASP Web Service Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Web_Service_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full control set covering transport confidentiality, server and user authentication, transport encoding, message integrity and confidentiality, authorization, schema and content validation, output encoding, virus protection, message size, availability and XML denial-of-service protection, and the endpoint security profile. `[documented]`
