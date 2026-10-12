# Transaction Authorization

## What it is

Transaction authorization is the extra confirmation a user gives before a sensitive action goes through, such
as a wire transfer, a change to how codes are received, or unlocking an account. It usually rides on a second
factor: an OTP token, an SMS code, a challenge-response reader, or a digital signature that signs the actual
transaction. This is the per-sheet guidance from the OWASP Transaction Authorization Cheat Sheet, condensed to
the controls that hold and the attack they stop.

## The attack it stops

The threat is malware or a man-in-the-middle that gets a fraudulent transaction approved without the user
knowingly confirming it. One documented trick: the malware shows a fake error after the user signs in, so the
user authenticates twice; the first response logs them in and the second authorizes a hidden transfer. Related
attacks swap the real payment details for the attacker's after the user has looked at them, downgrade the user
to a weaker authorization method, replay a captured code, or skip the authorization step entirely. The controls
below make the server, not the client, decide what was authorized and what runs.

## Controls

Functional rules, in the cheat sheet's order (what the user experiences):
1. **Show and confirm the real transaction data (What You See Is What You Sign).** The authorization step must
   let the user see and acknowledge the details that matter, such as the target account and the amount, because
   the user's own computer may already be compromised. When the device is limited, show at least a partial
   account number and the amount for confirmation.
2. **Authorize a token change with the current token.** When a user changes the thing that receives codes,
   confirm it with the credential they have now. If they switch the phone number for SMS codes, send the
   confirming code to the old number first.
3. **Authorize a method change with the current method.** When users can pick how transactions are authorized,
   confirm the switch using the method already in force so malware cannot quietly move them to a weaker one, and
   warn them about the risk of weak methods.
4. **Keep authentication and transaction authorization clearly different.** Do not make the user perform the
   same steps to log in and to approve a transaction, or malware can harvest one and reuse it. Use a different
   method, a different mode on the device, or a clear "you are signing this" prompt.
5. **Use fresh credentials for each transaction.** Never let one code or response approve a whole session or be
   reused, since a sniffed credential would then authorize anything.

Non-functional rules, in the cheat sheet's order (how the server must behave):
6. **Perform and enforce authorization on the server.** The outcome must not change by tampering with
   transaction parameters, adding or removing parameters to skip the check, or forcing an error. Default to deny
   and keep debug features out of production.
7. **Enforce the chosen method on the server.** The server must require the method the user picked or the policy
   demands, so an attacker cannot downgrade it through client parameters. Take special care when a new method is
   layered over old code that still accepts the old one.
8. **Generate the verification data on the server.** The significant transaction data the user confirms must be
   produced and stored on the server and handed to the authorization component with no chance for the client to
   alter it in between.
9. **Block brute-forcing of the credentials.** Once some number of authorization attempts have failed, throw
   away the whole process and make the user start over.
10. **Allow only the intended state transitions.** The multi-step flow (enter data, request authorization,
    confirm data, submit credentials, execute) must run in order, with no skipping or reordering of steps.
11. **Protect the transaction data from modification after entry.** Do not let a changed amount or recipient
    ride through on an already-issued code; if the data changes, void the earlier OTP and challenge or reset the
    whole process, and log the attempt. This closes the time-of-check to time-of-use gap.
12. **Keep transaction data confidential in transit.** Protect the privacy of the data the user is approving
    across every client-server exchange.
13. **Re-check authorization at execution time.** Put a final gate right before the transaction runs that
    confirms the user actually authorized this exact transaction, closing TOCTOU and skipped-check paths.
14. **Expire credentials quickly.** Accept an OTP or challenge response only inside a short window between when
    it is issued and when authorization completes, which also limits stolen-credential reuse and resource
    exhaustion.
15. **Make each credential unique per operation.** Tie every credential to one operation with a timestamp, a
    counter, or a random value so it cannot be replayed.

Beyond these, the sheet recommends protecting transactions with cryptography for integrity, confidentiality,
and non-repudiation, and guarding the device signing keys during pairing and use; it also notes anti-malware
tools are only a secondary layer.

## @security scenario

```gherkin
@security @owasp:transaction-authorization @usecase:server-side-authorization
Scenario: A tampered transaction cannot be authorized from the client
  Given a user has entered a wire transfer to account A for an amount
  And the server has generated and stored the significant transaction data
  When an attacker alters the target account to B in the authorization request
  Then the server rejects the authorization because the data no longer matches what was confirmed
  And the transaction does not execute
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects a transaction is the server holding the authorized details and checking them again at
the moment of execution, so nothing the client sends can change what runs. The `@security` scenario proves one
tampered request is turned away; the server-side generation, binding, and final execution check are what make
every tampered or replayed request fail. Showing the user the real data to sign, fresh per-operation
credentials, and a short validity window back this up. A test is a check; the server-side authorization is the
guarantee.

## Sources

- OWASP Transaction Authorization Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html>, retrieved 2026-10-11): the functional and non-functional guidelines (What You See Is What You Sign, server-side enforcement, state-transition control, brute-force limits, execution-time re-check, and per-operation credentials). `[documented]`
