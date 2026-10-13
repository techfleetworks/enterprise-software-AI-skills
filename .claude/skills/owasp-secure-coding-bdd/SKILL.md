---
name: owasp-secure-coding-bdd
description: "The always-on secure-coding entry point. Use on ANY change that touches input, auth, sessions, access control, crypto or secrets, file handling, APIs, dependencies, AI/LLM/agent code, or infrastructure, and any time security matters. It routes to one reference file per OWASP cheat sheet (137 of them) for the condensed controls, hardened with the attacker's view, and it REQUIRES that each security control ships an executable @security BDD scenario added to the repo's shared feature-file index so the secure coding is actually tested in CI (via bdd-comprehensive-testing). Trigger on build, add, implement, fix, change, login, password, token, upload, query, injection, xss, csrf, ssrf, crypto, secret, cookie, header, deserialize, dependency, or 'is this secure' even when 'OWASP' or 'security' are not said."
---

# OWASP secure coding

## Why this exists

Most breaches come from a short list of mistakes that are well understood and well documented: injection,
broken authentication, broken access control, weak crypto, unsafe deserialization, and so on. The OWASP Cheat
Sheet Series is the community's condensed, actionable guidance for each one. This skill makes that guidance
usable on a real change: it routes you to the right cheat sheet, states the attack each control stops in plain
terms, and, most important, it does not let a security control ship as advice. Every control must arrive with
an executable `@security` BDD scenario that actually tests it, in the same place every other scenario runs.

Advice that is not tested rots. A comment that says "we validate input here" is not a control; a test that
sends the attack and sees it rejected is. So this skill is the secure-coding half, and it leans on
`bdd-comprehensive-testing` for the executable half: the secure-coding controls come from the cheat sheets, and
the proof that they hold comes from `@security` scenarios wired into CI.

## The non-negotiables

1. **Find the relevant cheat sheet(s).** For the change in front of you, look up the matching sheet in the
   catalog below (for example a login form touches Authentication, Session Management, Password Storage, and
   Credential Stuffing Prevention). Read its per-sheet file and apply the controls.
2. **Threat-model with the attacker's view.** Each per-sheet file states the real attack the control stops,
   grounded in a penetration-testing source, so you defend against what attackers actually do, not an abstract
   risk.
3. **Every control ships an executable `@security` BDD scenario (not prose).** When you apply a sheet to real
   code, write or update its `@security` Gherkin scenario and ADD IT to the repo's single shared feature-file
   index that `bdd-comprehensive-testing` owns (its "Storing BDD scenarios permanently" section), tagged
   `@security`, and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
   every other scenario. The scenario in each per-sheet file is the canonical copy to add; the per-sheet doc is
   not where tests run. A security control with no executable scenario in that shared index is not done.
4. **Name the real guarantee.** The scenario checks one attack is blocked; the structural control (a
   parameterized query, contextual output encoding, an Argon2id hash, a DB constraint) is what makes every case
   safe. State both, so no one mistakes a passing test for a proof.

## The selection flow: OWASP threat modeling (required, enforced)

Choosing the right cheat sheets is not left to chance. Follow OWASP's own Threat Modeling Process, which runs
in four steps, and the flow produces a security-decision record plus the executable scenarios the enforcement
gate checks. This is the secure-coding analogue of how `pattern-selector` forces a deliberate pattern choice.

### Step 1: Scope your work
Map the change's surface the way OWASP's first step does: the entry and exit points, the assets worth
protecting, the trust boundaries the data crosses, and the data flows. From that surface, SELECT the cheat
sheets that apply. For example, a login form that writes to SQL crosses an authentication trust boundary and
touches a database, so it selects Authentication, Session Management, Password Storage, and SQL Injection
Prevention.

### Step 2: Determine threats
For the scoped surface, name what can go wrong using a categorization such as STRIDE, and map each threat to
the cheat sheet that addresses it. Rank the threats high, medium, or low by exploitability and impact, as
OWASP's process does, so the most dangerous are handled first.

### Step 3: Determine countermeasures and mitigation
Apply each selected sheet's controls, preferring the structural one it names first. For every threat choose a
risk response the way OWASP's third step frames it: eliminate, mitigate, transfer, or (rarely, with a stated
reason) accept. A threat with no countermeasure is a vulnerability, not a decision. Add each control's
`@security` scenario to the shared feature-file index (via `bdd-comprehensive-testing`), so the countermeasure
is tested, not merely asserted.

### Step 4: Assess your work (the security-decision record)
Record the result: the surface, the cheat sheets selected, the threats and their ranking, the countermeasures
applied, the `@security` scenarios added (or the explicit, reasoned waivers), and the real guarantee for each.
This security-decision record is the evidence that the flow ran, and it is exactly what OWASP's fourth step
asks for: a scope, a threat list, and a control list that exist and are reviewable.

### What makes this impossible to skip, and the honest limit
The flow is enforced at the OUTCOME, not on trust. `scripts/check-security-coverage.mjs` maps the changed code
to the security surfaces it touches (SQL, auth, sessions, uploads, JWT, rendering, SSRF, command execution,
deserialization, and more in `assets/security-coverage.config.json`) and FAILS the build when a triggered
surface has no matching `@security` scenario in the feature index and no reasoned, unexpired waiver. So
shipping security-relevant code with nothing testing it cannot pass CI, and it cannot regress silently,
because the gate runs on every change and has a discriminating test. The honest limit: the gate makes it
impossible to SKIP the flow or ship an untested surface; it cannot guarantee you picked the perfect set of
sheets or wrote a perfect scenario. That judgment is caught by a `judge-arch` review, and every gap found
becomes a new surface rule in the config, so the part that rests on judgment only shrinks.

## The cheat-sheet catalog (the routing index)

Each OWASP cheat sheet is its own reference file under `references/cheatsheets/<Slug>.md`, loaded on demand. The
authoritative list is `references/cheatsheets-manifest.json` (137 sheets, from the OWASP sitemap, retrieved
2026-10-10). All 137 are written to the per-sheet template with a cited, executable `@security`
scenario. The `check-cheatsheet-catalog.mjs` gate keeps this honest: every sheet must have its file, every
required section, a citation, an executable `@security` scenario, and an entry in this index.

### Frontend & browser (16/16)

| Cheat sheet | File | Status |
|---|---|---|
| [Browser Extension Vulnerabilities](references/cheatsheets/Browser_Extension_Vulnerabilities.md) | `references/cheatsheets/Browser_Extension_Vulnerabilities.md` | done |
| [Clickjacking Defense](references/cheatsheets/Clickjacking_Defense.md) | `references/cheatsheets/Clickjacking_Defense.md` | done |
| [Content Security Policy](references/cheatsheets/Content_Security_Policy.md) | `references/cheatsheets/Content_Security_Policy.md` | done |
| [Cookie Theft Mitigation](references/cheatsheets/Cookie_Theft_Mitigation.md) | `references/cheatsheets/Cookie_Theft_Mitigation.md` | done |
| [Cross Site Scripting Prevention](references/cheatsheets/Cross_Site_Scripting_Prevention.md) | `references/cheatsheets/Cross_Site_Scripting_Prevention.md` | done |
| [Cross-Site Request Forgery Prevention](references/cheatsheets/Cross-Site_Request_Forgery_Prevention.md) | `references/cheatsheets/Cross-Site_Request_Forgery_Prevention.md` | done |
| [DOM Clobbering Prevention](references/cheatsheets/DOM_Clobbering_Prevention.md) | `references/cheatsheets/DOM_Clobbering_Prevention.md` | done |
| [DOM based XSS Prevention](references/cheatsheets/DOM_based_XSS_Prevention.md) | `references/cheatsheets/DOM_based_XSS_Prevention.md` | done |
| [HTML5 Security](references/cheatsheets/HTML5_Security.md) | `references/cheatsheets/HTML5_Security.md` | done |
| [HTTP Headers](references/cheatsheets/HTTP_Headers.md) | `references/cheatsheets/HTTP_Headers.md` | done |
| [Micro Frontend Security](references/cheatsheets/Micro_Frontend_Security.md) | `references/cheatsheets/Micro_Frontend_Security.md` | done |
| [Prototype Pollution Prevention](references/cheatsheets/Prototype_Pollution_Prevention.md) | `references/cheatsheets/Prototype_Pollution_Prevention.md` | done |
| [Third Party Javascript Management](references/cheatsheets/Third_Party_Javascript_Management.md) | `references/cheatsheets/Third_Party_Javascript_Management.md` | done |
| [Web Frontend Security](references/cheatsheets/Web_Frontend_Security.md) | `references/cheatsheets/Web_Frontend_Security.md` | done |
| [XS Leaks](references/cheatsheets/XS_Leaks.md) | `references/cheatsheets/XS_Leaks.md` | done |
| [XSS Filter Evasion](references/cheatsheets/XSS_Filter_Evasion.md) | `references/cheatsheets/XSS_Filter_Evasion.md` | done |

### Backend: input, injection & data stores (15/15)

| Cheat sheet | File | Status |
|---|---|---|
| [Injection Prevention](references/cheatsheets/Injection_Prevention.md) | `references/cheatsheets/Injection_Prevention.md` | done |
| [Input Validation](references/cheatsheets/Input_Validation.md) | `references/cheatsheets/Input_Validation.md` | done |
| [SQL Injection Prevention](references/cheatsheets/SQL_Injection_Prevention.md) | `references/cheatsheets/SQL_Injection_Prevention.md` | done |
| [Query Parameterization](references/cheatsheets/Query_Parameterization.md) | `references/cheatsheets/Query_Parameterization.md` | done |
| [OS Command Injection Defense](references/cheatsheets/OS_Command_Injection_Defense.md) | `references/cheatsheets/OS_Command_Injection_Defense.md` | done |
| [LDAP Injection Prevention](references/cheatsheets/LDAP_Injection_Prevention.md) | `references/cheatsheets/LDAP_Injection_Prevention.md` | done |
| [XPath Injection Prevention](references/cheatsheets/XPath_Injection_Prevention.md) | `references/cheatsheets/XPath_Injection_Prevention.md` | done |
| [Server Side Template Injection Prevention](references/cheatsheets/Server_Side_Template_Injection_Prevention.md) | `references/cheatsheets/Server_Side_Template_Injection_Prevention.md` | done |
| [Server Side Request Forgery Prevention](references/cheatsheets/Server_Side_Request_Forgery_Prevention.md) | `references/cheatsheets/Server_Side_Request_Forgery_Prevention.md` | done |
| [Deserialization](references/cheatsheets/Deserialization.md) | `references/cheatsheets/Deserialization.md` | done |
| [XML External Entity Prevention](references/cheatsheets/XML_External_Entity_Prevention.md) | `references/cheatsheets/XML_External_Entity_Prevention.md` | done |
| [XML Security](references/cheatsheets/XML_Security.md) | `references/cheatsheets/XML_Security.md` | done |
| [Mass Assignment](references/cheatsheets/Mass_Assignment.md) | `references/cheatsheets/Mass_Assignment.md` | done |
| [Database Security](references/cheatsheets/Database_Security.md) | `references/cheatsheets/Database_Security.md` | done |
| [NoSQL Security](references/cheatsheets/NoSQL_Security.md) | `references/cheatsheets/NoSQL_Security.md` | done |

### Backend: authentication & sessions (11/11)

| Cheat sheet | File | Status |
|---|---|---|
| [Authentication](references/cheatsheets/Authentication.md) | `references/cheatsheets/Authentication.md` | done |
| [Authentication Patterns](references/cheatsheets/Authentication_Patterns.md) | `references/cheatsheets/Authentication_Patterns.md` | done |
| [Multifactor Authentication](references/cheatsheets/Multifactor_Authentication.md) | `references/cheatsheets/Multifactor_Authentication.md` | done |
| [Passkey Security](references/cheatsheets/Passkey_Security.md) | `references/cheatsheets/Passkey_Security.md` | done |
| [Password Storage](references/cheatsheets/Password_Storage.md) | `references/cheatsheets/Password_Storage.md` | done |
| [Forgot Password](references/cheatsheets/Forgot_Password.md) | `references/cheatsheets/Forgot_Password.md` | done |
| [Credential Stuffing Prevention](references/cheatsheets/Credential_Stuffing_Prevention.md) | `references/cheatsheets/Credential_Stuffing_Prevention.md` | done |
| [Choosing and Using Security Questions](references/cheatsheets/Choosing_and_Using_Security_Questions.md) | `references/cheatsheets/Choosing_and_Using_Security_Questions.md` | done |
| [Session Management](references/cheatsheets/Session_Management.md) | `references/cheatsheets/Session_Management.md` | done |
| [Email Validation and Verification](references/cheatsheets/Email_Validation_and_Verification.md) | `references/cheatsheets/Email_Validation_and_Verification.md` | done |
| [Bot Management and Anti-Automation](references/cheatsheets/Bot_Management_and_Anti-Automation.md) | `references/cheatsheets/Bot_Management_and_Anti-Automation.md` | done |

### Backend: authorization & access control (10/10)

| Cheat sheet | File | Status |
|---|---|---|
| [Access Control](references/cheatsheets/Access_Control.md) | `references/cheatsheets/Access_Control.md` | deprecated |
| [Authorization](references/cheatsheets/Authorization.md) | `references/cheatsheets/Authorization.md` | done |
| [Authorization Decisions And Output Handling](references/cheatsheets/Authorization_Decisions_And_Output_Handling.md) | `references/cheatsheets/Authorization_Decisions_And_Output_Handling.md` | done |
| [Authorization Patterns](references/cheatsheets/Authorization_Patterns.md) | `references/cheatsheets/Authorization_Patterns.md` | done |
| [Authorization Policy And Data Distribution](references/cheatsheets/Authorization_Policy_And_Data_Distribution.md) | `references/cheatsheets/Authorization_Policy_And_Data_Distribution.md` | done |
| [Authorization Regression Testing](references/cheatsheets/Authorization_Regression_Testing.md) | `references/cheatsheets/Authorization_Regression_Testing.md` | done |
| [Authorization Testing Automation](references/cheatsheets/Authorization_Testing_Automation.md) | `references/cheatsheets/Authorization_Testing_Automation.md` | done |
| [Insecure Direct Object Reference Prevention](references/cheatsheets/Insecure_Direct_Object_Reference_Prevention.md) | `references/cheatsheets/Insecure_Direct_Object_Reference_Prevention.md` | done |
| [Transaction Authorization](references/cheatsheets/Transaction_Authorization.md) | `references/cheatsheets/Transaction_Authorization.md` | done |
| [Business Logic Security](references/cheatsheets/Business_Logic_Security.md) | `references/cheatsheets/Business_Logic_Security.md` | done |

### Backend: handling, output & resources (8/8)

| Cheat sheet | File | Status |
|---|---|---|
| [File Upload](references/cheatsheets/File_Upload.md) | `references/cheatsheets/File_Upload.md` | done |
| [Error Handling](references/cheatsheets/Error_Handling.md) | `references/cheatsheets/Error_Handling.md` | done |
| [Logging](references/cheatsheets/Logging.md) | `references/cheatsheets/Logging.md` | done |
| [Logging Vocabulary](references/cheatsheets/Logging_Vocabulary.md) | `references/cheatsheets/Logging_Vocabulary.md` | done |
| [Denial of Service](references/cheatsheets/Denial_of_Service.md) | `references/cheatsheets/Denial_of_Service.md` | done |
| [Unvalidated Redirects and Forwards](references/cheatsheets/Unvalidated_Redirects_and_Forwards.md) | `references/cheatsheets/Unvalidated_Redirects_and_Forwards.md` | done |
| [Web Cache Security](references/cheatsheets/Web_Cache_Security.md) | `references/cheatsheets/Web_Cache_Security.md` | done |
| [Third Party Payment Gateway Integration](references/cheatsheets/Third_Party_Payment_Gateway_Integration.md) | `references/cheatsheets/Third_Party_Payment_Gateway_Integration.md` | done |

### API & services (14/14)

| Cheat sheet | File | Status |
|---|---|---|
| [GraphQL](references/cheatsheets/GraphQL.md) | `references/cheatsheets/GraphQL.md` | done |
| [gRPC Security](references/cheatsheets/gRPC_Security.md) | `references/cheatsheets/gRPC_Security.md` | done |
| [REST Assessment](references/cheatsheets/REST_Assessment.md) | `references/cheatsheets/REST_Assessment.md` | done |
| [REST Security](references/cheatsheets/REST_Security.md) | `references/cheatsheets/REST_Security.md` | done |
| [Web Service Security](references/cheatsheets/Web_Service_Security.md) | `references/cheatsheets/Web_Service_Security.md` | done |
| [Webhook Security](references/cheatsheets/Webhook_Security.md) | `references/cheatsheets/Webhook_Security.md` | done |
| [WebSocket Security](references/cheatsheets/WebSocket_Security.md) | `references/cheatsheets/WebSocket_Security.md` | done |
| [Microservices Security](references/cheatsheets/Microservices_Security.md) | `references/cheatsheets/Microservices_Security.md` | done |
| [Microservices based Security Arch Doc](references/cheatsheets/Microservices_based_Security_Arch_Doc.md) | `references/cheatsheets/Microservices_based_Security_Arch_Doc.md` | done |
| [JSON Web Token](references/cheatsheets/JSON_Web_Token.md) | `references/cheatsheets/JSON_Web_Token.md` | done |
| [OAuth2](references/cheatsheets/OAuth2.md) | `references/cheatsheets/OAuth2.md` | done |
| [SAML Security](references/cheatsheets/SAML_Security.md) | `references/cheatsheets/SAML_Security.md` | done |
| [Identity Propagation Patterns](references/cheatsheets/Identity_Propagation_Patterns.md) | `references/cheatsheets/Identity_Propagation_Patterns.md` | done |
| [Workload Identity Federation](references/cheatsheets/Workload_Identity_Federation.md) | `references/cheatsheets/Workload_Identity_Federation.md` | done |

### Cryptography, secrets & transport (10/10)

| Cheat sheet | File | Status |
|---|---|---|
| [Cryptographic Storage](references/cheatsheets/Cryptographic_Storage.md) | `references/cheatsheets/Cryptographic_Storage.md` | done |
| [Key Management](references/cheatsheets/Key_Management.md) | `references/cheatsheets/Key_Management.md` | done |
| [Secrets Management](references/cheatsheets/Secrets_Management.md) | `references/cheatsheets/Secrets_Management.md` | done |
| [TLS Cipher String](references/cheatsheets/TLS_Cipher_String.md) | `references/cheatsheets/TLS_Cipher_String.md` | deprecated |
| [Transport Layer Security](references/cheatsheets/Transport_Layer_Security.md) | `references/cheatsheets/Transport_Layer_Security.md` | done |
| [Transport Layer Protection](references/cheatsheets/Transport_Layer_Protection.md) | `references/cheatsheets/Transport_Layer_Protection.md` | deprecated |
| [HTTP Strict Transport Security](references/cheatsheets/HTTP_Strict_Transport_Security.md) | `references/cheatsheets/HTTP_Strict_Transport_Security.md` | done |
| [Pinning](references/cheatsheets/Pinning.md) | `references/cheatsheets/Pinning.md` | done |
| [Post Quantum Cryptography](references/cheatsheets/Post_Quantum_Cryptography.md) | `references/cheatsheets/Post_Quantum_Cryptography.md` | done |
| [User Privacy Protection](references/cheatsheets/User_Privacy_Protection.md) | `references/cheatsheets/User_Privacy_Protection.md` | done |

### Infrastructure, containers & cloud (10/10)

| Cheat sheet | File | Status |
|---|---|---|
| [Docker Security](references/cheatsheets/Docker_Security.md) | `references/cheatsheets/Docker_Security.md` | done |
| [NodeJS Docker](references/cheatsheets/NodeJS_Docker.md) | `references/cheatsheets/NodeJS_Docker.md` | done |
| [Kubernetes Security](references/cheatsheets/Kubernetes_Security.md) | `references/cheatsheets/Kubernetes_Security.md` | done |
| [Infrastructure as Code Security](references/cheatsheets/Infrastructure_as_Code_Security.md) | `references/cheatsheets/Infrastructure_as_Code_Security.md` | done |
| [Secure Cloud Architecture](references/cheatsheets/Secure_Cloud_Architecture.md) | `references/cheatsheets/Secure_Cloud_Architecture.md` | done |
| [Network Segmentation](references/cheatsheets/Network_Segmentation.md) | `references/cheatsheets/Network_Segmentation.md` | done |
| [Serverless FaaS Security](references/cheatsheets/Serverless_FaaS_Security.md) | `references/cheatsheets/Serverless_FaaS_Security.md` | done |
| [Zero Trust Architecture](references/cheatsheets/Zero_Trust_Architecture.md) | `references/cheatsheets/Zero_Trust_Architecture.md` | done |
| [Subdomain Takeover Prevention](references/cheatsheets/Subdomain_Takeover_Prevention.md) | `references/cheatsheets/Subdomain_Takeover_Prevention.md` | done |
| [Multi Tenant Security](references/cheatsheets/Multi_Tenant_Security.md) | `references/cheatsheets/Multi_Tenant_Security.md` | done |

### CI/CD & supply chain (6/6)

| Cheat sheet | File | Status |
|---|---|---|
| [CI CD Security](references/cheatsheets/CI_CD_Security.md) | `references/cheatsheets/CI_CD_Security.md` | done |
| [GitHub Actions Security](references/cheatsheets/GitHub_Actions_Security.md) | `references/cheatsheets/GitHub_Actions_Security.md` | done |
| [Dependency Graph SBOM](references/cheatsheets/Dependency_Graph_SBOM.md) | `references/cheatsheets/Dependency_Graph_SBOM.md` | done |
| [Vulnerable Dependency Management](references/cheatsheets/Vulnerable_Dependency_Management.md) | `references/cheatsheets/Vulnerable_Dependency_Management.md` | done |
| [Software Supply Chain Security](references/cheatsheets/Software_Supply_Chain_Security.md) | `references/cheatsheets/Software_Supply_Chain_Security.md` | done |
| [NPM Security](references/cheatsheets/NPM_Security.md) | `references/cheatsheets/NPM_Security.md` | done |

### AI, LLM & agents (9/9)

| Cheat sheet | File | Status |
|---|---|---|
| [AI Agent Security](references/cheatsheets/AI_Agent_Security.md) | `references/cheatsheets/AI_Agent_Security.md` | done |
| [AI-Powered Advertising Systems Security](references/cheatsheets/AI-Powered_Advertising_Systems_Security.md) | `references/cheatsheets/AI-Powered_Advertising_Systems_Security.md` | done |
| [AML Sanctions AI Agent Payments](references/cheatsheets/AML_Sanctions_AI_Agent_Payments.md) | `references/cheatsheets/AML_Sanctions_AI_Agent_Payments.md` | done |
| [LLM Prompt Injection Prevention](references/cheatsheets/LLM_Prompt_Injection_Prevention.md) | `references/cheatsheets/LLM_Prompt_Injection_Prevention.md` | done |
| [MCP Security](references/cheatsheets/MCP_Security.md) | `references/cheatsheets/MCP_Security.md` | done |
| [RAG Security](references/cheatsheets/RAG_Security.md) | `references/cheatsheets/RAG_Security.md` | done |
| [Secure AI Model Ops](references/cheatsheets/Secure_AI_Model_Ops.md) | `references/cheatsheets/Secure_AI_Model_Ops.md` | done |
| [Secure Coding with AI](references/cheatsheets/Secure_Coding_with_AI.md) | `references/cheatsheets/Secure_Coding_with_AI.md` | done |
| [Verifying Third Party Agent Execution Evidence](references/cheatsheets/Verifying_Third_Party_Agent_Execution_Evidence.md) | `references/cheatsheets/Verifying_Third_Party_Agent_Execution_Evidence.md` | done |

### Language & framework guides (16/16)

| Cheat sheet | File | Status |
|---|---|---|
| [Bean Validation](references/cheatsheets/Bean_Validation.md) | `references/cheatsheets/Bean_Validation.md` | done |
| [C-Based Toolchain Hardening](references/cheatsheets/C-Based_Toolchain_Hardening.md) | `references/cheatsheets/C-Based_Toolchain_Hardening.md` | done |
| [Django REST Framework](references/cheatsheets/Django_REST_Framework.md) | `references/cheatsheets/Django_REST_Framework.md` | done |
| [Django Security](references/cheatsheets/Django_Security.md) | `references/cheatsheets/Django_Security.md` | done |
| [DotNet Security](references/cheatsheets/DotNet_Security.md) | `references/cheatsheets/DotNet_Security.md` | done |
| [FastAPI Security](references/cheatsheets/FastAPI_Security.md) | `references/cheatsheets/FastAPI_Security.md` | done |
| [Injection Prevention in Java](references/cheatsheets/Injection_Prevention_in_Java.md) | `references/cheatsheets/Injection_Prevention_in_Java.md` | deprecated |
| [JAAS](references/cheatsheets/JAAS.md) | `references/cheatsheets/JAAS.md` | done |
| [Java Security](references/cheatsheets/Java_Security.md) | `references/cheatsheets/Java_Security.md` | done |
| [JavaScript and TypeScript Security](references/cheatsheets/JavaScript_and_TypeScript_Security.md) | `references/cheatsheets/JavaScript_and_TypeScript_Security.md` | done |
| [Laravel](references/cheatsheets/Laravel.md) | `references/cheatsheets/Laravel.md` | done |
| [Nextjs Security](references/cheatsheets/Nextjs_Security.md) | `references/cheatsheets/Nextjs_Security.md` | done |
| [Nodejs Security](references/cheatsheets/Nodejs_Security.md) | `references/cheatsheets/Nodejs_Security.md` | done |
| [PHP Configuration](references/cheatsheets/PHP_Configuration.md) | `references/cheatsheets/PHP_Configuration.md` | done |
| [Ruby on Rails](references/cheatsheets/Ruby_on_Rails.md) | `references/cheatsheets/Ruby_on_Rails.md` | done |
| [Symfony](references/cheatsheets/Symfony.md) | `references/cheatsheets/Symfony.md` | done |

### Mobile & embedded (3/3)

| Cheat sheet | File | Status |
|---|---|---|
| [Mobile Application Security](references/cheatsheets/Mobile_Application_Security.md) | `references/cheatsheets/Mobile_Application_Security.md` | done |
| [Automotive Security](references/cheatsheets/Automotive_Security.md) | `references/cheatsheets/Automotive_Security.md` | done |
| [Drone Security](references/cheatsheets/Drone_Security.md) | `references/cheatsheets/Drone_Security.md` | done |

### Security process & cross-cutting (9/9)

| Cheat sheet | File | Status |
|---|---|---|
| [Abuse Case](references/cheatsheets/Abuse_Case.md) | `references/cheatsheets/Abuse_Case.md` | done |
| [Attack Surface Analysis](references/cheatsheets/Attack_Surface_Analysis.md) | `references/cheatsheets/Attack_Surface_Analysis.md` | done |
| [Threat Modeling](references/cheatsheets/Threat_Modeling.md) | `references/cheatsheets/Threat_Modeling.md` | done |
| [Secure Code Review](references/cheatsheets/Secure_Code_Review.md) | `references/cheatsheets/Secure_Code_Review.md` | done |
| [Secure Product Design](references/cheatsheets/Secure_Product_Design.md) | `references/cheatsheets/Secure_Product_Design.md` | done |
| [Security Terminology](references/cheatsheets/Security_Terminology.md) | `references/cheatsheets/Security_Terminology.md` | done |
| [Vulnerability Disclosure](references/cheatsheets/Vulnerability_Disclosure.md) | `references/cheatsheets/Vulnerability_Disclosure.md` | done |
| [Virtual Patching](references/cheatsheets/Virtual_Patching.md) | `references/cheatsheets/Virtual_Patching.md` | done |
| [Legacy Application Management](references/cheatsheets/Legacy_Application_Management.md) | `references/cheatsheets/Legacy_Application_Management.md` | done |

## The per-sheet file template

Every `references/cheatsheets/<Slug>.md` follows the same shape, and the catalog gate enforces it:

- `## What it is` : the sheet's scope in a sentence or two.
- `## The attack it stops` : the real attack, grounded in the OWASP sheet and, where it maps, the attacker's
  view from a penetration-testing source.
- `## Controls` : the condensed, actionable controls from the OWASP sheet, in its order of preference.
- `## @security scenario` : a real, executable Gherkin `@security` scenario (the canonical copy to add to the
  shared feature index). The gate rejects prose here: it must contain a `@security` tag, `Scenario:`, and
  `Given` / `When` / `Then`.
- `## The real guarantee` : the structural control that makes every case safe, versus what the scenario checks.
- `## Sources` : the OWASP cheat-sheet URL with a retrieval date, plus any penetration-testing citation. Cite
  only what was read.

## Mechanical gate

- `scripts/check-security-coverage.mjs` (test: `test/owasp-security-coverage.test.mjs`) is the enforcement gate
  for the selection flow. It maps the changed code to the security surfaces it touches
  (`assets/security-coverage.config.json`) and fails closed when a triggered surface has no matching
  `@security` scenario in the feature index and no valid waiver. This is what makes the flow impossible to skip
  on a security-relevant change. Adopters run it on their changed files in CI.
- `scripts/check-cheatsheet-catalog.mjs` (test: `test/owasp-cheatsheet-catalog.test.mjs`) fails closed unless
  every sheet has its file, all required sections, a citation URL, and an executable `@security` Gherkin
  scenario, and is indexed above, with no orphan files. It confirms all 137 are complete.
- `scripts/check-owasp-lints.mjs` (test: `test/owasp-lints.test.mjs`) is the code-level secure-coding lint
  (JWT `alg:none`, insecure cookie flags).
- The `@security` scenarios are validated as real runnable Gherkin by `bdd-comprehensive-testing`'s
  `check-gherkin-valid.mjs`, and in an adopting repo they execute in CI through that skill's runner.

## Before you call it done

- [ ] The selection flow ran: the change's surface was scoped, threats determined and ranked, and the cheat
      sheet(s) selected (OWASP threat modeling steps 1 and 2).
- [ ] Countermeasures applied, each with a risk response (eliminate, mitigate, transfer, or reasoned accept).
- [ ] Each control has an executable `@security` scenario in the repo's shared feature-file index, wired into
      CI, not just prose in the per-sheet doc.
- [ ] The structural guarantee is named, separate from what the scenario checks.
- [ ] The **security-decision record** (OWASP threat modeling step 4) exists: surface, sheets selected, threats
      and ranking, countermeasures, scenarios added or reasoned waivers, and the real guarantee for each.
- [ ] `check-security-coverage.mjs`, `check-cheatsheet-catalog.mjs`, and `check-owasp-lints.mjs` pass.
- [ ] The run records its **evidence ledger**: each control, the attack it stops, the `@security` scenario that
      tests it, and the source read, each with an evidence state and a re-runnable source.

## Reference files

| Topic | File |
|---|---|
| The authoritative list of all 137 cheat sheets | `references/cheatsheets-manifest.json` |
| One file per cheat sheet (the routing targets) | `references/cheatsheets/<Slug>.md` |
| Standing cross-cutting companion (not an OWASP sheet): avoid self-lockout, accidental deletion, and broken access while hardening | `references/lockout-prevention-safe-changes.md` |
| Example executable `@security` features, one per stack layer (merge into the adopter's shared index) | `assets/example/features/` |
| Enforcement gate for the selection flow (change-type to required scenario) | `scripts/check-security-coverage.mjs` |
| The surface-to-scenario map the enforcement gate reads (tune per stack) | `assets/security-coverage.config.json` |
| Completeness gate for the per-sheet catalog | `scripts/check-cheatsheet-catalog.mjs` |
| Code-level secure-coding lints | `scripts/check-owasp-lints.mjs` |
| License-hygiene gate: each own-words sheet vs its vendored CC-BY-SA source | `scripts/check-verbatim.mjs` (`npm run check:verbatim`) |
| Fetch the exact upstream OWASP text (CC-BY-SA, on demand) | `tools/vendor-owasp.mjs` (`npm run vendor:owasp`) |
| The vendored exact text and its attribution | `vendor/NOTICE.md` |

## Evidence & skeptical assessment (required)

"This control is in place and tested" is a factual claim, so it follows the repo's evidence discipline
(canonical contract:
[`skeptical-audit/references/evidence-discipline.md`](../skeptical-audit/references/evidence-discipline.md)).
The deliverable for a change is its **evidence ledger**: each control, its attack, its `@security` scenario,
and the source read, each with a state and a re-runnable source.

| Claim | Reaches `observed` by | Becomes `proven` when |
|---|---|---|
| "This control is applied" | the code shows the structural control (the parameterized query, the encoder, the Argon2id call) at a `file:line` | a lint or type makes the unsafe form impossible (for example `check-owasp-lints` blocks `alg:none` and insecure cookies) |
| "The control is tested" | the `@security` scenario runs against the code and passes | the scenario is in the shared feature index and runs as a blocking autotest on every push (via `bdd-comprehensive-testing`) |
| "The per-sheet catalog is honest" | the per-sheet file reads complete and cited | `check-cheatsheet-catalog.mjs` passes in CI with a discriminating test |
| "The guidance matches OWASP" | the controls match the cited cheat-sheet URL read this session | the citation is present and the sheet's content was read, not summarized by proxy |

**Definition of done:** the right sheets are applied; every control has an executable `@security` scenario in
the shared feature index wired into CI; the structural guarantee is named; both gates pass; and the evidence
ledger is recorded. A security control with no scenario in the shared index is `not-assessed`, never a pass.

## Why this holds for every developer and every agent

It binds everyone because the controls, the per-sheet files, the catalog gate, and the `@security` scenarios
live in committed files and CI, not memory. Agents get it through the always-on hook, which lists this skill in
`always-on/enterprise-skills-always-on.md`. People and agents alike are held by the catalog gate (no
half-written sheet merges) and by the shared feature index plus `bdd-comprehensive-testing`'s gherkin and
coverage gates (a security control with no runnable scenario does not merge). It survives any one person
because everything is in git. The honest limit: the catalog gate proves a sheet is complete and its scenario
is real Gherkin, and the BDD gates prove the scenario runs; none of them proves the control is the right one
for the threat, which is why the attacker-view threat modeling and a `judge-arch` review sit alongside. A
second honest limit: each per-sheet file condenses a single OWASP cheat sheet, so it inherits that one
source's coverage and currency. This matters most for the fast-moving AI and LLM sheets; for those, treat the
condensed file as a routing entry point and read the live upstream sheet (and OWASP's separate AI/LLM project)
before relying on it.

## Sources and attribution

- OWASP Cheat Sheet Series (<https://cheatsheetseries.owasp.org/>, index retrieved 2026-10-10): the 137 cheat
  sheets this skill routes to; each per-sheet file cites the specific sheet it condenses, read this session.
  `[documented]`
- Georgia Weidman, *Penetration Testing: A Hands-On Introduction to Hacking* (No Starch Press, 2014, ISBN
  978-1-59327-564-8): the attacker's view that hardens the per-sheet files, cited per sheet from the chapters
  read this session. `[documented]`
- `bdd-comprehensive-testing` (this repo): owns the shared feature-file index, the official-parser gherkin
  validation, and the CI wiring that runs the `@security` scenarios. `[documented]`
