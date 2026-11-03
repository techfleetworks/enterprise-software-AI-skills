### Fixed (esk-genesis)

`esk-genesis` now carries each upstream gate's `testSha256` through to the generated consumer
`gate-manifest.json` (ADR-0111). Previously the projection copied the code `sha256` but dropped
`testSha256`, so a repo genesis'd with v1.3.2 failed its own `manifest-provenance` gate on every gate
(`testSha256 undefined != published ...`). The vendored test files were authentic; only the manifest
field was missing. A new discrimination test (`GENESIS ADR-0111`) asserts the passthrough and is
mutation-proven to fail when it is reverted.
