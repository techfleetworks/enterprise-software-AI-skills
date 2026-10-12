# Key Management

## What it is

How to run cryptographic keys safely across their whole life: choosing them, sizing them, generating and storing
them inside protected modules, rotating them on a cryptoperiod, auditing who touches them, and destroying them
when they are done. This is the per-sheet guidance from the OWASP Key Management Cheat Sheet, condensed to the
controls that hold and the attack they stop.

## The attack it stops

Encryption is only as strong as the key behind it. A key generated outside a protected module, reused for two
jobs, left in source control, kept in clear text, never rotated, or never destroyed gives an attacker a single
prize that unlocks everything it ever protected, often long after the breach. Without accountability nobody can
even tell when or how a key leaked; without a recovery plan a compromise becomes an outage with no way back.
Generating, holding, and using keys inside a validated module, keeping each key to one purpose, rotating on a
schedule, and tracking every access is what limits the blast radius when something goes wrong.

## Controls

In the cheat sheet's order:
1. **Set an organization-wide crypto strategy.** Give developers across applications one set of rules so every
   app meets a minimum bar. Identify each application's key-management needs and map every component that
   handles or stores key material.
2. **Select keys from the objective, not the library.** Start from what the application must do (confidentiality
   at rest or in transit, device or data-origin authenticity, integrity) and let that drive the protocols,
   algorithms, and the key types you need: symmetric and asymmetric encryption keys, pre-shared keys, trusted
   certificates and trust anchors, HMAC and MAC keys, and key-encryption keys.
3. **Use approved, well-understood algorithm classes.** Draw hash functions, symmetric-key algorithms, and
   asymmetric-key algorithms from NIST-approved sets (FIPS 180 hashes, FIPS 198 HMAC, FIPS 186 signatures, the
   SP 800-56/800-108 key-derivation methods, SP 800-90A random generators). For quantum resistance, follow the
   NSA CNSA 2.0 list. Reach for MACs or digital signatures for integrity and origin assurance rather than plain
   error-detection codes, which an adversary can forge.
4. **Size keys for the data's lifetime.** Decide the minimum work an attacker must do to break the key, based on
   your adversaries, how long the data must stay secret, and where it lives. Follow NIST SP 800-57 and SP
   800-131a for lengths. When you encrypt one key with another, the wrapping key must be at least as strong as
   the key it wraps, and elliptic-curve key lengths must match the comparative strength of the rest of your
   system.
5. **Give each key one job.** Do not reuse a single key for encryption and signing and wrapping. Mixing
   purposes can weaken one or both operations, widens the damage from a single leak, and collides with
   differing retention needs.
6. **Guard keys in memory.** Keys held in memory a long time can burn in; mitigate by splitting a key into parts
   that are refreshed often. Plan for loss or corruption of the media that holds keys and certificates, and for
   recovering the systems that generate, register, and distribute them.
7. **Use ephemeral keys for forward secrecy.** Short-lived session keys mean that cracking the server's
   long-term signing key does not expose past sessions.
8. **Do crypto inside a module boundary.** Perform key generation, encryption, decryption, and signing inside an
   isolated cryptographic module so plaintext key material never leaves it. For higher assurance, use
   hardware-backed modules such as an HSM or TPM to cut the chance of key extraction from software memory.
9. **Generate and distribute inside validated modules.** Generate keys within a module validated to at least
   FIPS 140-2 or 140-3, with the random bit generator living in that same module, and prefer hardware modules.
   When keys must travel, send them over secure channels and use them only inside validated modules at the far
   end.
10. **Store keys so raw material never leaks.** Never commit keys or API keys to source repositories or bake
    them into binaries, images, or config files; keep them in a dedicated secrets manager or vault. Know which
    memory and media hold your keys, protect both volatile and persistent copies, and never store a key in clear
    text. Wrap keys under a KEK of equal or greater strength before exporting them to offline stores, apply
    integrity protection in storage, and let key-management libraries (not application code) read and use raw
    keys, with all key operations done inside the sealed vault.
11. **Rotate within a cryptoperiod.** A cryptoperiod bounds how long one key is authorized and how much data it
    protects. Document a rotation schedule from your risk assessment, and set it from both calendar time and
    usage volume (for example, cap AES-GCM with random 96-bit IVs at about `2^32` encryptions per key to avoid
    IV collisions). To retire a KEK, re-wrap the stored DEKs under the new KEK before destroying the old one;
    re-wrapping leaves the DEKs and their cryptoperiods unchanged, so replacing a DEK still means re-encrypting
    its data. Prefer automated rotation through a KMS or ACME, and when rotation is manual, log the time,
    operator, and authorization.
12. **Back up and escrow keys carefully.** Data encrypted with a lost key is gone, so build a secure key backup,
    especially for long-term data-at-rest. Encrypt the backup store with a FIPS-validated module. You may escrow
    encryption keys for recovery, but never escrow signing keys, since that would let others forge signatures.
13. **Enforce accountability and audit.** Know who can access or control each key, apply least privilege to all
    key and secret assets, and at minimum account for everyone who can view a plaintext key. Audit both the
    security plan and procedures and the protective mechanisms over time, and watch for unusual events as signs
    of attack.
14. **Prepare for compromise and recovery.** Understand what a compromise means for confidentiality, integrity,
    usage, and ownership. Limit the time keys spend in plaintext, keep humans from viewing them, hold plaintext
    keys only in protected containers, use integrity checks and key confirmation, track every access, and
    destroy keys once done. Keep a documented, reachable compromise-recovery plan listing who to contact, the
    re-key method, an inventory of all keys and their uses, and the revocation steps.
15. **Zeroize and destroy at end of life.** Revoke compromised keys fast and stop protecting new data with them.
    Destroy all copies (backup, archived, escrowed, and in-memory) once they are no longer needed and retention
    is met, though you may keep public verification keys to check old signatures. Cryptographic erasure works
    only when every protecting key can be destroyed and no plaintext copy survives. Overwriting memory is
    best-effort in garbage-collected runtimes, so use secure-memory APIs where you can, HSM zeroize commands for
    hardware, and physical destruction for media and tokens.
16. **Protect trust stores.** Guard the store against injected third-party roots, apply integrity controls to
    its objects, block export of held keys without authentication and authorization, set strict export policies,
    and update the store through a secure process.
17. **Use reputable libraries.** Rely only on well-maintained crypto libraries that third parties (such as
    NIST/FIPS) have tested and validated.

## @security scenario

```gherkin
@security @owasp:key-management @usecase:single-purpose-rotatable-key
Scenario: A data-encryption key is isolated, single-purpose, and rotatable
  Given a key generated inside a FIPS-validated module and used only to encrypt stored data
  When the key reaches the end of its cryptoperiod or is suspected compromised
  Then a new key is generated in the module and takes over encryption of new data
  And the retired key is destroyed once its data is re-encrypted and no copy is reused for signing or any other purpose
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually limits the damage is the lifecycle discipline around the key: it is born inside a validated
module, bound to one purpose, stored where application code never touches the raw bytes, rotated on a
cryptoperiod, tracked on every access, and destroyed when done. The `@security` scenario proves one key is
single-purpose and rotates cleanly; the module boundary, the one-key-one-job rule, the separation from code, and
the destruction step are what keep a single leak from unlocking everything. A test is a check; the
cradle-to-grave handling of the key is the guarantee.

## Sources

- OWASP Key Management Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>, retrieved 2026-10-11): the key selection and strength guidance, single-purpose and module-boundary rules, lifecycle stages (generation, distribution, storage, cryptoperiods and rotation, escrow and backup, accountability, compromise recovery, zeroization), and trust-store and library controls summarized above. `[documented]`
