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
