# AML and Sanctions Compliance for AI Agent Payments

## What it is

How to keep anti-money-laundering and sanctions controls intact when an autonomous AI agent, rather than a human
in a browser, starts or carries a regulated payment. Agent payment rails are already live in production. This is
the per-sheet guidance from the OWASP cheat sheet on AML and sanctions compliance for AI agent payments,
condensed for fintechs, banks, and processors to the controls that hold. Using an agent does not lift any AML or sanctions
duty; compliance owners still define which rules apply to the institution, transaction, customer, and
jurisdiction.

## The attack it stops

When an agent is the caller, the usual browser-session assumptions break. An attacker can spoof a self-declared
identity header to reach screening tools it should not touch, skip the screening step and call a payment endpoint
directly, or lower the match threshold to wave a sanctioned party through. A flood of screening requests can be a
denial-of-service designed to force the system to fail open and settle without a result. Audit records kept only
in `console.log` or on the agent's own device can be altered after the fact, so there is no tamper-evident proof
of who screened what. A clean screen against a stale sanctions list looks compliant but is not. Downstream agents
in a multi-hop payment may trust an upstream claim that screening happened without any verifiable receipt. These
controls close each gap, and they keep legal customer identification separate from software authentication.

## Controls

The cheat sheet's sections, in order, each with its do-and-don't guidance:

1. **Agent identity before screening.** Verify the agent's identity cryptographically before it can reach a
   screening service or start a payment. Reject self-declared headers like `X-Agent-ID` that carry no
   cryptographic proof. Require a signed credential (passport, ECDSA key pair, or verifiable credential), bind
   that identity to each screening request so the audit shows which agent acted, and record its key fingerprint
   or passport ID in every log entry. Use graduated trust levels (L0 to L4) and never let an agent raise its own
   trust or edit its own permissions. Do not trust a caller-supplied certificate header just because TLS
   terminates at a proxy.
2. **Entity screening.** Screen every counterparty (people, businesses, vessels, addresses) against the
   applicable lists (OFAC SDN, UK, EU, UN) before a payment goes through. Pass the agent's identity and trust
   level into the screening context, and return machine-readable JSON with clear match, no-match, or
   partial-match indicators and scores, since an agent cannot read a PDF. Enforce a minimum match threshold the
   agent cannot lower, and log each request and result with the agent identity, a timestamp, and a unique nonce.
   Do not let an agent skip screening by calling a payment endpoint, cache results past a set window, or pull the
   raw list.
3. **Agent operator screening.** Identify the customer and organization running the agent, and screen the
   parties the compliance program names rather than assuming every developer or deployer is the legal customer.
   Tie the authenticated agent to the account you verified and to the permissions delegated to it. Define rescreening
   triggers and frequency (including ownership and list changes) and cut off access when the assessment no longer
   allows the relationship. Record the operator's screening status in the agent's trust profile and require the
   agent to declare its operator in its credential. Never allow an anonymous agent, never assume a one-time check
   lasts forever, and verify operator identity against business registries or KYB data.
4. **Signed audit trail.** Keep tamper-evident records that tie the authenticated agent to each request and
   result. Sign every request with the agent's key and every response with the server's key, each carrying a
   nonce and timestamp. Chain entries with cryptographic hashes (each entry holds the SHA-256 hash of the one
   before). Put into each entry the agent identity, the tool called, a hash of the arguments (not the raw
   arguments), the result, a timestamp, and the prior entry's hash. Keep records for the required retention
   period (often five years for BSA/AML) and make them exportable in a machine-readable form. Do not rely on
   plain application logs, store records on the agent's own device, omit the agent identity, or tolerate a broken
   hash chain, which must raise an alert.
5. **Fail-closed enforcement.** Treat an incomplete, unavailable, ambiguous, or timed-out screening result as
   unresolved, never as a pass. Hold or reject the payment until the assessment allows it, using bounded retries,
   manual review, or rejection per policy. Return a clear structured error, log failures as fully as successes,
   and alert compliance when the failure rate climbs, which may signal an attempt to force fail-open behavior.
   Add circuit breakers that stop agent payments when screening is down for a stretch. Never add fallback logic
   that bypasses screening, let an agent retry without limit, or return a vague error that blurs "service down"
   and "match found."
6. **Trust-tiered rate limiting.** Rate-limit on the agent's cryptographic identity, not its IP, which can be
   shared or spoofed. Give newer or lower-trust agents tighter limits than verified high-trust ones, report
   remaining quota and reset time in responses, and lower an agent's allocation when its behavior looks
   anomalous. Tie identities to verified operator accounts to block sybil attacks, and do not set limits so high
   they protect nothing.
7. **Self-hosted versus hosted screening.** Both running your own engine and calling a third-party API are
   valid; each carries different trust considerations. Encrypt all screening traffic (TLS 1.2 or higher) either
   way. When the threat model spans untrusted intermediaries, use a reviewed message-signing profile both ends
   support, with defined trusted keys, signed fields, and replay and failure handling, and verify provider
   response signatures when the profile requires them. Do not send the agent's private keys or full credential to
   a third party (send only the minimum attributes), and do not assume TLS protects data once the connection
   ends.
8. **Receipt canonicalization.** When two systems independently serialize the same JSON for hashing or
   signature checks, agree on a byte representation, since JSON allows varying key order, whitespace, and number
   formatting. If the receipt profile reconstructs JSON, canonicalize with RFC 8785 (JCS) before signing and
   before verifying; a JWS verifier that checks the encoded signing input does not need it. Record the
   canonicalization and signature profile used, and never rely on framework-default or pretty-printed output.
9. **Cross-agent payment accountability.** When a payment crosses several agents and a downstream service relies
   on a signed receipt, verify it with a key bound to a trusted screening issuer, remembering a signature proves
   origin and integrity, not that screening was done correctly. Bind each receipt to its transaction by signing
   over the transaction or intent hash, and propagate it end to end. At each hop, verify the signature, the
   trusted issuer, the transaction binding, and screening freshness before trusting it, then append a new signed
   receipt for any action taken. Do not keep the receipt only in the issuer's logs or let a hop trust an
   unverifiable upstream claim.
10. **Binding list freshness to the receipt.** A "screened, no match" result is meaningless without which list
    version and when, because lists change often and a clean check against a stale list is a gap. Place the list
    source or sources, the version or publication date, and the screening timestamp within the signed receipt,
    bound to the specific transaction. Apply the verifier's own ceiling on how old the list and the screen may be,
    and never let an issuer-supplied limit override it, while retaining evidence of the version used. Never treat "screened" as a
    mere boolean.
11. **Regulatory mapping.** The controls map to common AML and sanctions obligations (technical attribution,
    screening, recordkeeping and retention, fail-closed gating, risk-based limits), but the mapping is
    illustrative, not legal advice. Treat it as a starting point, confirm obligations with qualified counsel per
    jurisdiction, and do not lean on one jurisdiction's lists or rules for a cross-border system.
12. **Do's and don'ts summary.** The consolidated list restates the core rules: verify agent identity before
    every screen, sign and verify requests and responses under the chosen profile, screen the parties the
    program names, protect audit records from change and deletion, fail closed on any screening problem,
    rate-limit by cryptographic identity, apply graduated trust, re-screen on list changes, and keep records
    exportable. The matching don'ts forbid self-declared identity, settling when screening fails, agent-held
    audit storage, stale caches, agent-lowered thresholds, trusting transport past TLS termination, anonymous
    agents, and treating a one-time check as enough.

Throughout, the key principle holds: keep legal customer and counterparty identification separate from software
authentication, and never treat an agent credential or a single list-match check as proof that every legal duty
is met.

## @security scenario

```gherkin
@security @owasp:ai-aml-sanctions @usecase:fail-closed-screening
Scenario: An agent payment is withheld when sanctions screening cannot complete
  Given an agent-initiated payment that must pass sanctions screening before execution
  When the screening service times out or returns an ambiguous result
  Then the payment is held rather than released and a structured screening-failed error returns to the agent
  And the failure is logged with full detail and counts toward the compliance failure-rate alert
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps a sanctioned payment from slipping out is the fail-closed gate: an unresolved screen is
treated as unresolved, execution is withheld until the assessment permits it, and there is no fallback path that
settles without a result. The `@security` scenario proves one timed-out screen holds the payment; the
fail-closed rule is what makes every unavailable, ambiguous, or incomplete result stop the same way. Cryptographic
agent identity, tamper-evident audit chains, and receipt-bound list freshness each prove a different fact after
the event, but only the gate decides whether money moves while a check is open. A test is a check; the fail-closed
gate is the guarantee. None of this replaces the institution's legal obligations, which compliance owners define.

## Sources

- OWASP Cheat Sheet Series, AML and Sanctions Compliance for AI Agent Payments (<https://cheatsheetseries.owasp.org/cheatsheets/AML_Sanctions_AI_Agent_Payments_Cheat_Sheet.html>, retrieved 2026-10-11): the regulatory context, key principle, and the sectioned controls (agent identity, entity and operator screening, signed audit trail, fail-closed enforcement, trust-tiered rate limiting, screening architecture, receipt canonicalization, cross-agent accountability, list-freshness binding, regulatory mapping, and the do's and don'ts summary) summarized above. `[documented]`
