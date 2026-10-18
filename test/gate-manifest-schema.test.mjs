// Proves the gate-manifest contract (ADR-0041): the worked example validates against the committed
// JSON Schema, and representative malformed manifests are REJECTED — so the schema is a real,
// discriminating contract, not a decorative doc. Dependency-free: a compact validator interprets the
// subset of JSON Schema the manifest schema uses (type, required, additionalProperties, properties,
// pattern, enum, minItems, minLength, items, $ref/$defs). The full schema-validation GATE that reads
// this schema ships with the parity gate (bootstrap-v2 PR 1); this test proves the contract itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "design", "bootstrap-v2");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(resolve(DIR, "gate-manifest.schema.json"), "utf8"));
const example = JSON.parse(readFileSync(resolve(DIR, "gate-manifest.example.json"), "utf8"));
const rootManifest = JSON.parse(readFileSync(resolve(REPO, "gate-manifest.json"), "utf8"));

/** Validate `value` against a schema node. Returns an array of error strings ([] = valid). */
function validate(value, node, root, path = "$") {
  const errs = [];
  if (node.$ref) {
    const name = node.$ref.replace("#/$defs/", "");
    return validate(value, root.$defs[name], root, path);
  }
  // Fail closed on any schema keyword this validator does not implement, so a later schema tightening
  // (e.g. uniqueItems, const, oneOf, format) can never appear "tested" while silently unenforced.
  const HANDLED = new Set([
    "$schema", "$id", "title", "description", "$comment", "$defs", "$ref",
    "type", "properties", "required", "additionalProperties", "items", "enum", "pattern", "minLength", "minItems",
  ]);
  for (const k of Object.keys(node)) {
    if (!HANDLED.has(k)) errs.push(`${path}: validator does not implement schema keyword "${k}" (fail-closed)`);
  }
  const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
  if (node.type && typeOf(value) !== node.type) {
    errs.push(`${path}: expected ${node.type}, got ${typeOf(value)}`);
    return errs; // type mismatch: don't cascade
  }
  if (node.type === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) errs.push(`${path}: too short`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) errs.push(`${path}: fails pattern ${node.pattern}`);
    if (node.enum && !node.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  }
  if (node.type === "array") {
    if (node.minItems !== undefined && value.length < node.minItems) errs.push(`${path}: fewer than ${node.minItems} items`);
    if (node.items) value.forEach((v, i) => errs.push(...validate(v, node.items, root, `${path}[${i}]`)));
  }
  if (node.type === "object") {
    for (const req of node.required ?? []) {
      if (!(req in value)) errs.push(`${path}: missing required "${req}"`);
    }
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(node.properties && key in node.properties)) errs.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, sub] of Object.entries(node.properties ?? {})) {
      if (key in value) errs.push(...validate(value[key], sub, root, `${path}.${key}`));
    }
  }
  return errs;
}

test("the example manifest validates against the schema", () => {
  assert.deepEqual(validate(example, schema, schema), []);
});

test("the committed root gate-manifest.json validates against the schema", () => {
  assert.deepEqual(validate(rootManifest, schema, schema), []);
});

test("the schema accepts gate.invoke (string[]) and rejects a non-string element (ADR-0059)", () => {
  const withInvoke = structuredClone(example);
  withInvoke.gates[0].invoke = [".", "--changed-list", "a,b"];
  assert.deepEqual(validate(withInvoke, schema, schema), [], "an array-of-strings invoke must validate");
  const badElem = structuredClone(example);
  badElem.gates[0].invoke = ["ok", 1];
  assert.notEqual(validate(badElem, schema, schema).length, 0, "a non-string invoke element must be rejected");
  const badType = structuredClone(example);
  badType.gates[0].invoke = "nope";
  assert.notEqual(validate(badType, schema, schema).length, 0, "a non-array invoke must be rejected");
});

test("the schema accepts a machinery entry and discriminates a bad one", () => {
  const withMach = {
    version: "1.0.0",
    gates: [{ id: "x", skill: "s", script: "a.mjs", sha256: "a".repeat(64), test: "t.mjs", lane: "required" }],
    machinery: [{ id: "runner", skill: "s", script: "r.mjs", sha256: "b".repeat(64), test: "r.test.mjs" }],
    aggregator: { requiredCheck: "enterprise-gates" },
  };
  assert.deepEqual(validate(withMach, schema, schema), [], "a well-formed machinery entry is valid");
  const badHash = structuredClone(withMach);
  badHash.machinery[0].sha256 = "nothex";
  assert.ok(validate(badHash, schema, schema).length, "machinery with a bad sha256 must fail");
  const extraProp = structuredClone(withMach);
  extraProp.machinery[0].lane = "required";
  assert.ok(validate(extraProp, schema, schema).length, "an unexpected property on machinery must fail");
  const noScript = structuredClone(withMach);
  delete noScript.machinery[0].script;
  assert.ok(validate(noScript, schema, schema).length, "machinery missing script must fail");
  const noSkill = structuredClone(withMach);
  delete noSkill.machinery[0].skill;
  assert.ok(validate(noSkill, schema, schema).length, "machinery missing skill must fail (the integrity gate needs it to resolve the source)");
});

test("the validator itself discriminates: known-bad manifests are rejected", () => {
  const bad = (mutate) => {
    const m = structuredClone(example);
    mutate(m);
    return validate(m, schema, schema);
  };
  assert.ok(bad((m) => delete m.version).length, "missing version must fail");
  assert.ok(bad((m) => (m.version = "1.0")).length, "non-semver version must fail");
  assert.ok(bad((m) => (m.gates = [])).length, "empty gates must fail (minItems)");
  assert.ok(bad((m) => delete m.gates[0].sha256).length, "gate missing sha256 must fail");
  assert.ok(bad((m) => (m.gates[0].sha256 = "nothex")).length, "bad sha256 must fail pattern");
  assert.ok(bad((m) => (m.gates[0].lane = "blocking")).length, "lane outside enum must fail");
  assert.ok(bad((m) => (m.gates[0].script = "x.py")).length, "unsupported script extension must fail");
  assert.ok(bad((m) => (m.gates[0].id = "Not_Kebab")).length, "non-kebab id must fail");
  assert.ok(bad((m) => delete m.aggregator.requiredCheck).length, "missing requiredCheck must fail");
  assert.ok(bad((m) => (m.extra = true)).length, "unexpected top-level property must fail");
  // nested additionalProperties:false, minLength, and item typing are enforced too
  assert.ok(bad((m) => (m.gates[0].foo = 1)).length, "unexpected property on a gate must fail");
  assert.ok(bad((m) => (m.aggregator.requiredCheck = "")).length, "empty requiredCheck must fail (minLength)");
  assert.ok(bad((m) => (m.gates[1].couples = [123])).length, "non-string couples item must fail");
  assert.ok(bad((m) => (m.gates[0].origin = "sideloaded")).length, "origin outside enum must fail");
});

test("the validator does not false-positive: a minimally valid manifest passes", () => {
  const minimal = {
    version: "2.3.4",
    gates: [{ id: "x", skill: "s", script: "a.mjs", sha256: "a".repeat(64), test: "t.mjs", lane: "advisory" }],
    aggregator: { requiredCheck: "gate" },
  };
  assert.deepEqual(validate(minimal, schema, schema), []);
});

test("a repo-local gate without a skill is valid (skill is optional for adopted guards)", () => {
  const repoLocal = {
    version: "1.0.0",
    gates: [
      {
        id: "legacy-guard",
        origin: "repo-local",
        script: "scripts/ci/check-legacy.mjs",
        sha256: "b".repeat(64),
        test: "test/legacy.test.mjs",
        lane: "required",
      },
    ],
    aggregator: { requiredCheck: "gate" },
  };
  assert.deepEqual(validate(repoLocal, schema, schema), []);
});
