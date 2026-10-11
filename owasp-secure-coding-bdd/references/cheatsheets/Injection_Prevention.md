# Injection Prevention

## What it is

How to stop the whole family of injection flaws, where an application hands untrusted data to an interpreter and that interpreter runs it as instructions. This is the per-sheet guidance from the OWASP Injection Prevention Cheat Sheet, boiled down to the controls that actually hold and the attack they block. It covers SQL, LDAP, XPath, operating-system commands, scripting-language `eval`, and network-protocol streams, not just databases.

## The attack it stops

Injection happens any time user input becomes part of a command or query instead of staying plain data. An attacker adds their own syntax to steal data, bypass checks, or take over the host. The sheet gives a concrete OS-command case: on a page like `http://sensitive/something.php?dir=%3Bcat%20/etc/passwd`, the `%3B` decodes to a semicolon, which the shell reads as a command separator, so `cat /etc/passwd` runs on the server. If the file contents come back in the response, the attack worked. The same pattern lets an attacker read, change, or delete database rows, grant themselves LDAP permissions, or run arbitrary programs.

## Controls

The sheet sorts applications into three types (A1 new build, A2 adaptable open source, A3 hard-to-change closed source) and asks you to fix the source where you can, or fall back to virtual patching only when you cannot. The core defenses, in order of preference, are:

1. **Validate input first (Rule #1).** Check that each value is what you expect, preferring positive or allow-list rules with correct canonicalization. The sheet is clear this is helpful but **not** a complete defense on its own, since many fields legitimately need special characters.
2. **Use a safe API (Rule #2).** The best option is an interface that avoids the interpreter entirely or takes a parameterized input. Stay wary of APIs that look parameterized but still build dynamic statements underneath, such as some stored procedures.
3. **Escape by context (Rule #3).** Only when no parameterized API exists, escape special characters using the exact escaping rules for that specific interpreter.

Applied to each interpreter the sheet names:

- **SQL:** prefer prepared statements with parameterized queries; stored procedures implemented without unsafe dynamic SQL; allow-list validation for spots that cannot take a bind variable (table names, column names, sort direction such as `ASC` or `DESC`), mapping user choices to a known-good set; escaping only as a last resort for legacy code.
- **LDAP:** use the correct library encoder, since distinguished names (RFC 4514) and search filters (RFC 4515) need different escaping; do not hand-roll escaping code.
- **XPath:** use a parameterized query approach (see the XPath sheet).
- **OS commands:** if you truly cannot avoid calling a system command with user data, combine two layers. First, **parameterization**, meaning structured mechanisms that keep data and command apart (pass the executable and each argument as separate list items, as `ProcessBuilder` does, rather than one shell string). Second, **input validation**, checking commands against a list of allowed commands and arguments against an allow-list or a tight allow-list regular expression that bounds length and excludes shell metacharacters like `& | ; $ > < \` \ !` and whitespace, for example `^[a-z0-9]{3,10}$`. Argument separation does not replace argument validation.
- **Scripting languages:** avoid feeding unvalidated, unescaped input into any `eval`-style call, which can run attacker code and expose null-byte issues in the underlying lower-level language.
- **Network protocols:** when user input flows into an SMTP, IMAP, or FTP stream, stop injected command sequences from abusing the session.

## @security scenario

```gherkin
@security @owasp:injection @usecase:os-command-arg
Scenario: An endpoint that runs a system command rejects a shell-metacharacter payload
  Given an endpoint that invokes an OS command with a user-supplied argument
  When an attacker submits the value "; cat /etc/passwd" for that argument
  Then the request is rejected by allow-list validation before any command runs
  And the command is launched with the program and each argument passed separately, so no shell parses the input
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The mechanism that actually makes injection impossible is a safe API that keeps data out of the instruction channel: a parameterized query or a command launched with the program and each argument as separate items, so no interpreter ever parses user input as syntax. The `@security` scenario proves one payload is refused; the parameterized interface is what makes every payload harmless. A test is a check; the safe, data-separating API is the guarantee.

## Sources

- OWASP Injection Prevention Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html>, retrieved 2026-10-11): the three application types, the three injection-prevention rules (validate input, use a safe API, escape by context), the per-interpreter defenses for SQL, LDAP, XPath, OS commands, scripting, and network protocols, and the OS-command and argument-regex examples. `[documented]`
