# Unreleased changes

Each pull request adds ONE new file here describing its change, named `<YYYYMMDDTHHMMSSZ>-<slug>.md` (the UTC
time you write it, then a short slug of the branch). Start it with a `### Added (...)`, `### Changed (...)`, or
`### Fixed (...)` heading, the same form `CHANGELOG.md` uses.

Never edit `CHANGELOG.md` in a pull request, and never edit another change's file here. Two open pull requests
then add two different new files, so they cannot conflict, on GitHub or anywhere else (ADR-0108).

At release time, the release step runs:

```
node scripts/changelog-release.mjs <version> <YYYY-MM-DD>
```

It writes a `## <version> - <date>` section into `CHANGELOG.md` from these files, oldest first, and deletes them.
