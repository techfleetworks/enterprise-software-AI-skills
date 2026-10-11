---
status: "accepted"
date: 2026-10-11
decision-makers: mdenner
---

# Keep OWASP-deprecated cheat sheets as routing pointers, not fabricated content

## Context and Problem Statement

The OWASP secure-coding catalog mirrors the 137 cheat sheets from the upstream sitemap, and each `done` sheet
becomes an own-words per-sheet file with the six-section template and a real executable `@security` scenario,
enforced by `check-cheatsheet-catalog.mjs`. Some of those sitemap entries are deprecated upstream: OWASP has
retired the page and its first line is `# DEPRECATED: ...`, pointing readers to a successor sheet. The Wave 4
authorization batch hit the first one, `Access_Control`, which now redirects to `Authorization`; two more exist
for Wave 7 (`TLS_Cipher_String` and `Transport_Layer_Protection`, both redirecting to `Transport_Layer_Security`).
A deprecated page has no controls of its own, so there is nothing to condense and no attack-specific scenario to
write. Forcing it through the normal template would mean fabricating a `@security` scenario (which "do not make
anything up" forbids) and duplicating the successor's scenario tag across the shared feature files. Dropping the
sheet from the manifest would change the 137 count and lose a useful pointer for a developer who searches for the
old name. We needed a first-class way to mark a sheet deprecated and check it as a pointer.

## Decision Drivers

* Do not invent a control or a scenario for a page that has neither.
* Keep a useful landing spot for the old name that routes to the successor.
* Keep the catalog gate honest: a deprecated sheet still has to point somewhere real, not just claim completion.
* Handle all deprecated sheets the same way, so Wave 7 reuses the mechanism without new special cases.

## Considered Options

* Add `deprecated` + `supersededBy` to the manifest entry and a short pointer file, and teach the catalog gate to
  check deprecated sheets as pointers instead of full content.
* Leave the deprecated sheet `pending` forever. Rejected: it is not backlog, it will never be written, so it would
  misreport migration progress permanently.
* Remove the deprecated sheet from the manifest. Rejected: it changes the authoritative 137 count from the sitemap
  and throws away the old-name pointer a developer would search for.
* Fabricate a full template file for it. Rejected: it means inventing a scenario and duplicating the successor's
  `@owasp:` tag across feature files.

## Decision Outcome

Chosen option: "mark it deprecated in the manifest and check it as a pointer."

A deprecated sheet carries `"deprecated": true` and `"supersededBy": "<Slug>"` in the manifest. Its per-sheet file
is a short pointer: it says it is deprecated, links the successor per-sheet file
(`references/cheatsheets/<supersededBy>.md`) and the successor's live OWASP page, and cites the deprecated page in
a `## Sources` section. It carries no control sections and no `@security` scenario.

`check-cheatsheet-catalog.mjs` handles a `done` deprecated sheet on a separate path: it requires the file to
exist, to say it is deprecated, to link its successor, to cite a source URL, and to be indexed, and it requires
`supersededBy` to name a real manifest slug; it does not require the six template sections or a Gherkin scenario.
In the grouped index the sheet's Status is `deprecated` (the grouping check accepts that value and confirms it
against the manifest), and the per-category feature file omits deprecated sheets, since a deprecated sheet has no
`@security` scenario to add.

## Consequences

* Good, because a developer searching the old name still lands on a file that routes to the current guidance.
* Good, because the gate still forces a deprecated sheet to point at a real successor and cite its source, so it
  cannot quietly become a dead stub.
* Good, because the same `deprecated`/`supersededBy` mechanism covers the Wave 7 TLS redirects with no new code.
* Neutral, because a deprecated pointer counts toward the done total as "resolved"; it is handled, though it is a
  redirect rather than condensed content. The Status column shows `deprecated` so the distinction stays visible.
* Bad (honest limit), because the gate trusts the `deprecated` flag; a real sheet wrongly flagged deprecated would
  skip the content checks. That is a deliberate, visible manifest edit, and the flag must still point at a valid
  successor, so the failure mode is loud rather than silent.

### Confirmation

`test/owasp-cheatsheet-catalog.test.mjs` covers the path: a deprecated sheet that links its successor and cites a
source passes with no control sections or `@security` scenario; a deprecated sheet whose file omits the successor
link fails (exit 1); and a deprecated sheet whose `supersededBy` is not a manifest slug fails (exit 1). The
grouping Status check accepts `deprecated` only for a sheet the manifest marks deprecated, so a normal sheet
mislabeled in the index still fails.

## More Information

Builds on ADR-0016 (the per-cheat-sheet catalog and its completeness gate). First applied to `Access_Control`
(superseded by `Authorization`) in the Wave 4 authorization batch; `TLS_Cipher_String` and
`Transport_Layer_Protection` (superseded by `Transport_Layer_Security`) will use the same mechanism in Wave 7.
