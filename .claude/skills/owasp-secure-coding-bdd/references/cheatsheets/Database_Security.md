# Database Security

## What it is

How to configure and run a SQL database (MySQL, PostgreSQL, MariaDB, Microsoft SQL Server) so the server itself is hard to reach, hard to abuse, and hard to escalate from. This is the per-sheet guidance from the OWASP Database Security Cheat Sheet, condensed to the controls that hold and the attack they stop. It covers deployment and configuration; application-layer query defenses live in the SQL Injection Prevention sheet.

## The attack it stops

A database left open on the network, running with a default admin account and unencrypted connections, hands an attacker several easy wins. They can connect straight to an exposed port from the internet, sniff sensitive rows off the wire because traffic is clear text, log in with a built-in `root` or `sa` account that has full control, or use an over-privileged application account to read every table, write files on the host, or escalate to owning the whole instance. These controls shrink the server's exposure so a stolen credential or a loose firewall rule does not become a full compromise.

## Controls

In the order the cheat sheet presents them:
1. **Isolate the backend database.** Let it talk to as few hosts as possible: disable TCP in favor of a local socket or named pipe where you can, bind to `localhost`, restrict the port with firewall rules to specific hosts, and place it on a dedicated internal network segment away from the application server.
2. **Protect web-based admin tools** such as phpMyAdmin or pgAdmin with authentication, HTTPS, and network restrictions.
3. **Never let an untrusted client connect directly.** A thick client or other untrusted system must reach the database through an API that enforces access control, not by opening its own database connection.
4. **Require encrypted connections (TLS).** Configure the database to accept only encrypted connections, install a trusted certificate on the server, have the client connect with TLSv1.2 or higher using modern ciphers (AES-GCM or ChaCha20), and have the client verify the certificate is correct.
5. **Always require authentication, even locally.** Every connection, including from the local server, must authenticate.
6. **Harden database accounts.** Give each a strong, unique password; use one account per application or service; grant only the minimum permissions needed.
7. **Run normal account housekeeping.** Review accounts and permissions regularly, remove accounts when an application is retired, and rotate passwords when staff leave or a compromise is suspected.
8. **Prefer platform authentication where available**, such as Windows or Integrated Authentication for SQL Server (and the Windows Native Authentication plugins for MySQL), so the app need not store database credentials at all.
9. **Store credentials outside the code.** Keep them in a config file that sits outside the web root, is readable only by the required user(s), and is never committed to source control; encrypt or otherwise protect them with built-in features (for example `web.config` encryption in ASP.NET) where possible.
10. **Apply least privilege to permissions.** Do not use built-in `root`, `sa`, or `SYS` accounts; do not grant admin rights over the instance; restrict which hosts an account can connect from; give each account only the specific databases it needs (separate databases and accounts per environment); grant only the needed statements (often just `SELECT`, `UPDATE`, `DELETE`) and do not make the account the database owner; avoid database links, or scope them tightly when required.
11. **Go more granular for sensitive apps.** Use table-, column-, and row-level permissions, and block direct table access by routing all access through restricted views.
12. **Harden the host OS** against a secure baseline such as the CIS Benchmarks or Microsoft Security Baselines.
13. **Harden the database application.** Install security updates and patches, run the database service under a low-privileged OS account, remove default accounts and databases, keep transaction logs on a separate disk, and take regular backups that are permission-protected and ideally encrypted.
14. **Apply product-specific hardening.** SQL Server: disable `xp_cmdshell`, `xp_dirtree`, and other unneeded stored procedures, disable CLR execution and the SQL Browser service, avoid Mixed Mode Authentication unless required, and remove the sample Northwind and AdventureWorks databases. MySQL/MariaDB: run `mysql_secure_installation` and disable the `FILE` privilege for all users. PostgreSQL: follow its setup, operation, and security documentation. For MongoDB and Redis, follow their own security checklists and the NoSQL Security sheet.

## @security scenario

```gherkin
@security @owasp:database-security @usecase:least-privilege-db-account
Scenario: The application database account cannot drop a table
  Given the application connects with a dedicated account granted only SELECT, UPDATE, and DELETE
  When a query attempts to run DROP TABLE users through that connection
  Then the database refuses the statement with a permission error
  And the account is never the database owner and holds no administrative rights over the instance
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest alongside every other Gherkin scenario.

## The real guarantee

The thing that actually caps the damage is the least-privilege grant enforced by the database: an account that was never given DDL or admin rights cannot drop a table or escalate, no matter what query reaches it. The `@security` scenario proves one `DROP TABLE` is refused; the narrow grant is what makes every over-reaching statement from that account fail. A test is a check; the permission the database enforces is the guarantee.

## Sources

- OWASP Database Security Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html>, retrieved 2026-10-11): network isolation, TLS transport protection, required authentication and account hygiene, secure credential storage, least-privilege and granular permissions, OS and database hardening, and the product-specific hardening steps for SQL Server, MySQL/MariaDB, PostgreSQL, MongoDB, and Redis. `[documented]`
