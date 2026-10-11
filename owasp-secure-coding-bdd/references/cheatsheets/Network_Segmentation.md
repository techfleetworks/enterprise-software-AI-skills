# Network Segmentation

## What it is

How to split a service network into isolated zones so a break in one place cannot spread. The core idea is
defense in depth: separate the public-facing tier, the application tier, and the data tier with firewalls, and
write down the rules that say what may talk to what. This is the per-sheet guidance from the OWASP Network
Segmentation Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

In a flat network, one compromised machine reaches all the others. If an attacker runs commands on a public web
server, a flat layout lets them hop straight to the database. If they break into the database host, nothing stops
it from calling out to a command-and-control server on the internet. Segmentation slows every one of these moves:
a lateral step, a jump to the next server, a path from a compromised corporate service into the target. Each
firewall crossing is another barrier the attacker has to defeat.

## Controls

The cheat sheet lays out these building blocks:

1. **Three security zones by default.** Design each system with at least three separated tiers:
   - *FRONTEND:* the public-facing segments, holding the load balancer, the application-layer firewall, the web
     server, and the web cache.
   - *MIDDLEWARE:* the segments for the application logic, holding the web apps that process requests, plus
     authorization services, analytics, message queues, and stream processing.
   - *BACKEND:* the segments for stored data, holding the SQL database, the LDAP directory or domain controller,
     the cryptographic key store, and the file server.
2. **Firewalls at every zone boundary.** A boundary crossing means passing through a firewall. Place the public
   tier behind an edge firewall (for example, split into an inbound DMZ protected by a WAF and an outgoing DMZ
   that reaches external networks but accepts nothing inbound), and the application and data tiers behind an
   internal firewall that splits them into VLANs such as applications, databases, directory services, and logs.
3. **Interservice interaction rules.** When different systems talk to each other, define the firewall policy
   explicitly. Two rules matter most:
   - Block access between the FRONTEND and MIDDLEWARE segments of different systems.
   - Block any system's MIDDLEWARE from reaching another system's BACKEND; never let one app reach a foreign
     database without going through that database's own application server.
4. **Load balancer when consolidating apps.** If you run many apps per network to keep network count down, put a
   load balancer in front and open just one port into that network, routing by request parameters. Understand
   the trade-off: true segmentation stops working, because access control between those apps now happens at OSI
   layer 7 in the balancer rather than at the network boundary.
5. **A written network security policy.** Keep a "paper" policy describing the firewall rules and the baseline
   allowed access, so network admins, security staff, auditors, architects, and developers share one reference.
   Express it with simple, consistent diagrams, and include worked examples such as:
   - *CI/CD permissions:* the baseline access the build and deploy system is allowed.
   - *Secure logging:* ship logs to a separate server over a protocol like syslog that only appends events, so an
     attacker who compromises a system cannot rewrite its logs afterward.
   - *Monitoring permissions:* the access a monitoring system (for example Zabbix) needs.

## @security scenario

```gherkin
@security @owasp:network-segmentation @usecase:contain-web-server-compromise
Scenario: A compromised web server cannot reach the backend database directly
  Given a FRONTEND zone, a MIDDLEWARE zone, and a BACKEND zone separated by firewalls
  When an attacker runs commands on a web server in the FRONTEND zone
  And tries to open a connection straight to the SQL database in the BACKEND zone
  Then the firewall drops the connection because no rule permits FRONTEND to reach BACKEND
  And the database is reachable only through the application tier in MIDDLEWARE
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually contains an intrusion is the segmented layout plus the firewall rules between zones: with
no permitted path from the public tier to the data tier, a compromised web server has nowhere to pivot, and a
compromised database cannot call home. The `@security` scenario proves one forbidden hop is dropped; the zone
boundaries and the deny-by-default policy are what block every such hop. A test is a check; the firewall
boundaries between zones are the guarantee.

## Sources

- OWASP Network Segmentation Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Network_Segmentation_Cheat_Sheet.html>, retrieved 2026-10-11): the three-zone architecture (FRONTEND, MIDDLEWARE, BACKEND), firewalls at zone boundaries, the interservice allow/deny rules, the load-balancer consolidation trade-off, and the written network security policy with its CI/CD, logging, and monitoring examples. `[documented]`
