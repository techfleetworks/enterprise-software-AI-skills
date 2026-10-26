// Guards the #129 (ADR-0090) fix: every text file - and especially the vendored skills under .claude/skills -
// must check out with LF on every platform, so a Windows checkout no longer produces CRLF that a vendoring
// consumer then commits. The fix is `* text=auto eol=lf` in .gitattributes. This test asks git itself what the
// `eol` attribute resolves to for representative files (a SKILL.md, two gate/installer scripts, a JSON, a
// top-level doc, the directive); each must be `lf`. Discriminating: drop `eol=lf` and git reports `unspecified`
// (native, i.e. CRLF on Windows), failing these. Pure node + git check-attr; no bash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitOK = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const opts = { skip: gitOK ? false : "git unavailable here (CI/ubuntu runs it)" };

function eolAttr(file) {
  const r = spawnSync("git", ["-C", REPO, "check-attr", "eol", "--", file], { encoding: "utf8" });
  const m = (r.stdout || "").match(/: eol: (\S+)/); // "<file>: eol: <value>"
  return m ? m[1] : null;
}

const SAMPLES = [
  ".claude/skills/judge-arch/SKILL.md",
  ".claude/skills/judge-arch/scripts/run-manifest-gates.mjs",
  ".claude/skills/bootstrap/scripts/esk-genesis.mjs",
  "gate-manifest.json",
  "README.md",
  "always-on/enterprise-skills-always-on.md",
];

for (const f of SAMPLES) {
  test(`line endings: ${f} checks out as LF (git resolves eol=lf)`, opts, () => {
    assert.equal(eolAttr(f), "lf",
      `${f} must resolve to eol=lf so a Windows checkout gets LF, not CRLF (#129). If this fails, .gitattributes lost its "* text=auto eol=lf" rule.`);
  });
}
