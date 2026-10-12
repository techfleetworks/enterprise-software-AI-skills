# Post-Quantum Cryptography

## What it is

How to get an application ready for the day a quantum computer can break today's public-key math: take stock of
where you use cryptography, rank the risky spots, move to standardized quantum-resistant algorithms, test the
whole path, and roll the change out safely. This is the per-sheet guidance from the OWASP Post-Quantum
Cryptography Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

A strong enough quantum computer would break RSA, Diffie-Hellman, and elliptic-curve cryptography, which is what
protects key exchange, public-key encryption, and digital signatures. The sharpest near-term threat is
"harvest now, decrypt later": an adversary copies your encrypted traffic or stored data today and simply holds
it until a quantum machine exists to open it. Anything that must stay secret for years is already exposed, since
upgrading the encryption later does nothing for the copies someone already grabbed. Signed artifacts have a
mirror problem: forged signatures become possible once the signing math falls, so firmware, trust anchors, and
long-lived records can lose their trustworthiness. Starting the preparation work now is what keeps those long-tail
secrets and proofs safe.

## Controls

The cheat sheet lays the migration out as five stages:
1. **Build a cryptographic inventory (Stage 1).** List every place you use cryptography, one entry per use,
   including the crypto your platform or provider runs for you, not only the calls in your own code. For each
   entry record its purpose and how long the secret or trust must last, the protocol and algorithms and library
   versions (store metadata, never the secret keys), every dependent party (clients, servers, proxies, signing
   and key-management services, HSMs, backups), and an owner. Map each transport link on its own, trace how
   stored-data keys are guarded and recovered, and catalog the parties that verify signatures as well as those
   that create them. Done when every dependency has an owner and either a migration path or a recorded blocker.
2. **Rank the migration work (Stage 2).** Put data that must stay private for years, and systems that are hard
   to change later, at the top; give each item an owner and a target date. Flag exposed links and stored data
   whose keys lean on RSA or elliptic curve. Plan early for anything whose signatures must stay valid for years,
   and allow time to update every verifier. For dependencies you cannot move yet, ask the supplier for a
   supported release and plan, and record the leftover exposure with a review date. Favor AES-256 for extra
   margin with a secure mode, though AES-128 and AES-192 stay allowed; check how the keys protecting AES data
   are themselves wrapped with public-key crypto.
3. **Adopt supported implementations (Stage 3).** Upgrade maintained libraries and platform services to
   standardized algorithms, and pick parameters through the real protocol, not by hand. For key establishment
   use a supported integration of `ML-KEM` (FIPS 203), which sets up a shared secret but does not itself encrypt
   your data or authenticate the peer. For transport, pilot a supported classical-plus-PQC hybrid such as
   `X25519MLKEM768` while keeping certificate and hostname checks on. For signatures, run a separate migration
   to a supported format and verifier such as `ML-DSA` (FIPS 204), upgrading signer and verifier together. For
   stored data, use your provider's supported process to rewrap data keys, keeping recovery access during the
   move. Use the protocol's own hybrid construction rather than inventing your own combination, and remember a
   hybrid key exchange does not make the certificate signatures quantum-safe. Where a dual-signature scheme
   needs both signatures, require both to verify; accepting either one quietly allows classical-only trust. For
   long-term proof, revalidate signed records and renew their evidence through a supported archive-timestamp
   process before the old algorithms weaken.
4. **Test the whole application path (Stage 4).** Test with the exact algorithms and parameter sizes you will
   ship. Exercise real clients, proxies, gateways, and backend links, and confirm the key exchange that new
   connections actually negotiate; for a resumed TLS session, confirm which resumption mode is in use and how
   its earlier secrets were guarded. Measure handshake and verification cost under load, and check size limits on
   certificates, signatures, messages, and database fields. Confirm that bad signatures, untrusted certificates,
   and disallowed algorithms are rejected, and that a required second signature cannot be missing or invalid.
   Decide where classical fallback is allowed, and prove that a PQC-required path cannot silently drop back to
   classical. Test old data, older signed artifacts, backup restores, and key recovery before you retire any
   old key or format.
5. **Roll out and retire exceptions (Stage 5).** Deploy to a small set of services or clients first, then widen
   using your test and monitoring results, keeping an approved rollback plan and clear rules for ending
   classical-only support. Log the negotiated algorithms and verification outcomes without logging secrets, and
   alert on surprise classical-only use or on verification failures. Treat any rollback to classical-only
   protection as a tracked security exception with an owner and an expiry; where PQC is required, pause the
   operation instead of weakening the policy. Pull temporary fallback only after the peers and recovery
   workflows that need it have migrated, and once PQC verification is required, keep classical-only exceptions
   to known legacy artifacts and never use them to accept new ones. Keep the inventory current as things change.

## @security scenario

```gherkin
@security @owasp:post-quantum @usecase:harvest-now-decrypt-later
Scenario: A long-lived confidential channel negotiates a quantum-resistant key exchange
  Given a transport connection carrying data that must stay secret for years
  When a client opens a new session
  Then the negotiated key exchange is a supported classical-plus-PQC hybrid such as X25519MLKEM768
  And certificate and hostname validation stay enabled
  And a PQC-required path never silently falls back to a classical-only exchange
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually defeats harvest-now-decrypt-later is moving the key exchange and signatures onto
standardized quantum-resistant algorithms before a quantum computer arrives, so recorded traffic and stored
data have no classical math left to break. The `@security` scenario proves one connection negotiates the hybrid
exchange and will not downgrade; the algorithm migration across your whole inventory is what makes every
connection and signed record safe. A test is a check; the quantum-resistant algorithm in the live protocol is
the guarantee.

## Sources

- OWASP Post-Quantum Cryptography Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Post_Quantum_Cryptography_Cheat_Sheet.html>, retrieved 2026-10-11): the five migration stages (inventory, prioritize, adopt, test, roll out), the harvest-now-decrypt-later risk, hybrid and NIST PQC algorithms (ML-KEM, ML-DSA, X25519MLKEM768), AES-256 margin, and dual-signature verification. `[documented]`
