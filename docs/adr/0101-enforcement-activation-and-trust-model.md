---
status: "accepted"
date: 2026-10-30
decision-makers: mdenner
---

# 0101 - Enforcement activation from a static install, and an honest tamper trust model

Issue: #174 (PR-B, the installer wiring).

## Context

PR-A (ADR-0100) built the finish-check engine, and #175 built the edit-gate. Both are no-ops until they are
(1) registered as hooks and (2) told their per-session state paths. PR-A deferred both to "the installer."
Two questions had to be answered to make enforcement actually fire, and the operator was asked both:

1. **How does a single static install make the hooks fire per session?** A `settings.json` is static text, so
   it cannot hold a value that differs per session. But the design (ADR-0097, and the finish-check and
   edit-gate records docs) already commits to per-session files keyed by `session_id`
   (`~/.claude/esk/.../<session_id>.*`), and every hook receives `session_id` in its payload.

2. **What can "enforcement cannot be removed by the agent" honestly promise?** The substrate research
   established that on this build hooks load at session start and that `.claude/settings.json` is writable by
   the agent. So hooks placed there can be edited or removed by the agent. True prevention needs OS-level
   managed settings, which require admin rights and per-OS setup and cannot be installed by `esk-init` alone.

The operator chose, for both, the recommended option: **full per-session wiring now**, and **detection in
project settings** (tamper is made visible, not falsely claimed as prevented).

## Decision

### 1. Activation layer (`always-on/esk-paths.mjs`)

A single portable flag, `ESK_ENFORCE=1`, turns enforcement on. When it is set, each hook derives its
per-session paths from a base store (`ESK_HOME`, else `~/.claude/esk`) plus the payload `session_id`:
`records/`, `selections/`, `load-state/`, `plans/`, `receipts/`, `blocks/`, `waivers/`, each
`<base>/<kind>/<session_id>.<ext>`. An explicit full-path env (`ESK_TASK_RECORD`, `ESK_SELECTION`, ...) still
wins, so tests and bespoke installs are unchanged, and when neither the flag nor an explicit path is set the
hook is a no-op (the un-bootstrapped-machine safety from PR-A). Because the flag is just `"1"`, it is portable:
no machine-specific absolute path is committed. `finish-check.mjs` and `edit-gate.mjs` now resolve their state
through this layer.

A SessionStart companion, `always-on/session-setup.mjs`, announces the concrete per-session paths into the
session so the agent knows where to write its records, and runs the self-test below. It cannot block (a
SessionStart hook never can), so it only ever emits context and exits 0.

### 2. Operator waivers move out of the agent's record

A step is waived only by an entry in a separate operator file (`ESK_WAIVERS_FILE`, else the per-session
`waivers/<session_id>.json`) that names the step, is `"by":"operator"`, and carries a reason. The agent's own
task record no longer carries waivers, so the agent cannot waive a step for itself by writing its record.

### 3. Installer wiring (`esk-init --enforce`)

A new, opt-in `--enforce` flag registers the five enforcement hooks (session-setup + reload-skills on
SessionStart, edit-gate on PreToolUse, record-load on PostToolUse, finish-check on Stop and SubagentStop) and
sets `env.ESK_ENFORCE=1`, idempotently and additively (foreign hooks and keys preserved, our entries updated in
place, duplicates collapsed). A plain install is byte-identical to before (enforcement is opt-in). The marker
records `enforce:true`, so a later plain reconcile keeps enforcement on rather than silently dropping it.
`--check` reports a missing enforcement hook or an unset flag as drift, and an enforcement canary runs the
scripts on a harmless payload so a dead path is caught at install time. The install prints one plain-language
summary line of what is now held.

### 4. Trust model: detection, stated honestly

Removal is made **visible**, not prevented. Every session that starts after an enforcement hook is removed or
altered opens with a plain warning naming the missing hook (the self-test reads the effective settings), and
`esk-init --check` reports the same drift. We do **not** claim the agent is physically prevented from editing
`.claude`; doing so would be a false promise. Managed/OS-level settings are documented in
`always-on/README.md` as the optional stronger tier that actually prevents removal, for operators who want it
and can set it up.

## Consequences

- After `esk-init --yes --enforce`, the skills formula is actually held: an edit is blocked until select/load/
  plan exist, and a turn is blocked until build/prove/review/encode/receipt are proven. The operator stops
  being the enforcement.
- The honest limit is explicit and tested: tampering is detected and surfaced, not prevented, unless managed
  settings are used. This matches the substrate findings rather than overstating the guarantee.
- The agent is told its per-session paths at SessionStart, closing the "how does the agent know where to write
  the record" gap that would otherwise make enforcement unusable.
- A new dependency: `finish-check.mjs` and `edit-gate.mjs` import `esk-paths.mjs`. It is a small, pure path
  module with its own discriminating tests; the hooks still fail closed on their own errors.
- The per-session store accumulates small JSON files under `~/.claude/esk`. They are session-scoped; a cleanup
  policy is out of scope here (the receipt store already lives there, ADR-0097).

## Alternatives considered

- **A static `ESK_HOME`/`ESK_TASK_RECORD` absolute path in a committed settings.json.** Rejected: it is
  machine-specific and would be the same committed-footgun esk-init already refuses for the emitter path. The
  portable `"1"` flag plus payload-`session_id` derivation avoids it.
- **Managed settings as the default.** Rejected as the default (chosen as the documented stronger tier): it
  needs admin rights and per-OS setup, cannot be installed by esk-init alone, and would not apply on machines
  without it, so it cannot be the baseline. Detection works everywhere today.
- **Keep waivers in the agent's task record.** Rejected: the agent writes that record, so it could waive its
  own steps. A separate operator file is the honest seam, even though prevention is still only detection-grade.
