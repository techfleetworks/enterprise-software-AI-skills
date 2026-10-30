// routing-lib - map changed/edited file paths to the skills the edit-gate requires for a task (issue #175).
//
// The edit-gate (and the selection validator) ask: "given the files this task touches, which skills must apply?"
// This loads the versioned routing map (always-on/routing-rules.config.json by default) and answers that, so a
// skill the router requires cannot be marked not-applicable without an operator waiver.
//
// Dependency-free, offline. Pure over an in-memory config plus a file read for the default map.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = join(here, "routing-rules.config.json");

// Glob -> RegExp. ** spans directories; * and ? do not cross '/'. Same semantics as the routing/receipt gates.
export function globToRe(glob) {
  const g = String(glob).split("\\").join("/");
  let re = "^";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") { i++; if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*"; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}

// Load + validate a routing config. Throws on a malformed config so a caller can fail closed (never silently
// treat a broken map as "nothing is required").
export function loadRoutingConfig(path = DEFAULT_CONFIG_PATH) {
  let cfg;
  try { cfg = JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { throw new Error(`cannot read routing config ${path}: ${e.message}`); }
  if (!cfg || typeof cfg !== "object" || !Array.isArray(cfg.rules)) throw new Error(`routing config must be an object with a rules array: ${path}`);
  for (const r of cfg.rules) {
    if (!r || !r.id || !Array.isArray(r.when) || r.when.length === 0 || !Array.isArray(r.requires) || r.requires.length === 0) {
      throw new Error(`a routing rule needs an id and non-empty when[] and requires[]: ${JSON.stringify(r).slice(0, 120)}`);
    }
  }
  return cfg;
}

// The rules that fire for a set of paths, each with the skills it requires. Paths are normalized to forward
// slashes. Returns [{ id, path, requires }] (one entry per fired rule, naming a path that triggered it).
export function firedRules(paths, cfg) {
  const norm = (p) => String(p).split("\\").join("/");
  const files = (paths || []).map(norm);
  const compiled = cfg.rules.map((r) => ({ id: r.id, requires: r.requires, res: r.when.map(globToRe) }));
  const fired = [];
  for (const rule of compiled) {
    const hit = files.find((f) => rule.res.some((re) => re.test(f)));
    if (hit !== undefined) fired.push({ id: rule.id, path: hit, requires: rule.requires });
  }
  return fired;
}

// The union of skills the router requires for a set of paths, as a sorted array.
export function requiredSkillsForPaths(paths, cfg) {
  const set = new Set();
  for (const rule of firedRules(paths, cfg)) for (const s of rule.requires) set.add(s);
  return [...set].sort();
}
