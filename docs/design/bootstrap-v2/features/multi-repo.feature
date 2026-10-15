Feature: Many repos, one source of truth per repo
  Each repo pins its own version. Enforcement and generation are deterministic functions
  of that pin, which is what keeps independent repos (and concurrent syncs) from diverging.

  @multi-repo @version-resolution
  Scenario Outline: Each repo resolves its own pinned version
    Given repo "<repo>" has "gate-manifest.json" pinned to "<version>"
    When the effective enforcement version for "<repo>" is resolved
    Then it equals "<version>"

    Examples:
      | repo  | version |
      | repoB | 1.3.0   |
      | repoC | 1.2.0   |

  @multi-repo @independence
  Scenario: A bump to one repo does not change another
    Given repo B is pinned to "1.2.0" and repo C is pinned to "1.2.0"
    When repo B is bumped to "1.3.0"
    Then repo C's "gate-manifest.json" still pins "1.2.0"

  @multi-repo @deterministic-generation
  Scenario: Gate scripts generated from the same manifest are byte-identical
    Given two independent syncs both target version "1.3.0"
    When each writes "scripts/ci/check-untagged-pii.mjs" from the "1.3.0" manifest
    Then the two files have the same sha256
    # This replaces an untestable "no collision" claim: identical inputs produce identical
    # bytes, so concurrent syncs cannot produce diverging gate content.
