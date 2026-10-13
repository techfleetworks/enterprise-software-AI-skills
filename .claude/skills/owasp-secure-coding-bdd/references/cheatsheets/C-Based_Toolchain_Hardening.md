# C-Based Toolchain Hardening

## What it is

How to set up a C, C++, or Objective-C project so the build itself produces reliable, defensible executables:
tuning the four stages an attacker never sees (configuration, preprocessor, compiler, linker) plus runtime
diagnostics. This is the per-sheet guidance from the OWASP C-Based Toolchain Hardening Cheat Sheet, condensed to the
controls that hold across GCC, Clang, and Visual Studio while covering each distinct setting.

## The attack it stops

Defaults are the enemy here. Autotools and stock makefiles often ignore the flags you pass, reuse object files
built under a different configuration, and ship with platform defenses switched off, so a binary meant to have
stack canaries, a non-executable stack, and address randomization ends up with none, and a memory-corruption bug
turns into code execution. A bundled OpenSSL left with SSLv2, SSLv3, or TLS compression enabled reopens known
attacks (such as POODLE and CRIME). And `assert` wired to the standard `abort()` either crashes production or gets
abandoned by developers, so bugs that would have surfaced at the point of first failure stay hidden. Hardening the
toolchain closes these gaps before the executable ever leaves the build.

## Controls

Following the cheat sheet across its four stages and runtime:

1. **Separate Debug, Release, and Test build configurations.** Debug turns optimizations off and debug info to the
   maximum (`-O0 -g3 -ggdb`), keeps a frame pointer (`-fno-omit-frame-pointer`), defines `DEBUG` (not `NDEBUG`),
   and pulls in diagnostic allocators such as `dmalloc` or Address Sanitizer. Release optimizes and keeps modest
   debug info (`-On -g2`), defines `NDEBUG` (not `DEBUG`), and has its symbols stripped but archived for crash
   symbolication. Test is a Release variant that exposes internals for the harness (`-Dprotected=public
   -Dprivate=public`, and change `visibility("hidden")` to `visibility("default")`) and leans on negative tests
   that try to make the program fail gracefully. On Windows the optimization switches are `/Od` for debug and
   `/Ox`, `/O2`, or `/Os` for release. On x86, add the speculative-execution mitigations your target CPU and OS
   call for (such as `-mindirect-branch=thunk`), following current platform advice rather than assuming they cover
   every Spectre or Meltdown variant.
2. **Make the build honor your flags and rebuild on config change.** Autotools and Make often drop user-supplied
   `CFLAGS`/`CXXFLAGS`/`LDFLAGS` and, because Make compares timestamps, do not recompile when only the flags
   change, so a "release" build can secretly stay a debug build. Use `override` to merge your hardening flags ahead
   of the user's, and keep a separate build directory per configuration so objects compiled with different
   hardening are never reused.
3. **Integrate with platform security and audit the supply chain.** Turn on the defenses the platform offers,
   especially Position Independent Executable / ASLR (`-fPIE -pie`) and data-execution prevention / non-executable
   stack and heap, since skipping them has led to real exploits. Add diagnostic libraries (DMalloc, Address
   Sanitizer) to debug builds. Harden third-party code you bundle, because it falls in scope for supply-chain
   audits (for example SP 800-53 SA-12); a defective embedded library is your vulnerability. When you include
   OpenSSL, configure out the broken pieces (`-no-ssl2 -no-ssl3 -no-comp`, plus `-no-hw -no-engine -no-dso
   -no-shared` if you static-link without hardware engines).
4. **Pin the preprocessor to two clear configurations.** Honor `NDEBUG` for Release and an explicit `DEBUG` macro
   for Debug (vendors reuse `DEBUG`/`_DEBUG`, so define your own derived symbol). Treat both being defined as a
   compile error, and treat neither being defined as a safe default to Release.
5. **Assert everywhere, with debugger-friendly behavior.** Put an `assert` next to every validation `if` for
   parameters, return values, and program state so the code debugs itself. Replace the standard `abort()` behavior
   with an assert that raises `SIGTRAP` (snapping the debugger) in debug builds and compiles to `void` in release,
   and install a `SIGTRAP` handler at startup if none exists (on Windows, `_set_invalid_parameter_handler`).
   Production code runs under `NDEBUG`, so it never asserts or auto-aborts; if you need a memory image, write the
   dump deliberately instead of crashing and leaking secrets to disk or email.
6. **Set the integration and hardening macros, and flag their removal.** Define the macros needed to integrate
   each platform and library securely. Treat undefining a security macro as a defect, for example
   `-U_FORTIFY_SOURCE` on Linux or `_CRT_SECURE_NO_WARNINGS`, `_SCL_SECURE_NO_WARNINGS`,
   `_ATL_SECURE_NO_WARNINGS`, and `STRSAFE_NO_DEPRECATE` on Windows. On Linux, define `-D_FORTIFY_SOURCE=2`
   for fortified libc calls, or `-D_FORTIFY_SOURCE=3` for stronger dynamic buffer checks where the toolchain
   supports it (GCC 12+ or recent Clang with glibc 2.35+, backported to glibc 2.34 on RHEL 9 and derivatives);
   otherwise level 3 silently falls back to level 2. Mind the caveats: `_GLIBCXX_DEBUG` has ABI
   conflicts with prebuilt libraries, SQLite secure-delete zeroization is required under FIPS 140-2, default file
   modes leave broad access, and temp tables can be forced into memory to keep plaintext off disk.
7. **Turn on the compiler's warnings and static analysis.** GCC and Visual Studio catch mistakes early, such as an
   uninitialized variable or a signed value promoted and compared against an unsigned one (where `-1 > 1` after
   promotion). They do not catch SQL injection or other tainted-data flows, so add a dedicated taint or data-flow
   analyzer for that. Distributions already apply some hardening through GCC spec files; inspect it with
   `gcc -dumpspecs`.
8. **Build GCC/Binutils with warning and overflow flags plus linker hardening.** Compile with warnings such as
   `-Wall -Wextra -Wconversion -Wformat=2 -Wformat-security -Wstrict-overflow` and `-fstack-protector-all`, and use
   `-fno-strict-overflow` with `-fwrapv` so the compiler does not delete overflow or wrap checks (if the program
   only works with these, it is relying on undefined behavior; use `safe-iop` or `SafeInt` instead). Harden the
   link with `-z noexecstack -z noexecheap -z relro -z now` and `-fPIE -pie`, then confirm the result with
   `checksec`.
9. **Use Clang/Xcode extras.** Clang accepts the GCC flags and adds `-Weverything` (treat its non-spurious output
   as a quality gate), a static analyzer, and integer-overflow and shift checks via `-fsanitize=integer` and
   `-fsanitize=shift`.
10. **Use Visual Studio's defenses.** Enable the stack-cookie, ASLR, and DEP switches (such as `/GS`,
    `/DynamicBase`, `/NXCOMPAT`), apply `#pragma strict_gs_check(on)` in high-risk parsers, and verify the binary
    with BinScope.
11. **Suppress spurious warnings without disabling warnings.** Quiet real noise so genuine findings stand out: wrap
    unused parameters in an `UNUSED_PARAMETER` macro, range-test a value before a signed-to-unsigned cast, and
    never ignore a return value that signals truncation (check `snprintf`'s result rather than casting it to
    `void`).
12. **Add runtime diagnostics.** During development, enable the platform's runtime guards: Xcode Code Diagnostics
    (scribble, edge, and malloc guards, plus zombies) and, on Windows, Managed Debugging Assistants for debugging
    and Windows Defender Exploit Guard (the EMET replacement) with the Process Mitigation Management Tool for
    deployed hardening.

## @security scenario

```gherkin
@security @owasp:c-toolchain @usecase:release-binary-hardened
Scenario: The release executable ships with platform exploit mitigations on
  Given a C or C++ project built in its Release configuration
  When the build compiles and links with stack protection, non-executable stack and heap, RELRO, and PIE
  Then checksec reports stack canary, NX, full RELRO, and PIE all enabled on the binary
  And NDEBUG is defined so no assert can auto-abort in production
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

What actually hardens the program is the build producing the right binary: hardening flags that survive into the
linked output, mitigations the loader enforces (canaries, NX, RELRO, ASLR), broken protocol features configured out
of bundled libraries, and asserts that snap the debugger in debug yet stay silent in production. The `@security`
scenario proves one release binary carries the mitigations; the toolchain settings and the `override` that defends
them are what make every build carry them. A test is a check; the enforced build configuration is the guarantee.

## Sources

- OWASP C-Based Toolchain Hardening Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/C-Based_Toolchain_Hardening_Cheat_Sheet.html>, retrieved 2026-10-11): the Debug/Release/Test configurations, Autotools and Make pitfalls, platform and supply-chain integration (including OpenSSL configuration), the preprocessor `NDEBUG`/`DEBUG` and custom-assert guidance, the GCC/Binutils, Clang/Xcode, and Visual Studio compiler and linker flags with verification tools, warning suppression, and runtime diagnostics. `[documented]`
