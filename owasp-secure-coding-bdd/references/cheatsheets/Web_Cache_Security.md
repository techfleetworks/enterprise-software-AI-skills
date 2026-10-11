# Web Cache Security

## What it is

How to keep HTTP and application caches from leaking data or serving poisoned content. A cache turns into a
security boundary the moment it hands one request's stored response to a different request, so cacheability and
cache-key design belong inside the app's authorization model. This is the per-sheet guidance from the OWASP Web
Cache Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

Because one stored response can reach many users, a cache is a high-value target. The cheat sheet names several
concrete failures. In **sensitive response exposure**, a shared cache stores one user's personalized or logged-in
response and serves it to someone else. In **web cache poisoning**, an attacker sends a request whose input
changes the response but is left out of the cache key, so the harmful response gets stored and replayed to other
visitors. In **web cache deception**, the attacker dresses a dynamic URL up to look like a static file so a proxy
caches private content; for example, requesting `/account/profile/image.css` and hoping it resolves to the same
handler as `/account/profile`. Related failures include cache-key confusion, cross-tenant leakage when the key
omits tenant context, and stale security state when cached content outlives a permission change.

## Controls

The cheat sheet organizes its controls into seven areas; apply them together:

**1. Classify responses before caching.**
- Default to blocking shared caching for anything authenticated, personalized, tenant-specific, or otherwise
  sensitive; set a policy for every route.
- Use `Cache-Control: no-store` for responses no cache may keep.
- Use `Cache-Control: private` for responses a user's own browser may store but a shared cache may not.
- Remember `no-cache` still allows storage; it only forces revalidation before reuse.
- Do not assume a `Set-Cookie` header makes a response private.
- Do not mark a response shaped by `Authorization` or session cookies as `public` or give it `s-maxage` unless
  sharing was designed and reviewed on purpose.
- When you switch a route to `no-store`, purge the entries already stored, since the directive does not delete
  them.

**2. Build a cache key that captures everything.**
- Any input that could alter a cacheable response has to appear in the key, or else the route rejects that
  request.
- Fold the method, the scheme, the host, the normalized path, and each meaningful query parameter into the key.
- Reach for `Vary` on headers that pick a representation, like `Accept-Encoding` or `Accept-Language`.
- Do not treat `Vary: Cookie` as an authorization boundary; disable shared caching for personalized responses
  instead.
- Derive tenant and user identity from trusted server-side context, never straight from an untrusted header or
  parameter.
- Apply the same normalization and parameter handling at the CDN, the proxy, and the origin.
- Reject ambiguous requests: conflicting host info, duplicate parameters that mean different things, malformed
  path encodings.
- For app-level caches, use a structured, versioned key such as
  `<environment>:<resource-version>:<tenant-id>:<resource-type>:<resource-id>`.
- Keep session tokens, API keys, and other secrets out of keys, since keys surface in logs and admin tools.

**3. Prevent web cache poisoning.**
- Core rule: untrusted inputs that are not in the cache key must not change a cacheable response.
- Cache only routes you deliberately mean to share.
- Do not let unkeyed headers or a `GET` body alter a cacheable response.
- Trust `Forwarded` and `X-Forwarded-*` headers only when a trusted proxy set them.
- Canonicalize host and scheme before using them to build links, redirects, or security headers.
- Keep unvalidated request metadata out of any cached HTML, JSON, redirect, or response header.
- Split static assets from dynamic routes by hostname or a clear path namespace where you can.
- After a poisoning incident, purge every affected layer and fix the key or origin before caching again.

**4. Prevent web cache deception.**
- Base cache eligibility on an allowlisted route and policy, not on the file extension alone.
- Have dynamic routes turn away odd extra path segments and static-looking suffixes rather than quietly serving
  them.
- Ensure a path like `/account/profile/image.css` cannot reach the same personalized handler as
  `/account/profile`.
- Confirm the URL extension and the response `Content-Type` agree before caching a static asset.
- Drop query parameters from a key only after proving they cannot affect routing, authorization, or content.

**5. Coordinate origin and intermediary policies.**
- A CDN rule, proxy override, or framework default can undo a safe origin policy, so control caching explicitly.
- Set browser and shared-cache lifetimes separately with the right directives.
- Review CDN rules that override origin `Cache-Control` or cache by status code, path, or extension.
- Give error pages, redirects, and auth responses their own explicit cache policy.
- Normalize URLs the same way at every layer, and send the normalized form to the origin when the CDN normalizes
  its key.
- Keep a tested purge mechanism for single keys, tags, or small route groups.
- Fail closed when a sensitive route's cache policy is missing, malformed, or conflicting.

**6. Guard caches inside the application.**
- A cache held in memory, in a database, or across a distributed store can still leak with HTTP caching turned
  off, so authorize each request before you hand back cached data.
- Namespace keys by environment and application to avoid collisions.
- Put tenant identity and every authorization-relevant dimension in the key.
- Never let a cache hit skip object-level or tenant-level authorization.
- Do not cache a final authorization decision unless the key covers the full subject, object, action, policy
  version, and a tight lifetime.
- Version key formats so a schema or permission change cannot reuse incompatible entries.
- Lock down admin access to cache contents, config, stats, and purge controls.

**7. Exercise the whole caching route.**
- Run your tests through the very same CDN and proxy chain that serves production.
- Request one URL as two different users and tenants and confirm neither sees the other's data.
- Change one header, parameter, cookie, or path piece at a time and check the cache behaves as expected.
- Tack static-looking suffixes and stray path segments onto authenticated routes, then confirm each one is
  turned away and left out of the cache.
- Replay authorization changes, logout, content edits, and purges against entries that are already stored.
- Watch for surprise cache hits on authenticated routes, sudden hit-ratio shifts, odd forwarded headers, and
  repeated purges.
- Capture enough cache-status and routing detail to work through an incident later, while keeping secrets and
  complete sensitive bodies out of the logs.

## @security scenario

```gherkin
@security @owasp:web-cache @usecase:cross-user-response-leak
Scenario: A shared cache never serves one user's private response to another
  Given an authenticated route that returns personalized data with Cache-Control no-store
  When user A requests the route and then user B requests the same URL through the production cache path
  Then user B receives their own response and never user A's cached content
  And the shared cache stores no personalized response for that route
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps the cache safe is treating cacheability and the cache key as part of authorization: sensitive
responses are marked so no shared cache stores them, every response-changing input is either in the key or
rejected, and app-level caches re-check authorization on each hit. The `@security` scenario proves one user's
response cannot reach another; the no-store classification and complete key are what make cross-user and poisoned
responses impossible across the board. A test is a check; the correct cache policy and key are the guarantee.

## Sources

- OWASP Web Cache Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Web_Cache_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the key risks (sensitive exposure, poisoning, deception, cache-key confusion, cross-tenant leakage, stale state) and the seven best-practice areas (classify responses, complete key, prevent poisoning, prevent deception, coordinate layers, protect app caches, test the full path) summarized above. `[documented]`
