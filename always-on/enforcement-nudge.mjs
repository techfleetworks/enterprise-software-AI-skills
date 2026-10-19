#!/usr/bin/env node
/**
 * enforcement-nudge.mjs: the PURE decision logic for the always-on "your gates run but do not BLOCK merges
 * yet, turn enforcement on" nudge (ADR-0066). It is the enforcement sibling of sync-nudge.mjs: emit-directive.mjs
 * (the SessionStart boundary) gathers the local signals and does the file I/O, and this module decides what to
 * say. Keeping the logic here, I/O-free, is what makes it exhaustively testable.
 *
 * Why it exists: a consumer repo can install and RUN the gates (esk-genesis scaffolds the workflow) without the
 * repo's branch protection REQUIRING the `enterprise-gates` check. Then the gates show red but nothing blocks a
 * merge, so enforcement is silently advisory. Nothing in a repo can turn branch protection on (GitHub makes it
 * admin-only, on purpose), so the strongest honest move is to make the gap impossible to ignore: every session,
 * loudly tell the agent to tell the human to require the check, until it is wired. This is the same shape as the
 * sync nudge, pointed at enforcement instead of version drift.
 *
 * Honest ceiling (state it, do not hide it): this DRIVES the human hard but cannot FORCE them, and it clears on
 * a local intent+confirm signal (a committed ruleset that requires the check AND a committed applied-marker from
 * apply-ruleset.sh), which proves the ruleset was committed and applied, not that GitHub is live-enforcing it
 * this second. Live verification needs an admin API call and is deliberately out of scope (same stance as
 * required-checks.test.mjs).
 */

export const ENFORCE_NUDGE_CAP = 30; // loud for up to this many sessions, then a persistent quiet one-liner

/**
 * Does any committed ruleset require `checkName` as a status check?
 *   rulesets  an array of parsed ruleset JSON objects (GitHub ruleset shape)
 *   checkName the required-check name to look for (e.g. "enterprise-gates")
 * Pure: a rule of type "required_status_checks" whose parameters.required_status_checks[] has a matching
 * `context`. Anything malformed is simply "not found" (never throws), so a bad ruleset reads as not-enforced.
 */
export function rulesetRequires(rulesets, checkName) {
  if (!Array.isArray(rulesets) || typeof checkName !== "string" || checkName.length === 0) return false;
  for (const rs of rulesets) {
    // A ruleset only enforces anything when it is ACTIVE and it protects the DEFAULT branch. A disabled
    // ruleset, or one that targets some unused branch, lists the check but blocks nothing, so it must not
    // clear the nudge (that was the inert-ruleset false-clear). When we cannot confirm it protects the
    // default branch, we do NOT count it: a security signal errs toward nudging, never toward silence.
    if (!rs || rs.enforcement !== "active") continue;
    if (!protectsDefaultBranch(rs)) continue;
    const rules = Array.isArray(rs.rules) ? rs.rules : [];
    for (const rule of rules) {
      if (!rule || rule.type !== "required_status_checks") continue;
      const checks = rule.parameters && Array.isArray(rule.parameters.required_status_checks)
        ? rule.parameters.required_status_checks : [];
      if (checks.some((c) => c && c.context === checkName)) return true;
    }
  }
  return false;
}

// True only when we can confirm the ruleset targets the default branch (GitHub's ~DEFAULT_BRANCH / ~ALL
// tokens, or the usual default names). An unparseable or unusual-only target is treated as "cannot confirm"
// and returns false, so an active-but-wrong-branch ruleset keeps the nudge firing rather than false-clearing.
function protectsDefaultBranch(rs) {
  const include = rs && rs.conditions && rs.conditions.ref_name && Array.isArray(rs.conditions.ref_name.include)
    ? rs.conditions.ref_name.include : null;
  if (!include) return false;
  const DEFAULTS = new Set(["~DEFAULT_BRANCH", "~ALL", "refs/heads/main", "refs/heads/master"]);
  return include.some((r) => DEFAULTS.has(r));
}

/**
 * Decide the enforcement nudge for one SessionStart.
 *   installed            is this a consumer that installed the travelling gates? (the enterprise-gates
 *                        workflow is present). When false, say nothing: the origin repo and a repo that only
 *                        loads the directive have no `enterprise-gates` check to require.
 *   rulesetRequiresCheck does a committed ruleset require the check?
 *   applied              is the committed applied-marker present (apply-ruleset.sh ran)?
 *   requiredCheck        the check name, for the message (default "enterprise-gates")
 *   state                persisted { count } (or null on first run)
 * Returns { text, nextState, enforced, advisory }:
 *   enforced true  -> clear state, no nudge. advisory true -> loud (<= cap) then quiet; count persisted.
 */
export function decideEnforcementNudge({ installed, rulesetRequiresCheck, applied, requiredCheck, state }) {
  const check = typeof requiredCheck === "string" && requiredCheck.length ? requiredCheck : "enterprise-gates";
  if (!installed) return { text: null, nextState: state ?? null, enforced: false, advisory: false };

  if (rulesetRequiresCheck && applied) {
    // Committed ruleset requires the check AND it was applied: enforced (as far as a local signal can prove).
    return { text: null, nextState: null, enforced: true, advisory: false };
  }

  const count = (state && Number.isInteger(state.count) ? state.count : 0) + 1;
  const nextState = { count };
  const missing = !rulesetRequiresCheck ? "no-ruleset" : "not-applied";
  const text = count <= ENFORCE_NUDGE_CAP
    ? loudNudge({ check, missing, count })
    : quietNudge({ check });
  return { text, nextState, enforced: false, advisory: true };
}

function loudNudge({ check, missing, count }) {
  const step = missing === "no-ruleset"
    ? [
        `Commit a branch ruleset that REQUIRES the "${check}" check, then apply it (needs repo admin):`,
        "    scripts/apply-ruleset.sh",
        "(esk-genesis can scaffold the ruleset for you if it is not there yet.)",
      ]
    : [
        `A ruleset requiring "${check}" is committed but has NOT been applied to GitHub yet. Apply it`,
        "(needs repo admin):",
        "    scripts/apply-ruleset.sh",
      ];
  return [
    "=============================================================",
    "ACTION NEEDED: the enterprise gates RUN here but do NOT block merges yet.",
    `Branch protection does not require the "${check}" check, so a change can merge with the gates red.`,
    "Enforcement is ADVISORY until an admin turns it on.",
    "",
    ...step,
    "",
    "Only a repo admin can set branch protection; nothing in the repo can do it automatically.",
    `Please tell the user this plainly, recommend turning it on, and offer to walk them through it. (reminder ${count} of ${ENFORCE_NUDGE_CAP})`,
    "=============================================================",
  ].join("\n");
}

function quietNudge({ check }) {
  return `NOTE: the enterprise gates are still ADVISORY here (branch protection does not require "${check}"), ` +
    "so a change can merge with the gates red. Ask an admin to run scripts/apply-ruleset.sh when they can.";
}
