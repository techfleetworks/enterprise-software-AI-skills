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
2026-10-10). Files marked `done` are written to the per-sheet template with a cited, executable `@security`
scenario; `pending` sheets are being migrated from the interim cluster references listed further down. The
`check-cheatsheet-catalog.mjs` gate keeps this honest: every `done` sheet must have its file, every required
section, a citation, an executable `@security` scenario, and an entry in this index.

| # | Cheat sheet | File | Status |
|---|---|---|---|
| 1 | Abuse Case | `references/cheatsheets/Abuse_Case.md` | pending |
| 2 | Access Control | `references/cheatsheets/Access_Control.md` | pending |
| 3 | AI Agent Security | `references/cheatsheets/AI_Agent_Security.md` | pending |
| 4 | AI-Powered Advertising Systems Security | `references/cheatsheets/AI-Powered_Advertising_Systems_Security.md` | pending |
| 5 | AML Sanctions AI Agent Payments | `references/cheatsheets/AML_Sanctions_AI_Agent_Payments.md` | pending |
| 6 | Attack Surface Analysis | `references/cheatsheets/Attack_Surface_Analysis.md` | pending |
| 7 | Authentication | `references/cheatsheets/Authentication.md` | pending |
| 8 | Authentication Patterns | `references/cheatsheets/Authentication_Patterns.md` | pending |
| 9 | Authorization | `references/cheatsheets/Authorization.md` | pending |
| 10 | Authorization Decisions And Output Handling | `references/cheatsheets/Authorization_Decisions_And_Output_Handling.md` | pending |
| 11 | Authorization Patterns | `references/cheatsheets/Authorization_Patterns.md` | pending |
| 12 | Authorization Policy And Data Distribution | `references/cheatsheets/Authorization_Policy_And_Data_Distribution.md` | pending |
| 13 | Authorization Regression Testing | `references/cheatsheets/Authorization_Regression_Testing.md` | pending |
| 14 | Authorization Testing Automation | `references/cheatsheets/Authorization_Testing_Automation.md` | pending |
| 15 | Automotive Security | `references/cheatsheets/Automotive_Security.md` | pending |
| 16 | Bean Validation | `references/cheatsheets/Bean_Validation.md` | pending |
| 17 | Bot Management and Anti-Automation | `references/cheatsheets/Bot_Management_and_Anti-Automation.md` | pending |
| 18 | Browser Extension Vulnerabilities | `references/cheatsheets/Browser_Extension_Vulnerabilities.md` | pending |
| 19 | Business Logic Security | `references/cheatsheets/Business_Logic_Security.md` | pending |
| 20 | C-Based Toolchain Hardening | `references/cheatsheets/C-Based_Toolchain_Hardening.md` | pending |
| 21 | Choosing and Using Security Questions | `references/cheatsheets/Choosing_and_Using_Security_Questions.md` | pending |
| 22 | CI CD Security | `references/cheatsheets/CI_CD_Security.md` | pending |
| 23 | Clickjacking Defense | `references/cheatsheets/Clickjacking_Defense.md` | pending |
| 24 | Content Security Policy | `references/cheatsheets/Content_Security_Policy.md` | pending |
| 25 | Cookie Theft Mitigation | `references/cheatsheets/Cookie_Theft_Mitigation.md` | pending |
| 26 | Credential Stuffing Prevention | `references/cheatsheets/Credential_Stuffing_Prevention.md` | pending |
| 27 | [Cross Site Scripting Prevention](references/cheatsheets/Cross_Site_Scripting_Prevention.md) | `references/cheatsheets/Cross_Site_Scripting_Prevention.md` | done |
| 28 | Cross-Site Request Forgery Prevention | `references/cheatsheets/Cross-Site_Request_Forgery_Prevention.md` | pending |
| 29 | Cryptographic Storage | `references/cheatsheets/Cryptographic_Storage.md` | pending |
| 30 | Database Security | `references/cheatsheets/Database_Security.md` | pending |
| 31 | Denial of Service | `references/cheatsheets/Denial_of_Service.md` | pending |
| 32 | Dependency Graph SBOM | `references/cheatsheets/Dependency_Graph_SBOM.md` | pending |
| 33 | Deserialization | `references/cheatsheets/Deserialization.md` | pending |
| 34 | Django REST Framework | `references/cheatsheets/Django_REST_Framework.md` | pending |
| 35 | Django Security | `references/cheatsheets/Django_Security.md` | pending |
| 36 | Docker Security | `references/cheatsheets/Docker_Security.md` | pending |
| 37 | DOM based XSS Prevention | `references/cheatsheets/DOM_based_XSS_Prevention.md` | pending |
| 38 | DOM Clobbering Prevention | `references/cheatsheets/DOM_Clobbering_Prevention.md` | pending |
| 39 | DotNet Security | `references/cheatsheets/DotNet_Security.md` | pending |
| 40 | Drone Security | `references/cheatsheets/Drone_Security.md` | pending |
| 41 | Email Validation and Verification | `references/cheatsheets/Email_Validation_and_Verification.md` | pending |
| 42 | Error Handling | `references/cheatsheets/Error_Handling.md` | pending |
| 43 | FastAPI Security | `references/cheatsheets/FastAPI_Security.md` | pending |
| 44 | File Upload | `references/cheatsheets/File_Upload.md` | pending |
| 45 | Forgot Password | `references/cheatsheets/Forgot_Password.md` | pending |
| 46 | GitHub Actions Security | `references/cheatsheets/GitHub_Actions_Security.md` | pending |
| 47 | GraphQL | `references/cheatsheets/GraphQL.md` | pending |
| 48 | gRPC Security | `references/cheatsheets/gRPC_Security.md` | pending |
| 49 | HTML5 Security | `references/cheatsheets/HTML5_Security.md` | pending |
| 50 | HTTP Headers | `references/cheatsheets/HTTP_Headers.md` | pending |
| 51 | HTTP Strict Transport Security | `references/cheatsheets/HTTP_Strict_Transport_Security.md` | pending |
| 52 | Identity Propagation Patterns | `references/cheatsheets/Identity_Propagation_Patterns.md` | pending |
| 53 | Infrastructure as Code Security | `references/cheatsheets/Infrastructure_as_Code_Security.md` | pending |
| 54 | Injection Prevention | `references/cheatsheets/Injection_Prevention.md` | pending |
| 55 | Injection Prevention in Java | `references/cheatsheets/Injection_Prevention_in_Java.md` | pending |
| 56 | Input Validation | `references/cheatsheets/Input_Validation.md` | pending |
| 57 | Insecure Direct Object Reference Prevention | `references/cheatsheets/Insecure_Direct_Object_Reference_Prevention.md` | pending |
| 58 | JAAS | `references/cheatsheets/JAAS.md` | pending |
| 59 | Java Security | `references/cheatsheets/Java_Security.md` | pending |
| 60 | JavaScript and TypeScript Security | `references/cheatsheets/JavaScript_and_TypeScript_Security.md` | pending |
| 61 | JSON Web Token | `references/cheatsheets/JSON_Web_Token.md` | pending |
| 62 | Key Management | `references/cheatsheets/Key_Management.md` | pending |
| 63 | Kubernetes Security | `references/cheatsheets/Kubernetes_Security.md` | pending |
| 64 | Laravel | `references/cheatsheets/Laravel.md` | pending |
| 65 | LDAP Injection Prevention | `references/cheatsheets/LDAP_Injection_Prevention.md` | pending |
| 66 | Legacy Application Management | `references/cheatsheets/Legacy_Application_Management.md` | pending |
| 67 | LLM Prompt Injection Prevention | `references/cheatsheets/LLM_Prompt_Injection_Prevention.md` | pending |
| 68 | Logging | `references/cheatsheets/Logging.md` | pending |
| 69 | Logging Vocabulary | `references/cheatsheets/Logging_Vocabulary.md` | pending |
| 70 | Mass Assignment | `references/cheatsheets/Mass_Assignment.md` | pending |
| 71 | MCP Security | `references/cheatsheets/MCP_Security.md` | pending |
| 72 | Micro Frontend Security | `references/cheatsheets/Micro_Frontend_Security.md` | pending |
| 73 | Microservices based Security Arch Doc | `references/cheatsheets/Microservices_based_Security_Arch_Doc.md` | pending |
| 74 | Microservices Security | `references/cheatsheets/Microservices_Security.md` | pending |
| 75 | Mobile Application Security | `references/cheatsheets/Mobile_Application_Security.md` | pending |
| 76 | Multi Tenant Security | `references/cheatsheets/Multi_Tenant_Security.md` | pending |
| 77 | Multifactor Authentication | `references/cheatsheets/Multifactor_Authentication.md` | pending |
| 78 | Network Segmentation | `references/cheatsheets/Network_Segmentation.md` | pending |
| 79 | Nextjs Security | `references/cheatsheets/Nextjs_Security.md` | pending |
| 80 | NodeJS Docker | `references/cheatsheets/NodeJS_Docker.md` | pending |
| 81 | Nodejs Security | `references/cheatsheets/Nodejs_Security.md` | pending |
| 82 | NoSQL Security | `references/cheatsheets/NoSQL_Security.md` | pending |
| 83 | NPM Security | `references/cheatsheets/NPM_Security.md` | pending |
| 84 | OAuth2 | `references/cheatsheets/OAuth2.md` | pending |
| 85 | OS Command Injection Defense | `references/cheatsheets/OS_Command_Injection_Defense.md` | pending |
| 86 | Passkey Security | `references/cheatsheets/Passkey_Security.md` | pending |
| 87 | [Password Storage](references/cheatsheets/Password_Storage.md) | `references/cheatsheets/Password_Storage.md` | done |
| 88 | PHP Configuration | `references/cheatsheets/PHP_Configuration.md` | pending |
| 89 | Pinning | `references/cheatsheets/Pinning.md` | pending |
| 90 | Post Quantum Cryptography | `references/cheatsheets/Post_Quantum_Cryptography.md` | pending |
| 91 | Prototype Pollution Prevention | `references/cheatsheets/Prototype_Pollution_Prevention.md` | pending |
| 92 | Query Parameterization | `references/cheatsheets/Query_Parameterization.md` | pending |
| 93 | RAG Security | `references/cheatsheets/RAG_Security.md` | pending |
| 94 | REST Assessment | `references/cheatsheets/REST_Assessment.md` | pending |
| 95 | REST Security | `references/cheatsheets/REST_Security.md` | pending |
| 96 | Ruby on Rails | `references/cheatsheets/Ruby_on_Rails.md` | pending |
| 97 | SAML Security | `references/cheatsheets/SAML_Security.md` | pending |
| 98 | Secrets Management | `references/cheatsheets/Secrets_Management.md` | pending |
| 99 | Secure AI Model Ops | `references/cheatsheets/Secure_AI_Model_Ops.md` | pending |
| 100 | Secure Cloud Architecture | `references/cheatsheets/Secure_Cloud_Architecture.md` | pending |
| 101 | Secure Code Review | `references/cheatsheets/Secure_Code_Review.md` | pending |
| 102 | Secure Coding with AI | `references/cheatsheets/Secure_Coding_with_AI.md` | pending |
| 103 | Secure Product Design | `references/cheatsheets/Secure_Product_Design.md` | pending |
| 104 | Security Terminology | `references/cheatsheets/Security_Terminology.md` | pending |
| 105 | Server Side Request Forgery Prevention | `references/cheatsheets/Server_Side_Request_Forgery_Prevention.md` | pending |
| 106 | Server Side Template Injection Prevention | `references/cheatsheets/Server_Side_Template_Injection_Prevention.md` | pending |
| 107 | Serverless FaaS Security | `references/cheatsheets/Serverless_FaaS_Security.md` | pending |
| 108 | Session Management | `references/cheatsheets/Session_Management.md` | pending |
| 109 | Software Supply Chain Security | `references/cheatsheets/Software_Supply_Chain_Security.md` | pending |
| 110 | [SQL Injection Prevention](references/cheatsheets/SQL_Injection_Prevention.md) | `references/cheatsheets/SQL_Injection_Prevention.md` | done |
| 111 | Subdomain Takeover Prevention | `references/cheatsheets/Subdomain_Takeover_Prevention.md` | pending |
| 112 | Symfony | `references/cheatsheets/Symfony.md` | pending |
| 113 | Third Party Javascript Management | `references/cheatsheets/Third_Party_Javascript_Management.md` | pending |
| 114 | Third Party Payment Gateway Integration | `references/cheatsheets/Third_Party_Payment_Gateway_Integration.md` | pending |
| 115 | Threat Modeling | `references/cheatsheets/Threat_Modeling.md` | pending |
| 116 | TLS Cipher String | `references/cheatsheets/TLS_Cipher_String.md` | pending |
| 117 | Transaction Authorization | `references/cheatsheets/Transaction_Authorization.md` | pending |
| 118 | Transport Layer Protection | `references/cheatsheets/Transport_Layer_Protection.md` | pending |
| 119 | Transport Layer Security | `references/cheatsheets/Transport_Layer_Security.md` | pending |
| 120 | Unvalidated Redirects and Forwards | `references/cheatsheets/Unvalidated_Redirects_and_Forwards.md` | pending |
| 121 | User Privacy Protection | `references/cheatsheets/User_Privacy_Protection.md` | pending |
| 122 | Verifying Third Party Agent Execution Evidence | `references/cheatsheets/Verifying_Third_Party_Agent_Execution_Evidence.md` | pending |
| 123 | Virtual Patching | `references/cheatsheets/Virtual_Patching.md` | pending |
| 124 | Vulnerability Disclosure | `references/cheatsheets/Vulnerability_Disclosure.md` | pending |
| 125 | Vulnerable Dependency Management | `references/cheatsheets/Vulnerable_Dependency_Management.md` | pending |
| 126 | Web Cache Security | `references/cheatsheets/Web_Cache_Security.md` | pending |
| 127 | Web Frontend Security | `references/cheatsheets/Web_Frontend_Security.md` | pending |
| 128 | Web Service Security | `references/cheatsheets/Web_Service_Security.md` | pending |
| 129 | Webhook Security | `references/cheatsheets/Webhook_Security.md` | pending |
| 130 | WebSocket Security | `references/cheatsheets/WebSocket_Security.md` | pending |
| 131 | Workload Identity Federation | `references/cheatsheets/Workload_Identity_Federation.md` | pending |
| 132 | XML External Entity Prevention | `references/cheatsheets/XML_External_Entity_Prevention.md` | pending |
| 133 | XML Security | `references/cheatsheets/XML_Security.md` | pending |
| 134 | XPath Injection Prevention | `references/cheatsheets/XPath_Injection_Prevention.md` | pending |
| 135 | XS Leaks | `references/cheatsheets/XS_Leaks.md` | pending |
| 136 | XSS Filter Evasion | `references/cheatsheets/XSS_Filter_Evasion.md` | pending |
| 137 | Zero Trust Architecture | `references/cheatsheets/Zero_Trust_Architecture.md` | pending |

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
  every `done` sheet has its file, all required sections, a citation URL, and an executable `@security` Gherkin
  scenario, and is indexed above, with no orphan files. It reports progress toward all 137.
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
| Example executable `@security` feature (merges into the adopter's shared index) | `assets/example/features/owasp-security.feature` |
| Enforcement gate for the selection flow (change-type to required scenario) | `scripts/check-security-coverage.mjs` |
| The surface-to-scenario map the enforcement gate reads (tune per stack) | `assets/security-coverage.config.json` |
| Completeness gate for the per-sheet catalog | `scripts/check-cheatsheet-catalog.mjs` |
| Code-level secure-coding lints | `scripts/check-owasp-lints.mjs` |
| Fetch the exact upstream OWASP text (CC-BY-SA, on demand) | `tools/vendor-owasp.mjs` (`npm run vendor:owasp`) |
| The vendored exact text and its attribution | `third_party/owasp/NOTICE.md` |

The following interim cluster references hold the deep phase-2 content and are being migrated into the per-sheet
files, after which they will be removed: `references/access-control-authorization.md`,
`references/ai-llm-agent-security.md`, `references/api-tokens-graphql-microservices.md`,
`references/api-web-security-headers.md`, `references/authentication-session.md`,
`references/cryptography-secrets.md`, `references/file-upload-ssrf-deserialization.md`,
`references/injection-input-validation.md`, `references/language-framework-hardening.md`,
`references/lockout-prevention-safe-changes.md`, `references/logging-error-handling-dos.md`,
`references/platform-framework-specific.md`, `references/privacy-threat-modeling-business-logic.md`,
`references/third-party-dependency-container.md`, and the flat `references/owasp-full-index.md`.

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
for the threat, which is why the attacker-view threat modeling and a `judge-arch` review sit alongside.

## Sources and attribution

- OWASP Cheat Sheet Series (<https://cheatsheetseries.owasp.org/>, index retrieved 2026-10-10): the 137 cheat
  sheets this skill routes to; each per-sheet file cites the specific sheet it condenses, read this session.
  `[documented]`
- Georgia Weidman, *Penetration Testing: A Hands-On Introduction to Hacking* (No Starch Press, 2014, ISBN
  978-1-59327-564-8): the attacker's view that hardens the per-sheet files, cited per sheet from the chapters
  read this session. `[documented]`
- `bdd-comprehensive-testing` (this repo): owns the shared feature-file index, the official-parser gherkin
  validation, and the CI wiring that runs the `@security` scenarios. `[documented]`
