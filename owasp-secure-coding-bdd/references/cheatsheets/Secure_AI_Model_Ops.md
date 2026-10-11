# Secure AI Model Ops

## What it is

How to run and ship AI and ML systems safely across their whole lifecycle, from training through live
serving: classical models and large language models alike. This is the per-sheet guidance from the OWASP Secure
AI/ML Model Ops Cheat Sheet, condensed for MLOps, platform, and security teams to the controls that hold and
the attacks they stop.

## The attack it stops

An AI system has many soft spots a web app does not. Attackers can slip bad samples into a training set so the
model learns the wrong thing (poisoning), probe a live endpoint to rebuild the model or infer what it was
trained on (extraction, inversion, membership inference), feed slightly altered inputs that fool a classifier
while looking normal to a person (adversarial examples), or hijack an LLM with crafted text (prompt injection).
Other openings are plain operations failures: inference endpoints with no auth or rate limit, API keys left in
source, booby-trapped model files that run code when deserialized, third-party weights nobody checked, public
artifact stores, forgotten test deployments still live, and shared GPUs that leak one tenant's data to another.
These controls shrink each of those openings.

## Controls

The cheat sheet groups its recommendations by lifecycle stage; here is the full set in that order:

1. **Model development and training.** Run training through pipelines you can version and audit (MLFlow, DVC).
   Check and clean training data before it is used. When the data is sensitive, apply differential privacy or
   anonymization. Build in reproducible environments such as containers so a run can be repeated exactly.
2. **Secrets and configuration.** Keep credentials out of code and notebooks entirely. Hold them in a secret
   manager (Vault, a cloud secrets service) and feed them in through environment variables or CI injection.
3. **Model storage and artifacts.** Keep models in registries that enforce access control. Attach digital
   signatures to model binaries. Encrypt weights and datasets while they sit at rest. Lock down who can read
   training logs and intermediate files. Check any third-party or pretrained model for integrity and safe
   behavior before it reaches production.
4. **Inference API security.** Require authentication and authorization on every endpoint (OAuth, API tokens).
   Validate and clean all incoming data. Add rate limiting plus abuse detection such as anomaly scoring. For
   LLMs, use structured prompt templates that keep instructions apart from user text. Cap tokens, requests,
   concurrency, and spend per tenant to blunt denial-of-wallet. Bound recursion, retries, and chain depth for
   agent or tool-calling flows. Wire in circuit breakers or kill switches that trip on strange cost, latency,
   or tool-call surges. Watch usage telemetry close to real time and alert when tokens, requests, or spend jump.
5. **Deployment and infrastructure.** Harden containers and strip their capabilities (distroless images,
   AppArmor). Put security scanning inside the CI/CD pipeline. Grant training and inference jobs only the
   permissions they need. Keep development, staging, and production apart.
6. **Runtime and hardware isolation.** Split training, evaluation, and production serving along trust
   boundaries. Do not share a GPU or accelerator across tenants that do not trust each other unless the
   platform gives you hardware-backed partitioning and memory isolation. Wipe inputs, outputs, temp files,
   caches, and accelerator memory between jobs when the runtime allows it. Run untrusted evaluation,
   fine-tuning, and conversion work inside sandboxes or isolated workers with tight network egress. Reach for
   isolation technologies such as microVMs, gVisor, Kata Containers, a confidential-compute enclave, or dedicated
   nodes whenever a model or dataset is highly sensitive. Block serving containers from host paths, container sockets, cloud metadata endpoints, and
   needless device mounts. Set per-workload ceilings on CPU, memory, GPU, disk, processes, and network to stop
   noisy-neighbor and denial-of-service effects. Scope serving credentials to one model, endpoint, and
   environment rather than handing out broad platform keys. Confirm teardown clears temp artifacts, local
   checkpoints, prompt logs, and cached embeddings. Monitor for isolation breaks, unexpected device access,
   cross-namespace traffic, and tries at the metadata service.
7. **Monitoring and logging.** Track the shape of inputs, the entropy of outputs, and latency. Spot drift with
   statistics or shadow models. Log requests and access so they can be traced, while keeping sensitive data out
   of the logs. Raise alerts on odd patterns such as scraping or injection attempts.
8. **Adversarial robustness.** Put adversarial examples into your test and evaluation suites. Train for
   resilience with techniques like adversarial training and input denoising. Watch confidence thresholds to
   catch out-of-distribution inputs. Use shadow deployments to study a candidate model on real traffic without
   touching live output. Use canary releases to send a small slice of traffic to the new model with a fast way
   back if it misbehaves.
9. **Incident response and governance.** Write escalation steps for model abuse or drift. Build rollback into
   every deployment. Map your threats onto OWASP ASVS or the Proactive Controls for AI and ML.

## @security scenario

```gherkin
@security @owasp:ai-model-ops @usecase:signed-model-artifact-gate
Scenario: A tampered or unsigned model artifact is blocked before serving
  Given a model registry that requires a valid digital signature on every artifact
  When a deploy attempts to load weights whose signature is missing or does not verify
  Then the deploy fails and the artifact is refused before any inference serves
  And the failed verification raises an alert for the operations team
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually keeps a bad model out of production is the signature-and-registry chain: weights are signed with a
key the attacker does not hold, the registry refuses anything that fails the check, and the deploy fails closed.
The `@security` scenario proves one unsigned artifact is turned away; the signing and verification step is what
makes every swapped or poisoned binary fail the same way. The rest of the lifecycle controls (data hygiene,
isolation, rate limits, drift monitoring) each own one other opening, but none can save you if an attacker can
quietly replace the served weights. A test is a check; the verified signature is the guarantee.

## Sources

- OWASP Secure AI/ML Model Ops Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Secure_AI_Model_Ops_Cheat_Sheet.html>, retrieved 2026-10-11): the common threats, real-world examples, and the full set of lifecycle recommendations (development, secrets, storage, inference API, deployment, runtime isolation, monitoring, adversarial robustness, incident response) summarized above. `[documented]`
