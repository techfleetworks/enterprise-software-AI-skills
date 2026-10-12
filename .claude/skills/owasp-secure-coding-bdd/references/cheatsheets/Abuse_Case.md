# Abuse Case

## What it is

A way to turn vague security wishes ("the app must be secure") into a concrete, tracked list of the specific
attacks a feature must defend against, each tied back to a real business function. An abuse case names how
someone could misuse a feature to get an outcome the builder never intended, then carries that finding into the
feature's requirements. This is the per-sheet guidance from the OWASP Abuse Case Cheat Sheet (an archived,
historical sheet), condensed to the practice it describes and the gap it closes.

## The attack it stops

The failure here is not a single exploit but a whole class of attacks nobody planned for, because the only
stated requirement was something empty like "defend against the OWASP Top 10." That sentence tells a
development team nothing it can build or test. So the business-logic abuses slip through: a password reset flow
reused to enumerate accounts, an online-shop price field edited down before checkout, a stock trade opened in
the morning and settled at day's end only if the price moved the right way. These are not bugs in the usual
sense; the feature works as coded. They get missed because no one ever wrote down, per feature, what an
attacker would try. Naming each abuse up front, with a risk rating and an owner, is what keeps it from shipping
unconsidered.

## Controls

The cheat sheet's pragmatic workflow, in order:
1. **Know why you are listing attacks.** Pinning down the concrete attacks per feature lets the team rate each
   one's business risk, pick which to address against budget, derive real security requirements, estimate the
   extra effort, and decide where each defense belongs (code, design, network, or infrastructure).
2. **Run a workshop to generate the list.** Bring together a business analyst (explains each feature), a risk
   analyst (rates business impact), one or ideally two penetration testers with different backgrounds (propose
   the attacks), technical leads (judge feasibility of fixes), and a QA or functional tester (knows how the
   feature should and should not behave). Four hours is a reasonable starting block.
3. **Record everything in a shared spreadsheet** with three tabs: a FEATURES tab, an ABUSE CASES tab, and an
   optional COUNTERMEASURES tab. Give every abuse case a unique ID such as `ABUSE_CASE_001` and every defense
   an ID such as `DEFENSE_001` so they can be traced later.
4. **Mark each abuse case Technical or Business.** A Technical one is like injecting script into a comment
   field; a Business one is like tampering with an article's price to pay less. Both kinds matter and are
   tagged separately.
5. **Keep CVSS and business risk apart.** If a specific vulnerability is involved, testers may record its CVSS
   severity and vector, but CVSS measures severity, not risk; risk leaders rate likelihood and business impact
   with the org's own method and never bend a CVSS number to stand in for business risk.
6. **Decide and document per feature.** Business, risk, and technical leads agree which abuses must be
   addressed and which are accepted; an accepted risk gets a written reason.
7. **Feed selections back into requirements.** Each abuse chosen to address becomes a security requirement in
   the spec (waterfall) or an acceptance criterion on the user story (agile), so the extra cost and the
   countermeasure are planned in, not bolted on.
8. **Time the workshop right.** In agile, hold it after stories are committed to a sprint; in waterfall, once
   the business features are known.
9. **Track where each abuse is handled.** Note the covered IDs in design or infrastructure docs, or mark them
   in code with a comment or an annotation such as `@AbuseCase(ids={"ABUSE_CASE_001"})`, so a simple script can
   find them.
10. **Validate the handling, automated and manual.** Add SAST/DAST rules and dedicated security unit,
    integration, or functional tests that run in CI; back them with peer security review and a pentest pass
    confirming the named attacks no longer work. These autotests also catch a countermeasure quietly removed
    during later maintenance. Over time, save the attacks and defenses you find into a reusable dictionary for
    your domain to speed up future workshops.

## @security scenario

```gherkin
@security @owasp:abuse-case @usecase:price-tamper-business-logic
Scenario: A checkout rejects a client-tampered item price
  Given an online shop feature with a recorded abuse case ABUSE_CASE_001 for price tampering
  When an attacker lowers an item's price in the request before placing the order
  Then the order is priced only from the server-side catalog value and the tampered amount is ignored
  And the rejection is logged so the countermeasure for ABUSE_CASE_001 can be audited
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario. Tie
the scenario's tag to the abuse case ID so the executable test and the tracked finding point at each other.

## The real guarantee

What actually protects the feature is the discipline of naming the attack per feature, turning it into a
requirement, and keeping a running autotest that proves the countermeasure is still live. The listing is what
surfaces the business-logic abuse that generic requirements never would; the executable check is what stops it
from quietly regressing when the code is next touched. The `@security` scenario proves one named abuse is
blocked today; the tracked-and-tested abuse case is what keeps it blocked. A test is a check; the maintained
abuse case list and its wired-in validation are the guarantee.

## Sources

- OWASP Abuse Case Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Abuse_Case_Cheat_Sheet.html>, retrieved 2026-10-11): the workshop roles and flow, the spreadsheet and unique-ID scheme, the Technical-versus-Business tagging, keeping CVSS separate from business risk, feeding selected abuses into requirements, and tracking plus validating each countermeasure in CI. `[documented]`
