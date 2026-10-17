#!/usr/bin/env node
/**
 * sync-nudge.mjs: the PURE decision logic for the always-on "you are behind, sync the skills" nudge
 * (ADR-0054). It owns the drift decision and the persistent nudge counter; emit-directive.mjs (the
 * SessionStart boundary) does the file I/O and injects the text this returns. Keeping the logic here, with
 * no I/O, is what lets it be tested exhaustively and reused, and keeps emit-directive a thin boundary.
 *
 * The behavior mdenner asked for: when the installed skills are behind the repo, LOUDLY encourage a sync and
 * explain the benefit, every session, keeping it up for many sessions (a cap so it never becomes infinite
 * noise), and reset the moment the user syncs or a new version appears.
 */

export const NUDGE_CAP = 30; // keep the loud nudge for up to this many sessions, then fall back to a one-liner

// Compare two "x.y.z" strings. Returns -1 / 0 / 1, or null if either is not a clean semver (so a caller can
// decline to act rather than guess). No pre-releases: these are the repo's own release versions.
export function compareSemver(a, b) {
  const parse = (v) => {
    if (typeof v !== "string") return null;
    const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Decide the nudge for one SessionStart.
 *   currentVersion   the repo version now (from the repo package.json)
 *   installedVersion the version recorded in the install marker, or null/undefined if unknown
 *   state            the persisted nudge state { forVersion, count } (or null on first run)
 * Returns { text, nextState, inSync, behind }:
 *   text       the string to inject (null when there is nothing to say)
 *   nextState  the state to persist ({ forVersion, count }), or null to clear the state file
 * Rules:
 *   - versions unknown/unparseable, or no marker: do nothing (never nag someone we cannot assess).
 *   - installed >= current (in sync, or ahead): clear state, no nudge.
 *   - installed < current (behind): count this session. A new current version resets the count (a fresh
 *     target). Loud nudge up to NUDGE_CAP sessions, then a single quiet one-liner so it never goes fully
 *     silent but also never nags forever.
 */
export function decideNudge({ currentVersion, installedVersion, state }) {
  const base = { text: null, nextState: state ?? null, inSync: false, behind: false };

  if (installedVersion == null) return base; // not installed via the installer, or marker unknown: say nothing
  const cmp = compareSemver(installedVersion, currentVersion);
  if (cmp == null) return base; // cannot parse one of them: do not guess

  if (cmp >= 0) {
    // In sync (or the marker is ahead, e.g. a local dev bump): clear any prior nudge state.
    return { text: null, nextState: null, inSync: true, behind: false };
  }

  // Behind. A change of target version restarts the count from zero for the new version.
  const sameTarget = state && state.forVersion === currentVersion && Number.isInteger(state.count);
  const count = (sameTarget ? state.count : 0) + 1;
  const nextState = { forVersion: currentVersion, count };
  const text = count <= NUDGE_CAP
    ? loudNudge({ installedVersion, currentVersion, count })
    : quietNudge({ installedVersion, currentVersion });
  return { text, nextState, inSync: false, behind: true };
}

function loudNudge({ installedVersion, currentVersion, count }) {
  return [
    "=============================================================",
    "ACTION NEEDED: the enterprise skills here are OUT OF DATE.",
    `Installed v${installedVersion}, but the repo is v${currentVersion}. You are enforcing an OLD version.`,
    "",
    "Why this matters: a newer version can carry fixed gates, new security rules, and corrected",
    "skills. Until you sync, this session runs the stale copy, so a check that would catch a real",
    "problem may be missing or wrong here. Syncing is one step and takes seconds.",
    "",
    "Sync now: run the `bootstrap` skill, or run the installer reconcile:",
    "    node .claude/skills/bootstrap/scripts/esk-init.mjs --yes            (the hook)",
    "    node .claude/skills/bootstrap/scripts/esk-init.mjs --personal --yes --skills   (global: hook + skills)",
    "",
    `Please tell the user this, recommend syncing, and offer to run it. (reminder ${count} of ${NUDGE_CAP})`,
    "=============================================================",
  ].join("\n");
}

function quietNudge({ installedVersion, currentVersion }) {
  return `NOTE: the enterprise skills are still behind (installed v${installedVersion}, repo v${currentVersion}). ` +
    "Sync with the bootstrap skill (esk-init --yes) when you can; this session is running the stale copy.";
}
