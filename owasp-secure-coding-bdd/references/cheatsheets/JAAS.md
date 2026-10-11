# JAAS

## What it is

How to authenticate a user with the Java Authentication and Authorization Service: a pluggable login framework
that verifies identity, attaches the resulting principals and credentials to a `Subject`, and releases them again
at logout. This is the per-sheet guidance from the OWASP JAAS Cheat Sheet, condensed to the controls that keep the
login lifecycle and credential handling safe.

## The attack it stops

Authentication is the point where a wrong answer is catastrophic: treat a failed login as a success and the
attacker is in; leave credentials attached after logout and the next request rides someone else's identity; stash
a password in a field that is never cleared and it leaks through a memory dump or a later login attempt. JAAS, used
as described, closes these gaps by making the framework (not ad hoc code) decide pass or fail, by binding
credentials to the `Subject` only when the module actually succeeded, and by wiping saved state on both failure and
logout.

## Controls

Following the cheat sheet's structure, from lifecycle to each required method:

1. **Login lifecycle.** The application builds a `LoginContext` from a named configuration stanza and a callback
   handler. The context reads the config, instantiates the listed `LoginModule`s, and calls each module's
   `initialize()`. On `LoginContext.login()` the modules' `login()` methods run per their control flags; if the
   overall result is success the context calls each module's `commit()`, otherwise it calls `abort()`.
2. **Configuration file.** Each `LoginModule` gets a stanza with a control flag such as `required`, which forces
   that module's `login()` to pass for the overall login to succeed. Module options are `key=value` pairs, and
   every entry and stanza ends with a semicolon.
3. **Client side.** Create the `LoginContext` with the stanza name and a `CallbackHandler`, then call `login()`.
   It returns no value on success and throws a `LoginException` on failure, so never read a result as "logged in"
   without that exception-free return. Fetch the authenticated `Subject` with `getSubject()` only after a
   successful login.
4. **initialize().** Save the shared `Subject`, the `CallbackHandler`, the `sharedState` map (used when two or
   more modules must share data), and the `options` map, for later use by the other methods.
5. **login().** Use the callback handler to collect the username and password, compare them against a backing
   store such as LDAP, record whether this module succeeded, and return to the caller.
6. **commit().** Run only after credentials check out. Attach this module's principals and credentials to the
   shared `Subject` just when its own authentication passed, and otherwise discard the state it saved. Separate
   credentials by protection need: public ones (such as certificates) can be shared, private ones (such as
   passwords and private keys) need guarding. Return `true` when it passes, `false` if this module is skipped,
   and raise a `LoginException` when it fails.
7. **abort().** Called when authentication does not succeed. Clear the saved state before returning, including the
   username and password input fields, so no partial credentials linger.
8. **logout().** When `LoginContext.logout` runs and the `Subject` is not read-only, remove the principals and the
   credentials this module added, so the identity does not survive the session.
9. **CallbackHandler.** Keep it in its own source file with a single `handle()` method so it can serve many login
   modules; it fills each `NameCallback` and `PasswordCallback` with the gathered values.

## @security scenario

```gherkin
@security @owasp:jaas @usecase:logout-credential-release
Scenario: Logout strips the authenticated identity from the Subject
  Given a user who logged in through a JAAS LoginContext
  And the login committed principals and credentials to the Subject
  When the application calls LoginContext.logout
  Then the module removes the principals and credentials it added from the Subject
  And a later request carrying that Subject is no longer treated as authenticated
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually protects the login is the lifecycle discipline: the framework decides success through control flags,
`commit()` binds credentials only on a real pass, and `abort()` and `logout()` clear state so nothing leaks or
lingers. The `@security` scenario proves one logout releases the identity; the `commit`/`abort`/`logout` contract
is what makes every session's credentials bound only while earned and gone afterward. A test is a check; the
lifecycle methods doing their job are the guarantee.

## Sources

- OWASP JAAS Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/JAAS_Cheat_Sheet.html>, retrieved 2026-10-11): the authentication lifecycle, the configuration stanza and control flags, the client-side `LoginContext` flow, and the `initialize`/`login`/`commit`/`abort`/`logout` and `CallbackHandler` responsibilities. `[documented]`
