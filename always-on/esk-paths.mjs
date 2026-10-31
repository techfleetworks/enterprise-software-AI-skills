// esk-paths - the activation layer for the enterprise-skills enforcement hooks (issue #174 PR-B).
//
// The enforcement hooks (edit-gate, finish-check) read per-session, per-task state (a selection record, a task
// record, a receipt, a block counter). PR-A left HOW those paths get set per session to the installer. This module
// is that resolution: a single, static install turns enforcement on with one portable flag (ESK_ENFORCE=1), and
// every hook derives the SAME per-session paths from a base dir plus the session_id in its payload. No
// machine-specific absolute path has to be committed, so a project settings.json stays portable.
//
// Layout (matches ADR-0097's receipt store at <base>/receipts/<session_id>.jsonl):
//   <base>/records/<session_id>.json     the finish-check task record
//   <base>/selections/<session_id>.json  the edit-gate selection record
//   <base>/load-state/<session_id>.json  the edit-gate load-state
//   <base>/plans/<session_id>.json       the step-3 planning records
//   <base>/receipts/<session_id>.jsonl   the per-task receipt (task-receipt.mjs)
//   <base>/blocks/<session_id>.json      the finish-check loop counter
//   <base>/waivers/<session_id>.json     operator waivers (operator-written; see finish-check-records.md)
//
// base = ESK_HOME (if set) else ~/.claude/esk. A specific full-path env (ESK_TASK_RECORD, ESK_SELECTION, ...)
// still wins when set, so tests and bespoke installs keep working unchanged.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/; // a session id must be a plain name: no separators, no traversal
export function isSafeSession(id) { return typeof id === "string" && SAFE_NAME.test(id) && id !== "." && id !== ".."; }

// Enforcement is ON when the installer set the portable flag. A specific path env also counts as on, so an
// explicit --settings/-wired install (or a test) still enforces without the flag.
export function enforcementOn() { return process.env.ESK_ENFORCE === "1"; }

// The base store dir, outside any work tree so a cleaned Temp or a removed worktree cannot lose it.
export function baseDir() { return process.env.ESK_HOME ? resolve(process.env.ESK_HOME) : join(homedir(), ".claude", "esk"); }

// The per-session paths. Throws on an unsafe session id so a bad id can never escape the base dir.
export function sessionPaths(sessionId) {
  if (!isSafeSession(sessionId)) throw new Error(`unsafe or missing session id (${JSON.stringify(sessionId)}); refusing to derive a path from it.`);
  const b = baseDir();
  return {
    record: join(b, "records", `${sessionId}.json`),
    selection: join(b, "selections", `${sessionId}.json`),
    loaded: join(b, "load-state", `${sessionId}.json`),
    plans: join(b, "plans", `${sessionId}.json`),
    receipt: join(b, "receipts", `${sessionId}.jsonl`),
    blocks: join(b, "blocks", `${sessionId}.json`),
    waivers: join(b, "waivers", `${sessionId}.json`),
    subagents: join(b, "subagents", `${sessionId}.jsonl`), // the subagent ledger (issue #176): one line per subagent hand-back
  };
}

// Resolve ONE path for a hook: the explicit env wins; else, when enforcement is on and we have a safe session id,
// derive it from the base; else null (not wired -> the hook is a no-op). `kind` is a key of sessionPaths().
export function resolvePath(kind, envName, sessionId) {
  if (process.env[envName]) return resolve(process.env[envName]);
  if (!enforcementOn()) return null;
  if (!isSafeSession(sessionId)) return null;
  return sessionPaths(sessionId)[kind] || null;
}
