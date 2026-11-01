// Discriminating tests for always-on/sync-nudge.mjs (ADR-0054): the pure decision logic for the
// "you are behind, sync the skills" nudge. Covers behind -> loud nudge + counter increment, in-sync -> clear,
// ahead -> clear, a new target version resetting the count, the cap falling back to a one-liner, and the
// do-nothing cases (no marker, unparseable versions). The test FAILS if the logic stops nudging on drift or
// starts nudging when in sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideNudge, compareSemver, NUDGE_CAP } from "../always-on/sync-nudge.mjs";

test("compareSemver orders versions and rejects non-semver", () => {
  assert.equal(compareSemver("1.0.0", "1.0.1"), -1);
  assert.equal(compareSemver("1.2.0", "1.1.9"), 1);
  assert.equal(compareSemver("2.0.0", "2.0.0"), 0);
  assert.equal(compareSemver("1.0", "1.0.0"), null);
  assert.equal(compareSemver("x", "1.0.0"), null);
});

test("behind: returns a LOUD nudge and increments the counter (discriminating)", () => {
  const r = decideNudge({ currentVersion: "1.1.0", installedVersion: "1.0.0", state: null });
  assert.equal(r.behind, true);
  assert.match(r.text, /OUT OF DATE/);
  assert.match(r.text, /reminder 1 of /);
  assert.deepEqual(r.nextState, { forVersion: "1.1.0", count: 1 });
});

test("behind again at the same version: the counter keeps climbing", () => {
  const r = decideNudge({ currentVersion: "1.1.0", installedVersion: "1.0.0", state: { forVersion: "1.1.0", count: 4 } });
  assert.match(r.text, /reminder 5 of /);
  assert.equal(r.nextState.count, 5);
});

test("in sync: no nudge and the state is cleared (discriminating)", () => {
  const r = decideNudge({ currentVersion: "1.1.0", installedVersion: "1.1.0", state: { forVersion: "1.1.0", count: 9 } });
  assert.equal(r.text, null);
  assert.equal(r.inSync, true);
  assert.equal(r.nextState, null, "state must be cleared on sync so a later drift restarts the count");
});

test("installed AHEAD of the repo (local dev bump): treated as in sync, no nudge", () => {
  const r = decideNudge({ currentVersion: "1.0.0", installedVersion: "1.1.0", state: null });
  assert.equal(r.text, null);
  assert.equal(r.nextState, null);
});

test("a NEW target version resets the count to 1 (reset on update)", () => {
  const r = decideNudge({ currentVersion: "2.0.0", installedVersion: "1.0.0", state: { forVersion: "1.5.0", count: 20 } });
  assert.match(r.text, /reminder 1 of /, "a different current version restarts the count");
  assert.deepEqual(r.nextState, { forVersion: "2.0.0", count: 1 });
});

test("past the cap: falls back to a quiet one-liner, still counting", () => {
  const r = decideNudge({ currentVersion: "1.1.0", installedVersion: "1.0.0", state: { forVersion: "1.1.0", count: NUDGE_CAP } });
  assert.doesNotMatch(r.text, /OUT OF DATE/);
  assert.match(r.text, /still behind/);
  assert.equal(r.nextState.count, NUDGE_CAP + 1);
});

test("no marker / unknown installed version: say nothing", () => {
  assert.equal(decideNudge({ currentVersion: "1.1.0", installedVersion: null, state: null }).text, null);
  assert.equal(decideNudge({ currentVersion: "1.1.0", installedVersion: undefined, state: null }).text, null);
});

test("unparseable version: do not guess, no nudge", () => {
  assert.equal(decideNudge({ currentVersion: "1.1.0", installedVersion: "garbage", state: null }).text, null);
});

// --- same-version content drift (ADR-0104) ---------------------------------------------------------------
test("same version but drifted skills: LOUD nudge naming each skill and the fix (discriminating)", () => {
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: null, driftedSkills: ["judge-arch", "bootstrap"] });
  assert.equal(r.behind, true, "a stale mirror at the same version must count as behind");
  assert.match(r.text, /OUT OF DATE/);
  assert.match(r.text, /STALE: bootstrap, judge-arch\./, "the drifted skills are named, sorted");
  assert.match(r.text, /esk-init\.mjs --personal --yes --skills/, "the fix command is named");
  assert.deepEqual(r.nextState, { forVersion: "1.3.1+content:bootstrap,judge-arch", count: 1 });
});

test("content-only drift never offers the hook-only reconcile, which would drop the skills record and silence it", () => {
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: null, driftedSkills: ["a"] });
  assert.doesNotMatch(r.text, /esk-init\.mjs --yes /, "a reconcile without --skills does not fix a stale mirror");
  const v = decideNudge({ currentVersion: "1.4.0", installedVersion: "1.3.1", state: null });
  assert.match(v.text, /esk-init\.mjs --yes /, "a version gap still offers the hook reconcile");
});

test("a skipped content check (null) at the same version says nothing and KEEPS the counter", () => {
  const state = { forVersion: "1.3.1+content:a", count: 12 };
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state, driftedSkills: null });
  assert.equal(r.text, null);
  assert.deepEqual(r.nextState, state, "a scan that did not run must not reset the count as if in sync");
  const v = decideNudge({ currentVersion: "1.4.0", installedVersion: "1.3.1", state: null, driftedSkills: null });
  assert.match(v.text, /OUT OF DATE/, "a version gap still nudges when the content check was skipped");
});

test("a non-default mirror folder is named in the fix command, loud and quiet", () => {
  const loud = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: null, driftedSkills: ["a"], skillsTarget: "/opt/skills" });
  assert.match(loud.text, /--skills --skills-target "\/opt\/skills"/);
  const quiet = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: { forVersion: "1.3.1+content:a", count: NUDGE_CAP }, driftedSkills: ["a"], skillsTarget: "/opt/skills" });
  assert.match(quiet.text, /--skills-target "\/opt\/skills"/);
  const def = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: null, driftedSkills: ["a"] });
  assert.doesNotMatch(def.text, /--skills-target/, "the default folder needs no flag");
});

test("same version, no drifted skills: still in sync and the state clears", () => {
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: { forVersion: "1.3.1+content:x", count: 3 }, driftedSkills: [] });
  assert.equal(r.text, null);
  assert.equal(r.nextState, null);
});

test("a DIFFERENT drift set restarts the count; the same set keeps counting", () => {
  const same = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: { forVersion: "1.3.1+content:a", count: 4 }, driftedSkills: ["a"] });
  assert.equal(same.nextState.count, 5);
  const more = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: { forVersion: "1.3.1+content:a", count: 4 }, driftedSkills: ["a", "b"] });
  assert.equal(more.nextState.count, 1, "a later unversioned commit drifting another skill is a fresh target");
});

test("drift past the cap: quiet one-liner that still names the skills", () => {
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: { forVersion: "1.3.1+content:a", count: NUDGE_CAP }, driftedSkills: ["a"] });
  assert.doesNotMatch(r.text, /OUT OF DATE/);
  assert.match(r.text, /still stale at v1\.3\.1: a\./);
});

test("version behind AND drifted: the version line leads and the skills are listed", () => {
  const r = decideNudge({ currentVersion: "1.4.0", installedVersion: "1.3.1", state: null, driftedSkills: ["a"] });
  assert.match(r.text, /Installed v1\.3\.1, but the repo is v1\.4\.0/);
  assert.match(r.text, /Skills that changed or are missing: a\./);
  assert.deepEqual(r.nextState, { forVersion: "1.4.0", count: 1 }, "a version gap keys on the version alone");
});

test("a long drift list is capped so it cannot crowd out the directive", () => {
  const names = Array.from({ length: 25 }, (_, i) => `s${String(i).padStart(2, "0")}`);
  const r = decideNudge({ currentVersion: "1.3.1", installedVersion: "1.3.1", state: null, driftedSkills: names });
  assert.match(r.text, /s19, and 5 more\./);
  assert.doesNotMatch(r.text, /s20/);
});
