# The dependency grep-battery — in full, per stack

> Load this reference when running Step 5 of a `judge-arch` review (SKILL.md → "The grep-test
> battery"), or when you need the language-specific patterns behind the summary. The SKILL has the
> JS/TS short form; this is the full, multi-stack version with tuning notes.

The battery is *mechanical evidence*, not an eyeball pass: run each command, paste the command **and
its output** into the matrix cell, and treat a clean (empty) result as `observed` evidence — never an
assumption. A hit is a candidate finding with its `file:line`. Run every command over the change's
**domain / service / business / entity / edge** paths only — **never** over `ui/`, `routes/`,
`pages/`, `components/`, `controllers/`, `middleware/`, where these tokens are expected and legitimate
(see Tuning). The dependency rule it enforces — source-code dependencies point inward, toward policy,
never outward toward frameworks or transport — is the **Dependency Rule** (Robert C. Martin, *Clean
Architecture*, 2017) `[documented]`.

Patterns below use `rg` (ripgrep); `grep -RnE` works with the same regex. Scope each to the diff with
`--glob`/path args (see Tuning).

---

## Question 3 — dependency direction (the core of the battery)

**What it catches:** web/transport concerns (request, response, session, cookie, HTTP, rendering,
browser globals) leaking into code that should be plain-data-in, plain-data-out; and a module reaching
into another's internals instead of its public interface. Run over `src/{domain,services,business}/**`,
`supabase/functions/*/_shared/**`, entity/model folders.

```bash
# JS / TS  — web concerns in domain/service/edge code
rg -n -i '\b(request|response|session|cookie|req\.|res\.|window|document|localStorage)\b' <domain/service/edge>
rg -n 'fetch\(|new Response|Headers\(|axios\.' <domain/service/edge>
# JS / TS  — a data model that knows about the web
rg -n -i '\b(req|res|ctx|headers|querystring)\b' <model/entity>
# JS / TS  — reaching into another module's internals rather than its interface
rg -n "from '\.\./\.\./[^']*/(internal|private|lib)/" <service>

# Python — Flask/Django/FastAPI transport tokens in domain/service code
rg -n -i '\b(request|response|session|HttpRequest|HttpResponse|flask\.request|starlette)\b' <domain/service>
rg -n '\brequests\.(get|post|put|delete)\(' <domain/service>          # outbound HTTP in the core

# Go — net/http and gin/echo handles reaching the domain
rg -n '\b(http\.Request|http\.ResponseWriter|\*gin\.Context|echo\.Context|\br\b \*http)\b' <domain/service>

# JVM (Java/Kotlin) — servlet & Spring web types in domain/service
rg -n '\b(HttpServletRequest|HttpServletResponse|HttpSession|@RequestMapping|ServerWebExchange)\b' <domain/service>

# .NET (C#) — ASP.NET context in domain/application layers
rg -n '\b(HttpContext|HttpRequest|HttpResponse|IActionResult|ControllerBase|Request\.Cookies)\b' <domain/service>

# Ruby (Rails) — controller/request surface inside models/services
rg -n '\b(request|response|session|cookies|params)\b' <app/models app/services lib>
```

**Per-stack web-concern token map** `[documented]` (framework docs for each):

| Stack | Transport tokens that must not appear in domain/service code |
|---|---|
| JS/TS | `request` `response` `session` `cookie` `req.` `res.` `window` `document` `localStorage` |
| Python | `request` `response` `session` `HttpRequest` `HttpResponse` `flask.request` `starlette` |
| Go | `http.Request` `http.ResponseWriter` `*gin.Context` `echo.Context` `ctx` (request-scoped) |
| JVM | `HttpServletRequest` `HttpServletResponse` `HttpSession` `ServerWebExchange` `@RequestMapping` |
| .NET | `HttpContext` `HttpRequest` `HttpResponse` `IActionResult` `ControllerBase` `Request.Cookies` |
| Ruby | `request` `response` `session` `cookies` `params` |

---

## Question 1 — boundary placement (business verbs in transport layers)

**What it catches:** business rules (calculations, checks, multi-step workflows) sitting in a route
handler, controller, or component instead of a service. Run this one over the **transport** paths (the
inverse of the rest) — `routes/`, `pages/`, `components/`, `controllers/` — and read each hit: a verb
there is a candidate for extraction.

```bash
rg -n -i '\b(calculate|validate|apply|charge|refund|transition|award|prorate|reconcile)\w*\s*\(' \
   src/routes src/pages src/components src/controllers app/controllers
```
A hit is a *finding* when the matched code makes the decision inline; it is `cleared` when the handler
merely calls a service of that name (`refundService.refund(...)`). Record which, with the `file:line`.

## Question 2 — data ownership (a fact written in two places)

**What it catches:** the same column/key written from more than one module; a stored total mutated
instead of derived; a hand-sync marker.

```bash
# the same owned column written outside its owning module (adjust column + owner path)
rg -n "update .*set .*<owned_column>|\.<owned_column>\s*=|set\(\{[^}]*<owned_column>" <paths outside the owner>
rg -n -i 'keep .*in sync|must match|mirror(s|ed)? the' <paths>        # confessions of a second copy
rg -n -i '(post_count|total|balance|count)\s*(\+=|=\s*\w+\s*\+\s*1)' <paths>   # a derived value stored as fact
```
Cross-reference the hits across modules: two modules writing one column is the finding. The bundled
`arch-gate` built-in `keepInSync` already encodes the marker subset mechanically.

## Question 4 — error handling (swallowed failures)

**What it catches:** a `catch`/failure check that neither recovers, retries, nor reports.

```bash
# JS / TS
rg -n -U 'catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}|\.catch\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)' <paths>
rg -n 'catch\s*\([^)]*\)\s*\{[^}]*return\s+(null|false|\[\]|undefined)' <paths>
# Python
rg -n -U 'except[^:]*:\s*(pass|\.\.\.)\s*$' <paths>
# Go — the discarded error
rg -n '(^|[^A-Za-z])_\s*(,|:?=)\s*[A-Za-z].*\berr\b|_ = .*\(' <paths>
# JVM / .NET — empty or comment-only catch blocks
rg -n -U 'catch\s*\([^)]*\)\s*\{\s*(//[^\n]*\s*)?\}' <paths>
```
The bundled `arch-gate` built-ins `emptyCatch` and `swallowReturn` already encode the empty-catch and
`catch → return null/false` subsets mechanically.

---

## Tuning notes

- **Scope to the diff.** Pass only the change's paths: derive them from
  `git diff --name-only --merge-base main` and feed them (or their parent dirs) as the path args, so
  the battery mirrors exactly what the matrix covers. Don't scan the whole repo for a 3-file change.
- **The boundary layer legitimately uses these tokens — exclude it.** `request`/`response`/`session`
  in `routes/`, `controllers/`, `middleware/`, `pages/`, `components/` is correct: that *is* the
  boundary. Only hits in domain/service/entity/`_shared` code are findings. A hit in the wrong folder
  for the pattern (e.g. a web token inside the boundary layer) is expected, not a finding.
- **Finding vs expected — the test.** A hit is a *finding* only when the token couples **core logic**
  to transport (a service that reads `req.body`, a model with an `HttpSession` field). A hit is
  `cleared` when it's the boundary doing its job, a comment/string literal, or a same-named local
  variable (`const response = computeThing()`), not the framework type. Record the reason in the cell.
- **False-positive dampers.** Add `-g '!**/*.test.*' -g '!**/*.spec.*'` to skip tests; `-w` for
  whole-word tokens (`req` matches `required` without it); quote-anchor import patterns so a word in
  prose doesn't match.

## Encode every greppable catch (the ratchet)

Anything confirmed here that a regex can describe is **not fully resolved until it is an `arch-gate`
`forbid` rule** (authored via `arch-encode`) — that moves it from "a reviewer must notice it" to "the
mechanical gate catches it on every PR, forever" (SKILL non-negotiable #11, mechanism #1). `arch-gate`
already ships built-ins covering a subset — `emptyCatch`, `swallowReturn`, `keepInSync` — so the
battery is the review-time **superset** and the encode ratchet is how the gap between them shrinks. The
planted-violation fixtures in `check-arch-rules-discriminate` are what prove the encoded rules actually
fire (SKILL non-negotiable #12). `[documented]` — see SKILL.md "The grep-test battery" and
`references/mechanical-gate.md`.
