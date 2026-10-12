# User Privacy Protection

## What it is

How to build an online service that shields its users' privacy and anonymity, not just the service's own data:
strong crypto, enforced HTTPS, certificate pinning, panic modes, remote session control, support for anonymity
networks, blocking third-party content leaks, and plain honesty about what you can and cannot protect. This is
the per-sheet guidance from the OWASP User Privacy Protection Cheat Sheet, condensed to the controls that hold
and the threats they stop.

## The attack it stops

Users of social, messaging, and email platforms face surveillance, network eavesdropping, and real-world
coercion, and these harms fall hardest on activists and people in dangerous regions. An attacker on the wire
can read traffic that is not encrypted or can strip HTTPS back to plain HTTP in a man-in-the-middle position. A
compromised or forced certificate authority can impersonate any site. A stolen or confiscated device leaves
live sessions open for whoever holds it. A third-party image embedded in a feed can quietly leak a user's real
IP address to an adversary who hosts it. And a user who is physically threatened may be forced to hand over
their password. These controls blunt each of those paths.

## Controls

The cheat sheet lists these protective measures:
1. **Strong cryptography.** Encrypt user communications in transit and at rest. Follow TLS best practices:
   valid certificates, well-guarded private keys, strong ciphers only, adequate key lengths, and clear warnings
   to the user. Encrypt private data in storage under strict technical and procedural access limits, and always
   hash credentials with a strong, collision-resistant algorithm and a rising work factor, whether or not the
   store is also encrypted.
2. **Support HTTP Strict Transport Security (HSTS).** Send the HSTS header so the browser only talks over HTTPS,
   rewrites insecure links, and refuses an untrusted TLS connection instead of falling back. If you cannot
   enforce it for everyone, at least let users turn it on for themselves.
3. **Digital certificate pinning.** Pin a known set of certificates or public keys in the client so only those
   are accepted and every other one fails, even a certificate the user was tricked or forced into trusting.
   This defends against a compromised CA, a forced malicious root (as in some corporate or national setups), and
   users who would click through certificate warnings.
4. **Panic modes.** Give a coerced user a way out: a distress login that opens a decoy account, deletes or hides
   sensitive data, or fires a backup or upload trigger. A panic mode must be hard to detect; inside it, normal
   actions should still appear to work, and it must be possible to create a further panic mode from within one,
   so an adversary cannot tell they are already in a decoy. Consider making panic modes creatable only out of
   band so they are harder to spoof, and design them to confuse an attacker and keep the real account hidden.
5. **Remote session invalidation.** Let users see their active sessions and kill suspicious ones, so a lost,
   stolen, or seized device, or a session believed stolen in a man-in-the-middle attack, can be cut off remotely.
6. **Allow connections from anonymity networks.** Let users reach the service through networks like Tor, which
   people under surveillance or censorship rely on. Reconsider any policy that blocks such networks, and where
   you can, make it easy to pair with them, for example by supporting SOCKS proxies or integration libraries.
7. **Prevent IP address leakage.** When the app shows third-party content such as avatars or attachments, give
   users the option to block external content, since an attacker can host an image and watch the request to
   learn a victim's real IP. This matters most for social networks, forums, and web mail with HTML messages;
   many mail clients already block remote content by default.
8. **Honesty and transparency.** If you cannot guarantee legal or political protection, or cannot keep logs and
   sensitive data from misuse or disclosure, tell users clearly so they can decide whether to use the service.
   Where the law allows, let users know when an outside party asks for their information for removal or
   investigation. Candor builds trust and lets users in different regions weigh their own risk.

## @security scenario

```gherkin
@security @owasp:user-privacy @usecase:remote-session-invalidation
Scenario: A user cuts off a session on a stolen device
  Given a user with an active session on a device that was stolen
  When the user views their active sessions from another device and revokes the stolen one
  Then that session is invalidated and can no longer access the account
  And the user communications stay encrypted in transit and at rest throughout
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually protects a user is the combination of controls applied to their real threat: strong
crypto and HSTS keep the wire private, pinning survives a bad CA, remote invalidation closes a seized device,
panic modes protect a coerced user, blocking external content hides their IP, and honest disclosure lets them
opt out of a risk you cannot cover. The `@security` scenario proves one of these, remote session revocation,
works end to end; the measure that matches each user's actual danger is what keeps them safe. A test is a check;
the deployed protection is the guarantee.

## Sources

- OWASP User Privacy Protection Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/User_Privacy_Protection_Cheat_Sheet.html>, retrieved 2026-10-11): the protective measures (strong cryptography, HSTS, certificate pinning, panic modes, remote session invalidation, anonymity-network access, IP-leakage prevention, honesty and transparency) and the user threats they address. `[documented]`
