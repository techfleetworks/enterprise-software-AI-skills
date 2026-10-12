# Django REST Framework

## What it is

How to lock down a Django REST Framework (DRF) API, worked through the OWASP API Security Top 10 (2019): set the
framework defaults safely and close the per-endpoint gaps that leave APIs open. This is the per-sheet guidance
from the OWASP Django REST Framework Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

DRF defaults lean open, not closed. The default permission class is `AllowAny`, so until you change it every view
is reachable by anyone. There is no throttling and no pagination out of the box, so a single caller can hammer an
endpoint or pull a huge result set and exhaust resources. On top of that, a serializer that exposes every field
hands out data the caller should never see or lets a client set fields it should not own, and the usual injection
holes still apply. Each control below shuts one of these doors.

## Controls

Following the cheat sheet, starting with the framework settings in the `REST_FRAMEWORK` namespace, then the API
Security Top 10:
1. **Safe defaults in settings.** Set `DEFAULT_AUTHENTICATION_CLASSES` to the auth your project needs, replace the
   `AllowAny` `DEFAULT_PERMISSION_CLASSES` with real permissions, turn on `DEFAULT_THROTTLE_CLASSES` (off by
   default), and pick a `DEFAULT_PAGINATION_CLASS` (pagination is also off by default).
2. **Object-level authorization (API1).** In `get_object`, call `check_object_permissions(request, obj)` so a
   caller cannot reach a record just by guessing its id. Never override `get_object` without that check.
3. **Authentication on every private endpoint (API2).** Apply the right authentication classes and do not change
   the auth class on a single view unless you fully understand the effect.
4. **Minimal output (API3).** Return only the fields a caller needs. Review each serializer, and with
   `ModelSerializer` avoid `Meta.exclude`.
5. **Rate limiting and resource caps (API4).** Configure `DEFAULT_THROTTLE_CLASSES` and `DEFAULT_THROTTLE_RATES`
   and check per-view overrides, but treat DRF throttling as abuse management, not a defense against brute force or
   denial of service (its cache work is non-atomic, so bursts can slip past the limit). Add request-size and
   abuse limits at the reverse proxy or gateway too.
6. **Guard against mass assignment (API6).** Allow-list fields in `ModelSerializer.Meta.fields`; steer clear of
   `Meta.exclude` and `fields = "__all__"`, which can leak fields you add later. Mark client-readable but
   non-writable fields read-only via `Meta.read_only_fields` or `read_only=True`.
7. **Function-level authorization (API5).** Move off the `AllowAny` default, set real permission classes, and
   reserve `AllowAny` for genuinely public endpoints only.
8. **Configuration hardening (API7).** Keep a repeatable, automated hardening process. No default passwords; set
   `DEBUG` and `DEBUG_PROPAGATE_EXCEPTIONS` to False; allow only the HTTP verbs each endpoint needs; keep
   `SECRET_KEY` random and never hard-coded. Validate, filter, and sanitize all incoming data.
9. **Injection defenses (API8).** Use parameterized queries and be careful with `raw()`, `extra()`, and
   `cursor.execute()` (never feed user input into them). For YAML use `yaml.SafeLoader`, never `load()` on
   user-supplied files; keep user input out of `eval()`, `exec()`, and `execfile()`; and do not unpickle
   untrusted data, including via `pandas.read_pickle()`.
10. **Asset inventory (API9).** Keep an inventory of API hosts recording version, environment, and who may reach
    each one, and document auth, errors, redirects, rate limits, CORS, and every endpoint.
11. **Logging and monitoring (API10).** Log failed logins, denied access, and validation errors with enough
    context to spot a bad actor, in a format a log system can consume, protected in transit and at rest, fed into
    monitoring and a SIEM with alerts. Do not log vague messages, passwords, tokens, or PII.
12. **Beyond the Top 10.** Catch business-logic flaws through threat models, design and code review, and tests.
    Keep secrets in a secret manager, never hard-coded. Maintain a process to update Django, DRF, and all
    dependencies, and run SAST tools such as Bandit or Semgrep.

## @security scenario

```gherkin
@security @owasp:drf @usecase:default-permission-lockdown
Scenario: An unauthenticated caller cannot reach a private DRF endpoint
  Given a DRF API whose DEFAULT_PERMISSION_CLASSES is set to a real permission class
  When an anonymous client requests a non-public endpoint
  Then the response is 401 or 403 and no data is returned
  And the endpoint never falls back to the AllowAny default
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects a DRF API is replacing the open defaults with closed ones and enforcing authorization at
the object and function level: a real permission class instead of `AllowAny`, throttling and pagination turned on,
and serializers that allow-list their fields. The `@security` scenario proves one endpoint denies an anonymous
caller; the permission configuration is what denies every caller who lacks rights. A test is a check; the deny-by-
default configuration is the guarantee.

## Sources

- OWASP Django REST Framework Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Django_REST_Framework_Cheat_Sheet.html>, retrieved 2026-10-11): the REST_FRAMEWORK default settings and the API Security Top 10 (2019) controls, plus business-logic, secret-management, dependency-update, and SAST guidance above. `[documented]`
