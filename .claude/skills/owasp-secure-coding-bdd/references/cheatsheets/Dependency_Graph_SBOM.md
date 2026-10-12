# Dependency Graph and SBOM

## What it is

How to know exactly what components ship inside a release and how they connect, so you can find a
vulnerable part fast when a new advisory lands. A software bill of materials (SBOM) is the
inventory of components; a dependency graph is the record of how those components pull in one
another. This is the per-sheet guidance from the OWASP Dependency Graph and SBOM Cheat Sheet,
condensed to the controls that hold and the attack they stop.

## The attack it stops

When nobody has a reliable list of what a build actually contains, a flaw in a buried transitive
library can sit in production for weeks after it becomes public, because the team cannot answer
"do we even use that?" An attacker who tracks fresh advisories moves faster than a team that has
to grep source trees by hand. Worse, a forged or sloppy inventory can hide the affected part
entirely, so a "clean" scan is meaningless. A trustworthy, signed inventory bound to the real
artifact is what lets you locate the weak component and prove the fix shipped.

## Controls

In the cheat sheet's order:
1. **Capture components and their relationships.** Record the inventory in a standard
   machine-readable format such as `CycloneDX`. For each component, store its name, version,
   supplier, package identifier, and a hash when you can get one. Capture both direct components
   and the transitive ones that other components drag in. Add document metadata too: the product
   being described, who authored the SBOM, when it was produced, and which tool and version made
   it. Where coverage is partial or unknown, say so plainly; a part missing from the list does
   not mean it is missing from the software.
2. **Generate one inventory per release, automatically.** Produce the SBOM after dependency
   resolution runs, then compare it to the built artifact (the package or container image). Pull in the
   libraries and OS packages that ship inside it, since a manifest on its own can misstate what really
   ships. Note the scope you covered and any gaps. Validate the file against its format schema
   before you publish or import it, and separately confirm the metadata and relationships are
   present. Passing those checks proves the document is well-formed, not that the inventory is
   complete. Keep every release's inventory separate from the others.
3. **Bind the inventory to the real artifact and verify it.** Tie the SBOM to the final
   artifact's cryptographic digest with a signed attestation, which is a signed statement naming
   both the artifact and its SBOM. Signing the two files on their own does not establish that
   they belong together. Treat the SBOM attestation (what is inside) as separate from build
   provenance (how it was built). Before you install or deploy, verify the evidence the way
   `SLSA` describes: check the signatures, the allowed signer identities, the artifact digest,
   and the attestation type you expect; for provenance, also check the builder identity, source
   repository, build type, and parameters. Reject evidence that is missing, invalid, or not what
   your policy expects. Remember that a valid signature proves who made a claim and that it was
   not altered; it does not prove the inventory is accurate or the software is safe. Keep the
   original SBOMs and signed evidence with each release even after importing them elsewhere,
   restrict who can write to them, and limit who sees sensitive metadata.
4. **Drive vulnerability response from the inventory.** Map each release's SBOM to the systems
   where it runs, and re-check components whenever new advisories appear. Rank findings by how
   exploitable, exposed, and impactful they are rather than by how deep in the tree they sit, and
   use the graph to trace which parent dependency pulled in the affected part. For a VEX document
   that claims a flaw does not affect your product, first authenticate who issued it, confirm the
   file is intact, and weigh its reasoning against your exact version and deployment before you
   trust it. After you rebuild, diff the new SBOM against the previous one and refresh the
   deployment mappings. A newer inventory on its own does not prove the flaw is gone or the fix
   works.

## @security scenario

```gherkin
@security @owasp:sbom @usecase:locate-vulnerable-component
Scenario: A new advisory is traced to the exact affected release through the SBOM
  Given each release ships a schema-valid SBOM bound to the artifact digest by a signed attestation
  When an advisory is published for a transitive library
  Then the signed attestation verifies against the deployed artifact before the inventory is trusted
  And the dependency graph names the parent component and the releases that contain the affected version
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

The thing that actually lets you respond is a complete, signed inventory bound to the real
artifact: it turns "which releases contain this library?" into a lookup instead of a hunt, and
the attestation proves the inventory describes the thing you deployed. The `@security` scenario
proves one advisory is traced and one attestation verifies; the signed, artifact-bound SBOM and
its graph are what make every future advisory traceable. A test is a check; the verified inventory
is the guarantee.

## Sources

- OWASP Dependency Graph and SBOM Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Dependency_Graph_SBOM_Cheat_Sheet.html>, retrieved 2026-10-11): capturing components and relationships, per-release generation and schema validation, binding and verifying signed release evidence, and using the inventory and VEX for vulnerability response. `[documented]`
