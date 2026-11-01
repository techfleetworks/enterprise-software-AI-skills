// Step definitions for features/always-on/stale-mirror-nudge.feature (ADR-0104).
//
// Every scenario drives the REAL always-on/emit-directive.mjs as a SessionStart hook against a sandboxed repo
// (a copy of the emitter, its nudge modules, and the bootstrap skill's skill-signature.mjs, plus two stub
// skills) and a sandboxed home (the install marker and the global mirror), so the behavior is executed, not
// narrated. Removing the signature comparison (or not passing the drifted names to the nudge) flips the
// "is told / is named" assertions.
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { signatureOf } from "../../.claude/skills/bootstrap/scripts/skill-signature.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIG_REL = join(".claude", "skills", "bootstrap", "scripts", "skill-signature.mjs");
const SKILLS = ["alpha", "beta"];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "esk104-repo-"));
  mkdirSync(join(root, "always-on"), { recursive: true });
  for (const f of ["emit-directive.mjs", "sync-nudge.mjs", "enforcement-nudge.mjs"]) {
    copyFileSync(join(REPO, "always-on", f), join(root, "always-on", f));
  }
  writeFileSync(join(root, "always-on", "enterprise-skills-always-on.md"), "Enterprise engineering skills, always on.\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fake", version: "1.3.1" }) + "\n");
  mkdirSync(join(root, SIG_REL, ".."), { recursive: true });
  copyFileSync(join(REPO, SIG_REL), join(root, SIG_REL));
  const home = mkdtempSync(join(tmpdir(), "esk104-home-"));
  const target = join(home, ".claude", "skills");
  for (const n of SKILLS) {
    const src = join(root, ".claude", "skills", n);
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "SKILL.md"), `# ${n}\nsource body\n`);
    cpSync(src, join(target, n), { recursive: true });
  }
  return { root, home, target };
}
function writeMarker(world) {
  const signatures = {};
  for (const n of SKILLS) signatures[n] = signatureOf(join(world.root, ".claude", "skills", n), n);
  world.marker = {
    version: "1.3.1", repo: world.root, settings: "x", form: "exec",
    skills: { target: world.target, names: SKILLS, version: "1.3.1", signatures },
  };
  world.saveMarker = () => writeFileSync(join(world.home, ".claude", ".esk-installed"), JSON.stringify(world.marker) + "\n");
  world.saveMarker();
}

export default function ({ Given, When, Then, And }) {
  Given(/^the skills were mirrored globally by the installer at the repo's current version$/, (world) => {
    Object.assign(world, sandbox());
    writeMarker(world);
  });

  Given(/^the repo changed one mirrored skill without a version bump$/, (world) => {
    writeFileSync(join(world.root, ".claude", "skills", "beta", "SKILL.md"), "# beta\nchanged after the mirror\n");
    world.expectNamed = "beta";
  });
  Given(/^one skill is missing from the global mirror$/, (world) => {
    rmSync(join(world.target, "alpha"), { recursive: true, force: true });
    world.expectNamed = "alpha";
  });
  Given(/^every mirrored skill matches the repo$/, () => { /* the Background mirror is already current */ });
  And(/^the drift check module cannot be loaded$/, (world) => {
    rmSync(join(world.root, SIG_REL));
  });
  And(/^the install record names a different clone$/, (world) => {
    world.marker.repo = join(tmpdir(), "some-other-clone");
    world.saveMarker();
  });

  When(/^a new session starts outside the repo$/, (world) => {
    const env = { ...process.env, USERPROFILE: world.home, HOME: world.home, ESK_NUDGE_DISABLE: "" };
    const r = spawnSync(process.execPath, [join(world.root, "always-on", "emit-directive.mjs"), "SessionStart"], { encoding: "utf8", env });
    world.status = r.status;
    // No catch: hook output that is not the expected JSON must fail the step, not read as "no sync message".
    world.ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.equal(typeof world.ctx, "string");
  });

  Then(/^the session is told the skills are out of date$/, (world) => {
    assert.equal(world.status, 0);
    assert.match(world.ctx, /OUT OF DATE/);
  });
  And(/^only the (?:changed|missing) skill is named$/, (world) => {
    assert.match(world.ctx, new RegExp(`STALE: ${world.expectNamed}\\.`));
  });
  And(/^the command that re-mirrors the skills is named$/, (world) => {
    assert.match(world.ctx, /esk-init\.mjs --personal --yes --skills/);
  });
  Then(/^the session is not told to sync$/, (world) => {
    assert.equal(world.status, 0);
    assert.doesNotMatch(world.ctx, /OUT OF DATE/);
  });
  And(/^the session still gets the always-on directive$/, (world) => {
    assert.match(world.ctx, /Enterprise engineering skills, always on/);
  });
}
