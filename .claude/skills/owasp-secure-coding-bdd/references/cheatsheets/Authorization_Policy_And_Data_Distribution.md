# Authorization Policy and Data Distribution

## What it is

How to get the right rules and the right facts to the component that makes an access decision, and how fresh
and trustworthy those inputs have to be. A decision point (PDP) judges a request against policy using
attributes that come from an enforcement point (PEP) or from an authoritative source (PIP). This is the
per-sheet guidance from the OWASP Authorization Policy and Data Distribution Cheat Sheet, condensed to the
controls that hold and the attack they stop.

## The attack it stops

An access decision is only as good as the policy and the facts behind it. If those inputs are stale, faked, or
tampered with, the decision is wrong even when the rule engine works perfectly. The classic failure is a
revocation that never lands: an administrator removes a user's membership, but the decision point keeps serving
an old copy of the data and still grants access. Other failures look similar: a service team quietly ships a
rule that loosens an organization-wide restriction, a distribution outage is turned into a permit because a
timeout or undefined result defaults to allow, or the PEP forwards a role or resource id straight from the end
user and the PDP trusts it. The controls below keep every input owned, fresh within a stated budget, verified,
and deny-by-default when that cannot be met.

## Controls

In the cheat sheet's order:

1. **Set ownership and freshness for every policy and attribute.** Record who is allowed to change it, which
   service is its authoritative owner, and the longest delay allowed before a change must take effect in
   decisions. Treat policy changes (a new restriction) separately from data changes (revoking a membership).
   Do not let who owns it or how often it changes decide the acceptable delay: a central policy can still need
   an emergency push, and a scheduled rule can have a future effective date.
2. **Pick a delivery method against those needs, not by brand.**
   - Emergency restriction or revocation: dynamic push or a live lookup; measure the propagation time and deny
     the affected operations when that bound cannot be met.
   - Scheduled, stable rules: a versioned deploy or dynamic distribution; make the required version active
     before its deadline.
   - Frequently changing resource or relationship data: sync or look up from the owning source; allow for
     replication lag and for decisions that are already cached.
   - Request-specific attributes: validated context from the PEP; authenticate the PEP and pin down the origin
     of every value that matters to security.
   - Remember that bundle delivery settles only over time, so a completed publish does not prove that every
     decision point has switched to the new version.
3. **Deliver policy through a Policy Administration Point (PAP).** Ship approved policy on its own path,
   separate from app releases, when a restriction has to land faster than a deploy can reliably finish; push
   or pull both work. Only bake policy into a release when that release's deploy process reliably meets the
   update deadline.
4. **Choose a data-delivery pattern from the real consistency promises of the source and what the PDP can
   genuinely do** (never from a product name):
   - *Lookup during evaluation:* the PDP pulls attributes from the authoritative PIP at decision time. Use when
     the source meets availability and freshness needs. A lookup is not automatically current if the source, a
     replica, or a cache is behind; deny when a required attribute cannot be fetched reliably.
   - *Replicated data:* updates land in the PDP's local store before the decision. This takes the PIP out of
     the request path but adds a revocation lag. Watch sync progress and handle updates that are dropped,
     duplicated, or arrive out of order. Local availability is not the same as freshness.
   - *Request-time data:* the PEP gathers attributes and sends them with the request. Even an authenticated PEP
     must rederive identity, roles, ownership, and tenant from trusted sources; values copied out of the user's
     request are not authoritative. Check resource ids against the real target and keep user-supplied context
     separate from verified attributes.
   - *Embedded data:* stable data that ships inside the PDP itself or the policy release. Use only when a deploy
     can refresh it within its freshness budget. Keep changeable account status and revocation data out of
     releases that cannot update quickly.
5. **Protect distribution and administration.** Guard the network-facing decision API together with the APIs
   used to read or change policy and data. Require authentication from PEPs and from administrators, limit each
   to the tenants and actions it needs, and stop a service team from overwriting restrictions that apply to the
   whole organization. An in-process PDP sits inside the app's trust boundary and needs no separate network
   handshake. Verify artifacts before they go live: for bundles, demand a publisher's signature from a
   configured, trusted source and verify every file the bundle covers. Protect the transport and the signing
   keys too. A good signature shows where the policy came from and that it is intact, not that it is correct or
   current. Pin every deployment to a reviewed policy and schema version, keep a record of which revision each
   PDP is actually running, refuse unknown or outdated versions, and permit a rollback only by going through
   the reviewed release path. Prove that service-level rules cannot override mandatory restrictions. All of
   this applies to embedded releases as much as to dynamic delivery.
6. **Handle freshness and outages without failing open.** Separate two different failures: the policy
   distribution channel going down, and there being no usable decision at all. Keeping the last verified policy
   preserves uptime but does not prove that policy is still fresh enough.
   - Only go on serving decisions from an already-verified policy while the freshness limits on that policy,
     its data, and any cached decisions are all still met.
   - At startup, refuse to serve protected operations until the needed policy and data are present and valid.
   - Deny the affected operations when a required input is missing, invalid, or older than its allowed age.
     Never turn a timeout or an undefined result into a grant; fall back to deny by default.
   - Test the hard cases: revocation, late updates, bad artifacts, an unreachable source, and recovery. Confirm
     the real decision at the PEP, not just that the data reached the PDP.
   - Favor reviewed, versioned policy and set a clear freshness budget for each input that matters to security,
     pick the simplest delivery that meets those limits, and stop granting the affected access when it can't.

## @security scenario

```gherkin
@security @owasp:authorization-policy @usecase:revocation-propagation
Scenario: A revoked membership stops access within its freshness budget
  Given a user whose tenant membership grants access to a resource
  And a stated freshness budget for membership data at the decision point
  When an administrator revokes that membership at the authoritative source
  And the propagation bound for the change cannot be confirmed as met
  Then the decision point denies the affected operation by default
  And it never turns a stale, missing, or timed-out input into a grant
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually protects the resource is a stated freshness budget for each input plus deny-by-default
when that budget, a verified artifact, or an authoritative source is not there. The scenario proves one
revocation is honored in time; the budget and the fail-closed default are what make every stale or faked input
safe. A test is a check; the owned, fresh, verified input and the deny-by-default fallback are the guarantee.

## Sources

- OWASP Authorization Policy and Data Distribution Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Policy_And_Data_Distribution_Cheat_Sheet.html>, retrieved 2026-10-11): the ownership-and-freshness model, the four data-delivery patterns (lookup, replicated, request-time, embedded), artifact signing and version pinning, and the outage and deny-by-default rules summarized above. `[documented]`
