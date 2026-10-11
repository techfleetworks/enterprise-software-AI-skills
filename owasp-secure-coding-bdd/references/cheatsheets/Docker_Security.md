# Docker Security

## What it is

How to run Docker containers so a misconfiguration does not hand an attacker control of the host or the other
containers on it. Docker can raise security over running apps straight on the machine, but weak defaults and
sloppy flags cut that benefit or open new holes. This is the per-sheet guidance from the OWASP Docker Security
Cheat Sheet, condensed to the controls that hold and the attacks they stop.

## The attack it stops

Containers share the host kernel, so a kernel flaw reachable from inside a container (such as a Dirty COW style
privilege escalation, or a runc breakout like Leaky Vessels) can turn into full root on the host. An exposed
Docker daemon socket is just as bad: whoever can talk to it can start, stop, and reshape containers and reach
the host, which is how attackers have turned a careless mount or an open TCP daemon port into total takeover. A
container that runs as root, keeps every Linux capability, or can write anywhere also gives a single app bug
far more reach than it should have.

## Controls

In the cheat sheet's rule order:
1. **Patch the host and the engine.** Keep the host kernel and the Docker Engine current so known escape and
   privilege-escalation bugs are closed; the shared kernel means a vulnerable host exposes every container.
2. **Never expose the daemon socket.** Do not bind the daemon to a `tcp://` address, and do not mount
   `/var/run/docker.sock` into a container. Access to that socket equals unrestricted root on the host, and a
   read-only mount does not make the API read-only.
3. **Run as a non-root user.** Set an unprivileged user with `docker run -u`, a `USER` line in the Dockerfile,
   or user-namespace remapping (`--userns-remap`). This is the strongest guard against privilege escalation.
4. **Drop capabilities to the minimum.** Use `--cap-drop all` then `--cap-add` only what the workload needs,
   and never launch with `--privileged`, which grants every kernel capability.
5. **Block gaining new privileges.** Add `--security-opt=no-new-privileges` so `setuid` and `setgid` binaries
   cannot raise the container's privilege level at runtime.
6. **Control container-to-container traffic.** Inter-container connectivity is on by default. Rather than the
   blanket `--icc=false`, place containers on purpose-built custom networks so only intended peers can reach
   each other.
7. **Watch host firewalls when publishing ports.** Docker writes its own `iptables`/`nftables` rules and skips
   tools like UFW, so a published port can be open to the whole internet despite a `DENY` rule. Bind the host
   side to `127.0.0.1` when it should stay local, or use an integration such as `ufw-docker`.
8. **Keep a kernel security module on.** Do not turn off the default profile. Start from the shipped seccomp,
   AppArmor, or SELinux baseline and tighten the syscalls and access each workload is allowed, and add
   behavioral monitoring (Falco, Tetragon, Cilium eBPF) to catch anomalies at runtime.
9. **Cap resources.** Limit memory, CPU, file descriptors (`--ulimit nofile`), process count
   (`--ulimit nproc`), and restart attempts (`--restart=on-failure:N`) to blunt denial-of-service abuse.
10. **Make the filesystem read-only.** Run with `--read-only`, add a `--tmpfs` mount only where the app must
    write scratch data, and mount data volumes with `:ro` when they are for reading.
11. **Scan images in the pipeline.** Add linting and image scanning (Clair, Grype, Trivy, and similar) to CI,
    checking for things like a missing `USER`, unpinned base and OS package versions, `ADD` used where `COPY`
    fits, and secrets baked into layers.
12. **Keep daemon logging at `info`.** Leave the daemon log level at `info` so useful events are recorded;
    avoid `debug` unless you are actively troubleshooting.
13. **Prefer rootless mode.** Run the daemon and containers without host-root privileges to shrink the blast
    radius of a daemon or runtime compromise (note the shared kernel is still part of the boundary).
14. **Use a secrets mechanism for sensitive data.** Manage passwords, tokens, and keys with Docker secrets
    rather than baking them into images or run commands; protect file-backed Compose secrets on the host, since
    declaring them does not encrypt them.
15. **Harden the supply chain.** Record image provenance, generate an SBOM, sign images, store them in a
    trusted registry with access controls, and enforce validation at deploy time.
Consider Podman as a hardened alternative: it is daemonless, runs rootless by the fork-exec model, and
integrates with SELinux.

## @security scenario

```gherkin
@security @owasp:docker @usecase:container-root-blast-radius
Scenario: A compromised container cannot act as root or escalate on the host
  Given a service running in a Docker container
  When an attacker exploits a code bug to run commands inside that container
  Then the process runs as an unprivileged user, not root
  And the container was started with --cap-drop all and --security-opt=no-new-privileges
  And the Docker daemon socket is not mounted into the container
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually limits the damage is the container's runtime posture: a non-root user, dropped capabilities, no
new privileges, a read-only filesystem, and a daemon socket that no container can reach. The `@security`
scenario proves one container cannot act as root or climb higher; the dropped privileges are what make every
exploit attempt land in a small box instead of on the host. A test is a check; the least-privilege runtime
configuration is the guarantee.

## Sources

- OWASP Docker Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the full rule set (patching, daemon socket, non-root user, capabilities, no-new-privileges, inter-container networking, host firewall and port binding, kernel security modules, resource limits, read-only filesystem, image scanning, daemon log level, rootless mode, secrets, supply chain) and Podman as an alternative. `[documented]`
