# Zero Trust Architecture

## What it is

A way to design security around one idea: never trust by default, always check. No person, device, or service is
treated as safe just because it sits inside the network. Every access attempt is verified on its own, every time.
This is the per-sheet guidance from the OWASP Zero Trust Architecture Cheat Sheet, condensed to the controls that
hold and the attack they stop.

## The attack it stops

The old model guards the edge like a castle wall: get past it once and you can roam freely inside. That lets an
attacker who steals one credential, plants malware in a trusted supply-chain package, or lands on one machine move
sideways through a flat internal network and reach data everywhere. Insider abuse, stolen identity tokens
(pass-the-hash, golden ticket), misconfigured cloud resources, and direct API hits all exploit that implicit trust.
Zero Trust removes it: each connection is authenticated, authorized, and segmented, so one foothold does not open
the rest of the estate.

## Controls

Following the cheat sheet's structure:

1. **Seven NIST SP 800-207 principles.** Treat every data source and service as a protected resource. Secure
   (encrypt and authenticate) all traffic no matter where it comes from. Grant access one session at a time with
   least privilege, and do not let one grant imply another. Decide access with dynamic policy that weighs identity,
   device, location, time, and behavior. Watch the security state of every asset continuously and drop access when
   an asset falls out of compliance. Enforce authentication and authorization strictly, and re-check live sessions
   when policy calls for it. Gather posture, traffic, and request data to sharpen decisions, while managing the
   privacy risk of that collection.
2. **Three policy components.** A Policy Engine reaches the allow-or-block decision. A Policy Administrator turns
   that decision into instructions. Policy Enforcement Points (firewalls, proxies, app and API gateways) carry it
   out, and they sit everywhere, not only at the perimeter.
3. **Identity and access.** Require phishing-resistant MFA for staff, contractors, and partners; prefer FIDO2
   security keys, WebAuthn passkeys with user verification, or PIV smart cards, and avoid SMS codes. A biometric
   alone is not MFA; it only unlocks a possessed authenticator. Run one identity source, automate role-based
   provisioning, review access each quarter, and keep admin accounts separate. Give the least privilege needed,
   grant elevation just in time, and remove standing admin rights.
4. **Device security.** Register every device with its own certificate, confirm health in real time (patches,
   anti-malware, configuration), and revoke trust the moment a device looks compromised. On each endpoint run
   anti-malware, behavior monitoring, full-disk encryption, and remote wipe.
5. **Network architecture.** Carve the network into small isolated segments per application, deny traffic unless
   it is allowed, and encrypt and watch internal flows. Add DNS and web filtering, and replace broad network
   admission with access to specific resources; where a VPN must remain during migration, restrict and monitor it
   so connecting never counts as authorization.
6. **Application and data protection.** Front apps with an identity-aware proxy, authenticate and schema-validate
   and rate-limit every API call, and build security into development. Treat a WAF as added filtering, not as the
   thing that decides who may act; keep authorization and business rules in trusted server-side code. Label data
   by sensitivity, encrypt it at rest and in motion, block unauthorized transfers, and log every access.
7. **Monitoring and analytics.** Feed all logs into a SIEM, hunt for threats, automate containment, and learn
   normal behavior so anomalies stand out. Track auth success and failure rates, policy violations, and how fast
   you detect (MTTD) and respond (MTTR).
8. **Rollout approach.** Migrate incrementally while old and new workflows coexist. Inventory users, devices,
   apps, and data flows; stand up MFA; narrow remote access; and bring admin accounts under privileged access
   management first. Then segment, monitor devices continuously, and enforce identity-aware plus resource-level
   authorization. Add behavior analytics and automated response, then keep tuning. Pilot every change and confirm
   that legitimate access still works before expanding.
9. **Legacy systems.** For systems that cannot do modern auth, place a security proxy or gateway in front to
   handle strong authentication, isolate them in tightly watched network zones, translate modern tokens into the
   old format they expect, and lean on network-based monitoring where their own logs fall short.
10. **Cloud and containers.** Across clouds use one identity, encrypt inter-cloud links, apply the same policies,
    and centralize monitoring. For containers, let a service mesh handle identity and encryption, restrict which
    services may talk, scan images, and watch runtime behavior.
11. **Avoid the common traps.** Do not mistake network controls alone for Zero Trust, do not drown in unused
    telemetry, do not make security so painful that users route around it (use risk-based friction), and do not
    forget legacy systems, which often hold the most sensitive data.
12. **Policy-as-code, continuous verification, telemetry (for cloud-native workloads).** Keep policies in version
    control, test them in CI, and enforce them at deploy. Verify workload identity, image signatures, and policy
    drift at admission, noting that admission checks do not replace runtime authorization. Collect identity,
    network, runtime, deployment, and vulnerability signals and feed them back to refine policy.

## @security scenario

```gherkin
@security @owasp:zero-trust @usecase:stolen-credential-lateral-movement
Scenario: A valid credential from a risky context is still denied
  Given an internal service protected by a policy enforcement point
  When a request arrives with correct credentials from an unregistered device at an unusual hour
  Then the dynamic policy scores the request high-risk and blocks or step-up-challenges it
  And no resource access is granted on network location or a prior session alone
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops lateral movement is per-request verification plus segmentation: each resource checks identity,
device, and risk at the point of access, and the network is split so one foothold reaches almost nothing. The
`@security` scenario proves one risky request is denied; the policy engine deciding every session, enforced at
each enforcement point, is what makes every request safe. A test is a check; continuous verification at the
resource is the guarantee.

## Sources

- OWASP Zero Trust Architecture Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Zero_Trust_Architecture_Cheat_Sheet.html>, retrieved 2026-10-11): the seven NIST SP 800-207 principles, the policy engine/administrator/enforcement-point model, identity, device, network, application, data, monitoring, rollout, legacy, cloud, and policy-as-code controls summarized above. `[documented]`
