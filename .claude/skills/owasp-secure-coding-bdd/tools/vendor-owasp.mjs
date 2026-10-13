#!/usr/bin/env node
// vendor-owasp.mjs - fetch the EXACT upstream OWASP text from source, on demand.
//
// Why this exists: the OWASP Cheat Sheet Series and the OWASP Top 10 for LLM Applications are licensed
// CC-BY-SA-4.0; this repo's own code is MIT. You may use and redistribute OWASP's text WITH attribution and
// ShareAlike, but you may NOT relicense it as MIT by pasting it into our skill files. So the exact verbatim
// text is not committed here. Instead, this tool fetches it from the official upstream repositories into
// .claude/skills/owasp-secure-coding-bdd/vendor/ (gitignored), which is a clean "aggregation": the CC-BY-SA text sits in its
// own directory with its upstream LICENSE and our NOTICE, separate from the MIT-licensed skill files.
//
// Run: `npm run vendor:owasp` (or `node .claude/skills/owasp-secure-coding-bdd/tools/vendor-owasp.mjs`). It is NOT a gate
// script (it lives in tools/, not scripts/) because it makes outbound calls on purpose. It only reads from the
// network and writes under .claude/skills/owasp-secure-coding-bdd/vendor/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(SKILL_DIR, "vendor");
const CS_OUT = path.join(OUT, "cheatsheets-src");
const MANIFEST = path.join(SKILL_DIR, "references", "cheatsheets-manifest.json");

const CS_RAW = "https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master";
const LLM_RAW = "https://raw.githubusercontent.com/OWASP/www-project-top-10-for-large-language-model-applications/main";

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  return await res.text();
}

async function main() {
  fs.mkdirSync(CS_OUT, { recursive: true });

  // 1. The upstream LICENSE (CC-BY-SA-4.0) must travel with the vendored text.
  const license = (await get(`${CS_RAW}/LICENSE.md`)) || (await get(`${CS_RAW}/LICENSE`));
  if (license) fs.writeFileSync(path.join(OUT, "LICENSE-CheatSheetSeries.md"), license);
  else console.error("WARNING: could not fetch the CheatSheetSeries LICENSE; do not redistribute without it.");

  // 2. One source markdown file per cheat sheet, by the manifest's slugs.
  // WEBSITE_ONLY: do NOT fetch the GitHub raw .md for these; source them from the rendered website instead.
  // XSS Filter Evasion is a catalog of XSS payloads that heuristic antivirus engines flag as malicious HTML (a
  // false positive), so saving its raw file locally trips the scanner. Its per-sheet guidance is written from
  // the rendered page (https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html) in
  // concept, without reproducing the payloads.
  const WEBSITE_ONLY = new Set(["XSS_Filter_Evasion"]);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  let ok = 0;
  const missed = [];
  const websiteOnly = [];
  for (const s of manifest.sheets) {
    if (WEBSITE_ONLY.has(s.slug)) { websiteOnly.push(s.slug); continue; }
    const name = `${s.slug}_Cheat_Sheet.md`;
    const md = await get(`${CS_RAW}/cheatsheets/${name}`);
    if (md == null) { missed.push(s.slug); continue; }
    fs.writeFileSync(path.join(CS_OUT, name), md);
    ok++;
  }
  console.log(`CheatSheetSeries: vendored ${ok}/${manifest.sheets.length} sheets into ${path.relative(SKILL_DIR, CS_OUT)}`);
  if (websiteOnly.length) console.log(`  (sourced from the website, not vendored: ${websiteOnly.join(", ")}; see the comment in this tool)`);
  if (missed.length) console.error(`  (${missed.length} slug(s) had no upstream match, check names: ${missed.slice(0, 10).join(", ")}${missed.length > 10 ? " ..." : ""})`);

  // 3. The LLM / GenAI project's top-level docs (its full Top 10 content is also published at genai.owasp.org).
  const llmOut = path.join(OUT, "llm-top10-src");
  fs.mkdirSync(llmOut, { recursive: true });
  const llmLicense = (await get(`${LLM_RAW}/LICENSE.md`)) || (await get(`${LLM_RAW}/LICENSE`)) || (await get(`${LLM_RAW}/LICENSE.txt`));
  if (llmLicense) fs.writeFileSync(path.join(OUT, "LICENSE-LLM-Top10.md"), llmLicense);
  const llmReadme = (await get(`${LLM_RAW}/README.md`)) || (await get(`${LLM_RAW}/index.md`));
  if (llmReadme) { fs.writeFileSync(path.join(llmOut, "README.md"), llmReadme); console.log("LLM Top 10: vendored README (full content: https://genai.owasp.org/llm-top-10/)"); }
  else console.error("WARNING: could not fetch the LLM Top 10 README; cite https://genai.owasp.org/llm-top-10/ directly.");

  console.log("\nDone. .claude/skills/owasp-secure-coding-bdd/vendor/ holds CC-BY-SA-4.0 content; see its NOTICE.md for attribution.");
}

main().catch((e) => { console.error("vendor-owasp failed:", e.message); process.exit(1); });
