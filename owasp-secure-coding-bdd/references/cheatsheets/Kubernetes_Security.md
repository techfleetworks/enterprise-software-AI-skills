# Kubernetes Security

## What it is

How to harden a Kubernetes cluster across its whole life: the hosts and control-plane parts, the images you
build, the way workloads are deployed, and what happens while they run. Kubernetes is flexible enough to fit
almost any setup, and that same flexibility makes it easy to leave something open. This is the per-sheet
guidance from the OWASP Kubernetes Security Cheat Sheet, condensed to the controls that hold and the attacks
they stop.

## The attack it stops

Kubernetes has many high-value targets. A dashboard left public with a powerful service account is how Tesla's
cluster was taken over to mine cryptocurrency. Write access to etcd is the same as root over the whole cluster,
because an attacker who writes pod definitions straight into it skips the API server's validation and admission
checks. Weak API authentication, over-broad RBAC, pods that run privileged or as root, flat pod networking that
lets one compromised app reach its neighbors, and secrets stored in plain text in etcd each give an attacker a
way in or a way to spread. A poisoned base image or build pipeline can push malicious code to every pod at once.

## Controls

Grouped by phase, in the cheat sheet's order:

**Hosts and updates**
1. **Harden the nodes.** Patch and configure the host operating systems, apply firewall rules, and run the
   latest stable Kubernetes version. When a running container is vulnerable, rebuild the image and redeploy with
   a rolling update rather than editing the live container, which breaks the image-to-container link.

**Control-plane components**
2. **Lock down the dashboard.** Do not put it on the public internet, turn on RBAC, give its service account low
   privileges, grant permissions per user, and front it with an authenticating reverse proxy that enforces MFA.
3. **Protect etcd.** Require strong credentials such as mutual TLS from the API servers to etcd, firewall it so
   only the API servers reach it, and use separate instances or ACLs so other components cannot read or write
   the full keyspace.
4. **Restrict access to sensitive ports.** Block network access to the well-known control-plane and node ports
   (API server, etcd, kubelet, and so on) and limit the API server to trusted networks.
5. **Secure the API and kubelets.** Kubernetes denies API requests by default; prefer external authentication
   (OIDC, cloud IAM, or impersonation) over the built-in methods (static token file, X509 client certs, service
   account tokens), which suit only small or test clusters, and require MFA for user access. Turn on kubelet
   authentication and authorization, since kubelets allow unauthenticated access by default.
6. **Use RBAC.** Run the Node and RBAC authorizers together with the NodeRestriction admission plugin, and bind
   each user or group to only the verbs and resources they need, scoped to a namespace where possible.

**Build phase**
7. **Build from trusted, current, minimal images.** Base images on an approved, scanned source, keep them and
   their tools up to date, and allow only authorized images to run. Strip the image down to what the app needs;
   prefer distroless or empty (`scratch`) images with no shell or package manager.
8. **Scan in a CI pipeline.** Scan every image for known vulnerabilities in the build, push only clean images to
   a private registry, and fail the pipeline when the scan finds problems so bad images never reach production.

**Deploy phase**
9. **Know each deployment before it ships.** Track what image is used, where it goes, whether it runs
   privileged, what it can talk to, what secrets and volumes it touches, and whether it meets policy.
10. **Isolate with namespaces.** Use namespaces to partition resources and scope user permissions.
11. **Enforce image provenance.** Use the `ImagePolicyWebhook` admission controller to reject unscanned images,
    disallowed base images, and images from insecure registries, and keep scanning in production as new CVEs
    appear.
12. **Set a security context on every pod.** Require `runAsNonRoot`, drop Linux capabilities to the minimum,
    and set `readOnlyRootFilesystem: true`. Grant only the privileges each container needs.
13. **Enforce privilege levels with Pod Security Standards.** Apply the built-in Pod Security Admission
    controller with the `Baseline` level as a floor and `Restricted` as the goal, allowing `Privileged` only in
    namespaces that truly need host access. For finer rules use OPA Gatekeeper, Kyverno, or Validating Admission
    Policy. Older Pod Security Policies are removed; do not rely on them.
14. **Add mesh and policy layers where they earn their cost.** A service mesh can give mTLS between services,
    ingress/egress control, and observability, at the price of real added complexity. Centralized policy tools
    (OPA, Kyverno, VAP) can enforce rules the cluster cannot express on its own.
15. **Cap resources per namespace.** Use `ResourceQuota` for aggregate limits and object counts and `LimitRange`
    for per-pod and per-container minimums, maximums, and defaults, so one tenant cannot starve the others.
16. **Segment pod traffic with network policies.** Pods accept all traffic by default. Use the
    `networking.k8s.io/v1` NetworkPolicy API, with a plugin that enforces it, to allow only approved
    communication and block lateral movement; write a rule for each direction, since allowing ingress does not
    set egress.
17. **Guard secrets.** Mount secrets into read-only volumes rather than environment variables, keep them out of
    images, turn on etcd encryption at rest with a non-identity provider and rewrite existing secrets, consider
    an external secrets manager for central rotation, and scan container filesystems for exposed credentials.

**Runtime phase**
18. **Keep admission enforcing at runtime.** Use Pod Security Admission to stop risky pods, with `baseline` as
    the minimum and `restricted` as the target.
19. **Watch running containers.** Use runtime tools such as Falco to alert on events like a shell spawned in a
    container, a mount of a sensitive host path, a read of a sensitive file, or an unexpected outbound
    connection.
20. **Sandbox untrusted workloads.** For multi-tenant or untrusted clusters add isolation such as Kata
    Containers, gVisor, or Firecracker to put more distance between containers and the host kernel.
21. **Block unwanted kernel modules.** Prevent automatic module loading on nodes (for example a modprobe
    blacklist or an SELinux rule denying `module_request`) to shrink the kernel attack surface.
22. **Compare replicas and watch the network.** Flag a replica whose behavior drifts from its peers, and
    compare live traffic against your network policies to tighten them and spot odd flows.
23. **Contain breaches fast.** Scale suspicious pods to zero or kill and restart affected apps to stop an
    in-progress compromise.
24. **Rotate credentials often.** Keep certificate and token lifetimes short, automate rotation, and revoke
    bootstrap tokens once setup is done.
25. **Log and audit.** Ship container stdout/stderr to central logging, enable API audit logging with a defined
    policy, archive it on a secure server, and watch for authorization failures (`Forbidden`) that can signal
    stolen credentials in use.

**Supply chain**
26. **Secure the whole delivery path.** Use trusted minimal base images, scan dependencies and images, lock down
    CI/CD with access controls, sign and verify images (Notary, Cosign), keep images in private registries, and
    monitor for new vulnerabilities, because one supply-chain compromise can reach every pod.

Embed these controls early in the lifecycle, prefer Kubernetes-native controls over bolt-on shims, and use the
cluster's own context (is it privileged, is it internet-facing, is it production) to rank what to fix first.

## @security scenario

```gherkin
@security @owasp:kubernetes @usecase:restricted-pod-admission
Scenario: The cluster refuses a privileged, root-running pod
  Given a namespace that enforces the restricted Pod Security Standard
  When a user submits a pod that runs as root and sets securityContext.privileged true
  Then the Pod Security Admission controller rejects the pod
  And an accepted pod in that namespace runs as a non-root user with a read-only root filesystem and dropped capabilities
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually holds a cluster together is enforcement the cluster itself applies: admission control that refuses
privileged and root pods, RBAC and strong API authentication that deny by default, etcd locked behind mutual
TLS, network policies that stop lateral movement, and secrets encrypted at rest. The `@security` scenario proves
one risky pod is turned away; the admission policy and the security context are what make every risky pod turned
away. A test is a check; the enforced cluster policy is the guarantee.

## Sources

- OWASP Kubernetes Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full set of controls across host hardening, control-plane components (dashboard, etcd, ports, API and kubelet authentication, RBAC), the build phase (trusted minimal scanned images), the deploy phase (namespaces, image provenance, security context, Pod Security Standards, resource quotas, network policies, secrets), the runtime phase (runtime monitoring, sandboxing, kernel modules, breach containment, credential rotation, logging and audit), and supply-chain security. `[documented]`
