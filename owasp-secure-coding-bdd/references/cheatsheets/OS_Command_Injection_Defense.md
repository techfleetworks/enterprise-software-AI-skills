# OS Command Injection Defense

## What it is

How to stop OS command injection: an attacker bending a system command your code runs so it executes extra commands or extra arguments the code never meant to run. This is the per-sheet guidance from the OWASP OS Command Injection Defense Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

When code glues user input into a string that is handed to a shell, the attacker can add shell metacharacters that change what runs. The sheet gives a plain example: a program means to run `calc`, but the input `calc & echo "test"` makes the shell run `calc` and then also run `echo "test"`. The same trick works through arguments alone (argument injection): even if `&`, `|`, and `;` are escaped, a value like `--help` fed to `system("curl " . escape($url))` becomes a real `curl` flag and runs `curl --help`. Depending on the command, the damage ranges from leaking information to full remote code execution, and it is worse when the process runs with high privileges.

## Controls

In the cheat sheet's order of preference:
1. **Avoid calling OS commands at all (primary defense).** Reach for a built-in library or API instead, for example `mkdir()` rather than `system("mkdir /dir_name")`, since a library call cannot be twisted into running something else.
2. **Escape values with an OS-specific function** when you must pass input to a shell. In PHP, `escapeshellarg()` wraps the input in single quotes so a payload like `& echo "hello"` becomes one harmless argument. Note this still lets the attacker supply one argument.
3. **Parameterize and validate together** when a system call with user input is unavoidable, using two layers:
   - **Layer 1, parameterization:** use a structured API that keeps the command separate from its data and handles quoting and encoding for you.
   - **Layer 2, input validation:** validate both the command and its arguments. Check the command against an allow-list of permitted commands. Validate arguments with a positive allow-list of accepted values, or an allow-list regular expression that fixes the allowed characters and a maximum length and excludes shell metacharacters and whitespace, for example `^[a-z0-9]{3,10}$`. For tools that support it, use `--` to stop option parsing, but know its limits (in `curl`, later values are still treated as URLs), so pass exactly one validated URL through a process API and add `--globoff` to turn off URL globbing. Never drop an unquoted value into a shell string, and apply SSRF protections, since argument separation does not check where a URL points.
4. **Run with least privilege (additional, defense in depth).** Give the application only the permissions it truly needs, and where possible use isolated accounts with limited rights scoped to a single task.

Language notes the sheet gives: in Java, use `ProcessBuilder` (or `Runtime.exec`) with the executable and each argument as separate list elements, since neither invokes a shell or honors shell metacharacters. In PHP, prefer `escapeshellarg()` over `escapeshellcmd()` (the latter still lets an attacker add extra parameters), hardcode the executable and its required flags, and validate input strictly.

## @security scenario

```gherkin
@security @owasp:os-command-injection @usecase:shell-metacharacter-injection
Scenario: A command runner rejects a shell metacharacter payload
  Given an endpoint that runs an allow-listed system command with a user-supplied argument
  When an attacker submits the argument "calc & echo test"
  Then no second command runs and the request is rejected
  And the argument is passed through a process API as one value, never parsed by a shell
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually makes command injection impossible is not touching a shell at all: a library call or a process API that takes the program and each argument as separate values gives the attacker no shell to inject into. The `@security` scenario proves one metacharacter payload is blocked; passing arguments as discrete values (or skipping the OS command entirely) is what makes every payload safe. A test is a check; the shell-free process call is the guarantee.

## Sources

- OWASP OS Command Injection Defense Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html>, retrieved 2026-10-11): the ordered defenses (avoid OS calls, OS-specific escaping, parameterization plus input validation, least privilege), argument injection, and the Java, PHP, and `--`/`--globoff` guidance. `[documented]`
