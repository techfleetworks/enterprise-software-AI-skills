#!/usr/bin/env bash
# apply-ruleset.sh: make the live repo's branch protection match the committed ruleset(s).
#
# Governance-as-code: the JSON files under .github/rulesets/ are the single source of truth for how the
# default branch is protected. This script applies EVERY one of them via the GitHub API so protection is
# reproducible and reviewable in a PR, never hand-clicked in the UI and silently forgotten. Idempotent:
# it updates a ruleset if one with the same name already exists, otherwise creates it. On success it
# writes .github/.esk-enforcement-applied (commit it) so the always-on enforcement nudge (ADR-0066)
# knows enforcement was wired and stops asking.
#
#   scripts/apply-ruleset.sh [owner/repo]        # defaults to the current checkout's origin
#
# Requires: gh (authenticated with admin on the repo). No jq needed; uses gh's built-in --jq and node.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULESETS_DIR="$ROOT/.github/rulesets"

[ -d "$RULESETS_DIR" ] || { echo "no rulesets directory: $RULESETS_DIR" >&2; exit 1; }
shopt -s nullglob
FILES=("$RULESETS_DIR"/*.json)
[ "${#FILES[@]}" -gt 0 ] || { echo "no ruleset .json files in $RULESETS_DIR" >&2; exit 1; }

APPLIED_NAMES=()
for JSON in "${FILES[@]}"; do
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
  APPLIED_NAMES+=("$NAME")
done

# Record that enforcement was applied (the always-on nudge clears on this + a ruleset that requires the
# check). This is an intent+action record, not a live-state guarantee; GitHub can still be changed later.
MARKER="$ROOT/.github/.esk-enforcement-applied"
NAMES_CSV="$(IFS=,; echo "${APPLIED_NAMES[*]}")"
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({appliedAt:new Date().toISOString(),repo:process.argv[2],rulesets:process.argv[3].split(',')},null,2)+'\n')" "$MARKER" "$REPO" "$NAMES_CSV"

echo "Done. Live protection on $REPO now matches ${#FILES[@]} committed ruleset(s)."
echo "Wrote $MARKER (commit it so the enforcement nudge knows enforcement is wired)."
echo "Verify: gh api repos/$REPO/rulesets --jq '.[].name'"
