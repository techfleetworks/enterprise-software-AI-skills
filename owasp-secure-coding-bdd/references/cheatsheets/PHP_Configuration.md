# PHP Configuration

## What it is

How to harden the `php.ini` settings and the web server that runs PHP so the platform itself is secure before a
single line of application code runs. This is the per-sheet guidance from the OWASP PHP Configuration Cheat
Sheet, condensed to the controls that hold and the attacks they stop. It covers error handling, file and
include paths, uploads, dangerous functions, session cookies, and a hardening extension.

## The attack it stops

Loose PHP defaults hand attackers easy wins. Errors shown to the browser leak file paths, stack details, and the
PHP version, which maps out the app for the next attack. Leaving remote URL includes on lets a local file
inclusion turn into remote code execution. Leaving risky functions enabled gives an injection flaw a path to run
system commands. Session cookies without the right flags can be stolen by client scripts, sent over plain HTTP,
or ridden in a cross-site request. Unbounded uploads and request sizes let one request exhaust the server.

## Controls

In the cheat sheet's order:
1. **Run a supported PHP branch.** Stay on a version still listed as supported and plan the upgrade before its
   security-support date passes. A vendor's extended support does not make the upstream branch supported.
2. **Hide errors from users, keep them in logs.** Set `expose_php = Off`, `display_errors = Off`, and
   `display_startup_errors = Off`, turn `log_errors = On`, and point `error_log` at a valid file so failures go
   to the log instead of the response. On production, confirm display is off and review the logs often.
3. **Lock down file and include paths.** Confine scripts with `doc_root` and `open_basedir`, and set
   `include_path`, `extension_dir`, and the mime-magic file explicitly. Set `allow_url_fopen = Off` and
   `allow_url_include = Off` so a local file inclusion cannot be escalated to a remote one. Keep
   `variables_order` sane, turn `allow_webdav_methods = Off`, and shorten `session.gc_maxlifetime`.
4. **Constrain file uploads.** Turn `file_uploads = Off` entirely when the app accepts none. When it does, set a
   dedicated `upload_tmp_dir`, cap `upload_max_filesize`, and limit `max_file_uploads` to the few files you
   actually expect.
5. **Disable executable and dangerous functions.** Set `enable_dl = Off`, and use `disable_functions` to switch
   off every risky function you do not use, such as the command-execution, file-manipulation, and
   process-opening calls listed in the sheet. Use `disable_classes` the same way for classes.
6. **Harden session handling.** This is the most important area. Rename the session from the default via
   `session.name`, keep `session.auto_start` off, and set `session.use_strict_mode = 1`,
   `session.use_only_cookies = 1`, and `session.use_cookies = 1`. Mark the cookie `session.cookie_secure = 1`,
   `session.cookie_httponly = 1`, and `session.cookie_samesite = Strict`, scope `cookie_domain` and
   `cookie_path`, set a sensible `cookie_lifetime`, and use a long `sid_length` with adequate
   `sid_bits_per_character`.
7. **Add the paranoid checks.** Set `session.referer_check`, cap `memory_limit`, `post_max_size`, and
   `max_execution_time` so one request cannot drain resources, turn `html_errors = Off`, keep
   `report_memleaks = On`, and set `zend.exception_ignore_args = On` so exception arguments stay out of traces.
8. **Consider a hardening extension.** Add a runtime hardening module such as Snuffleupagus, the modern
   successor to Suhosin, which is stable enough for production use.
9. **Harden the web server too.** Apply matching configuration to the Apache, Nginx, or Caddy server in front of
   PHP, since securing the interpreter alone is not enough.

## @security scenario

```gherkin
@security @owasp:php-config @usecase:error-and-session-hardening
Scenario: PHP configuration hides errors and secures session cookies
  Given a production php.ini applied to the server
  When a request triggers a runtime error and starts a session
  Then no error detail or PHP version reaches the browser and the detail is written only to the error log
  And the session cookie is issued with Secure, HttpOnly, and SameSite=Strict set
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually protects a PHP deployment is the hardened configuration itself: errors that never reach
the browser, remote includes turned off, dangerous functions disabled, and session cookies flagged correctly.
The `@security` scenario proves one error stays hidden and one cookie is flagged; the settings are what make
every error and every session safe. Application code cannot re-enable a disabled function or a stripped flag,
which is why the configuration, not the test, is the guarantee here. A test is a check; the locked-down `php.ini`
is the guarantee.

## Sources

- OWASP PHP Configuration Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/PHP_Configuration_Cheat_Sheet.html>, retrieved 2026-10-11): the `php.ini` settings for supported versions, error handling, file and include paths, uploads, executable and dangerous functions, session handling, the paranoid checks, the Snuffleupagus hardening extension, and web-server configuration. `[documented]`
