# Denial of Service

## What it is

How to keep an application available when someone tries to knock it offline by draining its resources. A denial
of service (DoS) attack goes after availability, the "A" in the CIA triad, by overloading the app, the session
layer, or the network until real users cannot get through. This is the per-sheet guidance from the OWASP Denial
of Service Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

An attacker does not need to break in to take you down; they only need to make you run out of something. The
cheat sheet calls out slow HTTP attacks as a cheap, effective example: the attacker sends each HTTP request in
tiny pieces, very slowly, and never finishes it. The server holds a connection open for every unfinished
request while it waits for the rest of the data. With enough of these dribbling requests, the connection pool
fills up, and the server has nothing left for honest clients. Other versions exhaust CPU, memory, disk, file
handles, or raw network bandwidth. A single point of failure makes any of these far worse, because one
overwhelmed piece can drag the whole system down.

## Controls

The cheat sheet groups its defenses by where they apply. Work through them together, since no single layer is
enough:

**Software design (application layer):**
1. **Run cheap checks first.** Validate with low-cost checks before you spend CPU, memory, or bandwidth on
   expensive ones, so bad requests get dropped early.
2. **Design for graceful degradation.** Build the app so it keeps serving a reduced level of function when
   parts fail, instead of collapsing all at once.
3. **Remove single points of failure.** Favor stateless components, redundancy, and bulkheads that stop one
   failure from spreading, and make sure the app survives when an external dependency goes down.
4. **Avoid heavy CPU work.** Find and fix operations that burn a lot of processor time, since they turn into
   choke points under load.
5. **Handle every exception.** Make sure the code catches and manages errors cleanly, because an overwhelmed
   system will throw many of them and must stay running.
6. **Guard against overflow and underflow.** Prevent buffer overflow and underflow bugs, which both cause
   crashes and open vulnerabilities.
7. **Use asynchronous work.** Do not block on long-running tasks; use async operations so one slow job does not
   stall everything behind it.
8. **Know your expensive pages.** Identify resource-heavy endpoints up front and plan capacity for them.

**Session layer:**
9. **Expire idle and old sessions.** Set a server-side timeout on inactivity plus a hard final timeout, so
   abandoned sessions stop tying up resources.
10. **Store little per session.** Keep the data attached to each session small, so many sessions cost the
    server less.

**Input validation:**
11. **Cap file uploads.** Limit the size and allowed extensions of uploads to protect storage and any feature
    that processes the file (resizing, PDF generation, and the like).
12. **Cap total request size.** Reject oversized requests to make resource-draining attacks harder.
13. **Do not size allocations from input.** Never let raw user input decide how much memory or how many
    resources you reserve.
14. **Do not let input drive function or thread counts.** Keep user input from controlling how many times a
    function runs or how hard the CPU works, which would hand an attacker a resource-exhaustion lever.
15. **Use puzzles only against abuse, not DoS.** Captchas and math challenges can slow functionality abuse such
    as spamming a contact form, but they do not stop a real DoS attack.

**Access control:**
16. **Gate risky functions behind auth.** Apply least privilege so attackers cannot reach damaging functions
    they could abuse for DoS.
17. **Watch out for user lockout.** Do not let an attacker weaponize your own login-failure lockout to deny
    service to real accounts.

**Network design:**
18. **Prevent single points of failure** at the network level too, as above.
19. **Cache aggressively.** Serving more data from cache makes the app more resilient to bandwidth exhaustion.
20. **Host static files on another domain.** Moving images and scripts elsewhere cuts the request load on the
    main application.

**Rate limiting:**
21. **Require a minimum inbound data rate per connection,** enforced with request-read timeouts, so slow HTTP
    attacks get cut off (for example, Apache `mod_reqtimeout`). Tune the floor from your traffic logs: set it
    too high and you drop slow but genuine clients, too low and slow senders still get through.
22. **Set an absolute connection timeout** so no single connection lives forever.
23. **Set a maximum ingress data rate** and drop connections that go over it.
24. **Set a total bandwidth ceiling** to head off bandwidth exhaustion.
25. **Set a load limit** on how many users may hit any one resource at a time.

**ISP and global level:**
26. **Filter spoofed source addresses at edge routers** (per RFC 2267) to stop IP-spoofing used to dodge block
    lists.
27. **Check your ISP's DDoS readiness** ahead of time: multiple access points, enough bandwidth, and traffic
    analysis hardware.
28. **Consider a commercial DDoS filtering service** for large attacks. Match the provider's mitigation
    capacity and coverage to your availability needs rather than trusting a fixed size ceiling, and confirm
    they comply with privacy law since many route traffic through other countries.

## @security scenario

```gherkin
@security @owasp:denial-of-service @usecase:slow-http-resource-exhaustion
Scenario: A slow HTTP sender cannot exhaust the connection pool
  Given a web server with a request-read timeout and a minimum ingress data rate configured
  When an attacker opens many connections and sends each request one byte at a time below the minimum rate
  Then each stalled connection is closed once it breaches the read timeout
  And the connection pool stays available so legitimate requests are still served
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps the service up is the layered resource discipline: timeouts and rate limits that cut off
greedy connections, cheap-first validation and bounded allocations that deny the attacker any single resource
to drain, and redundancy that removes the single point of failure they are counting on. The `@security`
scenario proves one slow-sender pattern gets dropped; the timeout and minimum-rate controls are what make the
whole class of resource-exhaustion attacks fail. A test is a check; the enforced resource limits are the
guarantee.

## Sources

- OWASP Denial of Service Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html>, retrieved 2026-10-11): the attack-surface breakdown (application, session, network) and the full set of design, input-validation, access-control, rate-limiting, and ISP/global controls summarized above. `[documented]`
