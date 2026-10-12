# Deserialization

## What it is

How to safely rebuild objects from serialized data when that data comes from an untrusted source. This is the per-sheet guidance from the OWASP Deserialization Cheat Sheet, condensed to the controls that hold and the attack they stop. It covers language-native formats (which carry the most risk), the safe configuration of common libraries, and format-agnostic defenses.

## The attack it stops

Native deserialization does not just read data: it can reconstruct arbitrary objects and run custom code that fires during the rebuild. When an attacker controls the serialized bytes, they can craft a payload that chains together existing classes (gadgets) to reach denial of service, access-control bypass, or remote code execution. For example, a Python app that calls `pickle.loads()` on attacker data can be made to execute arbitrary code, and a Java app reading a crafted `ObjectInputStream` stream can be driven to RCE through a known gadget chain. The fix is to never let untrusted bytes decide which classes get built or what code runs.

## Controls

Language-agnostic defenses (the strongest, apply everywhere):

1. **Prefer a pure data format over a native one.** Use JSON or XML so there is no custom deserialization logic to repurpose. Map incoming data into dedicated data-transfer objects rather than straight into domain objects.
2. **Only deserialize signed data.** When you know ahead of time which messages are legitimate, sign them at serialization time and refuse any message without a valid signature.

PHP:

- Audit every `unserialize()` call and how its input is sourced. For data you exchange with users, use a standard format via `json_encode()` and `json_decode()` instead.

Python:

- Never unpickle untrusted data; `pickle.load()` and `pickle.loads()` can execute arbitrary code.
- For untrusted YAML use `yaml.safe_load()`; avoid `yaml.unsafe_load()` and `yaml.load()` with an unsafe `Loader`, and do not register custom constructors that build arbitrary objects.
- Avoid `jsonpickle.decode()` on untrusted input.

Java (native `Serializable` format):

1. **Configure serialization filters** with an application-specific allow-list of classes plus resource limits (graph depth, references, array lengths, stream bytes) before reading any object, and bound the input size separately since filters skip concretely encoded strings and primitives. Filtering reduces risk but does not make arbitrary untrusted deserialization safe.
2. **Mark sensitive fields `transient`** (for example `private transient`) so they are neither written out nor set by an attacker during a rebuild.
3. **Block deserialization of domain objects** that must never be rebuilt by declaring a `final readObject()` that always throws.
4. **Harden your own `ObjectInputStream`** by overriding `resolveClass()` to allow only expected classes. Know the limits: strings are handled separately and proxies go through `resolveProxyClass()`, so a class check is not a full defense and must be paired with filtering. Community libraries such as SerialKiller and Apache Commons IO's `ValidatingObjectInputStream` implement this pattern.
5. **Use a JVM agent** (for example the `-javaagent:` option) to weave hardening into `ObjectInputStream` when you cannot change the code. Applied globally it is safe only for block-listing known-malicious gadget classes, since the expected classes vary by app.
6. **Audit risky Java APIs** for untrusted input: `XMLDecoder`, `XStream.fromXML` (vulnerable at or below v1.4.6), `ObjectInputStream.readObject` and `readUnshared`, and the `readObject`, `readObjectNoData`, `readResolve`, and `readExternal` hooks.

Other Java libraries and formats (pick safe ones and configure them):

- Usable safely by default: `fastjson2` (keep autotype off), `jackson-databind` (avoid polymorphism), Kryo v5.0.0+ (keep class registration on), YamlBeans v1.16+ (avoid `UnsafeYamlConfig`), and XStream v1.4.17+ (keep its allow-list in place).
- Need configuration first: `fastjson` v1.2.68+ (turn on safemode), json-io (use non-typed mode or a custom deserializer), Kryo below v5.0.0 (turn registration on), and SnakeYAML (use `SafeConstructor`).
- Avoid entirely for untrusted input: Castor, `fastjson` below v1.2.68, the JDK `XMLDecoder`, XStream below v1.4.17, and YamlBeans below v1.16.

.NET / C#:

1. **Do not use `BinaryFormatter`;** Microsoft states it cannot be secured.
2. **Do not let the data stream choose the type.** Prefer `DataContractSerializer` or `XmlSerializer`, set `JSON.Net`'s `TypeNameHandling` to `None`, and do not pair `JavaScriptSerializer` with a `JavaScriptTypeResolver`.
3. **If a stream must define its own type, restrict the allowed types** with a custom `SerializationBinder`, and understand this is still risky because some native types are dangerous in themselves.
4. **Never type-check after deserializing;** execution can already have happened, so an `is SomeType` check on the result is too late.
5. **Keep gadget-prone code away from internet-facing code,** stay current on known .NET RCE gadgets (such as `ObjectDataProvider`, `AssemblyInstaller`, and `WorkflowDesigner`), and remember a deserializer can only build types it knows about.
6. **Review for red flags** in source (`TypeNameHandling`, `JavaScriptTypeResolver`, user-controlled types) and in captured traffic (base64 beginning `AAEAAAD/////`, or text like `$type:`).

## @security scenario

```gherkin
@security @owasp:insecure-deserialization @usecase:object-intake
Scenario: An object intake endpoint refuses a native serialized payload
  Given an endpoint that accepts serialized objects from clients
  When an attacker posts a Java stream whose class is not on the allow-list
  Then the deserialization filter rejects the stream before any object is built
  And no gadget code runs
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually stops a deserialization attack is not accepting attacker-chosen types at all: use a pure data format parsed into fixed DTOs, or, where native deserialization is unavoidable, a filter that admits only an explicit allow-list of classes before any object is constructed. The `@security` scenario proves one off-list stream is blocked; refusing every type outside the allow-list is what makes every unknown gadget equally harmless. A test is a check; the class allow-list enforced before construction is the guarantee.

## Sources

- OWASP Deserialization Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html>, retrieved 2026-10-11): the per-language guidance (PHP, Python, Java, .NET), serialization filtering and `resolveClass()` hardening, the safe/unsafe library configuration lists, and the language-agnostic defenses (pure data formats, signed data). `[documented]`
