Feature: OWASP Backend input, injection and data-store controls
  Executable @security scenarios drawn from the per-sheet cheat-sheet files in this category.
  In an adopting repo these merge into the single shared feature-file index (see bdd-comprehensive-testing).
  Each mirrors the @security scenario in its references/cheatsheets/<Slug>.md file.

  # from Database_Security
  @security @owasp:database-security @usecase:least-privilege-db-account
  Scenario: The application database account cannot drop a table
    Given the application connects with a dedicated account granted only SELECT, UPDATE, and DELETE
    When a query attempts to run DROP TABLE users through that connection
    Then the database refuses the statement with a permission error
    And the account is never the database owner and holds no administrative rights over the instance

  # from Deserialization
  @security @owasp:insecure-deserialization @usecase:object-intake
  Scenario: An object intake endpoint refuses a native serialized payload
    Given an endpoint that accepts serialized objects from clients
    When an attacker posts a Java stream whose class is not on the allow-list
    Then the deserialization filter rejects the stream before any object is built
    And no gadget code runs

  # from Injection_Prevention
  @security @owasp:injection @usecase:os-command-arg
  Scenario: An endpoint that runs a system command rejects a shell-metacharacter payload
    Given an endpoint that invokes an OS command with a user-supplied argument
    When an attacker submits the value "; cat /etc/passwd" for that argument
    Then the request is rejected by allow-list validation before any command runs
    And the command is launched with the program and each argument passed separately, so no shell parses the input

  # from Input_Validation
  @security @owasp:input-validation @usecase:booking-date-order
  Scenario: A booking request with an end date before its start date is rejected
    Given a booking endpoint that validates syntax and semantics on the server
    When a client submits a start date of "2026-05-10" and an end date of "2026-05-01"
    Then the request is rejected with a clear validation error
    And no partially validated booking is created or stored

  # from LDAP_Injection_Prevention
  @security @owasp:ldap-injection @usecase:search-filter-injection
  Scenario: An LDAP user search rejects a filter injection payload
    Given a directory search endpoint that builds an LDAP filter from a username
    When an attacker submits the username "*)(objectClass=*"
    Then the search returns no unintended entries and the input is rejected
    And the value reaches the filter only as an escaped parameter, never as raw filter syntax

  # from Mass_Assignment
  @security @owasp:mass-assignment @usecase:account-edit
  Scenario: An account-edit endpoint ignores an unauthorized privilege field
    Given an account-edit endpoint that binds the fields userid, password, and email
    When an attacker submits the form with an extra parameter "isAdmin=true"
    Then the isAdmin field is not changed because it is outside the bound field set
    And the saved account keeps its original privilege level

  # from NoSQL_Security
  @security @owasp:nosql-injection @usecase:operator-injection-auth-bypass
  Scenario: A query rejects an operator object submitted where a scalar is expected
    Given a lookup endpoint that filters users by a name value from the request
    When an attacker submits name as the object { "$ne": "" } instead of a string
    Then the request is rejected because the value fails the scalar-type check
    And no query runs that would match every user record

  # from OS_Command_Injection_Defense
  @security @owasp:os-command-injection @usecase:shell-metacharacter-injection
  Scenario: A command runner rejects a shell metacharacter payload
    Given an endpoint that runs an allow-listed system command with a user-supplied argument
    When an attacker submits the argument "calc & echo test"
    Then no second command runs and the request is rejected
    And the argument is passed through a process API as one value, never parsed by a shell

  # from Query_Parameterization
  @security @owasp:query-parameterization @usecase:lookup-bound-value
  Scenario: A product lookup binds the user value instead of concatenating it
    Given a product lookup that runs a prepared statement with a bound parameter
    When an attacker submits the search term "x' OR '1'='1"
    Then the query matches only rows whose value literally equals "x' OR '1'='1"
    And no extra rows are returned and the query structure is unchanged

  # from Server_Side_Request_Forgery_Prevention
  @security @owasp:ssrf @usecase:avatar-url-fetch
  Scenario: An avatar-fetch endpoint refuses to request a cloud metadata address
    Given an endpoint that downloads a user-supplied avatar host
    When an attacker submits the host "169.254.169.254"
    Then the request is rejected because the resolved IP is not in the allow-list
    And the HTTP client never opens a connection to that address

  # from Server_Side_Template_Injection_Prevention
  @security @owasp:ssti @usecase:template-expression-injection
  Scenario: A rendered message rejects a template expression payload
    Given an endpoint that renders a fixed template and inserts a user-supplied name
    When an attacker submits the name "{{7*7}}"
    Then the output contains the literal text "{{7*7}}" and never the evaluated value "49"
    And the name reaches the engine only as a render variable, never as template source or code

  # from SQL_Injection_Prevention
  @security @owasp:sql-injection @usecase:login-auth-bypass
  Scenario: A login form rejects a SQL injection authentication-bypass payload
    Given a login endpoint backed by a SQL database
    When an attacker submits the username "' OR '1'='1" with any password
    Then the credentials are rejected and no session is created
    And the query runs as a parameterized statement so the input is treated as data, not SQL

  # from XML_External_Entity_Prevention
  @security @owasp:xxe @usecase:xml-upload-file-read
  Scenario: An XML parser refuses an external entity that points at a local file
    Given an endpoint that parses an uploaded XML document
    When an attacker submits a document whose DOCTYPE declares an external entity pointing at "file:///etc/passwd"
    Then the parser rejects the DOCTYPE declaration and no file contents appear in the response
    And the parser runs with DTD processing disabled so external entities are never resolved

  # from XML_Security
  @security @owasp:xml-security @usecase:schema-structure-tampering
  Scenario: A loose XML document is rejected by strict schema validation
    Given an endpoint that validates each XML order against a strict XSD before processing
    When an attacker submits an order that closes the id tag early and injects an extra price element set to 0
    Then schema validation fails because the structure does not match the defined sequence
    And the order is rejected so the tampered zero price is never processed

  # from XPath_Injection_Prevention
  @security @owasp:xpath-injection @usecase:predicate-injection
  Scenario: An XML catalog lookup rejects an XPath predicate injection payload
    Given a catalog endpoint that selects a book by id from an XML document
    When an attacker submits the id "1' or '1'='1"
    Then no unauthorized books are returned and the input is treated as a plain value
    And the id reaches the expression only as a bound variable, never as XPath syntax
