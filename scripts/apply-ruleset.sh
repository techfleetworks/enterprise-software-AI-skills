#!/usr/bin/env bash
# apply-ruleset.sh — make the live repo's branch protection match the committed ruleset.
#
# Governance-as-code: .github/rulesets/main-protection.json is the single source of truth for how
# `main` is protected. This script applies it via the GitHub API so protection is reproducible and
# reviewable in a PR — never hand-clicked in the UI and silently forgotten. Idempotent: it updates
# the ruleset if one with the same name already exists, otherwise creates it.
#
#   scripts/apply-ruleset.sh [owner/repo]        # defaults to the current checkout's origin
#
# Requires: gh (authenticated with admin on the repo). No jq needed — uses gh's built-in --jq and node.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSON="$ROOT/.github/rulesets/main-protection.json"

[ -f "$JSON" ] || { echo "ruleset file not found: $JSON" >&2; exit 1; }
NAME="$(node -e "process.stdout.write(require(process.argv[1]).name)" "$JSON")"

# Find an existing ruleset with this name (an idempotent upsert keyed on the name).
ID="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$NAME\") | .id" | head -n1 || true)"

if [ -n "${ID:-}" ]; then
  echo "Updating ruleset '$NAME' (id $ID) on $REPO from $JSON …"
  gh api -X PUT "repos/$REPO/rulesets/$ID" --input "$JSON" >/dev/null
else
  echo "Creating ruleset '$NAME' on $REPO from $JSON …"
  gh api -X POST "repos/$REPO/rulesets" --input "$JSON" >/dev/null
fi

echo "Done — live protection on $REPO now matches $JSON."
echo "Verify: gh api repos/$REPO/rulesets --jq '.[].name'"
