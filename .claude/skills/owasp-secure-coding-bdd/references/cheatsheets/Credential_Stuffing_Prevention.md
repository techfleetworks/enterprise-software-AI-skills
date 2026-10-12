# Credential Stuffing Prevention

## What it is

How to defend a login against attacks that reuse stolen or weak credentials at scale: credential stuffing (trying
username and password pairs leaked from other sites), password spraying (trying one weak password across many
accounts), and plain brute force. This is the per-sheet guidance from the OWASP Credential Stuffing Prevention
Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

People reuse the same email and password on many sites. When one site is breached, those pairs land in lists that
attackers replay against every other login they can find, automated through tools that POST credentials and read
the success or failure in the response. Because the passwords are already valid somewhere, a small fraction work
here too, and the attacker takes over those accounts. Password spraying is the mirror image: one common password
such as the season and year tried against a huge pool of accounts, low enough per account to slip under naive
limits. Toolkits like Sentry MBA route this traffic through proxy networks so no single IP looks busy.

## Controls

The cheat sheet leads with MFA and then lists layered alternatives for when MFA is not possible. None of the
alternatives alone matches MFA, so stack several.

1. **Multi-factor authentication (strongest defense).** Microsoft's analysis puts it at stopping about 99.9% of
   account compromises, so enable it wherever you can. To balance usability, trigger the second factor only on
   risky signals (a new device, browser, or IP, an unusual or untrusted country, a denylisted or anonymizing or
   VPN IP, an IP hitting many accounts, or scripted or bot-like volume), or as step-up auth before high-risk
   actions such as large transfers or admin changes. Enterprise apps may allowlist trusted IP ranges, and
   different roles can get different rules (for example, require MFA for all admins even if not for all users).
2. **Build defense in depth with metrics.** Assume any single layer can be bypassed (client-side checks like
   device fingerprinting or JS challenges can be spoofed), so layer defenses, emit detected and mitigated volume
   metrics per layer (filterable by fields like IP) to spot failures and attacks, and coordinate across teams
   when defenses are changed.
3. **Avoid security questions as a second challenge, and verify whole secrets.** Do not use knowledge-based
   security questions as an extra factor (ASVS 5.0 excludes them). Where an app keeps a secondary password, PIN,
   or memorable word as a check, ask for the whole secret rather than selected characters. Another knowledge
   factor is not MFA; prefer a truly independent factor.
4. **CAPTCHA.** A puzzle per login slows bots, though solving services break many CAPTCHAs, so only challenge
   suspicious or high-risk logins and watch solve rates for user impact and automated solvers.
5. **IP mitigation and intelligence.** IP blocking alone is easy to evade, so use a graduated response over
   several measures. Consider short bursts and long slow campaigns, high volume and the low-but-steady traffic of
   many coordinated IPs, plus IP classification (residential versus hosting) and geolocation to tune thresholds.
   Keep blocks temporary with a path back out. Correlate against proxy, VPN, and hosting-provider ranges (for
   example, challenge every request from a hosting provider). Store each account's login IP history, and if a
   recent IP lands on a block list, consider locking the account and notifying the user.
6. **Device fingerprinting.** Build a device signature from passive HTTP headers (OS, browser, language) and, via
   JavaScript, richer traits (screen resolution, installed fonts, plugins). Prompt for extra auth on a mismatch
   rather than blocking, since people use many devices, give users a remembered-device history to manage, and
   flag anomalies like an outdated OS. Remember the client supplies all of it and can spoof it (the user agent
   trivially).
7. **Connection fingerprinting.** Signatures based on how the connection is made (JA3, HTTP/2 fingerprinting, HTTP
   header order) can be more reliable than IP or request data, and cross-checking them against other signals
   catches lies (for example, headers claim a phone but the connection looks like a Python script).
8. **Require unpredictable usernames.** Stuffing reuses usernames too, and email-as-username makes the pair
   portable. Letting users pick a non-email username, or assigning one, breaks that reuse; keep any generated
   name unpredictable (not from the real name or sequential IDs) so it does not enable enumeration.
9. **Use multi-step login.** Off-the-shelf tools expect a single POST. Splitting username and password across
   steps, or requiring a fetched CSRF token first, doubles the attacker's requests, but do not let the steps leak
   which accounts exist.
10. **Require JavaScript and block headless browsers.** Most attack tools do not run JS, so requiring JS
    execution (for example to mint a required token) forces a real browser or automation framework, which can be
    detected. Note that blocking no-JS visitors hurts accessibility and may break accessibility law in some
    places.
11. **Degrade the attacker's throughput.** Raise the cost of each attempt: escalate JS complexity, demand a
    proof-of-work puzzle, add long response delays, return oversized HTML, or randomize error messages. These cap
    the attacker's request rate without profiling users, and need a risk assessment for effectiveness and UX.
12. **Check passwords against breach data.** Enforce the ASVS rule to reject new passwords found in breach sets,
    using a service such as Pwned Passwords (self-hosted or via its API).
13. **Notify users of unusual security events.** Warn on meaningful events without flooding people. Do not alert
    on a plain wrong-password attempt, but do alert when the correct password is entered and then MFA fails, so
    they can change it. Consider blocking access pending verification after repeated resets from different
    devices or IPs, and show users their recent login details and active sessions so they can end rogue ones.

## @security scenario

```gherkin
@security @owasp:credential-stuffing @usecase:breached-credential-replay
Scenario: A breach-sourced credential replay is blocked by a second factor
  Given a login endpoint with MFA enabled
  When an attacker submits a valid username and password pair leaked from another site
  Then the password alone does not grant a session
  And a second, independent factor is required before login succeeds
  And the attempt is counted in per-IP attack metrics
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually defeats reused credentials is the second, independent factor: even a correct, breached
password cannot finish a login without something the attacker does not have, which is why MFA stops the large
majority of these attacks. Where MFA is impossible, no single alternative is a guarantee; layered defenses only
raise the cost. The `@security` scenario checks that one leaked pair is blocked; the independent second factor is
what makes every leaked pair safe. A test is a check; the independent factor is the guarantee.

## Sources

- OWASP Credential Stuffing Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the MFA-first defense with risk-based triggers, and the layered alternatives (defense in depth and metrics, CAPTCHA, IP intelligence, device and connection fingerprinting, unpredictable usernames, multi-step login, JavaScript and headless-browser blocking, degradation, breached-password checks, and user notifications). `[documented]`
