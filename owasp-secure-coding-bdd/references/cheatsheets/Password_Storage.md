# Password Storage

## What it is

How to store passwords so that stealing the database does not hand an attacker the passwords: slow, salted,
memory-hard hashing. This is the per-sheet guidance from the OWASP Password Storage Cheat Sheet, condensed to
the controls that hold and the attack they stop.

## The attack it stops

If passwords are stored in plain text, or with a fast or unsalted hash, an attacker who steals the store cracks
them offline. Weidman's password-attacks chapter shows the tooling: "One of the more popular tools for
cracking passwords is John the Ripper," whose default mode is brute forcing, and against a weak, fast hash it
"can run through the entire set of possible passwords and come up with the correct answer" quickly. A slow,
memory-hard, salted hash is what makes that offline brute force infeasible.

## Controls

The cheat sheet's order of preference and minimum parameters:
1. **Argon2id (first choice):** minimum `m=19456 (19 MiB), t=2, p=1` (alternatives include `m=47104, t=1, p=1`
   and `m=12288, t=3, p=1`).
2. **scrypt (when Argon2id is unavailable):** minimum `N=2^17, r=8, p=1`.
3. **bcrypt (legacy systems only):** work factor "minimum of 10," and note the "maximum length input length of
   72 bytes" (pre-hash longer inputs or prefer Argon2id).
4. **PBKDF2 (when FIPS-140 compliance is required):** `600,000` iterations for HMAC-SHA256, `220,000` for
   HMAC-SHA512 (HMAC-SHA1 legacy only).
Always use a unique per-password salt (the algorithms above handle this), and never a plain fast hash such as
a bare SHA-256.

## @security scenario

```gherkin
@security @owasp:password-storage @usecase:offline-cracking-resistance
Scenario: Stored password hashes resist offline cracking
  Given a user registers with a password
  When the password is persisted
  Then it is stored as an Argon2id hash at or above m=19456, t=2, p=1 with a unique salt
  And it is never stored in plain text or as a fast unsalted hash
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually protects the passwords is the choice of a slow, salted, memory-hard algorithm at the
right parameters: it makes each guess expensive, so an offline attacker with the whole store still cannot work
through the keyspace. The `@security` scenario proves the stored format is Argon2id at the floor parameters;
the algorithm and its cost factors are what make a stolen hash infeasible to crack. Rate limiting and MFA
defend the live login; they do nothing for a stolen hash, which is why the stored format is the guarantee here.

## Sources

- OWASP Password Storage Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>, retrieved 2026-10-10): the order of preference (Argon2id, scrypt, bcrypt, PBKDF2) and the minimum parameters quoted above. `[documented]`
- Georgia Weidman, *Penetration Testing: A Hands-On Introduction to Hacking* (No Starch, 2014), Chapter 9 "Password Attacks": the attacker view of offline hash cracking with John the Ripper against weak, fast hashes. `[documented]`
