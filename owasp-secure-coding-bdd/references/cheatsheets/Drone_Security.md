# Drone Security

## What it is

How to secure an unmanned aircraft and the system around it: the drone itself, the ground control station
(GCS) that flies it, and the radio link between them. The work spans authenticating command messages,
encrypting the link, protecting onboard data and firmware, guarding the sensors that steer, and hardening
the wireless protocols in use. This is the per-sheet guidance from the OWASP Drone Security Cheat Sheet,
condensed to the controls that hold and the attacks they stop.

## The attack it stops

The link between a drone and its GCS can be listened to and injected into. If command messages are not
authenticated, an attacker forges or replays them and flies the aircraft; this is not hypothetical, as
recent critical CVEs in PX4 and ArduPilot show that unsigned MAVLink has handed out remote shells and
memory disclosure. Weak Wi-Fi lets cheap hardware knock the drone off its network with deauthentication
frames. A captured or lost drone gives up unencrypted storage, keys in RAM, and data through open USB
ports. And spoofed GPS or sensor readings make the drone act on a false picture of the world, Stuxnet-style,
while its telemetry still looks normal. The controls below keep forged commands, hijacked links, stolen
data, and spoofed sensors from taking over the flight.

## Controls

In the cheat sheet's order:

**Communication security**
1. **Encrypt the link.** Data moving between the drone and the GCS can be captured unless it is encrypted
   with standard protocols.
2. **Stop command spoofing and replay.** Authenticate each command and drop replays with the freshness
   checks the protocol offers; on MAVLink that means signed messages and timestamp validation, which plain
   encryption does not give you.
3. **Harden Wi-Fi.** Weak authentication or open channels invite unauthorized access, even from simple
   microcontrollers; turn on 802.11w Management Frame Protection to block deauthentication attacks.

**Authentication and access control**
4. **Secure the companion computer.** Drones usually pair a flight-control chip with a companion SoC for
   peripherals and telemetry; open ports such as SSH or FTP on it are exploitable if left misconfigured.
5. **Avoid misconfiguration.** Settings left in an insecure state expose the drone, so configure security
   deliberately.

**Data protection**
6. **Encrypt storage at rest** so a drone captured while powered off does not surrender its data (for
   example LUKS, gocryptfs, or age).
7. **Keep the most sensitive data in RAM** (keys, credentials, IP), clear it after use, and deliver it over
   a secure channel before the mission starts.

**Physical security**
8. **Lock down the hardware.** Unsecured USB ports and exposed hardware allow data theft or tampering,
   compromised supplier parts can hide flaws, and poorly decommissioned drones can retain data or be reused
   maliciously.

**System integrity**
9. **Secure boot.** Sign every firmware stage and run only signed code, anchor the first-stage bootloader
   in immutable ROM or eFuse-locked code, and have each stage verify the next.
10. **Measured boot.** Record what loaded at each stage so a fleet manager or ground station can confirm
    the drone runs only trusted code, and gate local actions such as releasing decryption keys on a clean
    boot.
11. **Firmware signing.** Sign firmware and configuration updates, add rollback protection against older
    vulnerable versions, and encrypt packages that carry sensitive IP.

**Sensor security**
12. **Defend the sensors.** Because control logic depends on GPS, cameras, and altimeters, guard against
    manipulated readings; emerging work uses watermarked signals whose entropy reveals whether sensor
    values are genuine.

**Logging and monitoring**
13. **Log and monitor.** Without enough monitoring, breaches and anomalies go unseen; poorly integrated
    camera or telemetry web servers also leak information, so keep credentials strong.

**Secure communication protocols**
14. **MAVLink 2.0.** Require valid MAVLink 2 signatures on commands over untrusted links and reject
    unsigned or wrongly signed ones, protect the shared signing key, and keep signing timestamps across
    restarts so replay checks survive a reboot. Treat a heartbeat as a liveness hint, not permission to run
    commands. Prefer tested stacks such as ArduPilot and PX4 and add end-to-end TLS or DTLS. Because
    signing is often turned off in the field and any software mitigation shares the trust domain an
    attacker may hold, add defense in depth: validate headers with system-ID allowlists and sequence
    numbers (which detect odd senders but do not authenticate unsigned messages), validate typed payloads
    (reject non-finite `PARAM_SET` values, bound FTP path lengths), and where firmware cannot be trusted,
    put a hardware bump-in-the-wire validator between the companion computer and the flight controller.
15. **CAN bus.** Most CAN attacks need physical access; do not trust DroneCAN alone to authenticate
    senders, since its multi-frame CRC is an unkeyed checksum, not a MAC, so guard physical access to the
    bus and keep untrusted parts off it.
16. **ZigBee.** Enable AES-128 encryption, rotate network keys often, and watch for packet sniffing with
    SDR tools like HackRF or YARD Stick One.
17. **Bluetooth.** Enforce LE Secure Connections on Bluetooth 4.2+ and never use Just Works pairing, which
    is open to man-in-the-middle attacks.
18. **Wi-Fi.** Use WPA3 and avoid WEP, apply 802.11w MFP against deauthentication, and do not rely on a
    hidden SSID or MAC filtering, since hidden networks are still discoverable and MAC addresses can be
    spoofed.

**Attack-to-control mapping (Summary table).** The sheet maps each attack to its defense and its limits:
malware and backdoors need trusted, verified firmware and restricted admin interfaces; social engineering
and baiting need operator training plus removable-media controls; message injection, fabricated commands,
and replay need authentication, content validation, and freshness; eavesdropping, reconnaissance, and
traffic analysis need encryption and reduced exposure (with the caveat that encryption hides neither all
metadata nor timing); network attacks (scanning, SYN flooding, ARP poisoning, ping-of-death) need closed
ports, patched stacks, and network protections; Wi-Fi attacks need WPA3, MFP, and tested link-loss
failsafes; buffer overflows need memory-safe code and bounds checks; denial of service needs bounded
message sizes and rate limits; and GPS spoofing needs navigation consistency checks and tested navigation
failsafes rather than blind trust in return-to-home.

## @security scenario

```gherkin
@security @owasp:drone @usecase:unsigned-mavlink-command
Scenario: An unsigned MAVLink command on an untrusted link is rejected
  Given a drone configured to require valid MAVLink 2 message signatures on an untrusted link
  When an attacker sends a forged or replayed command without a valid signature and fresh timestamp
  Then the flight controller rejects the command and does not act on it
  And the event is logged for monitoring
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into
CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin
scenario.

## The real guarantee

What actually keeps an attacker from flying the drone is authenticated commands with freshness: the flight
controller acts only on a message that carries a valid signature and a timestamp it has not seen before, so
a forged or replayed command is dropped. The `@security` scenario proves one unsigned command is rejected;
the signature and freshness check are what make every forged and replayed command safe to ignore. A test
is a check; the signed, fresh command is the guarantee. Because signing is so often disabled in the field,
the out-of-band defenses, a hardware validator and sensor and navigation consistency checks, are what hold
that guarantee up when the software trust domain cannot.

## Sources

- OWASP Drone Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Drone_Security_Cheat_Sheet.html>, retrieved 2026-10-11): the vulnerable-endpoint controls (communication, access control, data protection, physical security, system integrity, sensor security, logging), the per-protocol guidance for MAVLink, CAN, ZigBee, Bluetooth, and Wi-Fi, and the attack-to-control summary table drawn on above. `[documented]`
