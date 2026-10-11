Feature: OWASP cryptography, secrets and transport controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Cryptographic_Storage
  @security @owasp:crypto-storage @usecase:data-at-rest-confidentiality
  Scenario: Stored sensitive data survives a storage breach unreadable
    Given a record containing sensitive data is written to storage
    When an attacker obtains a full copy of that storage
    Then the record is stored as AES-256 ciphertext in an authenticated mode such as GCM
    And the key that decrypts it is held on a separate system and is absent from the stolen copy

  # from HTTP_Strict_Transport_Security
  @security @owasp:hsts @usecase:https-downgrade-resistance
  Scenario: A returning browser refuses HTTP and will not bypass a cert warning
    Given the site has sent Strict-Transport-Security with a long max-age and includeSubDomains over HTTPS
    When the user later follows an http:// link to the domain or a subdomain
    Then the browser rewrites the request to HTTPS before any plaintext leaves the device
    And when a man-in-the-middle presents an invalid certificate, the browser blocks it with no click-through

  # from Key_Management
  @security @owasp:key-management @usecase:single-purpose-rotatable-key
  Scenario: A data-encryption key is isolated, single-purpose, and rotatable
    Given a key generated inside a FIPS-validated module and used only to encrypt stored data
    When the key reaches the end of its cryptoperiod or is suspected compromised
    Then a new key is generated in the module and takes over encryption of new data
    And the retired key is destroyed once its data is re-encrypted and no copy is reused for signing or any other purpose

  # from Pinning
  @security @owasp:pinning @usecase:rogue-certificate-rejection
  Scenario: A pinned mobile client rejects a valid rogue certificate
    Given a native app that pins the server leaf key plus a backup intermediate pin, built in at release time
    When a man-in-the-middle presents a certificate that chains to a trusted CA but uses a different key
    Then the OnConnect check finds no match in the pinset and aborts the connection
    And the failure is logged on the client and the user is given no option to continue past it

  # from Post_Quantum_Cryptography
  @security @owasp:post-quantum @usecase:harvest-now-decrypt-later
  Scenario: A long-lived confidential channel negotiates a quantum-resistant key exchange
    Given a transport connection carrying data that must stay secret for years
    When a client opens a new session
    Then the negotiated key exchange is a supported classical-plus-PQC hybrid such as X25519MLKEM768
    And certificate and hostname validation stay enabled
    And a PQC-required path never silently falls back to a classical-only exchange

  # from Secrets_Management
  @security @owasp:secrets-management @usecase:no-hardcoded-secret
  Scenario: An application loads credentials from a vault, never from source
    Given an application that needs a database credential
    When the application starts and requests the credential
    Then it receives a short-lived secret from the central secrets manager over TLS
    And no credential is hard-coded in the source, baked into the image, or passed as a plain environment variable

  # from Transport_Layer_Security
  @security @owasp:tls @usecase:downgrade-and-plaintext-resistance
  Scenario: The server refuses weak TLS and never serves secrets in the clear
    Given a web application reachable over the network
    When a client offers TLS 1.0, an anonymous cipher, or a plain HTTP request to a sensitive page
    Then the handshake is rejected for the deprecated protocol and the weak cipher
    And the HTTP request is redirected to HTTPS or refused, so no session cookie travels unencrypted
    And the presented certificate chains to a trusted CA and matches the host in its subjectAlternativeName

  # from User_Privacy_Protection
  @security @owasp:user-privacy @usecase:remote-session-invalidation
  Scenario: A user cuts off a session on a stolen device
    Given a user with an active session on a device that was stolen
    When the user views their active sessions from another device and revokes the stolen one
    Then that session is invalidated and can no longer access the account
    And the user communications stay encrypted in transit and at rest throughout
