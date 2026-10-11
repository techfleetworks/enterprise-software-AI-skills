# Authorization Patterns

## What it is

Authorization patterns are about where an app evaluates a policy and where it enforces the result. A
Policy Enforcement Point (PEP) guards an operation, while a Policy Decision Point (PDP) works out
what the policy says; a Policy Administration Point manages the rules and a Policy Information Point
feeds in the attributes used to judge them. This is the per-sheet guidance from the OWASP
Authorization Patterns Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

The attack is any request that slips past access control through a gap in the architecture. Three
concrete forms appear in the source. An attacker calls a service directly and dodges the gateway that
was supposed to check it. An attacker forges a trusted header so a downstream service thinks a
gateway already vouched for the request. Or the PDP times out and a system that fails open waves the
request through, so "allowing requests when authorization fails bypasses the control." Each one lets
an unauthorized action complete because enforcement was placed or configured wrongly.

## Controls

The cheat sheet's patterns and the controls each one demands:

1. **Service-level authorization (keep enforcement near the resource).** Put enforcement close to the
   protected resource so it can see the requested action, the object, and the tenant. Default to
   refusal, and re-check permissions on each request that arrives. Splitting the decision away from enforcement does not
   move the PEP's duty to enforce the result; the AuthZEN trust model leans on that duty.
   - **Policies in application code.** The service both decides and enforces, using the framework's
     authorization features where it can. This fits a small app with a limited policy surface.
     Centralize the checks inside the app's authorization layer and test every protected entry point,
     because conditional checks scattered through the code make gaps and inconsistent rules hard to
     spot, and changing those rules means redeploying. Policies written in code are not fail-open by
     nature.
   - **Separately managed policies.** The service stays the PEP but hands evaluation to a PDP whose
     policies live apart from business code. That PDP can be embedded, local, or remote, and central
     ownership of policy does not force a single central runtime. Reach for this when several services
     must share one rule set and one review workflow. Hand the PDP authenticated subject context
     together with trustworthy resource attributes, apply the returned decision before you touch the
     resource, and refuse the operation when no valid decision comes back.
2. **Gateway and proxy enforcement.** A gateway can apply coarse rules before it forwards a request,
   and a service-local proxy can do the same for calls to one service; Envoy's external authorization
   filter shows both the delegation to a PDP and how a routing change after the check can invalidate
   it. Treat full traffic coverage as something you have to deploy, not a free property of having a
   gateway. Authenticate the callers you permit, block direct access to the services behind it, and
   cover internal calls and alternate endpoints too. When the proxy has no context for an object-level
   rule or a business-specific one, keep that check inside the service, and re-evaluate authorization
   if the real resource or action changes after the first check.
   - **Propagating an authorization context.** A gateway can bolt on signed context that states an
     authenticated subject, or a decision, for services further down. Each downstream service must still
     validate the issuer it trusts, the integrity, the audience, the expiry, and whether the context
     actually fits the request in hand. Reject direct calls that arrive without the required context,
     and strip any client-supplied copies of trusted headers before you set your own. A signature by
     itself neither stops a bypass nor authorizes a different resource, tenant, or action, so follow
     the JWT validation guidance and keep enforcing at the service.
3. **PDP deployment and failure behavior.** Pick a deployment independently of the access control
   model; for instance OPA runs as HTTP, library, or WebAssembly, and a product name does not fix one
   deployment mode or one standard. The source compares three deployments:
   - *Embedded library:* evaluation can keep going without a remote connection, but you must keep the
     policy and data current and verify enforcement at every entry point.
   - *Local sidecar or daemon:* a shared decision engine sits near the service, but you must lock down
     its API and handle its process failing, since being nearby does not make it trusted.
   - *Remote service:* evaluation is shared and policy administration is central, but you must
     authenticate and authorize the PEPs, protect the responses, and deny when no valid decision is
     available.
   Every mode is only as good as the policy and data it uses; a local PDP that holds outdated
   revocation data can still grant access by mistake. Log both the decision and its enforcement with enough policy and
   version context to chase down discrepancies, without writing sensitive attributes into the log.
4. **Fail closed on PDP errors and timeouts.** Configure errors and timeouts so protected operations
   are denied; Envoy's failure-mode setting makes this an explicit choice, and allowing requests when
   authorization fails is a bypass. A policy loaded earlier may keep being evaluated only inside the
   freshness limits set by the policy and data distribution guidance.
5. **Grow toward reviewed, shared, service-level policies.** As the system grows, prefer service-level
   enforcement backed by shared, separately reviewed policies. Add gateway checks for early rejection
   and traffic control, and confirm that protected operations stay covered even when a gateway, a
   policy source, or the PDP is unavailable.

## @security scenario

```gherkin
@security @owasp:authorization-patterns @usecase:fail-closed-pdp-outage
Scenario: A protected call is denied when the decision point is unreachable
  Given a service that acts as the enforcement point for a protected operation
  And a policy decision point that is timing out
  When a request arrives for the protected operation
  Then the enforcement point receives no valid decision
  And it denies the operation instead of letting it through
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

What actually keeps access controlled is the enforcement point's duty to deny whenever it holds no
valid decision, kept at the service even when a gateway or a remote PDP sits in front of it. The
`@security` scenario proves one timeout is denied; the fail-closed enforcement point is what makes
every outage, forged header, or direct call safe. A test is a check; the enforcement point that fails
closed is the guarantee.

## Sources

- OWASP Authorization Patterns Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Patterns_Cheat_Sheet.html>, retrieved 2026-10-11): the PEP/PDP/PAP/PIP roles, the service-level, gateway, and PDP-deployment patterns, and the controls for each (deny by default, validate every request, cover all traffic, validate propagated context, strip client-supplied trusted headers, and fail closed on PDP error or timeout). `[documented]`
