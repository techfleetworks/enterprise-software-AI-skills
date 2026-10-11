# Bot Management and Anti-Automation

## What it is

How to raise the cost of abusive automated traffic (credential stuffing, scraping, scalping, fake signups, card testing, and the rest of the OWASP OAT catalog) without blocking the legitimate bots and users you want. This is the per-sheet guidance from the OWASP Bot Management and Anti-Automation Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Automated clients pound an application in ways that are not a flood-style outage but are still abusive. A plain example from the source is credential stuffing (OAT-008): a bot replays username and password pairs from past breaches across your login form, trying one password per account across many accounts to slip under any single counter. The same automation underpins scraping, inventory hoarding for resale, fake account creation, gift-card and coupon brute forcing, and card testing, all of which the controls here are meant to make expensive instead of free.

## Controls

The cheat sheet's guidance, in order:

1. **Threat-model first.** Map which OAT categories hit your app and which endpoints carry them, since a login, a search page, a checkout, and a public API each need different defenses. Aim to raise the cost of abuse, not to block every bot.
2. **Layer defenses across three tiers.** At the edge (CDN/WAF): IP reputation, ASN filtering, TLS fingerprints (JA3/JA4), HTTP/2 fingerprint, coarse rate limits. At the application: session-aware and identity-bound limits, behavioral signals, honeypots, challenges. At the backend: transaction anomaly detection, account-velocity rules, fraud scoring, and async review queues. A request that passes one tier can still fail another.
3. **Rate limit on several keys, with the right algorithm.** Limit per IP (a weak floor), per session or cookie, per authenticated identity (most reliable), per endpoint (tighter on login), and per ASN or geo. Use token-bucket or sliding-window, not fixed-window (which allows boundary bursts). For login, run two independent buckets that must both pass: one keyed on username (protects a single account from a distributed attack) and one keyed on IP or IP+ASN (caps one source's spread across accounts). Do not key a single bucket on the IP-plus-username pair, which lets one IP hit every account once. On a limit, return a generic `429` with no diagnostic detail and no schedulable `Retry-After`.
4. **Fingerprint privacy-first.** Use passive network signals before client-side ones: JA3/JA4 TLS fingerprints, the HTTP/2 fingerprint, and Client Hints checked against the TLS fingerprint. Fall back to browser signals (canvas, WebGL, fonts, behavioral telemetry) only when needed and on sensitive flows. Disclose fingerprinting in the privacy notice, hash or truncate values before storing, keep retention short (hours to days), and skip fingerprinting authenticated low-risk traffic.
5. **Treat CAPTCHA as a last-resort step-up, not the primary defense,** because visible CAPTCHAs are accessibility-hostile and cheaply solved by ML or human farms. Prefer or layer: cryptographic attestation tokens (for example Privacy Pass, trusting issuers whose policy fits), managed challenges (such as Turnstile, validated server-side with `success: true` plus hostname and action checks, tokens single-use and expiring in five minutes), invisible risk scoring (reCAPTCHA v3, hCaptcha Enterprise), proof of work (benchmark it so puzzles do not deny service), and WebAuthn/passkeys for high-value flows. Use a maintained challenge library, keep difficulty, expiry, and state server-side, reject unknown/expired/spent challenges, block concurrent reuse, and keep rate limits on after a pass.
6. **Add honeypots and tarpits,** which cost nothing and never touch real users. Use hidden form fields that only bots fill (drop or tarpit those submissions), bait paths disallowed in `robots.txt`, progressive slow responses (tarpitting) for detected bots instead of a `403`, and watermarked canary records to prove and fingerprint scraping.
7. **Defend specific flows.** Signup (OAT-019): verify email before the account works, check disposable domains, check carrier type for phone, apply per-IP/ASN/device velocity caps, and reject high-entropy local-parts on newly registered domains. Login (OAT-008): per-username and per-IP limits, breach-corpus password checks that trigger step-up rather than a block, and MFA on suspicious patterns. Inventory/scalping (OAT-005, OAT-015): waiting-room queues, server-side per-account purchase limits including payment/address/device proxies, cart hold times, and address/payment dedup by normalized hash. Public APIs: rotating API keys (not static bearer tokens in client code), per-key quotas advertised via `X-RateLimit-*`, request signing (HMAC of method, path, timestamp, body), and explicit API tiering.
8. **Respond in graduated steps, not always a block,** so attackers get no clean signal. Escalate from log-and-serve, to step-up challenge, to tarpit or stale data, to soft-blocking specific actions, to an account hold with manual review (do not delete, to preserve forensics). For scrapers, serving plausibly wrong data (price off by a percent, fake stock) can hurt the scraping business case more than a `403`.
9. **Log and monitor for post-hoc investigation.** Per sensitive request, capture timestamp, request ID, route, status, client IP/ASN/country, TLS and HTTP/2 fingerprints, raw and parsed User-Agent, authenticated identity or hashed session ID, and the decision with its signals. Mask credentials and PII. Build dashboards (RPS by endpoint, 4xx/5xx rate, signup-to-purchase funnel, login success) and alert on shifts beyond about three sigma.
10. **Handle anti-bot data as regulated processing.** Document the lawful basis and data collected, honor consent rules for device access and fingerprinting (legitimate interest does not replace required consent), minimize collection, keep raw signals briefly, list third-party vendors as sub-processors, do not block users just for a hardened browser (challenge instead), and offer accessible challenge alternatives.
11. **Avoid the named anti-patterns:** blocking all non-standard User-Agents, trusting a single edge vendor as the only control, storing raw fingerprints forever, CAPTCHA on every login, unlogged hidden rules, and hard-blocking on the first signal.

## @security scenario

```gherkin
@security @owasp:bot-management @usecase:credential-stuffing-dual-bucket
Scenario: Distributed credential stuffing trips a per-username rate limit
  Given a login endpoint with separate per-username and per-IP rate buckets
  When one username is targeted with many password guesses spread across many IP addresses
  Then the per-username bucket exceeds its threshold and further attempts get a generic 429
  And the response leaks no detail about which bucket fired or how many attempts remain
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually caps a distributed credential-stuffing run is the pair of independent rate buckets, checked separately: the per-username bucket catches a single account attacked from many IPs, and the per-IP bucket catches one source sweeping many accounts, so neither axis of the attack has a free path. The `@security` scenario proves one username trips the limit; checking both buckets independently (never a single IP-plus-username key) is what makes the attack unprofitable across every axis. A test is a check; the two separate buckets are the guarantee.

## Sources

- OWASP Bot Management and Anti-Automation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Bot_Management_and_Anti-Automation_Cheat_Sheet.html>, retrieved 2026-10-11): OAT threat modeling, three-layer defense, multi-key rate limiting with the dual-bucket login rule, privacy-aware fingerprinting, CAPTCHA alternatives, honeypots and tarpits, per-flow defenses, graduated response, logging, and privacy/compliance and anti-pattern guidance. `[documented]`
