# Next.js Security

## What it is

How to secure a Next.js application, which has many server entry points and renders and caches data on both
sides of the server and client boundary. This is the per-sheet guidance from the OWASP Next.js Security Cheat
Sheet, condensed to the controls that hold and the attacks they stop. It covers both the App Router and the
Pages Router and places authorization close to the data, not in routing or UI checks.

## The attack it stops

Because a Next.js app exposes several independently callable server paths, an attacker skips the page and calls
a Server Action, Route Handler, or data loader directly. If authorization lives only in proxy or middleware, or
only on the page that renders a form, that direct call sails through, which is exactly how framework bypass bugs
like CVE-2025-29927 leaked data. Server code can also hand the browser more than it should by serializing whole
ORM records, secrets, or private config. A cache keyed without an audience lets one user receive another user's
data. Loose rewrite and image settings open the door to server-side request forgery and open redirects.

## Controls

In the cheat sheet's order:
1. **Classify and protect every server entry point.** Put authorization at a boundary that all protected paths
   must cross, such as a server-only Data Access Layer that authorizes and returns minimal Data Transfer
   Objects, or an equivalent service or database control. Treat proxy, Server Actions, Route Handlers, Pages
   API routes, Server Components, data loaders, layouts, and Client Components each according to its own
   audience and effects.
2. **Do not rely on proxy or middleware alone.** A matcher can miss a route, and routing changes can quietly
   move an operation out of its coverage. Use proxy for early redirects, but authorize again at the handler or
   data source so a single bypass cannot expose data.
3. **Secure Server Actions as endpoints.** A referenced action accepts a client POST on its own, apart from the
   page that renders its form. Validate every argument, derive the identity on the server instead of trusting
   claims in the arguments, check permission on the exact object being touched, return only authorized fields
   since results are serialized to the client, and rate-limit or re-authenticate costly actions. Keep the
   built-in origin allowlist narrow; it does not replace authentication or authorization.
4. **Guard Route Handlers and Pages API routes on their own.** A page being protected does nothing for a
   handler that serves its data. Classify each handler's audience (public, webhook, authenticated API) and apply
   the matching controls. If no external caller needs the HTTP endpoint, call the data layer directly from the
   Server Component and delete the extra route.
5. **Protect Draft Mode as a privileged change.** Enabling Draft Mode sets the preview-bypass cookie but does
   not authenticate the caller by itself. Authenticate the caller with a high-entropy shared secret, validate
   any requested content identifier against the trusted source, redirect only to a server-established path, and
   confirm an unauthenticated caller cannot get the bypass cookie or reach unpublished content.
6. **Control data crossing into the browser.** Build an explicit DTO holding only fields the browser may
   receive, and select only required columns at the source. Do not ship ORM records, session objects, secrets,
   or config just because they are handy. Treat `getServerSideProps`, `getStaticProps`, and `getInitialProps`
   return props as visible to that page. Use the `NEXT_PUBLIC_` prefix only for values that are meant to be
   public. The `server-only` import and React taint APIs are extra guards, not a substitute for shaping the
   data.
7. **Scope caches to their audiences.** Classify each cached value's audience before caching, and never let a
   cache entry be reusable by a broader audience than the data allows. Include verified dimensions that change
   the value or the authorization decision (user ID, tenant ID, permission version, locale), and never key on a
   raw cookie or bearer token. Use build-time or shared caches only for data the whole audience may read, and
   do not add shared `Cache-Control` to personalized responses. After permission or tenancy changes, invalidate
   affected keys or advance a permission version. Treat cache invalidation itself as a mutation: authenticate
   and authorize its callers and constrain the target. A private cache still delivers its result to that
   browser, so it does not make over-broad data safe.
8. **Treat configuration as security code.** Review `next.config.*`, proxy matchers, and routing with the same
   care as handlers. Resolve external rewrite hosts from a fixed allowlist, never from an untrusted header,
   host, cookie, or query. Make sure direct requests cannot bypass a protected rewrite destination's auth.
   Validate interpolated redirect paths. Define every `images.remotePatterns` restriction you can, since omitted
   fields mean broad wildcards, and keep local-IP image fetching disabled unless a reviewed case needs it. Keep
   the Server Actions origin allowlist tight, leave production browser source maps off unless justified, and
   never expose the development server as the production service. Validate hosts and origins at startup and fail
   closed on a missing or invalid value.
9. **Choose a CSP that fits the rendering model.** Use a Content Security Policy suited to the app's script and
   resource needs. A nonce must be unpredictable and unique per response, so never cache HTML that would reuse
   it; note that nonce-based CSP forces dynamic rendering. Do not loosen a production policy with development-only
   directives such as `'unsafe-eval'`.
10. **Verify the boundaries with negative tests.** Inventory every entry point, cached function, invalidation
    call site, rewrite, redirect, CSP setting, source-map setting, and remote image pattern, deriving the list
    from the source tree where you can. Call actions and handlers directly without loading their page and prove
    unauthenticated, unauthorized, wrong-owner, and wrong-tenant requests fail. Exercise bypassed-proxy paths,
    inspect rendered HTML and serialized payloads for server-only fields, run cross-user and cross-tenant cache
    tests after permission changes, and keep Next.js on a supported patched release.

## @security scenario

```gherkin
@security @owasp:nextjs @usecase:server-action-direct-call
Scenario: A protected Server Action denies a direct unauthorized call
  Given a Server Action whose form renders only on an authenticated page
  When an attacker sends a POST to that action directly without loading the page
  Then the action derives identity on the server, finds no valid session, and refuses the operation
  And it returns no protected fields because its authorization runs at the data access layer, not on the page
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually protects a Next.js app is authorizing at a boundary every protected path must cross,
usually a data access layer that returns minimal DTOs, rather than at routing, layouts, or the page. The
`@security` scenario proves one direct call is denied; the shared authorization boundary is what denies every
direct call, including ones through entry points added later. Audience-keyed caches and allowlisted config
extend the same discipline to data exposure and SSRF. A test is a check; the authorization boundary at the data
source is the guarantee.

## Sources

- OWASP Next.js Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the controls for classifying server entry points, securing Server Actions and Route Handlers, Draft Mode, data crossing to the browser, audience-scoped caches, configuration as security code, CSP choice, and boundary verification. `[documented]`
