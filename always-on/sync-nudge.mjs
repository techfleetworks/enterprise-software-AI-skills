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
 *   driftedSkills    names of mirrored skills that no longer match the repo (ADR-0104): commits that changed a
 *                    skill without a version bump. The boundary computes it from the install marker's per-skill
 *                    signatures (.claude/skills/bootstrap/scripts/skill-signature.mjs); [] when nothing
 *                    drifted or there is no skills record, null when the check was skipped or failed.
 *   skillsTarget     the mirror folder when it is NOT the default ~/.claude/skills, else null, so the printed fix
 *                    re-mirrors the folder that is actually stale.
 * Returns { text, nextState, inSync, behind }:
 *   text       the string to inject (null when there is nothing to say)
 *   nextState  the state to persist ({ forVersion, count }), or null to clear the state file
 * Rules:
 *   - versions unknown/unparseable, or no marker: do nothing (never nag someone we cannot assess).
 *   - installed >= current (in sync, or ahead) AND no drifted skills: clear state, no nudge.
 *   - installed >= current but some mirrored skills drifted: behind on CONTENT. Same counter and cap, keyed on
 *     the version plus the drifted names, so a new drift (a later unversioned commit) restarts the count.
 *   - installed < current (behind): count this session. A new current version resets the count (a fresh
 *     target). Loud nudge up to NUDGE_CAP sessions, then a single quiet one-liner so it never goes fully
 *     silent but also never nags forever.
 */
export function decideNudge({ currentVersion, installedVersion, state, driftedSkills = [], skillsTarget = null }) {
  const base = { text: null, nextState: state ?? null, inSync: false, behind: false };

  if (installedVersion == null) return base; // not installed via the installer, or marker unknown: say nothing
  const cmp = compareSemver(installedVersion, currentVersion);
  if (cmp == null) return base; // cannot parse one of them: do not guess

  const versionBehind = cmp < 0;
  // null = the content check was NOT assessed (it was skipped, failed, or ran past its budget). At an unchanged
  // version that is "say nothing and keep the counter", never "in sync": clearing the state on a skipped scan
  // would let an occasionally slow disk restart the loud count forever and bypass the cap.
  if (driftedSkills === null && !versionBehind) return base;
  const drifted = Array.isArray(driftedSkills) ? [...driftedSkills].sort() : [];
  if (!versionBehind && drifted.length === 0) {
    // In sync (or the marker is ahead, e.g. a local dev bump) and every mirrored skill matches: clear any state.
    return { text: null, nextState: null, inSync: true, behind: false };
  }

  // Behind on version, or on content at the same version. A change of target restarts the count from zero.
  const forVersion = versionBehind ? currentVersion : `${currentVersion}+content:${drifted.join(",")}`;
  const sameTarget = state && state.forVersion === forVersion && Number.isInteger(state.count);
  const count = (sameTarget ? state.count : 0) + 1;
  const nextState = { forVersion, count };
  const skillsCmd = "esk-init.mjs --personal --yes --skills" + (skillsTarget ? ` --skills-target "${skillsTarget}"` : "");
  const text = count <= NUDGE_CAP
    ? loudNudge({ installedVersion, currentVersion, count, drifted, versionBehind, skillsCmd })
    : quietNudge({ installedVersion, currentVersion, drifted, versionBehind, skillsCmd });
  return { text, nextState, inSync: false, behind: true };
}

// Name the drifted skills, capped so a long list never crowds the directive out of the hook's length limit.
const MAX_NAMED = 20;
function driftList(drifted) {
  const shown = drifted.slice(0, MAX_NAMED).join(", ");
  return drifted.length > MAX_NAMED ? `${shown}, and ${drifted.length - MAX_NAMED} more` : shown;
}

function loudNudge({ installedVersion, currentVersion, count, drifted, versionBehind, skillsCmd }) {
  // Content-only drift is fixed ONLY by re-mirroring: a hook-only reconcile (no --skills) rewrites the marker
  // without its skills record, which would silence this nudge while the mirror stays stale. So offer it only
  // when the version itself is behind.
  const fixes = versionBehind
    ? ["    node .claude/skills/bootstrap/scripts/esk-init.mjs --yes            (the hook)",
       `    node .claude/skills/bootstrap/scripts/${skillsCmd}   (global: hook + skills)`]
    : [`    node .claude/skills/bootstrap/scripts/${skillsCmd}   (re-mirror the skills)`];
  const what = versionBehind
    ? [`Installed v${installedVersion}, but the repo is v${currentVersion}. You are enforcing an OLD version.`]
    : [`Installed v${installedVersion} matches the repo version, but these mirrored skills changed in the repo`,
       `after they were installed (commits landed without a version bump), so your copy is STALE: ${driftList(drifted)}.`];
  if (versionBehind && drifted.length) what.push(`Skills that changed or are missing: ${driftList(drifted)}.`);
  return [
    "=============================================================",
    "ACTION NEEDED: the enterprise skills here are OUT OF DATE.",
    ...what,
    "",
    "Why this matters: a newer version can carry fixed gates, new security rules, and corrected",
    "skills. Until you sync, this session runs the stale copy, so a check that would catch a real",
    "problem may be missing or wrong here. Syncing is one step and takes seconds.",
    "",
    "Sync now: run the `bootstrap` skill, or run the installer reconcile:",
    ...fixes,
    "",
    `Please tell the user this, recommend syncing, and offer to run it. (reminder ${count} of ${NUDGE_CAP})`,
    "=============================================================",
  ].join("\n");
}

function quietNudge({ installedVersion, currentVersion, drifted, versionBehind, skillsCmd }) {
  if (!versionBehind) {
    return `NOTE: these mirrored enterprise skills are still stale at v${currentVersion}: ${driftList(drifted)}. ` +
      `Re-mirror with ${skillsCmd} when you can; this session is running the stale copy.`;
  }
  return `NOTE: the enterprise skills are still behind (installed v${installedVersion}, repo v${currentVersion}). ` +
    "Sync with the bootstrap skill (esk-init --yes) when you can; this session is running the stale copy.";
}
