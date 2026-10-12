# XML External Entity Prevention

## What it is

How to stop XML External Entity (XXE) attacks: an XML parser resolving an external entity that came from untrusted input, which can leak local files, drive server-side request forgery (SSRF), or drain resources. This is the per-sheet guidance from the OWASP XML External Entity Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop. The core move is simple: turn off document type definitions (DTDs) and external entity loading in whatever parser you use.

## The attack it stops

XML lets a document declare an entity that points at an outside resource. If the parser resolves it, the attacker controls what that resource is. A payload such as `<!DOCTYPE doc [<!ENTITY win SYSTEM 'file:///C:/Users/testdata2.txt'>]><doc>&win;</doc>` makes the parser read a local file and splice its contents into the parsed result, where the attacker can read them back. Swap the `file://` target for an `http://` URL and the same trick becomes SSRF, letting the server reach internal hosts. A crafted DTD can also force runaway entity expansion for denial of service.

## Controls

In the order the cheat sheet presents them:
1. **Turn off DTDs entirely wherever you can.** Reject the DOCTYPE declaration when the parser supports that. This is the strongest single setting because no DTD means no external entities and no entity expansion.
2. **If DTDs are needed, disable external entity resolution and external DTD loading, and cap entity expansion.** Partial hardening is not enough.
3. **Keep XInclude off unless you truly need it**, since it can pull in resources on its own, separate from DTDs.
4. **Apply the same external-access limits to schema validation and style sheet processing**, not just the initial parse.
5. **Treat an unsupported security setting as a failure.** Stop processing untrusted XML rather than continuing with the setting missing; do not catch the exception and keep parsing.
6. **Hand the parser a stream rather than a filename or URL you do not trust.** The settings that block external entities place no limit on that very first resource you feed straight into a parsing API.
7. **Use each language's safe settings by name.** Java (JAXP): set `disallow-doctype-decl` to `true`, enable `FEATURE_SECURE_PROCESSING`, and for StAX set `SUPPORT_DTD` and `IS_SUPPORTING_EXTERNAL_ENTITIES` to `false`; for XSLT and schema work set `ACCESS_EXTERNAL_DTD`, `ACCESS_EXTERNAL_STYLESHEET`, and `ACCESS_EXTERNAL_SCHEMA` to `""`. Install resolvers on both factory and each validator, since validators do not inherit the factory resolver.
8. **C/C++ (libxml2):** do not set `XML_PARSE_NOENT` or `XML_PARSE_DTDLOAD`; versions 2.9 and later disable XXE by default. For Xerces-C, call `setDisableDefaultEntityResolution(true)`.
9. **.NET:** prefer parsers safe by default (`XmlReader`, `XDocument`, `XmlDictionaryReader`); for older framework versions set the `XmlResolver` to `null` or `DtdProcessing` to `Prohibit`, and set `httpRuntime targetFramework` to 4.5.2 or higher in `Web.config`.
10. **PHP:** on libxml 2.9.0 or later entity substitution is off by default; do not enable `LIBXML_NOENT`, and install an external entity loader callback that returns `null`.
11. **Python:** use the `defusedxml` parsing interfaces for untrusted XML, keep entity and external-resource rejection on, set `forbid_dtd=True` where available, and keep Python and Expat patched.
12. **iOS (`NSXMLDocument`):** avoid `NSXMLNodeLoadExternalEntitiesSameOriginOnly` for untrusted input; specify `NSXMLNodeLoadExternalEntitiesNever`.
13. **Do not feed untrusted input to `java.beans.XMLDecoder`;** blocking entities does not remove its deserialization risk.
14. **Scan for the weakness with static analysis** such as Semgrep rules for `DocumentBuilderFactory`, `SAXParserFactory`, and `XMLInputFactory`.

## @security scenario

```gherkin
@security @owasp:xxe @usecase:xml-upload-file-read
Scenario: An XML parser refuses an external entity that points at a local file
  Given an endpoint that parses an uploaded XML document
  When an attacker submits a document whose DOCTYPE declares an external entity pointing at "file:///etc/passwd"
  Then the parser rejects the DOCTYPE declaration and no file contents appear in the response
  And the parser runs with DTD processing disabled so external entities are never resolved
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually makes XXE impossible is the parser configuration that rejects the DOCTYPE and refuses to load any external entity: with DTD processing off, there is no entity for an attacker to point at a file or URL. The `@security` scenario proves one file-read payload is blocked; the disabled DTD and external-entity settings are what make every such payload safe. A test is a check; the hardened parser configuration is the guarantee.

## Sources

- OWASP XML External Entity Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the general guidance to disable DTDs and external entities, the per-language settings (Java JAXP, libxml2, Xerces-C, .NET, PHP, Python defusedxml, iOS), the fail-closed rule, and the stream-not-filename caution. `[documented]`
