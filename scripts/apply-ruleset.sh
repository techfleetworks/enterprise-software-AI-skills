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
#
# Plan note (ADR-0084): applying a repository ruleset to a PRIVATE repository needs a plan that includes
# repository rulesets (for example GitHub Pro, Team, or Enterprise). On a plan that does not, the GitHub API
# refuses with HTTP 403 ("Upgrade to GitHub Pro or make this repository public"). This script turns that
# refusal into an actionable explanation instead of aborting on gh's raw error, and it does not swallow a
# failed lookup. The gates still run in CI on every PR either way; only the merge-blocking enforcement waits
# until a ruleset (or equivalent protection) requires the check.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULESETS_DIR="$ROOT/.github/rulesets"

[ -d "$RULESETS_DIR" ] || { echo "no rulesets directory: $RULESETS_DIR" >&2; exit 1; }
shopt -s nullglob
FILES=("$RULESETS_DIR"/*.json)
[ "${#FILES[@]}" -gt 0 ] || { echo "no ruleset .json files in $RULESETS_DIR" >&2; exit 1; }

# A ruleset read or write that GitHub refuses (most often a plan 403 on a private repo) is REPORTED with the
# options, not left to abort the script with an unexplained error. This handler cannot recover or retry the
# refusal, so it reports it clearly and exits non-zero. "$1" is the operation, "$2" the captured gh output.
explain_ruleset_failure() {
  local op="$1" err="$2"
  echo "ERROR: could not $op a ruleset on $REPO." >&2
  if printf '%s' "$err" | grep -qiE '403|upgrade to github pro|make this repository public|not available on your plan'; then
    cat >&2 <<EOF

GitHub refused the request. Applying a repository ruleset needs admin on the repo, and on a PRIVATE repository
it needs a plan that includes repository rulesets (for example GitHub Pro, Team, or Enterprise).
What GitHub returned:
$(printf '%s' "$err" | sed 's/^/  /')

Your options:
  - Upgrade the repository's plan so it includes rulesets
    (plans: https://docs.github.com/en/get-started/learning-about-github/githubs-plans), or
  - Make the repository public (repository rulesets are available on public repositories on every plan), or
  - Require the "enterprise-gates" check another way your plan allows (for example classic branch protection).

The committed ruleset JSON stays in .github/rulesets/; re-run this script once your plan allows rulesets. The
gates still run in CI on every PR; only the merge-blocking enforcement is not wired until a ruleset (or
equivalent protection) requires the "enterprise-gates" check.
EOF
  else
    printf '%s\n' "$err" | sed 's/^/  /' >&2
  fi
  exit 1
}

APPLIED_NAMES=()
for JSON in "${FILES[@]}"; do
  NAME="$(node -e "process.stdout.write(require(process.argv[1]).name)" "$JSON")"
  # Find an existing ruleset with this name (an idempotent upsert keyed on the name). A failed LOOKUP is an
  # API error (for example a plan 403), not "none found", so distinguish the two instead of swallowing both
  # with `|| true` and marching on to the create call (issue #152).
  if ! LOOKUP="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$NAME\") | .id" 2>&1)"; then
    explain_ruleset_failure "look up" "$LOOKUP"
  fi
  ID="$(printf '%s' "$LOOKUP" | head -n1)"
  if [ -n "${ID:-}" ]; then
    echo "Updating ruleset '$NAME' (id $ID) on $REPO from $JSON …"
    if ! OUT="$(gh api -X PUT "repos/$REPO/rulesets/$ID" --input "$JSON" 2>&1)"; then
      explain_ruleset_failure "update" "$OUT"
    fi
  else
    echo "Creating ruleset '$NAME' on $REPO from $JSON …"
    if ! OUT="$(gh api -X POST "repos/$REPO/rulesets" --input "$JSON" 2>&1)"; then
      explain_ruleset_failure "create" "$OUT"
    fi
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
