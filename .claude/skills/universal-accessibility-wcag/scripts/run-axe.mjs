#!/usr/bin/env node
/**
 * run-axe - SCAFFOLD: drive a real browser, run axe-core on each configured page, and write the
 * results JSON that check-axe-results.mjs then judges. This is the browser half of the accessibility
 * gate and, unlike the repo's other gates, it is NOT dependency-free and does NOT run in this repo's
 * own CI - it needs Playwright + @axe-core/playwright and a RUNNING instance of your app. Copy it into
 * an adopting repo, install the two devDependencies, point it at your pages, and wire the pair into CI:
 *
 *   npm i -D playwright @axe-core/playwright
 *   npx playwright install --with-deps chromium
 *   node run-axe.mjs --config axe-config.json --out axe-results.json
 *   node check-axe-results.mjs --results axe-results.json --config axe-config.json   # the gate verdict
 *
 * axe-config.json (shared with the verdict step):
 *   {
 *     "baseUrl": "http://localhost:3000",
 *     "pages": ["/", "/login", "/checkout"],         // or absolute URLs
 *     "wcagTags": ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"],
 *     "failOn": ["critical","serious"],
 *     "allowlist": [ { "rule": "color-contrast", "reason": "...", "sc": "1.4.3", "expires": "2026-12-31" } ]
 *   }
 *
 * The scaffold is intentionally thin and un-opinionated about how your app starts (compose it with
 * your existing e2e `webServer` config). It writes one axe run per page into an ARRAY, exactly the
 * shape check-axe-results.mjs consumes. The import is dynamic so this file parses even where Playwright
 * isn't installed (so it can live in the repo alongside the tested verdict script).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function die(msg) { console.error(`[run-axe] ${msg}`); process.exit(2); }

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const configPath = resolve(opt("--config", "axe-config.json"));
const outPath = resolve(opt("--out", "axe-results.json"));
if (!existsSync(configPath)) die(`config not found: ${configPath}`);
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const pages = cfg.pages || [];
if (!pages.length) die("config has no `pages` to scan");

let chromium, AxeBuilder;
try {
  ({ chromium } = await import("playwright"));
  AxeBuilder = (await import("@axe-core/playwright")).default;
} catch {
  die("Playwright + @axe-core/playwright are required. Install: npm i -D playwright @axe-core/playwright");
}

const tags = cfg.wcagTags || ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const browser = await chromium.launch();
const results = [];
try {
  for (const p of pages) {
    const url = /^https?:\/\//.test(p) ? p : (cfg.baseUrl || "") + p;
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
      results.push({ url, violations });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`[run-axe] wrote ${results.length} page result(s) to ${outPath}. Now run check-axe-results.mjs to get the gate verdict.`);
