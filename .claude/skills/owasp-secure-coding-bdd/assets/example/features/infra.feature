Feature: OWASP infrastructure, containers and cloud controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Docker_Security
  @security @owasp:docker @usecase:container-root-blast-radius
  Scenario: A compromised container cannot act as root or escalate on the host
    Given a service running in a Docker container
    When an attacker exploits a code bug to run commands inside that container
    Then the process runs as an unprivileged user, not root
    And the container was started with --cap-drop all and --security-opt=no-new-privileges
    And the Docker daemon socket is not mounted into the container

  # from Infrastructure_as_Code_Security
  @security @owasp:iac @usecase:no-secrets-in-iac
  Scenario: An IaC change carrying a hardcoded secret is blocked before merge
    Given an infrastructure-as-code template committed to version control
    When a developer adds a plaintext credential and opens a merge request
    Then the pipeline secret scanner flags the credential and fails the check
    And the change cannot merge until the secret moves to the secrets store

  # from Kubernetes_Security
  @security @owasp:kubernetes @usecase:restricted-pod-admission
  Scenario: The cluster refuses a privileged, root-running pod
    Given a namespace that enforces the restricted Pod Security Standard
    When a user submits a pod that runs as root and sets securityContext.privileged true
    Then the Pod Security Admission controller rejects the pod
    And an accepted pod in that namespace runs as a non-root user with a read-only root filesystem and dropped capabilities

  # from Multi_Tenant_Security
  @security @owasp:multi-tenant @usecase:cross-tenant-idor
  Scenario: A document request cannot reach another tenant's record
    Given an authenticated user whose verified context belongs to tenant A
    When the user requests a document id that belongs to tenant B
    Then the lookup is scoped to tenant A and returns the same not-found response as a missing record
    And no tenant B data is returned even though the id is valid

  # from Network_Segmentation
  @security @owasp:network-segmentation @usecase:contain-web-server-compromise
  Scenario: A compromised web server cannot reach the backend database directly
    Given a FRONTEND zone, a MIDDLEWARE zone, and a BACKEND zone separated by firewalls
    When an attacker runs commands on a web server in the FRONTEND zone
    And tries to open a connection straight to the SQL database in the BACKEND zone
    Then the firewall drops the connection because no rule permits FRONTEND to reach BACKEND
    And the database is reachable only through the application tier in MIDDLEWARE

  # from NodeJS_Docker
  @security @owasp:nodejs-docker @usecase:non-root-no-secret-leak
  Scenario: The Node.js image runs unprivileged and leaks no build secret
    Given a Node.js application built into a Docker image
    When the image is inspected and the container is started
    Then the application process runs as the node user, not root
    And the base image is pinned to a sha256 digest
    And no NPM_TOKEN or .npmrc secret is present in any image layer or build history

  # from Secure_Cloud_Architecture
  @security @owasp:cloud-architecture @usecase:private-backend-isolation
  Scenario: A database in a private subnet rejects direct internet access
    Given a VPC with a public subnet for the web tier and a private subnet for the database
    When an attacker on the internet tries to reach the database endpoint directly
    Then the connection is refused because no public route exists to the private subnet
    And the database is reachable only through the authenticated application tier

  # from Serverless_FaaS_Security
  @security @owasp:serverless @usecase:least-privilege-function-role
  Scenario: A compromised function cannot act beyond its scoped IAM role
    Given a serverless function whose role allows only dynamodb:GetItem and dynamodb:PutItem on the Orders table
    When an attacker who controls the function attempts to delete an unrelated S3 bucket
    Then the platform denies the call because the role grants no such permission
    And no wildcard action or resource is present in the function's policy

  # from Subdomain_Takeover_Prevention
  @security @owasp:subdomain-takeover @usecase:dangling-cname-claim
  Scenario: A retired service leaves no claimable DNS record behind
    Given a subdomain whose CNAME pointed to a now-deleted cloud resource
    When the decommissioning pipeline runs
    Then the DNS record is removed or repointed before the resource is torn down
    And a takeover scan confirms the subdomain returns no provider error fingerprint and is not claimable

  # from Zero_Trust_Architecture
  @security @owasp:zero-trust @usecase:stolen-credential-lateral-movement
  Scenario: A valid credential from a risky context is still denied
    Given an internal service protected by a policy enforcement point
    When a request arrives with correct credentials from an unregistered device at an unusual hour
    Then the dynamic policy scores the request high-risk and blocks or step-up-challenges it
    And no resource access is granted on network location or a prior session alone
