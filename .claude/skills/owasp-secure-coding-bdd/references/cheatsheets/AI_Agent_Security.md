# AI Agent Security

## What it is

How to secure an AI agent: an LLM-driven system that reasons, plans, keeps memory, calls tools, and takes
actions on its own to reach a goal. That autonomy opens risks well past ordinary prompt injection. This is the
per-sheet guidance from the OWASP AI Agent Security Cheat Sheet, condensed to the controls that hold and the
attacks they stop.

## The attack it stops

Because an agent can act, an attacker who bends its behavior can make it do real damage, not just produce bad
text. Hostile instructions can arrive directly in a user message or indirectly through a fetched web page,
document, or email, and then redirect what the agent does. From there an attacker can push the agent to abuse
an over-powered tool, leak secrets through an outbound call, plant poisoned entries in memory that resurface in
later sessions, swap the agent's goal for their own, or trip a high-impact action such as a payment or a bulk
delete with no real sign-off. Unbounded loops run up a huge bill (denial of wallet), and in a multi-agent
setup one captured agent can infect the rest. The controls below keep each of these contained.

## Controls

The cheat sheet's best practices, in source order:
1. **Tool security and least privilege.** Give each agent only the tools its job needs. Scope every tool
   (read vs. write, named resources, path allowlists, blocked patterns such as `*.env` or `*secret*`), split
   tool sets by trust level, and require explicit authorization for sensitive calls. Enforce that
   authorization in the execution layer, outside the model's context: a `user_confirmed` flag is not enough.
   Check and consume the approval in one atomic step right before running, tie it to the exact actor and call,
   and demand a fresh approval if the target or parameters change. Fail closed on unknown tools.
2. **Input validation and prompt-injection defense.** Treat every external source as untrusted (user text,
   retrieved documents, API replies, emails). Sanitize before it enters context, mark clear boundaries between
   instructions and data, filter known injection patterns, and consider a separate model call to vet or
   summarize untrusted content.
3. **Memory and context security.** Validate and clean data before it is stored, isolate memory per user and
   session, cap size and set expiry, screen for sensitive values before persisting, and add integrity checks
   (a keyed checksum) on long-lived memory so tampering shows.
4. **Human-in-the-loop controls.** Require sign-off for high-impact or irreversible actions, preview actions
   before they run, set autonomy limits by risk level, keep an audit trail, and let people interrupt and undo.
   Classify each action by risk and fail closed: an unmapped tool defaults to needing review.
5. **High-impact action integrity.** For destructive, financial, admin, or externally visible actions, go past
   a yes/no prompt. Keep the decision separate from execution so a policy or execution service independently
   checks scope, privilege, and approval. Bind the approval record to actor, tool, target, normalized
   parameters, time, and expiry. Use short-lived, replay-protected authorization artifacts, require step-up
   auth for critical operations, make actions idempotent where you can, and fail closed if any check fails.
6. **Output validation and guardrails.** Validate agent output before it runs or is shown. Confirm the chosen
   tool is on the allowlist, block sensitive data in parameters, prefer schema-checked structured output, rate-
   and scope-limit actions, and watch for exfiltration signs such as encoded data in a URL or an oversized
   payload to a webhook.
7. **Monitoring and observability.** Log every decision, tool call, and result; redact secrets first. Run
   anomaly detection, track token spend and cost per session, alert on security events, and record structured
   metadata for high-risk actions (classification, risk score, authorization outcome, approval id, result,
   policy version). Watch for drift in approvals, repeated bypass tries, and sudden spikes in risky actions.
8. **Multi-agent security.** Put trust boundaries between agents, authenticate each sender and re-check its
   permissions at the receiver (a valid signature is not permission), sanitize messages between agents, stop
   privilege climbing along a chain, isolate runtimes, and add circuit breakers against cascading failure.
   When you sign messages, use a maintained library, cover a bounded validity window, and reject repeated
   message ids with shared state across receivers.
9. **Data protection and privacy.** Minimize sensitive data in context, classify data and apply handling rules,
   encrypt at rest and in transit, enforce retention and deletion, and meet privacy law (GDPR, CCPA).
10. **Secure testing and adversarial validation.** Run abuse-case tests (prompt override, tool misuse,
    privilege escalation, memory poisoning, exfiltration, recursive tool abuse, approval bypass, agent
    chaining) before launch and after any change to prompts, tools, memory, retrieval, policy, or provider.
    Wire adversarial suites into CI, keep regression tests for past failures, block releases that change risky
    policy without updated tests, and retain evidence of what was tested and what residual risk was accepted.

## @security scenario

```gherkin
@security @owasp:ai-agent @usecase:injected-high-impact-action
Scenario: An injected instruction cannot trigger a high-impact action without bound approval
  Given an agent that reads an untrusted document and can call a transfer_funds tool
  When the document hides an instruction telling the agent to transfer funds
  Then the execution layer blocks the call because no approval is bound to that exact actor, tool, and parameters
  And the attempt is logged as a high-risk event and the action fails closed
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps an agent safe is enforcing authorization and approval in the execution layer, outside the
model's reasoning, so no amount of clever text can talk the agent into a high-impact action on its own. The
`@security` scenario proves one injected instruction is refused; the out-of-context check bound to the exact
actor, tool, and parameters is what refuses every one. A test is a check; the execution-layer gate that fails
closed is the guarantee.

## Sources

- OWASP AI Agent Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the key risks and the full set of best practices (tool least privilege, input and prompt-injection defense, memory security, human-in-the-loop, high-impact action integrity, output guardrails, monitoring, multi-agent security, data protection, adversarial testing) summarized above. `[documented]`
