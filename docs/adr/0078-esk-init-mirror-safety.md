---
status: "accepted"
date: 2026-10-24
decision-makers: mdenner
---

# esk-init's skills mirror never silently deletes local content, and --check sees a drifted target

## Context and Problem Statement

`esk-init --personal --skills` mirrors the repo's `.claude/skills/` into `~/.claude/skills/` so the skills load
from any folder. On a reconcile it replaces each mirrored skill folder. Issue #130 reported two gaps, both on
one machine (never touching the repo or CI):

- **Data loss on reconcile.** A reconcile re-mirrored ALL skills whenever anything changed (a one-byte edit in
  one skill rewrote all of them), and each mirror replaced the whole target folder, so a file a user added or
  edited INSIDE a mirrored skill was discarded. Only `settings.json` was backed up; the plan named a count and
  the changed skills, never the local files it would delete. (Current `main` had already added per-skill content
  fingerprinting since the issue was filed, but still re-mirrored all skills and still deleted local content.)
- **A blind `--check --skills`.** `--check --skills` compared the recorded signature against the current REPO
  signature only, never fingerprinting the installed TARGET. So a mirrored skill whose on-disk copy had been
  replaced by an older or edited copy reported OK.

## Decision

Reuse the existing content fingerprint (now refactored to run against any root) to make the mirror safe and the
check honest. Each behavior is pinned by a discrimination test.

1. **Re-mirror only the skills that need it.** `planSkills` now re-mirrors only skills that are missing from the
   target or whose SOURCE signature changed since it was recorded, not all of them. A change in one skill no
   longer rewrites the others, so it cannot touch their local content. A new target makes every skill "missing",
   so a first install still mirrors everything.

2. **Back up a locally-changed target before replacing it, never delete it silently.** Before replacing a skill,
   esk-init fingerprints the installed TARGET folder and compares it to what it recorded at mirror time. A clean
   (even if stale) mirror matches and is replaced with no backup; a target that DIVERGED (a file added or edited
   inside it, or an older copy swapped in) is copied to a timestamped `<skill>.esk-local-*` backup first, and
   listed in the plan and the result. If the backup cannot be written, esk-init stops rather than replace-and-lose.

3. **`--check --skills` fingerprints the TARGET.** It now also compares each installed skill's on-disk signature
   against the recorded one, so a stale or hand-edited mirrored copy is reported as drift instead of passing. The
   existing repo-moved-ahead check is kept alongside it.

The fingerprint walk was split into `signatureOf(root, label)` (throws on a read error) with `skillSignature`
(source; a read error fails closed/die, unchanged) and `targetSignature` (target; returns null when absent or
unreadable, a condition to report, not abort). The marker records the FULL installed skill set and every source
signature as the new baseline, so the next reconcile's remove/compare logic still sees every skill it owns.

esk-init is the bootstrap installer, not a manifest gate, so there is no sha/provenance change; this ships in the
1.3.1 line.

## Consequences

* A reconcile can no longer silently delete user content under `~/.claude/skills`: a locally-changed mirrored
  skill is backed up and named before it is replaced, and an unchanged skill is not touched at all.
* `--check --skills` now detects a mirrored copy that drifted from what was installed, so a stale copy is no
  longer reported as current — and the drift is **self-healing**: a drifted target is included in the re-mirror
  set, so `--yes --skills` (the remedy `--check` prints) actually re-mirrors it, backing up any local change, and
  the next `--check` is green. A fresh-context review caught that, before this, `--check` could report a drift
  that `--yes` would not clear.
* The guarantee holds across the **upgrade transition**, which the same review caught as a silent-data-loss hole:
  the backup decision is **baseline-agnostic** (`classifyTarget`), so the first reconcile after upgrading from a
  marker that recorded no signatures still backs up a diverged target rather than deleting it — even though there
  is no recorded baseline to compare against.
* Honest limits: the backup is a whole-folder `<skill>.esk-local-*` copy, not a per-file merge — it preserves the
  content and names the skill, but the user resolves what to keep. Divergence is detected at the per-skill
  signature level, not per file, so the plan names the skill, not the exact files. With **no recorded baseline**
  (a pre-signature marker) the first reconcile cannot tell a local edit from a merely-stale clean copy, so it
  backs up **any** target that differs from the new source — conservative (a one-time extra backup of a stale
  copy is possible), on the side of never losing content; subsequent reconciles compare against the recorded
  baseline and are precise. A skill whose target is unreadable is reported (not replaced blindly); it cannot be
  backed up, so the run stops and asks the user to move it aside. The mirror remains per-skill and not
  crash-atomic on Windows (a hard kill mid-swap still needs a re-run to heal), as before.
