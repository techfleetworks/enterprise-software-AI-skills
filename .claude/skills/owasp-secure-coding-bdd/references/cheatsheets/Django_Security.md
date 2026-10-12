# Django Security

## What it is

How to turn on and correctly configure the security features Django ships with, so a Django site is hardened by
default instead of left open by a misconfigured setting. This is the per-sheet guidance from the OWASP Django
Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

Django gives you secure building blocks, but they only help when they are switched on and set up right. A
developer who does not know how a piece works can wire it up in a way that leaves a hole: a live site running in
debug mode leaks stack traces and settings, a cookie sent over plain HTTP gets sniffed on the wire, a missing
`@login_required` exposes a private view, a leaked `SECRET_KEY` lets an attacker forge signed data, and a form
with no CSRF token lets another site act as the logged-in user. Each control below closes one of these gaps.

## Controls

In the cheat sheet's order:
1. **General hygiene.** Keep Django and every dependency patched. Make sure `DEBUG` is off in production (never
   `DEBUG = True` on a live server). Add a rate-limiting package such as `django_ratelimit` or `django-axes` to
   slow down brute-force attempts.
2. **Authentication.** Build login, logout, and password-change flows on the `django.contrib.auth` app (with
   `django.contrib.contenttypes` and `django.contrib.sessions` listed in `INSTALLED_APPS`). Gate private views
   with the `@login_required` decorator. Enforce password rules through `AUTH_PASSWORD_VALIDATORS` (similarity to
   user attributes, minimum length, common-password screening, and a not-all-numeric check). Hash with
   `make_password` and verify with `check_password`.
3. **Key management.** Treat `SECRET_KEY` as confidential: at least 50 mixed characters, produced by a strong
   random source such as `get_random_secret_key()`. Do not hard-code it; pull it from an environment variable or
   secret manager. Rotate it on a schedule and right away if it leaks, knowing rotation invalidates sessions and
   reset tokens.
4. **Security headers.** Add `django.middleware.security.SecurityMiddleware`, then set
   `SECURE_CONTENT_TYPE_NOSNIFF = True` to block MIME sniffing and `SECURE_HSTS_SECONDS` to a positive value for
   HSTS on HTTPS replies. Add `django.middleware.clickjacking.XFrameOptionsMiddleware` after it and set
   `X_FRAME_OPTIONS` to `DENY` or `SAMEORIGIN` to stop clickjacking.
5. **Content Security Policy.** On Django 6.0 and later, enable
   `django.middleware.csp.ContentSecurityPolicyMiddleware` and define `SECURE_CSP` to enforce, or
   `SECURE_CSP_REPORT_ONLY` to watch first. Earlier versions need a library such as `django-csp`.
6. **Cookies.** Set `SESSION_COOKIE_SECURE = True` and `CSRF_COOKIE_SECURE = True` so those cookies ride only
   over HTTPS, and pass `secure=True` whenever you set your own cookie with `set_cookie()`.
7. **CSRF.** Keep `django.middleware.csrf.CsrfViewMiddleware` in `MIDDLEWARE`, drop `{% csrf_token %}` into every
   form, and pull the token into your AJAX calls.
8. **XSS.** Render through the template engine so output is auto-escaped. Stay away from the `safe` filter and
   `mark_safe` unless the data is trusted. Hand data to JavaScript with the `json_script` filter.
9. **HTTPS.** Turn on `SECURE_SSL_REDIRECT = True` to push HTTP traffic to HTTPS. Only set
   `SECURE_PROXY_SSL_HEADER` when a trusted proxy in front removes any client-sent value for that header; without
   that guarantee, keep it at `None`.
10. **Admin URL.** Change the admin path away from the default `admin/` to make automated scans a little harder.
11. **Deployment check.** Run `manage.py check --deploy` and clear the warnings it raises before shipping.

## @security scenario

```gherkin
@security @owasp:django @usecase:debug-mode-disclosure
Scenario: A production Django response does not leak internal details
  Given a Django site deployed to production
  When a request triggers a server error
  Then the response is a generic error page with no stack trace or settings
  And DEBUG is False and the deployment check command reports no security warnings
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects a Django site is each secure default being switched on and set correctly in `settings.py`:
debug off, cookies marked secure, the security and CSRF middleware present, HSTS and redirect enforced, and the
secret key kept out of the code. The `@security` scenario proves one setting (debug disclosure) is closed; the
settings themselves are what make the whole site safe. A test is a check; the correct configuration is the
guarantee.

## Sources

- OWASP Django Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Django_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the configuration controls above (general hygiene, authentication, key management, headers, CSP, cookies, CSRF, XSS, HTTPS, admin URL, and the deploy check). `[documented]`
