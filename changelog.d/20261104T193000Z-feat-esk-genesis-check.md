### Added (bootstrap)

- `esk-genesis --check` is a read-only coverage/drift verdict for a consumer's enterprise gates (the gates'
  counterpart to `esk-init --check`). It computes the reconcile plan and exits `0` when the repo is covered and
  current, `1` when it is drifted or un-gated, `2` when it cannot be assessed (fail closed), and writes nothing
  even with `--yes`. Wire it into a consumer's CI so a repo that was never genesis'd, or that drifted after, is
  a red build rather than a silent gap; it is also the decision function the org-wide reconciliation bot
  branches on. Closes the committable half of #203 gap 2. ADR-0115 (bot design: ADR-0110).
