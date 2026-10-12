# Server-Side Template Injection Prevention

## What it is

How to stop server-side template injection (SSTI), which occurs when a template engine treats attacker-controlled text as executable template syntax rather than displaying it as ordinary content. This is the per-sheet guidance from the OWASP Server-Side Template Injection Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

Each engine (Jinja2, Twig, FreeMarker, and the rest) ships an expression language of its own, which means injected markup executes with whatever reach that engine holds over the program's objects. The sheet names three ways input crosses into template code: input gets built into the template source (for example `"Hello {{" + name + "}}"`, or passed to a string-to-template call like Jinja2's `from_string()` or Flask's `render_template_string()`); a fixed template feeds a value to a feature that evaluates strings as code (like FreeMarker's `?interpret` and `?eval` or Twig's `template_from_string()`); or input picks the template name, path, or include target so the engine loads a file it should not. The impact runs from reading sensitive data and files up to remote code execution. Filtering template syntax out of input does not work, because the syntax varies by engine and a denylist will miss payloads.

## Controls

In the cheat sheet's order of preference:
1. **Treat templates as code.** Store every template beside the rest of your source, put edits to it through the same review your code gets, and build none of it out of data you do not trust. An attacker-controlled value must not select which template name, path, or include target loads; instead translate the user's pick through a server-held allow-list of fixed names. Where your product requires users to write their own templates, apply the privileged-feature rules in control 8.
2. **Supply user input purely as bound data.** Have the engine render a fixed, pre-written template while injecting user values through named parameters, which keeps hostile text away from the template exactly as a prepared statement keeps it away from SQL.
3. **Starve the render context.** Whatever you place in context is fully visible to the template, and on many engines its methods are callable too, so hand over strictly the values that view requires and withhold secrets, configuration, service clients, and any object with side-effecting methods. Doing so shrinks what a successful injection can touch, yet on an engine without a sandbox it still will not block code from running.
4. **Pick the weakest engine that works.** Favor one that caps what its expressions, calls, or commands can do (a logic-less option such as Mustache, for instance) unless your use case truly demands something richer. Keep in mind that every helper or lambda you wire in yourself executes as ordinary application code.
5. **Leave escaping switched on.** Automatic escaping is a defense against cross-site scripting in rendered HTML, but it does nothing for SSTI: escaping acts on the output a template emits, whereas the engine has already parsed the template code itself. Leave the feature active and refuse to tag any untrusted value as trusted.
6. **Hunt down exploitable template code.** Catalog every spot where the app renders a template. That includes the bodies of emails and notifications, generation of PDFs and reports, prompt construction for large language models, and each place that permits users to create or modify templates; regard any template arriving in third-party files as code you authored none of. Grep for string-to-template entry points, Jinja2's `from_string()`, Flask's `render_template_string()`, Twig's `createTemplate()` and `template_from_string()`, FreeMarker's `Template` constructor plus `?interpret` and `?eval`, together with anything that assembles template bodies or template names out of input. At every one of those sites, verify that untrusted data lands only in render variables and is never routed to a construct that runs strings as code.
7. **Harden each engine's configuration against untrusted templates.** Because frameworks can shift the defaults, confirm what is actually in effect. On Jinja2, run a `SandboxedEnvironment` (or `ImmutableSandboxedEnvironment`), supply your own `is_safe_attribute()`, and flag risky methods via `unsafe()`. On Twig, where templates count as trusted code, hand the sandbox a dedicated environment plus a tight `SecurityPolicy` that allow-lists which tags, filters, functions, tests, methods, and properties a template may touch (the `Sandbox` class wants Twig 3.29 or newer), and forbid `template_from_string()` entirely inside sandboxed templates. On FreeMarker, point the `?new` class resolver at `ALLOWS_NOTHING_RESOLVER` rather than `SAFER_RESOLVER`, leave `?api` turned off, clamp member access through `SimpleObjectWrapper` or a `WhitelistMemberAccessPolicy`, switch off DOM node wrapping, and configure a loader that serves only vetted files.
8. **Treat user-authored templates as a privileged capability.** Some products deliberately let people write templates (email builders, CMS themes, report designers); where they do, confine editing rights to authorized roles, record every template edit in an audit trail, render through the engine's sandbox or locked-down configuration from control 7 while keeping the engine patched, and expose only filters, functions, and globals that stay safe no matter what arguments an author passes. A sandbox will not bound CPU or memory, sanitize the rendered output, or restrain what your own invoked code gets up to, so wall off everything it misses: execute inside an isolated process or container capped on time and memory, stripped of secrets, and fenced off from the network, and handle whatever it produces as untrusted.

## @security scenario

```gherkin
@security @owasp:ssti @usecase:template-expression-injection
Scenario: A rendered message rejects a template expression payload
  Given an endpoint that renders a fixed template and inserts a user-supplied name
  When an attacker submits the name "{{7*7}}"
  Then the output contains the literal text "{{7*7}}" and never the evaluated value "49"
  And the name reaches the engine only as a render variable, never as template source or code
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes SSTI impossible is keeping untrusted input out of template code entirely: a fixed template written with the application source, with user values passed only as render variables, gives the attacker nothing the engine will parse as code. The `@security` scenario proves `{{7*7}}` stays literal; the fixed template plus data-only variables is what makes every payload safe (and a sandbox is the fallback boundary only when users must author templates themselves). A test is a check; the fixed template with data-only variables is the guarantee.

## Sources

- OWASP Server-Side Template Injection Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Template_Injection_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the three injection paths, the prevention controls (treat templates as code, pass input as data, minimal render context, least powerful engine, keep escaping on, find vulnerable code), the per-engine sandbox configuration for Jinja2, Twig, and FreeMarker, and the user-supplied-template rules. `[documented]`
