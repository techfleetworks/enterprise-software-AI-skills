# 0001. Record architecture decisions

Date: 2026-10-10

## Status

Accepted

## Context

This repository ships the engineering disciplines it expects other projects to adopt —
including the architectural-decision-records skill itself — yet it has kept no decision log
of its own. Choices already baked into the repo (dependency-free gate scripts, the shrink-only
ratchet, the evidence taxonomy) are undocumented, so a newcomer cannot tell which are deliberate
and load-bearing versus incidental. As the repo undergoes a major overhaul, the "why" behind each
structural change needs a durable home.

## Decision

We will record architecturally-significant decisions as Architecture Decision Records stored in
`docs/adr/`, numbered sequentially (`NNNN-kebab-title.md`), MADR format by default and Nygard for
small decisions, committed in the same change as the code they explain. Numbers are never reused,
even for superseded records. We start recording from this change forward and do not back-fill the
entire history.

## Consequences

The next engineer or agent can read the log to understand why the repo is shaped as it is, and
every future structural change arrives with its rationale. The repo now practices the discipline
it preaches. The cost is one record per significant decision; trivial changes need none. Past
undocumented decisions stay unrecorded unless a specific one later proves load-bearing enough to
capture.
