# File Upload, SSRF, Deserialization & XXE

Covers: File Upload Security, Server-Side Request Forgery (SSRF) Prevention, Deserialization, XML External Entity (XXE) Prevention.

## File uploads
- Validate file type by **content** (magic-byte/signature inspection), not by trusting the client-supplied `Content-Type` header or file extension alone — both are trivially spoofed.
- Enforce a maximum file size server-side before/while reading the upload, to prevent resource-exhaustion.
- Generate a new, random filename server-side for storage; never use the client-supplied filename directly for the storage path (prevents path traversal via `../../` in filenames and collisions/overwrites).
- Store uploaded files outside the web root, or in object storage (S3/GCS/Blob) with no execute permission, so an uploaded file can never be directly requested and executed by the web server.
- If files are served back to users, serve them with a `Content-Disposition: attachment` header and a safe `Content-Type` (or force download) for any type that could be rendered as HTML/JS by a browser, to prevent stored-XSS-via-upload.
- Scan uploads for malware if the app accepts files from untrusted users at any meaningful scale (ClamAV or a cloud scanning service).
- Reject archive files (zip) from expanding without limits — enforce a decompression size/ratio limit (zip bomb defense).

## Server-Side Request Forgery (SSRF)
- Relevant whenever the application makes an outbound HTTP(S) request to a URL that is, even partially, influenced by user input (webhooks, "fetch this image URL," PDF-from-URL generators, link previews, import-from-URL features).
- **Prefer an allow-list of exact destination hosts/schemes** (the by-construction control) over a deny-list — resolve the host server-side and confirm the *resulting IP* is one you intend to reach. A deny-list is error-prone but, where you must use one, block at least: `127.0.0.0/8`, `0.0.0.0/8` (the address `0.0.0.0` itself routes to localhost on Linux), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (incl. the cloud metadata endpoint `169.254.169.254`), and IPv6 `::1`, `fc00::/7`, `fe80::/10`, plus **IPv4-mapped IPv6** (`::ffff:169.254.169.254`). Also reject **encoded/alternate IP forms** that bypass naive string checks — decimal (`http://2130706433/`), octal (`http://0177.0.0.1/`), and hex — by comparing the *parsed, canonical* IP, not the raw string.
- Re-check the resolved IP at connection time, not just at initial validation — DNS rebinding can change what a hostname resolves to between the check and the actual request.
- Disable following redirects automatically for user-supplied URL fetches, or re-validate the redirect target against the same allow-list before following it.
- **Preferred structural control:** make the outbound request from a network-isolated egress path/proxy that has **no route to internal infrastructure at all** — a dedicated egress proxy or a locked-down security group. Application-level IP checks are defense in depth *on top of* this, not a substitute: the network boundary is what holds when a check is bypassed.

## Deserialization
- Avoid deserializing data with formats/APIs that can trigger arbitrary code execution from untrusted input: Java's native `ObjectInputStream`, Python `pickle`, PHP `unserialize()`, Ruby `Marshal.load`, and `YAML.unsafe_load` on untrusted data — all are unsafe if fed attacker-controlled bytes. (Note: Ruby's `YAML.load` is **safe by default since Psych 4 / Ruby 3.1** — it behaves like `safe_load`; the dangerous call is now `YAML.unsafe_load`. On older Rubies, `YAML.load` is still the unsafe one.) `[documented: Ruby 3.1 / Psych 4 release notes]`
- Prefer plain-data formats (JSON, well-configured XML/YAML without object instantiation) for anything crossing a trust boundary, and use libraries in a mode that only builds plain data structures, not arbitrary objects.
- If native object deserialization of untrusted data is unavoidable, use integrity verification (signed/HMAC'd payloads checked before deserializing) and a strict allow-list of deserializable classes/types.

## XML External Entity (XXE) injection
- If parsing XML from an untrusted source, **disable external entity resolution and DTD processing** in the XML parser configuration — this is off by default in some modern parser versions but must be explicitly verified/set for many common libraries (e.g., explicitly disable `DTDHandler`/external entities in Java's `DocumentBuilderFactory`, .NET's `XmlReaderSettings.DtdProcessing = Prohibit`, Python's `defusedxml` instead of stdlib `xml.etree` for untrusted input).
- Prefer JSON over XML for new APIs handling untrusted input where there's a choice, simply to remove this entire class of risk.

## BDD security scenario patterns

```gherkin
@security
Scenario: Uploaded file type is validated by content, not extension
  When a user uploads a file named "image.png" containing executable script content
  Then the upload is rejected or the file is not served as executable/HTML content

@security
Scenario: Uploaded filename cannot traverse directories
  When a user uploads a file named "../../etc/cronjob"
  Then the file is stored under a generated safe name, not the traversal path

@security
Scenario Outline: Outbound URL fetch feature blocks internal network targets
  When a user submits a webhook URL of "<url>"
  Then the request is rejected before any outbound connection is made

  Examples:
    | url                                          |
    | http://169.254.169.254/latest/meta-data/     |
    | http://127.0.0.1:6379/                       |
    | http://10.0.0.5/internal-admin               |

@security
Scenario: XML upload does not resolve external entities
  Given a user uploads an XML file containing an external entity referencing a local file
  When the XML is parsed
  Then the external entity is not resolved and no local file content is returned
```
