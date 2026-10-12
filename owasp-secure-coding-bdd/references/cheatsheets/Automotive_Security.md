# Automotive Security

## What it is

How to secure the computers in a vehicle: the electronic control units (ECUs), the backend services they
talk to, and the companion apps drivers use. The job is to authenticate the messages that drive safety
functions, verify the software that runs, lock down diagnostic and command paths, and fail safely when
something goes wrong. This is the per-sheet guidance from the OWASP Automotive Security Cheat Sheet,
condensed to the controls that hold and the attacks they stop. It starts with a threat model and with a
safety agreement, because shutting down a car in motion can itself be dangerous.

## The attack it stops

A modern car is a network of ECUs on buses that were never built to check who is talking. Plain CAN has no
sender authentication, so anything that reaches the bus (a compromised infotainment unit, an exposed
diagnostic port, a hostile backend reply) can forge messages that brakes or steering obey. Attackers also
flash unsigned firmware, replay old-but-valid commands, reach debug interfaces left on in production, or
pull personal and location data out of storage. Because these systems move people at speed, a forged
message or a bad update is not just a data breach; it is a safety event. The controls below keep forged
and replayed messages from being trusted and keep unverified software from running.

## Controls

In the cheat sheet's order:

**Protect communications and inputs**
1. **Separate trust zones.** Keep infotainment, wireless, and diagnostics apart from the controls that
   matter for safety, and let gateways pass only the message flows that are actually needed. Segmentation
   shrinks how far a compromise spreads, but it does not authenticate messages inside a zone.
2. **Authenticate vehicle messages.** Since classic CAN cannot tell who sent a frame, add
   platform-supported protection such as AUTOSAR SecOC with freshness checks that drop replays. SecOC
   authenticates the configured message data; it does not encrypt the bus, stop flooding, or stop a
   compromised-but-legitimate sender from producing valid messages.
3. **Protect external connections.** Use TLS with certificate validation for links to the backend and to
   apps, and authenticate each vehicle on its own. An encrypted pipe is not the same as an authorized
   command.
4. **Validate before acting.** Even on authenticated input, check lengths, types, ranges, and whether the
   action is allowed in the current vehicle state. Authentication does not prove a sensor value is
   physically true.

**Verify software and updates**
5. **Verify before execution.** Use secure boot anchored in a protected root of trust to check the whole
   boot chain, and include recovery firmware. Secure boot does not stop runtime exploitation of trusted
   software that is itself vulnerable.
6. **Authenticate updates on the ECU.** For over-the-air and workshop updates, check signed metadata,
   image hashes, the target hardware, freshness, and rollback rules, following Uptane. Encrypting the
   transport does not, on its own, prove an update is genuine.
7. **Plan safe recovery.** Apply updates only under conditions the safety engineers agreed are safe, and
   recover from an interrupted install using authenticated software without turning off rollback
   protection. A signature does not mean the software has no flaws, so protect the supply chain too.

**Restrict access and protect data**
8. **Authorize every operation.** Enforce authorization for the specific vehicle and the specific action
   in both backend services and in-vehicle command handlers, keep owner, fleet, and service rights
   separate, and revoke a prior user's access when ownership or a rental ends.
9. **Protect service interfaces.** Turn off debug access that production does not need, and authenticate
   and limit the diagnostic functions that remain while still allowing authorized repair. Having physical
   access is not the same as being authorized.
10. **Protect keys and stored data.** Do not share one secret across a whole fleet, use hardware-backed
    key protection where you can with renewal and revocation, keep retained location and personal data to
    a minimum, and encrypt sensitive storage with keys held apart from the data. Encryption blocks offline
    extraction, but software allowed to decrypt can still leak the data.

**Test and maintain security**
11. **Track versions.** Keep a record of which component versions are on which vehicles so a new flaw
    maps to targeted fixes, and settle with suppliers who owns patches and for how long.
12. **Test the failure paths.** Exercise rejected commands, malformed input, replay behavior, and
    interrupted installs against isolated benches or simulators, confirming both that enforcement works and that
    failure is safe before anything reaches a vehicle.
13. **Log security events.** Record authentication failures, privileged actions, and update outcomes
    without writing secrets, and assign someone to review them and act on reports.
14. **Handle unpatchable parts.** When a component cannot be patched, cut down the interfaces that can
    reach it and plan to replace it. Gateway filtering lowers exposure but does not fix the firmware.

## @security scenario

```gherkin
@security @owasp:automotive @usecase:can-message-forgery
Scenario: A forged safety-critical CAN message is rejected
  Given a safety-critical ECU that accepts commands protected by SecOC with freshness checks
  When an attacker on the bus injects a frame without a valid authenticator or replays a captured one
  Then the ECU rejects the message and does not act on it
  And the rejection is logged without recording any secret material
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin
scenario.

## The real guarantee

What actually keeps a forged command from steering the car is message authentication with freshness: the
ECU acts only on data that carries a valid authenticator it has not seen before, so an injected or
replayed frame is dropped. The `@security` scenario proves one forged message is rejected; the
authenticator and freshness check are what make every forged and replayed message safe to ignore. A test
is a check; the authenticated, fresh message is the guarantee. And because stopping a moving vehicle can
itself harm people, the agreed safe-failure behavior is part of that guarantee, not an afterthought.

## Sources

- OWASP Automotive Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Automotive_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the controls for protecting communications and inputs, verifying software and updates, restricting access and protecting data, and testing and maintaining security, including the SecOC, secure boot, Uptane, authorization, and safe-failure points summarized above. `[documented]`
