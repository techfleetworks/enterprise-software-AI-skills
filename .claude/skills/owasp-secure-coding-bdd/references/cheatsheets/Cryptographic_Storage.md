# Cryptographic Storage

## What it is

How to protect data at rest so that a copy of the stored bytes stays unreadable: strong algorithms,
authenticated cipher modes, secure randomness, and keys held apart from the data they lock. This is the
per-sheet guidance from the OWASP Cryptographic Storage Cheat Sheet, condensed to the controls that hold and
the attack they stop.

## The attack it stops

An attacker who reaches your storage (a stolen backup, a lost disk, SQL injection, or directory traversal)
walks off with every record in clear text when data sits unprotected or is locked with a weak cipher, a broken
mode such as ECB, or a guessable key. Roll your own algorithm or seed keys and IVs from a fast, predictable
generator, and the attacker reproduces them and decrypts the lot. Keys left in source code, in version control,
or beside the very data they protect hand over both halves at once. Authenticated encryption at proper strength,
fed by a cryptographically secure generator, with keys kept separate, is what turns a stolen copy into noise.

## Controls

In the cheat sheet's order:
1. **Design from the threat model first.** Decide who you are defending the data against, then pick where
   encryption happens: at the application, database, filesystem, or hardware layer. Each layer stops a
   different attack (hardware level defeats physical theft but not a remote compromise), so match the layer to
   the threat.
2. **Store as little sensitive data as you can.** The safest record is the one you never keep. This matters
   most for card data, where PCI DSS sets strict rules; avoid holding it wherever possible.
3. **Pick vetted algorithms.** For symmetric encryption use **AES** with a key of at least **128 bits** (prefer
   **256**) and a secure mode. For public-key work use a maintained library of an established hybrid scheme such
   as **HPKE**; note that X25519 is only key agreement and does not encrypt stored data on its own. If you must
   use **RSA**, keep the key at **2048 bits** or more.
4. **Plan for post-quantum.** RSA and elliptic-curve schemes (Curve25519 included) are not quantum-safe, which
   matters for data that stays secret for years. Where quantum-safe key establishment is needed, use a
   standardized mechanism such as **ML-KEM (FIPS 203)**, usually paired with a classical algorithm during the
   switch-over, and cover the keys that wrap your stored data in the plan.
5. **Weigh the selection criteria.** Judge any algorithm on key size, known weaknesses, maturity, third-party
   approval (such as NIST validation), speed, library quality, and portability, plus any rules like FIPS 140-3
   or PCI DSS that constrain your choice.
6. **Never invent your own algorithm.** The cheat sheet's advice here is one line: do not do it.
7. **Use authenticated cipher modes.** Prefer **GCM** or **CCM**, which protect integrity and authenticity
   along with confidentiality. If neither is available, **CTR** or **CBC** can work, but add separate
   authentication with Encrypt-then-MAC. Keep **ECB** out of use except in rare special cases. Let the library
   generate IVs and other mode attributes.
8. **Pad RSA correctly.** When you encrypt with RSA, apply the **RSAES-OAEP** scheme from a maintained library.
   Prepending a few random bytes by hand is not a substitute, and raw RSA with no padding scheme is unsafe.
9. **Generate randomness securely.** Keys, IVs, session IDs, CSRF tokens, and reset tokens all need a
   **CSPRNG**; ordinary fast PRNGs are predictable and must never back anything security-critical. Use your
   language's secure call (for example `getrandom(2)` in C, `SecureRandom` in Java, `secrets` in Python,
   `crypto.randomBytes()` in Node.js) and avoid the unsafe ones like `rand()` or `Math.random()`. Do not lean
   on UUIDs for secrecy: version 1 encodes a timestamp and MAC address, and version 4 is only as random as its
   implementation.
10. **Build defense in depth.** Assume the crypto could fail. Guard encrypted data with access control as well,
    and never trust the secrecy of an encrypted URL parameter.
11. **Run real key-management processes.** Cover generation, storage, distribution, deployment, rotation, and
    decommissioning, and test them. Generate keys with a secure function, never from words or keyboard mashing,
    and keep separate keys (such as data keys and key-encrypting keys) fully independent.
12. **Rotate keys on clear triggers.** Change a key when it is known or suspected compromised (including when a
    person with access departs), after its cryptoperiod ends, before the mode's usage limits are reached, or
    when the algorithm's strength drops. Afterward either re-encrypt old data under the new key (preferred) or
    tag each item with its key ID and retain the old keys to read it. Keep retired keys a while for old
    backups, and have the rotation and algorithm-swap code ready before you need it.
13. **Store keys in a hardened place.** Prefer an HSM, a key vault such as AWS KMS or Azure Key Vault, an
    external secrets manager such as Vault or Conjur, or an OS API like .NET ProtectedData. These give central
    management, easy rotation, secure generation, and compliance help. When none is available, at minimum do
    not hard-code keys, do not commit them to version control, lock down the permissions on any config file
    holding them, and avoid environment variables (which leak through calls like `phpinfo()` or
    `/proc/self/environ`).
14. **Keep keys apart from the data.** Store them on a different system or medium from the ciphertext, so one
    hole (a traversal bug, an injection flaw) does not expose both.
15. **Encrypt the keys themselves.** Use a **DEK** to encrypt data and a **KEK** to encrypt the DEK, and hold
    the KEK separately; the wrapped DEK can live with the data. Make the KEK at least as strong as the DEK. A
    KDF can turn a user passphrase into a KEK that wraps a random DEK, so changing the passphrase does not force
    re-encryption of the data.

## @security scenario

```gherkin
@security @owasp:crypto-storage @usecase:data-at-rest-confidentiality
Scenario: Stored sensitive data survives a storage breach unreadable
  Given a record containing sensitive data is written to storage
  When an attacker obtains a full copy of that storage
  Then the record is stored as AES-256 ciphertext in an authenticated mode such as GCM
  And the key that decrypts it is held on a separate system and is absent from the stolen copy
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects the data is the pairing of strong authenticated encryption with keys stored apart from
the ciphertext: the stolen copy decodes to nothing without a key the thief never gets, and the authenticated
mode means tampering is detected rather than silently decrypted. The `@security` scenario proves one record is
ciphertext and one key is elsewhere; the algorithm, the mode, the secure generator, and the separation are what
make every record safe. A test is a check; the authenticated cipher plus the separated key is the guarantee.

## Sources

- OWASP Cryptographic Storage Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>, retrieved 2026-10-11): the architectural design choices, algorithm and key-size minimums, authenticated cipher modes, OAEP padding, secure random generation, and the key generation, rotation, storage, separation, and envelope-encryption guidance summarized above. `[documented]`
