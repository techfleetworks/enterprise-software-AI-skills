#!/usr/bin/env bash
# check_adr.sh — verify an ADR is complete and well-formed before commit.
#
# Usage:
#   scripts/check_adr.sh path/to/0007-title.md
#   scripts/check_adr.sh docs/adr/            # check every ADR in a directory
#
# Exit status is non-zero if any checked file fails, so it can gate CI or a
# pre-commit hook the same way a failing test would.
#
# Checks per file:
#   - filename matches NNNN-kebab-title.md
#   - no unfilled {placeholder} or <placeholder> tokens remain (prose only; fenced code is ignored)
#   - a Status/status is present
#   - a Context section is present and non-trivial
#   - a Consequences section is present
#   - if MADR (has "Considered Options"), at least two options are listed

set -uo pipefail

fail_total=0

check_file() {
  local f="$1"
  local errs=()
  local base; base="$(basename "$f")"

  [[ "$base" =~ ^[0-9]{3,4}-[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] \
    || errs+=("filename should be NNNN-kebab-case-title.md")

  # Unfilled placeholder tokens — {like this} or <like this> / <ADR-00Y> — but only in PROSE, not
  # inside fenced code blocks (so examples like { "a": 1 } or a <T> generic don't trip it), and never
  # a markdown autolink like <https://…>.
  # A real template placeholder is descriptive text in brackets ({short title}, {YYYY-MM-DD …},
  # {option 1}) or an ADR-ref stub (<ADR-NNNN>, <ADR-00Y>). We flag those, but NOT single-token
  # command args like <owner>/<repo>/<sha> or JSON/generics (which live in fenced code anyway).
  # Strip fenced code blocks (awk) and inline `code` spans (sed) first, so an ADR that *discusses*
  # placeholder syntax in code formatting isn't flagged — only bare, unfilled placeholders in prose are.
  local prose; prose="$(awk '/^[[:space:]]*```/{f=!f;next} !f' "$f" | sed 's/`[^`]*`//g')"
  if printf '%s\n' "$prose" \
       | grep -E '\{[^}]* [^}]*\}|<[^>]* [^>]*>|[<{]ADR-[0-9NXY]*[NXY][0-9NXY]*[>}]' \
       | grep -q .; then
    errs+=("unfilled placeholder tokens remain ({…} or <…>)")
  fi

  grep -qiE '^(status:|## Status)' "$f" || errs+=("missing Status")

  if grep -qiE '^## (Context|Context and Problem Statement)' "$f"; then
    # ensure the context section has some real prose, not just a heading
    local ctx
    ctx="$(awk 'tolower($0) ~ /^## context/{f=1;next} /^## /{f=0} f' "$f" | tr -d '[:space:]')"
    [ "${#ctx}" -ge 40 ] || errs+=("Context section is empty or too thin")
  else
    errs+=("missing Context section")
  fi

  grep -qiE '^(##|###) Consequences' "$f" || errs+=("missing Consequences section")

  if grep -qiE '^## Considered Options' "$f"; then
    local opts
    opts="$(awk '/^## Considered Options/{f=1;next} /^## /{f=0} f && /^[*-] /{c++} END{print c+0}' "$f")"
    [ "${opts:-0}" -ge 2 ] || errs+=("MADR ADR lists fewer than 2 considered options")
  fi

  if [ "${#errs[@]}" -eq 0 ]; then
    echo "PASS  $f"
  else
    echo "FAIL  $f"
    for e in "${errs[@]}"; do echo "      - $e"; done
    fail_total=$((fail_total + 1))
  fi
}

if [ $# -lt 1 ]; then
  echo "usage: check_adr.sh <adr-file.md | adr-directory>" >&2
  exit 2
fi

for target in "$@"; do
  if [ -d "$target" ]; then
    while IFS= read -r f; do check_file "$f"; done \
      < <(find "$target" -maxdepth 1 -type f -name '[0-9]*-*.md' | sort)
  elif [ -f "$target" ]; then
    check_file "$target"
  else
    echo "error: no such file or directory: $target" >&2
    fail_total=$((fail_total + 1))
  fi
done

if [ "$fail_total" -gt 0 ]; then
  echo ""
  echo "$fail_total file(s) failed ADR checks."
  exit 1
fi
echo ""
echo "All ADR checks passed."
