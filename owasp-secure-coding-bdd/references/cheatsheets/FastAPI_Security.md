# FastAPI Security

## What it is

How to secure a FastAPI application: enforce auth through dependency injection, verify JWTs yourself, pin down
Pydantic models and CORS, and harden the deployment. This is the per-sheet guidance from the OWASP FastAPI
Security Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

FastAPI hands you the pieces but does not make the security decisions for you. `OAuth2PasswordBearer` only pulls
the bearer token out of the header; it never checks the signature, so trusting it alone lets a forged token
through. A JWT decoded without required claims or a pinned algorithm can be replayed or swapped to a weaker
algorithm. A Pydantic model that accepts extra fields lets a client set `is_admin`, a response that returns the
raw database row leaks the password hash, a wildcard CORS policy exposes private replies to any site, and a
blocking call in an async route stalls the whole worker. Each control below closes one of these gaps.

## Controls

Following the cheat sheet:
1. **Dependency-driven access control.** Enforce authentication and authorization through `Depends()` so every
   protected route runs the same check. Remember that `OAuth2PasswordBearer` does not validate the token: your
   auth dependency must verify it and reject bad credentials before returning a user.
2. **Separate authorization from authentication.** A valid login is not permission. For privileged routes add a
   dependency that checks the user's rights (for example an admin flag) and raises 403 otherwise.
3. **Router-level deny-by-default.** Attach auth dependencies to an `APIRouter` so new routes under it inherit the
   check; still add per-operation permission checks on sensitive actions.
4. **JWT library and verification.** Use a maintained library such as PyJWT rather than hand-rolled parsing or
   crypto. Verify the signature and require `exp`, `iss`, and `aud`, supplying the expected issuer and audience;
   validate `nbf` when present. Requiring a claim only checks it exists, so keep its verification on.
5. **Pin the algorithm.** Pass the accepted algorithm explicitly at decode time (for example `algorithms=["HS256"]`)
   and never trust the algorithm named in the token header.
6. **Revocation and replay.** Expiration bounds a token's life and a blocklist rejects revoked tokens, but a
   stolen still-valid token is reusable, so follow the JWT replay-protection guidance for more.
7. **Refresh-token cookies.** When refresh tokens live in cookies, set `HttpOnly`, `Secure`, and `SameSite=Lax`
   or `Strict`. `HttpOnly` stops scripts reading the cookie but not injected scripts making authenticated calls,
   so protect state-changing routes with CSRF defenses and treat `SameSite` as defense in depth.
8. **Signing-key management.** Never hard-code signing secrets or ship a default dev key. Load keys from managed
   secret storage (a mounted secret file or secret manager preferred), keep `.env` secret files out of source
   control, and follow the secrets guidance for rotation.
9. **Reject unknown fields.** Pydantic ignores undeclared fields by default; set `extra="forbid"` to reject
   requests that carry fields you did not declare.
10. **Block mass assignment.** Use narrow input schemas (`UserCreate`, `UserUpdate`) that leave out
    server-owned fields like `is_admin` or `id`, and persist only validated fields, never the raw request body.
    Note `extra="forbid"` does not stop a client setting a sensitive field you did declare.
11. **Filter responses.** Set `response_model` on the path operation so responses expose only safe fields and
    drop things like `password_hash`.
12. **Strict typing.** Pydantic coerces types (for example `"123"` to `123`); where a security decision needs an
    exact type use strict types such as `StrictInt` and `StrictBool`.
13. **Injection.** Validation does not stop SQL injection. Use parameterized queries, including through an ORM
    that binds parameters, and never build raw SQL by formatting strings with user input.
14. **CORS.** When `allow_credentials=True`, list trusted origins explicitly and never pair credentials with
    `allow_origins=["*"]`. Keep `allow_methods` and `allow_headers` limited to what the client uses. CORS does not
    replace endpoint authorization.
15. **API docs exposure.** Decide whether `/docs`, `/redoc`, and `/openapi.json` should be public; restrict or
    disable them with `FastAPI(openapi_url=None)`. Hiding docs does not secure the operations, which still need
    authorization.
16. **Async event loop.** Use async database and network clients in `async def` routes; put synchronous libraries
    in `def` routes so FastAPI runs them in a thread pool. Push CPU-heavy or long jobs to a separate worker such as
    Celery, since `BackgroundTasks` still runs in the app process.
17. **Error leakage.** Control what error detail reaches clients and logs. In a `RequestValidationError` handler
    return only safe field names and messages; do not return `str(exc)` or the whole request body, which can carry
    passwords or tokens.
18. **File uploads.** Cap the request body at the reverse proxy or gateway before parsing (checking
    `UploadFile.size` later does not undo the resources already spent). Treat `filename` and `content_type` as
    untrusted and apply the File Upload controls.
19. **Rate limiting.** Limit abuse of sensitive or costly endpoints with a library such as slowapi, back it with a
    shared store like Redis across workers, and also enforce limits at the proxy or gateway.
20. **ASGI server hardening.** Set `--forwarded-allow-ips` to trusted proxies only (never `"*"`) and have those
    proxies overwrite untrusted forwarding headers; disable proxy headers with `--no-proxy-headers` when unused,
    and suppress the `Server` header with `--no-server-header`.

## @security scenario

```gherkin
@security @owasp:fastapi @usecase:jwt-signature-verification
Scenario: An endpoint rejects a token with a forged or unverified signature
  Given a FastAPI route protected by a JWT authentication dependency
  When a client sends a bearer token whose signature does not verify
  Then the request is rejected with 401 and no user is returned
  And the dependency verifies the signature with a pinned algorithm and required exp, iss, and aud claims
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects a FastAPI app is the auth dependency that verifies every token before returning a user,
backed by input and output models that allow-list fields and a deployment that does not trust forwarding headers.
The `@security` scenario proves one forged token is rejected; the verifying dependency is what rejects every
forged token. A test is a check; the verified dependency is the guarantee.

## Sources

- OWASP FastAPI Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/FastAPI_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the controls above covering dependency-based access control, JWT verification and key management, Pydantic input and output hardening, CORS, OpenAPI exposure, the async event loop, error leakage, file uploads, rate limiting, and ASGI server hardening. `[documented]`
