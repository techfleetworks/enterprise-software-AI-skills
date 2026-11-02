### Added

- Design and decision record for the org-wide **genesis bot** that closes gap 2 (a repo that never ran
  `esk-genesis` still has no gates). ADR-0110 (`docs/adr/0110-org-wide-genesis-bot-closes-gap-2.md`, status
  proposed) and the full design (`docs/design/genesis-bot/README.md`) describe a scheduled reconciliation
  loop: a GitHub App for least-privilege, revocable identity plus a daily GitHub Actions workflow in a
  central governance repo, driving the existing `esk-genesis` installer across every repo in the org and
  opening a pull request for each uncovered or drifted one. It is a driver, not a rebuild, so there stays
  one owner of how a repo gets gated. The honest limits are stated: no bot code ships here (the bot is an
  org actor that must live in a governance repo and be granted org permission by a human once), private
  repos on the free plan get advisory gates only, the bot never self-merges and never passes
  `--adopt-existing`, and the one code dependency (`esk-genesis --check`, a read-only covered/drifted
  predicate) is specified but not yet built. The README gains a "Making Every Repo Covered Automatically"
  section explaining it, labeled designed-not-shipped.
- A "Where this skill's scripts run" pointer in each of the ten skills whose scripts were classified in
  ADR-0109, pointing at `gate-manifest.json` and ADR-0109 as the single source of truth for install scope
  rather than restating per-script scopes (which would drift).
