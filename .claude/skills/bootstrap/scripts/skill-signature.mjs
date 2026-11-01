#!/usr/bin/env node
/**
 * skill-signature.mjs: the ONE owner of the skill-mirror content fingerprint and of the "which mirrored skills
 * no longer match the repo" rule (ADR-0105). The installer (the sibling esk-init.mjs) records these signatures
 * when it mirrors the skills and checks them in `--check`; the SessionStart emitter (always-on/emit-directive.mjs)
 * reads the same rule so a session rooted outside the repo is told when its global mirror is stale even though
 * the version string did not move. Both import this file, so the two can never disagree about what "changed"
 * means. It lives beside the installer because the installer owns the mirror and the marker, and so it travels
 * with every copy of the bootstrap skill (esk-init imports it as a sibling, wherever that copy runs from).
 *
 * No process exit, no logging: a read error THROWS, and each caller decides what that means (the installer
 * fails closed, the emitter says nothing).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Folders the mirror never copies (the gitignored OWASP vendor text, node_modules, .git), so they never move a
// signature either.
export const SKILL_MIRROR_SKIP = new Set(["vendor", "node_modules", ".git"]);

// A sha256 over the sorted (relative-path, file-hash) pairs of every file under `root`, minus SKILL_MIRROR_SKIP.
// Paths are joined with "/" so the digest is the same on every OS, and an untouched mirror of a source hashes to
// the SAME value as that source. THROWS on a read error.
export function signatureOf(root, label) {
  const parts = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch (e) { throw new Error(`cannot read ${dir} while fingerprinting ${label} (${e.message})`); }
    for (const e of entries.filter((x) => !SKILL_MIRROR_SKIP.has(x.name)).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(abs, r); continue; }
      if (!e.isFile()) continue; // symlinks and specials: the mirror copies them, but they carry no content to fingerprint here
      let buf;
      try { buf = readFileSync(abs); }
      catch (err) { throw new Error(`cannot read ${abs} while fingerprinting ${label} (${err.message})`); }
      parts.push(`${r}\0${createHash("sha256").update(buf).digest("hex")}`);
    }
  };
  walk(root, "");
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

// Which of `names` (source skills under sourceDir) the mirror at targetDir does not match:
//   missing  no SKILL.md at the target (never mirrored, or removed).
//   changed  present at the target, but the source's signature now differs from the one recorded at mirror time
//            (`recorded`, keyed by name). A name with no recorded signature (a marker written before signatures
//            were tracked) reads as changed, so the next reconcile records the baseline.
// `sign(name)` returns the source signature; it defaults to signatureOf over sourceDir/name, and the installer
// passes its own memoized, fail-closed version. THROWS on a read error.
export function mirrorDrift({ sourceDir, targetDir, names, recorded, sign }) {
  const sig = sign || ((n) => signatureOf(join(sourceDir, n), `skill ${n}`));
  const stored = recorded || {};
  const missing = names.filter((n) => !existsSync(join(targetDir, n, "SKILL.md")));
  const changed = names.filter((n) => !missing.includes(n) && stored[n] !== sig(n));
  return { missing, changed };
}

// The source skill names: folders under sourceDir that hold a SKILL.md, sorted. THROWS if sourceDir cannot be read
// (so a read error is never mistaken for "the repo has no skills"); returns [] only when sourceDir does not exist.
export function skillNamesIn(sourceDir) {
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(sourceDir, e.name, "SKILL.md")))
    .map((e) => e.name).sort();
}
