# Authorization

## What it is

Authorization is the step that decides whether an already-identified entity is allowed to run a
requested action on a given resource. It is separate from authentication, which only proves who the
entity is; a logged-in user is usually not cleared to reach every resource or run every operation.
This is the per-sheet guidance from the OWASP Authorization Cheat Sheet, condensed to the controls
that hold and the attack they stop.

## The attack it stops

Broken access control is the attack. An authenticated user, or even an outsider, exploits a missing
or wrong check to reach resources or actions meant for someone else. The common form is horizontal
escalation: reading or changing another user's data. The source gives the classic case of an exposed
lookup ID. A page shows your transactions through `acct_id=901` in the URL; if you swap that value
for `523` and the app returns another person's account because it never checks ownership, that is an
Insecure Direct Object Reference (CWE-639). The same gap also lets attackers create, modify, or
delete protected records and, when unlogged, do so without being traced.

## Controls

The cheat sheet's recommendations, in order:

1. **Enforce least privilege.** Give each user only the minimum rights the job needs, and apply this
   both sideways and up the hierarchy (two peers at the same level still need different access; a
   manager needs more than a report). During design, set trust boundaries: list the user types, the
   resources, and the operations (read, write, update) each type may run on each resource, weighing
   every attribute category for an ABAC system. Add tests that confirm the designed permissions are
   enforced. After launch, review rights on a schedule to catch "privilege creep." Granting more
   later is far easier than taking rights back.
2. **Deny by default.** When no rule matches a request, the app still has to choose; it cannot stay
   neutral. Make refusal the baseline, and carry that mindset into every new feature or exposed
   resource. Set the deny posture in your own configuration rather than trusting a framework's
   default, since third-party defaults can change without your knowledge.
3. **Validate permissions on every request.** Check rights on each request whatever its source
   (AJAX, server-side, or anything else). Prefer one global, app-wide mechanism over a check bolted
   onto each method or class, because a single missed check is all an attacker needs. Framework tools
   that help include Java/Jakarta EE filters (and Spring Security), Django middleware, .NET Core
   filters, and Laravel middleware.
4. **Review the authorization logic of the tools you pick, and add custom logic when needed.** Do not
   treat a library or framework as a cure-all. Two risks apply: misconfiguration by the developer,
   and flaws inside the component itself, which hit even popular, well-kept projects. Assume any
   third-party piece could carry an authorization bug: keep a process to find and respond to
   vulnerable components (using tools like OWASP Dependency-Check and feeds such as the NVD), and
   build defense in depth so no single control is the only thing enforcing access. On configuration,
   understand the technology deeply, decide your authorization requirements first and then judge the
   component against them, never lean on default config, and test the config in your own environment.
5. **Prefer attribute-based (ABAC) and relationship-based (ReBAC) access control over RBAC.** RBAC
   grants access from the roles assigned to a user. ABAC decides from attributes of the subject,
   object, and environment plus a policy written over those attributes (role can be one attribute,
   alongside time of day, device type, or location). ReBAC grants from relationships between
   resources, such as letting only a post's author edit it. ABAC and ReBAC are usually the better
   choice because they support fine-grained boolean logic, stay robust where chained role checks are
   easy to get wrong, avoid the "role explosion" that overflows header size limits, handle
   multi-tenant and cross-organization requests, and stay easier to manage as a system grows.
6. **Keep lookup IDs safe even when guessed, or make them impossible to tamper with.** Apps often
   expose internal identifiers (an account number or database primary key) in a query parameter,
   path variable, or hidden field. Masking or randomizing those IDs alone is not enough; that is
   security through obscurity. Instead, control access to the objects themselves: avoid exposing
   identifiers when you can (derive the object from the authenticated user's identity held in a
   securely built JWT or server-side session), use per-user or per-session indirect references (for
   example OWASP ESAPI, and see the IDOR Prevention Cheat Sheet), and run an access check on every
   request for the specific object requested, since access to one object of a type does not grant
   access to all of them.
7. **Enforce authorization on static resources.** Fold static files into the access control policy.
   Some may be fine to serve publicly while others need a tight set of user and environment
   conditions, so understand what each resource exposes and consider a formal data classification
   scheme. Secure cloud storage such as S3 buckets with the provider's own configuration and tools,
   and where possible protect static resources with the same mechanism that guards the rest of the
   app.
8. **Run the checks in the right place.** Never let a client-side check be the deciding factor;
   client logic is easy to bypass and should only improve the experience. Make the real decision on
   the server, at the gateway, or in serverless functions (see OWASP ASVS V1.4.1 and V4.1.1).
9. **Exit safely when a check fails.** Failed checks are normal in a secured app, so plan for them
   and do not leave the app in an unpredictable state (CWE-280). Handle every exception and failed
   check, even unlikely ones (often a plain message or status code is enough), centralize that
   failure handling, confirm a failure cannot destabilize into a bypass, and keep sensitive detail
   such as logs or debug output out of error messages (CWE-209).
10. **Log appropriately.** Logging is a key detective control, and weak logging and monitoring is
    itself a top OWASP risk. Use consistent, parseable formats (for example Apache Logging
    Services), tune the volume because both too much and too little are weaknesses (CWE-778 and
    CWE-779), synchronize clocks and time zones across systems, and consider sending logs to a
    central server or SIEM.
11. **Write unit and integration tests for the authorization logic.** Access control flaws are
    subtle, and automated tests catch the low-hanging fruit across changes even though they do not
    replace a real security or penetration test. Aim the tests at the ideas above: is access denied
    by default, does the app terminate safely when a check fails, and are ABAC policies enforced.

## @security scenario

```gherkin
@security @owasp:authorization @usecase:horizontal-privilege-escalation
Scenario: A user cannot read another account's transactions by changing the ID
  Given an authenticated user who owns account 901
  When the user requests acct_id 523, which belongs to someone else
  Then the server runs an access control check for that specific account
  And the request is denied because the user does not own account 523
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

What actually protects a resource is a server-side access control check, run on every request,
against the specific object requested, with deny as the default. The `@security` scenario proves one
tampered ID is refused; the per-request, per-object, server-side check is what makes every tampered
ID safe. A test is a check; the server-side authorization decision is the guarantee.

## Sources

- OWASP Authorization Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>, retrieved 2026-10-11): the ordered recommendations (least privilege, deny by default, validate every request, review chosen tools, prefer ABAC/ReBAC over RBAC, protect lookup IDs, secure static resources, check server-side, exit safely, log, and test) and the IDOR lookup-ID example. `[documented]`
