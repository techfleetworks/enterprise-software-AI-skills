# Webhook Security

## What it is

How to secure both sides of a webhook: the publisher that pushes event callbacks to a registered URL, and the
subscriber that runs a public POST handler to receive them. This is the per-sheet guidance from the OWASP
Webhook Security Cheat Sheet, condensed to the controls that hold and the attacks they stop. A webhook endpoint
is an open, unauthenticated handler until you add proof of who sent the event, and a publisher that forwards
events to URLs its subscribers choose becomes an outbound requester attackers will try to steer toward your own
network.

## The attack it stops

The headline threat is a forged delivery: with no verification, anyone can POST a fake event that fulfills an
order, grants account access, or rewrites records. A captured genuine delivery still carries a valid signature,
so an attacker can replay it to make the same side effect happen again. A leaked signing secret lets an attacker
mint valid deliveries at will. On the publisher side, letting subscribers register any callback URL invites
server-side request forgery: an attacker signs up an internal address, or the cloud metadata endpoint, and rides
your delivery workers into the private network. And an unthrottled endpoint can be flooded into a denial of
service.

## Controls

The sheet groups its controls by concern:
1. **Transport security.** Require HTTPS on every endpoint and reject plain HTTP, since a signature proves origin
   but does not hide the body. Require at least TLS 1.2 with a certificate issued by a trusted CA, and as a
   publisher check the subscriber's certificate on each delivery.
2. **Signature verification.** The publisher generates a random signing secret per webhook (24 to 64 bytes, 32 a
   good default) and signs the event ID, timestamp, and raw body together using a documented scheme. The
   subscriber recomputes the HMAC over the untouched raw body and compares the two with a constant-time equality
   helper (`hmac.compare_digest`, `crypto.timingSafeEqual`), and never plain `==`. Accept only the scheme you expect, accept a
   delivery if any one of the supplied signatures matches, and answer a missing or wrong signature with `401`
   and no explanation.
3. **Secret management.** Keep signing secrets in a secrets manager, never in source, config, or images. Use a
   separate secret per webhook so one leak exposes one integration, and strip secrets and signature headers out
   of logs and error bodies.
4. **Secret rotation.** On suspected compromise, revoke and replace the secret at once. For planned rotation,
   run an overlap window where the publisher signs with every active secret and sends one signature each; since
   the subscriber honors any signature that checks out, the order in which the two sides update does not matter,
   then the old secret is revoked and deliveries signed only with it get `401`.
5. **Extra authentication (defense in depth).** HMAC authenticates the payload, not the connection, so layer on
   mutual TLS, a stored bearer token or API key, or OAuth 2.0 client credentials when a leaked secret alone must
   not be enough. IP allowlisting is only a weak extra layer, since ranges change and a shared egress IP is not
   identity.
6. **Replay protection.** For protocols with an authenticated timestamp and event ID, the subscriber rejects
   deliveries whose signed timestamp is outside a small tolerance (five minutes is a common default) with the
   clock kept in sync by NTP, and caches accepted event IDs to block repeats for at least twice the tolerance.
7. **Idempotency and duplicates.** Because publishers retry, persist processed event IDs across the whole retry
   window and skip repeats, return `200` for an already-handled duplicate without redoing its effects, make
   downstream writes idempotent, and never assume in-order delivery; refetch current state when an event may be
   stale.
8. **Rate limiting.** Publishers apply per-subscriber limits, backoff with jitter, a retry cap, and disable
   endpoints that keep failing. Subscribers throttle at the gateway or app, answer excess with `429` plus
   `Retry-After`, acknowledge fast and process through an async queue, and subscribe only to event types they
   actually handle.
9. **SSRF prevention (publisher side).** Allow only the `https://` scheme, and block every non-public
   destination by resolving the hostname and rejecting any address that is not globally reachable, including the
   IPv6 equivalents and names like `metadata.google.internal`. Validate the exact IP you connect to (resolve
   once, check it, then connect to that IP while sending the real hostname in `Host` and SNI, or validate inside
   the client's connect hook) to close DNS rebinding. Disable redirects or recheck each target, and isolate
   delivery workers in a segment that cannot reach internal services.
10. **Endpoint hardening.** A valid signature does not make the content safe, so cap the body
    size, turn away unexpected `Content-Type` values, and check the payload against a strict schema before you
    process it, then use parameterized queries and context-aware output encoding downstream. Accept `POST` only and answer other
    methods with `405`. Exempt only the webhook route from framework CSRF checks, and only once signature
    verification is the replacement control. Fail securely: send `200` only once the event has been safely
    queued or handled, `400` for malformed input, `401` for a bad signature, all with generic bodies, and route
    repeatedly failing events to a dead-letter queue with an alert.
11. **Logging and monitoring.** Log the timestamp, source IP, method, status, event ID and type, and latency,
    but keep full bodies, secrets, and signature or `Authorization` headers out of logs. Alert on bursts of
    signature failures, sustained `4xx` or `5xx`, and deliveries from unexpected addresses.

## @security scenario

```gherkin
@security @owasp:webhook @usecase:forged-delivery-rejected
Scenario: A webhook handler rejects a delivery with an invalid signature
  Given a webhook endpoint that verifies an HMAC-SHA256 signature over the raw body
  When an attacker posts a fake event whose signature does not match any active secret
  Then the handler returns 401 with a generic body and no detail about why
  And no side effect such as order fulfillment or a record change is triggered
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually keeps forged events out is signature verification with a constant-time comparison over
the raw body: only a caller holding the signing secret can produce a delivery the handler will act on. The
`@security` scenario proves one unsigned forgery is turned away; the HMAC check, the replay window, and the
idempotency record together are what make every forged, replayed, or duplicated delivery safe. A test is a
check; the verified signature is the guarantee.

## Sources

- OWASP Webhook Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full two-sided control set covering transport security, signature verification, secret management and rotation, defense-in-depth authentication, replay and duplicate protection, rate limiting, publisher-side SSRF prevention, endpoint hardening, and logging. `[documented]`
