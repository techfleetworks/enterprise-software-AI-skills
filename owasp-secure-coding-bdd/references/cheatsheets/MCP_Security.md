# MCP Security

## What it is

How to secure the Model Context Protocol (MCP): the standard way an AI app connects an LLM to outside tools,
data, and services. The protocol lets the model pick which tool to call, when, and with what arguments, which
is a new attack surface that mixes prompt injection, supply-chain risk, and confused-deputy problems. This is
the per-sheet guidance from the OWASP MCP Security Cheat Sheet, condensed to the controls that hold and the
attacks they stop.

## The attack it stops

The LLM sees the descriptions of every tool from every connected server at once, so one bad server can reach
across them. A tool description, parameter schema, or return value can hide instructions that steer the model
(tool poisoning). A server trusted at install can swap its definitions later to turn malicious (a rug pull), or
its description can change how the agent uses tools from a different, trusted server (shadowing). Because a
server often runs with its own broad rights rather than the user's, it becomes a confused deputy. Injected text
can smuggle secrets out through a normal-looking call such as a search query, over-scoped OAuth tokens widen
the blast radius, a compromised proxy can tamper with or replay JSON-RPC after TLS ends, and a local server
with full host access can escape to the file system or steal credentials. The controls below close these paths.

## Controls

The cheat sheet's best practices, in source order:
1. **Least privilege.** Give each server only the permissions it needs, use separate per-server credentials
   (never shared tokens), request narrow OAuth scopes such as `mail.readonly`, and prefer short-lived tokens
   over long-lived personal access tokens.
2. **Tool description and schema integrity.** Review every description, parameter name, type, and return schema
   before approval, and treat the whole schema as an injection surface, not just the `description` field. Pin
   approved definitions by cryptographic hash and re-review on change (this catches metadata edits, not hidden
   server-code changes). Scan with tooling like `mcp-scan`, and tighten schemas with `additionalProperties:
   false` and `pattern` constraints so only declared, well-formed parameters pass.
3. **Sandbox and isolate servers.** Run local servers in a real sandbox with minimal host access (a bare
   `chroot` is not one), limit the file system to needed directories, turn off network access unless required,
   use `stdio` for local transport to avoid a listening endpoint, and keep sensitive servers (payment, auth,
   PII) apart from general ones.
4. **Human review on sensitive calls.** Ask the user to confirm any destructive, financial, or data-sharing
   operation, show the full parameters rather than only a tool name, never auto-approve (especially across
   servers), and make sure the model cannot forge a response that bypasses the confirmation UI.
5. **Input and output validation.** Treat all tool inputs as untrusted since they come from LLM output shaped
   by possibly hostile context. Sanitize against SQL, OS command, and path-traversal injection; never pass raw
   shell commands or unchecked file paths. Validate and clean tool output too, because it often feeds another
   tool. Guard against SSRF: never fetch an LLM-supplied URL without strict allowlist checks, so an injection
   cannot reach internal services like a cloud metadata endpoint.
6. **Authentication, authorization, and transport.** Require auth when remote endpoints expose non-public tools
   or data, and follow the MCP OAuth 2.1 profile with the `resource` parameter so the client names the intended
   server. Check that each access token was issued for this server as its audience, reject bad tokens, and
   never forward an MCP token to an upstream API. Authorize every protected request, use TLS for remote
   Streamable HTTP, verify server identity (certificate pinning or cryptographic checks), apply rate limits and
   quotas per session or tenant, store tokens in OS-native secure storage rather than plaintext config, bind
   local servers to localhost unless network access is needed, and validate the `Origin` (reject a present-but-
   bad one with 403, but do not reject clients that simply send none) and the `Host` header.
7. **Optional message-level integrity.** TLS covers data in transit, but a component that alters data after TLS
   ends is a separate threat, and the core transport does not require signing each JSON-RPC message. If your
   threat model needs integrity past TLS termination, pick a reviewed mechanism both ends support and define
   what is signed, how keys are trusted, how replay is rejected, and what a failed check does. Do not present
   signing as required for ordinary deployments.
8. **Multi-server isolation and cross-origin protection.** Treat each server as its own untrusted security
   domain, stop one server's descriptions from referencing or changing another server's tools, watch for
   cross-server data flows (credentials from server A showing up in calls to server B), and use a proxy or
   gateway to enforce isolation.
9. **Supply-chain security.** Install only from trusted, verified sources, review source and tool definitions
   first, verify package integrity with checksums or signing, scan dependencies, watch for post-install
   definition changes (rug pulls), and check package names closely to avoid typosquats.
10. **Monitoring, logging, and auditing.** Log every invocation with full parameters, user context, and
    timestamps, feed logs to a SIEM, alert on unusual patterns (new tools, admin-level queries, abnormal
    frequency), redact secrets and PII, and run regular audits and simulated attacks.
11. **Consent and installation security.** Show a clear consent dialog before connecting any new server, display
    the exact launch command in full for local servers, identify the source and publisher, re-prompt when
    definitions change, and never let web content or untrusted data start an installation.
12. **Tool return values as an injection vector.** Treat each response coming back from a tool as untrusted,
    even from an approved server. Label tool data clearly in context and tell the model to read it as data, not
    instructions as it decides what to do next. Use
    tag stripping and pattern detection only as extra filtering (they cannot prove the rest is safe), enforce
    authorization and validate follow-up calls in trusted application code, and for scraping or retrieval
    extract the structured fields you need instead of passing raw HTML.

## @security scenario

```gherkin
@security @owasp:mcp @usecase:ssrf-via-tool-parameter
Scenario: An MCP fetch tool refuses an LLM-supplied URL that targets an internal service
  Given an MCP server tool that fetches a URL chosen by the model
  When injected context makes the model request the cloud metadata endpoint at a link-local address
  Then the server rejects the URL because it is not on the allowlist
  And no internal response is returned to the model context
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps MCP safe is enforcing authorization and validation in trusted application code at the server
layer, independent of how the model read its context, so a poisoned description or an injected return value
cannot grant itself a tool call or reach a host it should not. The `@security` scenario proves one SSRF URL is
refused; the server-side allowlist and independent authorization are what refuse the whole class. A test is a
check; the server-layer control the model cannot talk its way past is the guarantee.

## Sources

- OWASP MCP (Model Context Protocol) Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the key risks and the full best-practice set (least privilege, schema integrity, sandboxing, human approval, input and output validation, authentication and transport, optional message integrity, multi-server isolation, supply chain, monitoring, consent, and prompt injection via tool return values) summarized above. `[documented]`
