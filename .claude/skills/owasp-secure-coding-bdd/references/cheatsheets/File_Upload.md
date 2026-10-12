# File Upload

## What it is

How to accept files from users without letting a bad one harm the app, its host, or other
people who later fetch the file. This is the per-sheet guidance from the OWASP File Upload Cheat
Sheet, condensed to the layered controls that hold and the attacks they stop. No single check is
enough, so the sheet stacks several.

## The attack it stops

A naive upload form lets an attacker send a file that the server treats as code or that abuses
the way files are named and stored. The sheet lists the concrete cases: a disguised script such
as `shell.jpg.php` that slips past a lazy `.jpg` check and then runs as PHP; a null-byte trick
like `.php%00.jpg` that truncates the stored name back to `.php`; case tricks like `.pHp`; mapped
variants such as `.phtml` or `.php5`; a Windows stream name like `shell.php::$DATA`; a ZIP bomb or
billion-laughs XML that fills the disk and takes the service down; a file that overwrites one
already on the system; and active content (XSS or CSRF) that fires when another user downloads it.
A dropped `.htaccess` or `web.config` in the upload folder can even re-map how the server runs
files there. The controls below close each of these paths.

## Controls

The sheet's defense-in-depth set, roughly in the order it presents them:

1. **Validate input before checking the extension.** Decode the filename first, then apply your
   filter, so encoding tricks do not sneak past.
2. **Allow-list extensions.** Permit only the few extensions the business actually needs (for
   example `pdf` and `docx` for a CV upload). Pick the lowest-risk types. Blocking known-bad
   extensions is weak on its own and easy to bypass.
3. **Guard against extension bypasses.** Reject double extensions, null bytes, case variants,
   interpreter-mapped alternates, and any name containing a colon (`:`) for NTFS stream abuse. Do
   not hand-roll a clever regex; use a tested parser.
4. **Check the file type, but never trust the `Content-Type` header.** The client sets it and can
   spoof it. Use it only as a quick sanity check, preferably against an allow-list, not as a
   security control.
5. **Validate the file signature (magic bytes)** against the type you expect, alongside the
   content-type check. On its own it is bypassable, so pair it with the other checks.
6. **Generate the stored filename yourself.** Create a random name such as a UUID or GUID. This
   also defeats the Windows 8.3 short-name alias trick, since the attacker no longer picks the
   target name. If you must keep the user's name, validate it on both client and server sides.
7. **Constrain user-supplied filenames.** Set a maximum length. Restrict to a safe subset such as
   letters, digits, hyphen, spaces, and periods. Block leading periods (hidden files), repeated
   periods (traversal), and leading hyphens or spaces (shell-argument abuse). If you cannot
   allow-list characters, at least block-list the dangerous ones.
8. **Validate file content by type.** For images, decode and re-encode to an approved format and
   strip metadata, using a patched, sandboxed, resource-limited library. For Office documents, use
   a tool like Apache POI. Avoid accepting ZIP files, since they can carry anything. Where you
   can, run uploads through antivirus, a sandbox, or CDR (Content Disarm and Reconstruct), and
   consider a hash-reputation scan (watching for data leakage to public services).
9. **Store files away from code.** Best: a separate host. Next: outside the webroot. Last resort:
   inside the webroot with write-only permissions and tight read controls. Also disable
   per-directory config overrides on the upload path (for example Apache `AllowOverride None`) so
   a planted `.htaccess` cannot re-map handlers.
10. **Require authentication and authorization** before anyone can upload, so you can scope and
    limit each user's rights.
11. **Apply least-privilege filesystem permissions.** Only the right system users may read the
    files; set only the modes needed; scan any file before it is ever executed.
12. **Set size and request limits.** Cap upload size, and compute ZIP sizes safely after
    decompression. Rate-limit downloads too, to blunt DoS.
13. **Keep upload libraries current and well configured,** and protect the upload endpoint against
    CSRF.

## @security scenario

```gherkin
@security @owasp:file-upload @usecase:disguised-executable-rejected
Scenario: An upload endpoint rejects a disguised executable file
  Given an upload endpoint that allows only pdf and docx files for authenticated users
  When an attacker uploads a file named "resume.jpg.php" with a spoofed image Content-Type
  Then the upload is rejected because the real extension and signature are not on the allow-list
  And no file is written inside the webroot and no server-side script is created
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently")
and wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as
every other Gherkin scenario.

## The real guarantee

What actually keeps a bad upload from doing harm is the stack of controls working together:
allow-listed and signature-checked types mean a disguised script never lands, a server-generated
name means the attacker cannot target or overwrite anything, and storage outside the webroot with
no config overrides means even a stored file cannot be executed. The `@security` scenario proves
one disguised payload is turned away; the layered design is what makes the whole class of uploads
safe. A test is a check; the defense-in-depth placement and allow-list are the guarantee.

## Sources

- OWASP File Upload Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>, retrieved 2026-10-11): the upload threat list and the full layered control set (extension allow-listing and bypass defenses, content-type and signature checks, server-generated filenames, content validation, storage location, permissions, size limits, and CSRF protection) summarized above. `[documented]`
