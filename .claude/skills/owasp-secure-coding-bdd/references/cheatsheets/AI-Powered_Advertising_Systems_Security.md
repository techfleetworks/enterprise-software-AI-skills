# AI-Powered Advertising Systems Security

## What it is

How to keep the AI inside an ad platform from becoming the attack surface itself. Every ad request triggers an
AI-driven money decision, across programmatic, search, retail media, connected TV, digital-out-of-home,
direct-sold, native, and mobile. This is the per-sheet guidance from the OWASP AI-Powered Advertising Systems
Security Cheat Sheet, condensed to the ad-tech-specific controls for both classical ML and generative models
(LLMs and vision-language models) on the live serving path.

## The attack it stops

An ad platform exposes its models to paying partners and to adversarial participants who write to its data at
line rate, so the AI itself gets attacked. A rival can poison the training corpus or the RAG index, hide a
fine-tune backdoor that survives safety training, or seed near-neighbor chunks to drown out policy anchors. A
paying partner can treat any scoring surface as an oracle and extract the model, or run a denial-of-wallet
sponge attack. Attacker-controlled text (publisher HTML, a landing page, a brief field) can inject the prompt,
and a crafted image or patch can flip a policy verdict. Forged outcome callbacks are both payment fraud and a
poisoned training label at once, and caches shared across tenants leak data. On top of this sit legal failures:
running a model on a non-consented user, targeting protected classes, or shipping an unmarked deep fake. These
controls close each path.

## Controls

The cheat sheet organizes its controls into five protection areas; here is the full set in that order.

**1. Gate AI decisions on consent.** Treat consent as an authorization check, not a model input feature.
Running personalization, targeting, ranking, or lookalike models on personal data is profiling, so gate the
model call; contextual review of page content with no user data is exempt until its output is joined to a user
ID, so gate the identifier write and the model call as two separate steps. Refuse the model call on
child-directed traffic using a classification the platform owns, and where that signal is missing, fail closed
and treat the traffic as child-directed; the sender-declared OpenRTB `regs.coppa` only raises the bar. Keep the
training corpus scoped to consent (TC strings are personal data). React to live opt-out signals right where
features are fetched: Sec-GPC and the `regs.gpp` string, Apple ATT, a reset of the Android Ad ID; and invalidate
downstream materializations (segments, lookalike scores, serving KV caches, adapter warm-pools) when consent is
withdrawn. Test for
special-category inference from ordinary inputs. Send employment, housing, and credit ads down a stricter path,
since those are high-risk or legally governed targeting categories.

**2. Protect the corpus (training and retrieval).** Use an offline key to sign both dataset manifests and RAG
chunks (in-toto wrapped in a DSSE envelope). Tag every row and chunk with a participant-provenance tag so a scoped rollback
("drop partner X across window Y") is answerable without rehashing. Pin canonical policy chunks per restricted
category and require that each query in that category returns at least k of n pinned anchors as an integrity
check, not a boundary; route to a non-LLM rules baseline when too few anchors come back, and treat that baseline
as the real last line of defense. Prefer diversity-sampled retrieval (MMR) over plain similarity top-k, as
defense-in-depth. Quarantine outcome events before training for an adjudication window set from observed verdict
latency, and reverse rows later flagged as sophisticated invalid traffic. Trigger-scan every refreshed model as
defense-in-depth, knowing clean-label and semantic backdoors evade it and safety training does not remove them;
provenance bounds who can ship a model but does not verify what was trained, so gate promotion on a held-out
trigger corpus from your own taxonomy and keep blast radius small with staged rollout. Refuse any unsigned
fine-tune adapter, and tie each adapter signature to an ML-BOM entry. Before text from participants is classified
or indexed, run it through Unicode NFC normalization and strip out zero-width and bidi-control characters.

**3. Protect inference and the prompt boundary.** Every scoring surface a partner can query is an extraction
oracle. Return tier labels rather than raw scores on partner-visible output to raise extraction cost, but keep
protocol money fields (`seatbid.bid.price`, ad-rank, sponsored-rank) precise and guard them with query budgets
and probing detection, because the query budget is the real control. Enforce contractual query budgets in code
and reject out-of-domain feature values instead of clamping them. Cap inference cost per call in dollars per
minute. On each text input the attacker controls, run a dual-LLM structural handoff: a quarantined LLM produces a
fixed JSON schema, and a privileged LLM reads only that schema. Check each boolean verdict that shifts
monetization against a rules baseline that runs no model. For submitted images, use an ensemble of two VLMs
trained on different setups (change the backbone, not just the weights) as added depth, and send any
disagreement, plus high-risk tags such as minors, celebrity likeness, or trademark, to human review as the real
boundary; the rules-based creative classifier stays the automated floor. Use voice-clone and AI-content detectors only to prioritize audio review, never to prove a
submission is authentic, and verify voice-use authorization on its own. Never grant an ad slot the
`allow="language-model"` token, since on-device LLM output is untrusted at the DOM boundary and CSP does not
reach into a cross-origin ad iframe. Isolate every cache by tenant ID (KV cache, RAG namespace, plan cache,
adapter pool), and set thresholds in a deterministic post-processor that keys off the structured output of the
model rather than trusting system-prompt secrecy.

**4. Protect outcome events and agentic actions.** Sign every callback over the ad-tech field set (`key_id`,
`event_type`, event ID, `timestamp`, monetary value, receiving endpoint), and include `event_type` in the
signed set because one `impression_id` is reused across event types. Compute an HMAC-SHA256 over a length-prefixed
serialization, or adopt RFC 9421 HTTP Message Signatures where the receiver enforces a minimum set of covered
components. Cover the request body, not just named fields: require an RFC 9530 `Content-Digest` among the covered
components and recheck that digest against the bytes actually received, so nothing outside the covered set can
shift a monetary amount or a label.
Deduplicate on event ID alone, never on `(event_id, timestamp)`, and keep dedup records for at least the full
signature-acceptance plus retry window set from the delivery contract. Reject expired callbacks. Verify the HMAC
before any field touches control flow. Keep money settlement apart from training-label materialization.
Tie the certificate identity to one `partner_id` through a typed SAN entry or an SPKI hash, not just a trusted
issuer. Treat auth incidents as data incidents: rotate credentials, flag exposure-window rows as suspect, and
invalidate per-partner weights and model artifacts. Rank every agentic tool by its risk, and tie each
human-in-the-loop approval to six bound values: the actor, the tool, the target, the normalized parameters, a
timestamp, and an expiry. Keep
a warm, pre-deployed rules-based bidder as a kill-switch fallback one control-plane flip away. Quarantine reward
events past the fraud-adjudication lag and cap the maximum policy shift per training epoch.

**5. Protect the AI supply chain and generative provenance.** Sign every model artifact and stop the deploy
when a signature fails, and pair the signing with a behavioral gate that trigger-scans any classifier sourced
from outside. Bind ML-BOM entries to the participant-provenance tag from the corpus controls, since the ML-BOM is
the key for scoped rollback. Scope feature-store namespaces to their purpose, and rotate the materialization-write
credentials on your production-secrets cadence. Check participant provenance for each serving mode (ads.txt and
the SupplyChain object
for programmatic, seller-ID authorization for retail, advertiser-domain ownership for search, ads.cert or device
attestation for CTV). Turn away VPAID creatives entirely in video-programmatic and CTV, since there is no viable
way to sandbox them; prefer SIMID instead. Know your legal role for generative output: a platform offering a generative endpoint
under its own name is a provider with a machine-readable marking duty, and an advertiser using it is a deployer
with a deep-fake disclosure duty. Emit a C2PA manifest with a hard binding over the generated bytes at egress,
and re-sign it for each rendition (an image resize, a video ABR ladder step, an audio SSAI stitch) instead of
leaning on soft binding. Before the generator will take a brief that names a real person, require that a likeness
or voice-use authorization artifact already be on file. Allow the generation model version to be frozen from the control plane during an
incident.

## @security scenario

```gherkin
@security @owasp:ai-advertising @usecase:forged-outcome-callback
Scenario: A forged ad outcome callback is rejected as both fraud and a poison label
  Given an outcome endpoint that verifies an HMAC over the signed field set and a Content-Digest of the body
  When an attacker replays an impression_id with a fresh timestamp and an altered monetary value
  Then the callback is rejected before any field influences settlement or a training label
  And the rejection increments the per-partner rejected-callback signal
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually stops a forged outcome event from becoming both a fraudulent payout and a poisoned label is the
verified signature over the whole message: the HMAC and the body digest are checked before any value reaches
control flow, dedup is keyed on the event ID, and nothing outside the covered set can move money or a label.
The `@security` scenario proves one replayed callback is turned away; the covered-content signature is what makes
every forged or tampered packet fail the same way. The consent gate, the corpus signing, the extraction budgets,
and the provenance manifests each own a different path, but a model is only as trustworthy as the events that
train and pay it. A test is a check; the verified, body-covering signature is the guarantee.

## Sources

- OWASP AI-Powered Advertising Systems Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/AI-Powered_Advertising_Systems_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the five protection areas (consent gating, corpus protection, inference and prompt boundary, outcome events and agentic actions, supply chain and generative provenance) and their controls summarized above. `[documented]`
