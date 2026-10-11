# Verifying Third-Party Agent Execution Evidence

## What it is

How to judge an execution record handed to you by an agent, an MCP server, or any service you do not run. The
supplier can sign a record that leaves actions out or that describes a run that never took place, so you verify
the one claim you actually need and work out who could have faked the evidence behind it. This is the per-sheet
guidance from the OWASP Verifying Third-Party Agent Execution Evidence Cheat Sheet, condensed to the checks that
hold and the trap they stop.

## The attack it stops

The trap is treating a supplier's log as proof that something happened. A signature only shows who made a claim,
not that the claim is true, and a vendor who controls the recorder, the host, and the signing key is still a
single party vouching for itself. Taken at face value, such a record lets a supplier hide actions, invent ones,
backdate them, or drop events during a failure and then present a clean-looking report. These checks sort what a
record can actually support into three outcomes: independently re-checkable (a second reviewer can
re-establish the same property from authenticated evidence plus trust anchors that are not wholly in the
supplier's hands), a supplier assertion (claimed, but with no independent backing, still useful for debugging), or no information (do not read
it as proof the run was clean). Do not settle an incident or dispute with a supplier's own assertions alone.

## Controls

The cheat sheet's six questions to ask about any execution record, in source order:
1. **Who could have written or changed it?** List the component, host, recorder, operator, and key holder, and
   count independent parties rather than processes, since many services under one supplier are still one party.
   A recorder fed only by the component just preserves that component's story. Find an observer that gets event
   data on its own, keep its records where the supplier cannot rewrite them, and reconcile against calls caught
   at a gateway or boundary you control. Remember a boundary observer sees only what crosses it, not local file
   writes or in-process actions, and not encrypted bodies without the plaintext.
2. **What does the timing evidence really establish?** A supplier's timestamp is just its own claim. To test
   freshness, send a fresh unpredictable nonce and require it signed with the execution claims, then verify the
   signature and match the nonce. A matching nonce only bounds signing to after you issued the challenge; it
   does not show when each claim was captured. A trusted timestamp over the signed record shows it existed by a
   certain time but not that its contents are real. Record which timing property you checked, and do not call
   capture live just because a signature is fresh or appears in a transparency log.
3. **Does it name the artifact and execution you mean?** A signature that checks out over some
   other run tells you nothing about the one in front of you. Obtain the artifact you expect through a separate
   channel, hash it with a collision-resistant function, and test that value against the signed subject.
   Separately match the signed run identifier or challenge to the run you
   meant to review, and check which inputs are covered, such as tool definitions, config, prompts, model
   version, and policy. A digest fixes artifact identity and a run id fixes which execution is claimed, but
   neither shows the reported actions happened.
4. **Would a missing event be noticeable?** Define the window and the events an independent observer could see,
   then reconcile against an expected-event list or per-run sequence the supplier cannot quietly redefine. A
   transparency log can make post-entry changes detectable but cannot reveal an event that was never submitted,
   and a log can show different views to different clients, so verify inclusion and consistency proofs and check
   how the deployment spots divergent views. A log's total entry count is not the run's event count, and
   finding one injected event is a spot-check, not a completeness test.
5. **What happens when recording or delivery fails?** Find out whether the component keeps going and drops
   events, buffers and retries, or halts, and test buffer-overflow behavior as well as normal operation. Where
   you can, interrupt the recording path yourself and see if execution continues and gaps show; where you
   cannot, ask for evidence from a real or exercised outage and treat docs alone as a supplier claim. A gap
   marker written only by the component is still its assertion even if stored elsewhere. Halting on every
   logging failure is not always right, because it turns a recording outage into downtime; choose by the
   action's risk and make any lost evidence visible.
6. **Can a reviewer confirm it yet be unable to forge it?** Rely on a well-kept verifier configured apart from
   the record itself, holding the signer identities, keys or certificate roots you trust and the algorithms you
   allow. A key shipped inside the
   record is not a trust anchor just because it verifies that record; it has to tie back to trust you already
   hold. Validate certificate paths and revocation, and do not accept a signature just because the math checks
   out. Public-key verification needs no secret, but anyone holding the shared secret behind a MAC can also
   create one, so a MAC cannot attribute authorship between those holders, and asking the supplier's own service
   whether its record is valid leaves the supplier as the source.

Store the verification policy and the values you expect somewhere other than inside the record you are judging.

## @security scenario

```gherkin
@security @owasp:agent-execution-evidence @usecase:unforgeable-record-verification
Scenario: A vendor execution record is accepted only when it is independently verifiable
  Given an execution record signed and exported by a third-party agent vendor
  When a reviewer verifies it with a trusted signer identity and trust material the vendor does not solely control
  Then the matched artifact digest and run identifier are treated only as the vendor's asserted claim about that run
  And the record is not accepted as proof the actions occurred until it is reconciled against an independent observer
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually tells you a reported action happened is corroboration from an observer the supplier does not
control, reconciled against the supplier's record; verifying a signature only tells you who made the claim. The
`@security` scenario proves one record is labeled a supplier assertion until an independent observer confirms
it; the independent observation is what upgrades any claim from asserted to established. A test is a check; the
independent, unforgeable corroboration is the guarantee.

## Sources

- OWASP Verifying Third-Party Agent Execution Evidence Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Verifying_Third_Party_Agent_Execution_Evidence_Cheat_Sheet.html>, retrieved 2026-10-11): the three outcome classes and the six verification questions (authorship, timing, artifact and execution binding, omission detection, recording-failure behavior, and forgery-resistant verification) summarized above. `[documented]`
