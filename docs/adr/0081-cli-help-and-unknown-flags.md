---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# The command-line tools recognize --help and reject an unknown flag

## Context and Problem Statement

None of the repo's command-line tools handled `--help` or `-h`, and all of them silently ignored any flag they
did not recognize (issue #140):

- `esk-init --help` and `esk-genesis --help` printed an install plan instead of usage; `check-skill-receipt --help`
  ran the full receipt check. A user asking for usage got a plan or a pass/fail verdict.
- Because unknown flags were ignored, a typo was dangerous rather than merely unhelpful: `esk-init --persnal --yes`
  (a typo of `--personal`) silently targeted the repo-scope settings file instead of the personal one, applying a
  real change to the wrong place.

## Decision

Give all four tools (`esk-init`, `esk-genesis`, `check-skill-receipt`, `claim-lint`) the same two behaviors,
handled before any work:

1. **`--help` / `-h` prints a short usage block and exits 0,** doing nothing else. The usage text names the real
   flags each tool accepts.
2. **An unknown `--flag` is rejected with exit 2** (a clear "unknown flag(s): ... Run with --help for usage."
   message). Each tool carries the complete set of the flags it accepts; the check only looks at `--`-prefixed
   arguments, and every tool's option VALUES are paths, owners, versions or shell names (never `--`-prefixed), so
   a real option value is never mistaken for an unknown flag. So a typo now fails closed instead of silently
   selecting a different scope or mode.

These are installer/CLI scripts, not manifest gates, so there is no sha/provenance change; this ships in the
1.3.1 line. Each behavior is pinned by a discrimination test per tool (help exits 0 with usage; a typo'd flag
exits 2).

## Consequences

* A user discovering any of the tools from the command line gets usage from `--help`, and a typo in a flag name
  is caught immediately rather than silently changing what the tool does. The `--persnal`-picks-the-wrong-scope
  footgun is closed.
* This is a small CLI-contract change: a caller that passed an undocumented `--flag` and relied on it being
  ignored now gets exit 2. Every in-repo caller and test passes only documented flags, so none is affected; a
  consumer or script passing an unknown flag to these tools would now see a clear error, which is the intent.
* Honest limits: the guard inspects `--`-prefixed arguments only, so a stray single-dash token (other than the
  handled `-h`) or a bare positional is not treated as an unknown flag; this is deliberate, since the tools'
  option values are never `--`-prefixed and single-dash options are not part of their surface. `claim-lint` takes
  its input file as a positional argument, which is unchanged. The usage text is a short summary, not a full man
  page; the script header comments remain the detailed reference.
