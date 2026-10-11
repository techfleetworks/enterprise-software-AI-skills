# Server-Side Request Forgery Prevention

## What it is

How to stop server-side request forgery (SSRF): an attacker tricking your server into making a network request to a target the attacker picks. This is the per-sheet guidance from the OWASP Server-Side Request Forgery Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop. It splits the defenses by whether the set of allowed destinations is known ahead of time or not.

## The attack it stops

Any feature that takes a URL, host, or IP from a user and then fetches it can be abused. The sheet gives the avatar case: a user is asked for the URL of their profile image so the app can download it. If the app does not constrain the destination, the attacker points it at an internal service instead, such as `http://169.254.169.254/` to steal cloud instance credentials, or a host on the private network that the attacker cannot reach directly. The vulnerable app becomes a proxy, reaching things behind the firewall on the attacker's behalf, which can expose metadata, internal APIs, or `file://` and `gopher://` resources.

## Controls

The sheet separates two situations and applies defense in depth (application layer plus network layer) to both.

Case 1, when the allowed destinations are known and trusted (allow-list is possible):

1. **Validate input with an allow-list, not a deny-list.** The expected format is usually known, so accept only what matches it.
2. **Validate a plain string** (business data) with a tight regex when the format is simple, or with the language's `string` library functions when it is complex; do not hand-roll fragile regexes for complex formats.
3. **Validate an IP address in two steps.** First confirm it is a well-formed IPv4 or IPv6 value using a vetted library (the sheet lists per-language picks such as `InetAddressValidator.isValid` for Java, `IPAddress.TryParse` for .NET, the `ip-address` npm package, and Ruby's `IPAddr`), checking each for encoding bypasses (hex, octal, dword, URL, mixed). Then compare the library's normalized output against the allow-list of trusted IPs, with a strict case-sensitive match.
4. **Validate a domain name in two steps.** First confirm it is a well-formed domain with a library that does no DNS lookup (such as Java `DomainValidator.isValid`, .NET `Uri.CheckHostName`, the `is-valid-domain` npm package, or Python `validators.domain`). Then check it against the allow-list of trusted domains with a strict match.
5. **Guard against DNS rebinding.** Domain allow-listing alone is not enough: resolve the destination and check the resulting IPs against your permitted networks, then make the HTTP client connect only to that validated IP while keeping the original hostname for the `Host` header, TLS SNI, and certificate checks. Apply the same destination policy to retries and fallback connections. A second, unchecked lookup between validation and connection reopens the hole.
6. **Do not accept a whole URL from the user.** URLs are hard to validate and parsers can be fooled. Take only an IP or a domain, then build the request yourself with a scheme, port, and path the app fixes. Do not carry over the path or query from a user-supplied URL.
7. **Treat parser disagreement as a rejection.** When a URL does cross a boundary as a string and gets parsed twice, two parsers can read different hosts from the same bytes (for example `http://example.com\@evil.com`). Reject any URL whose host is not read the same way by every parser involved, rather than trying to reconcile them.
8. **Disable HTTP redirect following** in the client so a validated first hop cannot redirect to an internal target.
9. **Add DNS monitoring as detection only.** Resolve your own domains through your internal DNS first, and watch the allow-list for any entry that starts resolving to a local or private address. This detects problems; it does not replace connection-time enforcement.
10. **Harden the network layer.** Use a firewall so the app can only reach the routes it legitimately needs, and apply network segregation to block illegitimate calls at the network level.

Case 2, when the destination can be any external IP or domain (no allow-list, such as webhooks):

1. **Run the same first-stage format validation** on the string, IP, or domain as in Case 1.
2. **Swap the second stage to a deny-list**, since you cannot enumerate the allowed targets. For an IP, confirm it is public. For a domain, confirm it does not resolve on your internal-only DNS resolver, then resolve its `A` and `AAAA` records and confirm every resulting IP is public, and bind the connection to that validated address.
3. **Restrict the protocol** to an allow-list of `HTTP` or `HTTPS` via a dedicated parameter.
4. **Prove the call is legitimate.** Have the receiving app issue a random token (for example 20 alphanumeric characters) that the caller must send back; constrain the token parameter name to `[a-z]{1,10}` and the token value to `[a-zA-Z0-9]{20}`, and accept only HTTP `POST`.
5. **Build the outbound request from validated values only**, connect only to the IP validated in step 2, and keep redirect following disabled.
6. **Apply the same network-layer hardening** (firewall, segregation) as Case 1.

Deny-list of last resort (when allow-listing is truly impossible): at minimum block cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`, `metadata.amazonaws.com`), localhost (`127.0.0.0/8`, `0.0.0.0/8`, `::1/128`), RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), IPv6 unique-local (`fc00::/7`) and link-local (`fe80::/10`), and multicast (`224.0.0.0/4`, `ff00::/8`). Deny-lists are bypass-prone; prefer allow-lists.

Cloud-specific: on AWS, move to IMDSv2 and disable IMDSv1 as extra defense in depth against credential theft via SSRF.

## @security scenario

```gherkin
@security @owasp:ssrf @usecase:avatar-url-fetch
Scenario: An avatar-fetch endpoint refuses to request a cloud metadata address
  Given an endpoint that downloads a user-supplied avatar host
  When an attacker submits the host "169.254.169.254"
  Then the request is rejected because the resolved IP is not in the allow-list
  And the HTTP client never opens a connection to that address
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually stops SSRF is binding the outbound connection to an IP you validated against an allow-list, so the request can only ever land on a destination you approved. The `@security` scenario proves one metadata address is blocked; connection-time enforcement against the validated IP is what makes every other target, including a domain that rebinds after validation, equally unreachable. A test is a check; the allow-listed, connection-bound destination is the guarantee.

## Sources

- OWASP Server-Side Request Forgery Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the two-case split, allow-list and deny-list validation of strings, IPs, and domains, DNS-rebinding and parser-disagreement guidance, redirect disabling, network-layer hardening, the minimum deny-list ranges, and IMDSv2. `[documented]`
