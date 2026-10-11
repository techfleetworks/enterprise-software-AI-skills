# WebSocket Security

## What it is

How to secure a WebSocket service, where a single long-lived connection carries two-way traffic that normal HTTP
controls and logs do not cover. This is the per-sheet guidance from the OWASP WebSocket Security Cheat Sheet,
condensed to the controls that hold and the attacks they stop. Because the connection stays open and keeps
exchanging messages, you have to secure the handshake, each message, and the lifetime of the socket, not just a
one-shot request.

## The attack it stops

The signature attack is Cross-Site WebSocket Hijacking (CSWSH). A victim who is logged into your app visits a
malicious page; that page opens a WebSocket to your server; the browser attaches the session cookie
automatically; and if the server does not check where the handshake came from, it hands the attacker a live,
authenticated socket. On top of that, WebSockets have no built-in authentication, so access control is easy to
skip; every message is untrusted input that can carry XSS, SQL injection, or command injection; a persistent
connection opens new denial-of-service paths such as connection exhaustion and memory overload from a fast
sender; and standard HTTP logs only record the opening upgrade, hiding every later message.

## Controls

The sheet groups the primary defenses:
1. **Transport security.** Always use `wss://` and never plain `ws://` in production, so traffic cannot be read
   or altered. Support only the current RFC 6455 protocol and drop old drafts like Hixie-76 and hybi-00. Turn
   off `permessage-deflate` compression unless you truly need it, since compression over secret data enables
   CRIME/BREACH-style leaks. Configure proxies, load balancers, and CDNs to pass the `Upgrade` and
   `Connection: upgrade` headers and allow long-lived connections, and confirm your WAF can inspect WebSocket
   traffic past the handshake or lean on server-side checks instead.
2. **Origin validation.** Check the `Origin` header on every handshake against an explicit allow-list of trusted
   origins; browsers set this header and page scripts cannot forge it. Use an allow-list, never a deny-list, and
   avoid wildcards or substring matching. With Node's `ws`, do this in the HTTP server's `upgrade` event rather
   than `verifyClient`.
3. **CSWSH hardening.** If the app already uses CSRF tokens, include one in the handshake. Set cookies to
   `SameSite=Lax` or `Strict` so they are not sent cross-site.
4. **Session handling.** A socket often outlives the session, so validate the session server-side for
   long-running connections, close the socket when the session expires, and re-check periodically (every 30
   minutes is common). On logout, immediately close all of that user's sockets, which means keeping a map from
   session to active connections.
5. **Token authentication.** For browser clients using tokens, send the token in the first message over `wss://`
   rather than in the URL query string, where it can leak into logs. Until the token checks out, accept only the
   auth message and send no protected data; close the socket on failure or timeout, and cap unauthenticated
   connections. Rotate tokens on long-lived sockets, and keep tokens out of message logs too.
6. **Message-level authorization.** Do not treat an open connection as blanket access. Authorize every action
   individually, for example confirming an admin role before a `delete_user` message runs.
7. **Input validation.** Treat each message as untrusted. Validate structure and content with JSON schemas and
   allow-lists, set a size limit (often 64KB or less), and rate-limit to stop flooding. For binary data, confirm
   the file type by magic numbers rather than a content-type header, scan uploads when warranted, and deserialize
   formats like protobuf or MessagePack safely. Include a timestamp or nonce and reject duplicates to block
   message replay. Always parse with `JSON.parse()` and never `eval()`.
8. **Service tunneling risks.** Tunneling TCP services (VNC, FTP, SSH) over WebSockets is risky: an XSS flaw
   could let an attacker reach those services from a victim's browser, so add authentication and access control
   beyond the WebSocket layer if you must tunnel.
9. **Denial-of-service protection.** Cap total connections and add per-user limits (preferred) or per-IP limits,
   set message size limits, and rate-limit messages (100 per minute is a common start). Close idle connections
   on a timeout, use ping/pong heartbeats to detect dead ones, and apply backpressure so a fast producer cannot
   exhaust memory.
10. **Monitoring and logging.** Since HTTP logs miss message traffic, log connection open and close (with
    identity, IP, and origin), auth and authorization events, security violations like rate-limit trips and
    validation failures, and abnormal disconnects, while never logging full message contents, tokens, session
    IDs, or personal data.
11. **Framework practices and dependencies.** Follow each stack's guidance (Node `ws` upgrade-event checks and
    `maxPayload`; Django Channels auth middleware and async error handling; Spring explicit allowed origins and
    message size limits; Go Gorilla a real `CheckOrigin` with read limits and timeouts), and keep WebSocket
    libraries patched, since `ws`, Spring STOMP, and Python `websockets` have all shipped critical fixes.

## @security scenario

```gherkin
@security @owasp:websocket @usecase:cross-site-hijacking
Scenario: A WebSocket handshake from an untrusted origin is refused
  Given a WebSocket server that checks the Origin header against an allow-list
  When a malicious page opens a handshake and the browser attaches the user's session cookie
  Then the server rejects the handshake because its origin is not on the allow-list
  And no authenticated socket is established for the attacker
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually stops a hijacked connection is server-side origin validation against an allow-list at
handshake time: a socket opened from any untrusted page is refused before it is ever authenticated, no matter
that the browser sent the cookie. The `@security` scenario proves one cross-site handshake is rejected; the
allow-list check, plus per-message authorization and input validation, are what make every later message safe
too. A test is a check; the enforced origin allow-list is the guarantee.

## Sources

- OWASP WebSocket Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full defense set covering WSS transport and protocol configuration, origin validation and CSWSH hardening, session and token authentication, message-level authorization, input validation and replay protection, tunneling risks, denial-of-service limits, logging, and framework-specific practices. `[documented]`
