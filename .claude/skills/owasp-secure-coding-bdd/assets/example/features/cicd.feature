Feature: OWASP CI/CD and supply-chain controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from CI_CD_Security
  @security @owasp:ci-cd @usecase:block-unreviewed-production-deploy
  Scenario: An unreviewed commit cannot reach production through the pipeline
    Given a protected main branch with auto-merge disabled and mandatory review enabled
    When an attacker pushes a commit and tries to merge and deploy it without an approved review
    Then the merge is blocked until a required reviewer approves the change
    And the production deploy stage halts for a manual approval gate before release

  # from Dependency_Graph_SBOM
  @security @owasp:sbom @usecase:locate-vulnerable-component
  Scenario: A new advisory is traced to the exact affected release through the SBOM
    Given each release ships a schema-valid SBOM bound to the artifact digest by a signed attestation
    When an advisory is published for a transitive library
    Then the signed attestation verifies against the deployed artifact before the inventory is trusted
    And the dependency graph names the parent component and the releases that contain the affected version

  # from GitHub_Actions_Security
  @security @owasp:github-actions @usecase:prevent-secret-exfiltration
  Scenario: A forked pull request cannot run privileged workflow code and steal secrets
    Given a public repository whose workflows default GITHUB_TOKEN to read-only and require approval for all external contributors
    When an attacker opens a pull request from a fork that tries to print a secret to the logs
    Then the workflow does not run automatically and waits for a maintainer to approve it
    And the token exposed to the fork is read-only with no secrets, so the attempt exfiltrates nothing

  # from NPM_Security
  @security @owasp:npm @usecase:block-malicious-install
  Scenario: A CI install blocks hostile scripts and unverified AI-suggested packages
    Given CI installs dependencies from the committed lockfile with scripts disabled by default
    When a build adds a newly suggested package whose name does not exist on the registry
    Then the existence check fails the build and no install-time script from any dependency runs
    And publishing uses a short-lived trusted-publisher credential rather than a stored long-lived token

  # from Software_Supply_Chain_Security
  @security @owasp:supply-chain @usecase:block-tampered-dependency
  Scenario: A build refuses a dependency whose contents do not match the pinned, verified version
    Given a project that pins every dependency in a committed lockfile with recorded integrity hashes
    When the build pulls a package whose downloaded contents no longer match the pinned hash
    Then the build fails instead of installing the altered package
    And an SBOM and vulnerability scan flag the component for review before release

  # from Vulnerable_Dependency_Management
  @security @owasp:dependency-management @usecase:known-cve-remediation
  Scenario: A known-vulnerable dependency is remediated and proven, not just silenced
    Given a scanner flags a direct dependency for a published CVE
    When the team applies the fix path for the case that matches the finding
    Then a test reproducing the flaw fails against the vulnerable version and passes against the fixed one
    And any scanner suppression is scoped to that single CVE after the test proves the fix
