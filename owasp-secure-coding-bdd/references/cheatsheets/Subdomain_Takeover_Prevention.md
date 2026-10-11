# Subdomain Takeover Prevention

## What it is

How to keep an attacker from claiming one of your subdomains. The hole opens when a DNS record still points at a
third-party service or cloud resource that is already gone. Whoever re-registers that orphaned resource gets to
serve their own content on your subdomain. This is the per-sheet guidance from the OWASP Subdomain Takeover
Prevention Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

A team wires `blog.example.com` to a CNAME like `example-blog.herokuapp.com`, later deletes the Heroku app, and
leaves the DNS record behind. The record now points at a name nobody owns, so an attacker creates a fresh app with
that same name and takes the hostname. Now they control `blog.example.com` on a domain your users already trust.
From there they can grab session cookies scoped to the parent domain, slip past Content Security Policy rules that
trust `*.example.com`, host believable phishing, hijack OAuth or SSO flows that allow-list the subdomain, obtain
real TLS certificates through domain validation, and (with MX records) receive mail sent to the subdomain. A
records on released IPs and NS records delegating to a deleted zone can be hijacked the same way.

## Controls

Following the cheat sheet's prevention and response guidance:

1. **Decommission DNS in the safe order.** When you retire a service, first point the subdomain at a redirect or
   maintenance page, then update or remove the DNS record, then wait out the TTL for propagation, and only after
   that tear down the cloud resource. Doing it backward (resource first) leaves an open window until someone spots
   the dangling record.
2. **Keep a DNS inventory tied to ownership.** Record, for every CNAME, A, and NS entry, what it points to, which
   team owns it, which project it serves, when it was created and when it should go away, and why it exists. A
   spreadsheet or a CMDB works, as long as it is consulted and updated on every infrastructure change;
   infrastructure-as-code (Terraform, Pulumi, CDK) can double as that living inventory.
3. **Detect dangling records automatically.** Scan all DNS entries on a schedule to confirm each target still
   resolves and returns the content you expect rather than a provider error page. Build DNS validation into deploy
   and teardown pipelines so a service is not "removed" until its records are gone. Alert on new CNAMEs and on
   targets returning 404, NXDOMAIN, or default error pages. Tools include dnsReaper, nuclei templates, and the
   can-i-take-over-xyz reference.
4. **Use provider domain verification where it exists.** Services such as Azure App Service, Google Cloud, GitHub
   Pages, and Cloudflare for SaaS let you prove ownership (often a TXT record) so no other account can bind your
   custom domain. Keep the verification record in place even after decommissioning. Note that AWS CloudFront
   instead requires a trusted certificate covering a new alternate name, which already blocks a simple claim. Where
   no verification exists, removing the DNS record promptly is the only reliable protection.
5. **Restrict wildcard DNS.** A `*.example.com` record answers for every possible subdomain, including names tied
   to services that are gone, so avoid wildcards unless you must. If you need one, scope it as tightly as you can,
   pair it with a proxy or load balancer that allow-lists valid hostnames, and watch Certificate Transparency logs
   for unexpected issuance under the wildcard.
6. **Follow a decommissioning checklist.** For any external service, find all related DNS records (CNAME, A, MX,
   NS, TXT), redirect or remove them, wait for propagation, then remove the cloud resource. Revoke or expire the
   subdomain's certificates, update the inventory, pull the subdomain from OAuth redirect allow-lists, CSP, and
   CORS, and run a takeover scan to confirm it cannot be claimed.
7. **Shrink the blast radius with tight scoping.** Set cookies on the exact subdomain rather than the parent, and
   use the `__Host-` prefix where you can. List trusted subdomains explicitly in CSP, CORS, and OAuth redirect
   validation instead of wildcard patterns. Keep SPF, DKIM, and DMARC narrow so a hijacked subdomain cannot send
   mail that passes as yours.
8. **Monitor continuously.** Compare each record to its live resource, scan weekly for the known service
   fingerprints (for example `NoSuchBucket` or `No such app`), manage DNS under version control for a reviewed
   audit trail, and watch Certificate Transparency logs; a certificate you did not request is a strong sign a
   takeover is underway.
9. **Respond fast when one is found.** Remove the DNS record at once (or repoint it to something you control),
   revoke any certificates issued during the takeover, assess what cookies, phishing, OAuth flows, or mail could
   have been exposed, notify affected users if data was at risk, fix the process gap that let the record linger,
   sweep every zone you own for other dangling records, and document the incident.

## @security scenario

```gherkin
@security @owasp:subdomain-takeover @usecase:dangling-cname-claim
Scenario: A retired service leaves no claimable DNS record behind
  Given a subdomain whose CNAME pointed to a now-deleted cloud resource
  When the decommissioning pipeline runs
  Then the DNS record is removed or repointed before the resource is torn down
  And a takeover scan confirms the subdomain returns no provider error fingerprint and is not claimable
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually prevents takeover is removing or repointing the DNS record before the resource behind it stops
existing, so there is never a moment when your domain points at something a stranger can claim. The `@security`
scenario proves one retired subdomain is not claimable; the ordered decommissioning plus automated dangling-record
detection is what keeps every subdomain safe. A test is a check; the record never outliving its resource is the
guarantee.

## Sources

- OWASP Subdomain Takeover Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Subdomain_Takeover_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the takeover mechanism, at-risk record types, provider risk reference, prevention strategies (lifecycle order, inventory, detection, domain verification, wildcard limits, checklist, scoping), monitoring, and incident response summarized above. `[documented]`
