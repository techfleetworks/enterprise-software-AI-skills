# Micro-Frontend Security

## What it is

A micro-frontend setup lets several independently shipped features share one parent application,
usually called the shell, so that no single feature controls the entire page. What follows is this
repo's short version of the OWASP Micro-Frontend Security Cheat Sheet: the measures worth keeping and
the threat they stop. Begin with one fact that trips teams up. Spreading your code across many
repositories and many release pipelines buys nothing at the browser's security layer. The browser
enforces a boundary between origins, not between the separate features that render on a single page.
So any code that runs inside the shell's page inherits the shell's privileges until you take a
deliberate step to isolate it.

## The attack it stops

The target is one feature quietly taking over the role of the entire app. When a remote feature runs
directly in the shell's page, it gains the ability to read and rewrite the shell's DOM, pull whatever
data and storage sit in that page, and fire off requests under the signed-in user's identity. The
guidance also shuts down frontend-driven privilege escalation, where a shell or a remote invents a
role, tenant, or permission flag and counts on the server to accept it at face value. Finally, it
closes the gap where data bleeds across features that only look separated because they share one
origin, and where naming prefixes on storage keys, split state containers, or a page-level event bus
give the appearance of walls while enforcing nothing.

## Controls

### Choose and enforce runtime boundaries

1. **Write down each micro-frontend's facts first.** Before you decide how to compose it, record its
   origin, the team that owns its deployment, and the data it genuinely needs to reach.
2. **Be clear about what each way of composing actually walls off.** Pulling a remote's JavaScript
   straight into the shell, Module Federation included, hands that code the privileges the shell page
   already holds, and serving it from a different download location does nothing to sandbox what then
   runs. A Web Component mounted in the shell counts as part of the one application; neither Shadow
   DOM nor scoped styling fences off the scripts it carries. Reach for a cross-origin iframe when a
   feature has to be kept clear of the shell's DOM and its origin-scoped storage, then pare back what
   the frame may do and treat every message across the frame edge as something you explicitly allow.
   Markup stitched together upstream, in a server or at a CDN edge, arrives as shell content, and
   pre-assembling it earns no isolation boundary in the browser.
3. **Put lower-trust features in a sandboxed, dedicated-origin iframe.** Give the frame both the
   `sandbox` attribute and its own dedicated origin. Hand it only the permissions its feature truly
   requires, and keep top-level navigation and pop-ups switched off unless the feature cannot work
   without them. When the framed content sits on the shell's own origin, never pair `allow-scripts`
   with `allow-same-origin`: together they let the guest page strip away the very sandbox meant to
   contain it. Keep in mind that `allow-same-origin` merely retains whatever origin the frame started
   with; it will not turn a frame from another origin into a same-origin peer of the shell. Drop
   `allow-same-origin` and the framed document gets an opaque origin that shows up as `"null"` in
   messages, and a `"null"` sender is something you can never treat as a trustworthy identity. Should
   a sensitive exchange genuinely need a named origin on the other end, give it a separate
   cross-origin frame whose sandbox settings keep that origin intact. One more limit: separating
   origins only blocks a frame from reaching directly into the shell's DOM and storage. It grants no
   backend authorization on its own, and it does nothing to hide data you chose to pass into the
   frame from the code inside that frame.
4. **Treat remote code, and the releases that deliver it, exactly as you treat the shell's own
   code.** Letting someone publish a remote is the same as letting them edit the application your
   users are running right now. Pull remotes only from an approved list of HTTPS URLs that the shell
   itself controls, and keep untrusted inputs such as query parameters from ever deciding which
   script runs. Lock each remote to an immutable, reviewed build, entry scripts and the chunks they
   depend on alike, and always keep a last-known-good build on hand so you can roll back. Give the
   shell and every remote their own deployment credentials: that stops one pipeline from quietly
   altering another, though it will not rein in a remote that is already trusted to execute inside the
   shell. Where your loader honors Subresource Integrity, switch it on, and confirm the hashes extend
   to chunks fetched on the fly, because guarding only the entry file leaves everything it pulls in
   afterward unchecked; and bear in mind that an integrity hash notices altered bytes, never hostile
   logic shipped inside a build you approved. Finally, extend the shell's Content Security Policy over
   remote loading too, while remembering that an allowed script source is fully trusted all the same,
   and that CSP draws no line between one approved micro-frontend and the next.

### Restrict cross-application communication

1. **Pin down both ends of every message channel.** When you post, name the precise `targetOrigin`;
   when you receive, require an exact match on `event.origin`, then inspect the payload itself.
2. **Agree on a narrow contract for each channel.** Let a receiver accept only the handful of message
   kinds and fields it actually consumes.
3. **Check `event.source` too, not the origin alone.** Hold it against the `contentWindow` of the
   frame you expect, or against the parent window you expect, since one origin can be shared by many
   frames.
4. **Send no more than the operation needs.** Resist pushing credentials or sensitive state out to
   every feature on the page.
5. **Be realistic about what passing these checks tells you.** They pin down which origin and which
   window sent a message, but say nothing about what the logged-in person may do, so a message asking
   for anything privileged still has to clear authorization back on the server. They also offer no
   defense when the legitimate sender has itself been taken over. And a page-local event bus carries
   no identity the browser will vouch for among the parts wired to it, so an event's name or an app's
   label can never, on its own, show that the caller is entitled to the action.

### Enforce backend authorization and limit shared data

1. **Put every authorization decision on the server.** No client-side code, in the shell or in any
   remote, can be the thing that enforces access; route guards, concealed buttons, and role tests done
   in the browser shape only what the user sees and are trivial to sidestep. For each call that
   reaches the backend, re-evaluate whether the caller may perform that operation on that resource in
   that tenant, no matter which frontend sent the call, and give no weight to any role, tenant marker,
   or permission flag that arrived from a shell or a remote. Where it fits, run those checks through
   one shared server-side policy, so features built by different teams stay consistent.
2. **Never park sensitive state in runtimes that features share.** Because the browser isolates
   storage per origin and nothing finer, dressing it up with key prefixes, with separate state
   stores, or with component lines draws no security line between scripts that live on the same page;
   assume that whatever shows up in the page or in origin storage is readable by every remote loaded
   alongside it. Session identifiers do not belong in `localStorage` or `sessionStorage`. If you
   front the app with a backend-for-frontend, park the upstream access tokens server-side and carry
   the session in a cookie set up the way the Session Management guidance describes; marking that
   cookie `HttpOnly` keeps JavaScript from reading it, yet host code that has been compromised can
   still fire off authenticated calls, which is why cookie-based operations also need CSRF defenses.
   Hand back only the records the signed-in user is cleared to see, and on logout or a tenant switch,
   wipe shared state and any cached responses so nothing stale lingers, bearing in mind that this
   housekeeping is no substitute for tenant checks on the server and does nothing for data a
   compromised remote has already seen.

## @security scenario

```gherkin
@security @owasp:micro-frontend @usecase:server-side-authorization
Scenario: The backend ignores a frontend-supplied role and checks real permissions
  Given a host shell that composes an independently deployed remote micro-frontend
  When the remote requests a privileged operation with a forged "admin" role flag in the payload
  Then the server re-checks the user's real permissions for that operation, resource, and tenant
  And the request is denied because the authenticated user does not hold the permission
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin
scenario.

## The real guarantee

Between features that share one origin and the same privileges, the browser hands you next to no
separation, which leaves exactly one boundary you can actually enforce: the server. Our scenario
shows a single forged role being turned away, and what extends that result to every forged claim is
the server re-checking authorization on each request, for that exact operation, on that resource, in
that tenant. Everything else in this sheet, iframe sandboxing, keeping origins apart, Subresource
Integrity, CSP, verifying message origins, shrinks the blast radius and earns its place, but each one
comes with a limit it cannot cross: no wall between scripts on the same origin, no inspection of
behavior within a release you already approved, no evidence of what a user is permitted to do. That
is why none of them is the real guarantee, and the server's decision is.

## Sources

- OWASP Micro-Frontend Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Micro_Frontend_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the runtime-boundary choices and their limits (Module Federation, Web Components, cross-origin iframe, server-assembled fragments, the iframe `sandbox` rules and the `allow-scripts` plus `allow-same-origin` and `"null"`-origin pitfalls), remote-code and deployment control (approved HTTPS URLs, pinned releases, Subresource Integrity, CSP), cross-application messaging (`targetOrigin`, `event.origin`, `event.source`, `contentWindow`), and backend authorization with shared-data limits (`localStorage`, `sessionStorage`, `HttpOnly`, CSRF). `[documented]`
