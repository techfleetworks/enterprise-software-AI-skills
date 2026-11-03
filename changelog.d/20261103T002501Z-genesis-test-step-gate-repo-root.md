### Fixed (esk-genesis)

The generated `enterprise-gates.yml` now sets `GATE_REPO_ROOT` on the gate discrimination-test step, not
just the gate-run step (ADR-0112). Without it, a gate spawned by its test with no `--root` (the
`reference-links` real-repository case) fell back to its upstream four-levels-up root default and scanned
the runner's `_actions/` cache, failing CI in consumers. Consumers previously hand-patched this after every
genesis; the fix now ships in the template. A new discrimination test (`GENESIS ADR-0112`) asserts the env
is set on that step and is mutation-proven.
