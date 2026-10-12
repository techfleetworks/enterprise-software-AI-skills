# Choosing and Using Security Questions

## What it is

How to choose and handle security questions on the rare legacy systems that still use them, and why they are not a
real authentication factor. This is the per-sheet guidance from the OWASP Choosing and Using Security Questions
Cheat Sheet, condensed to the controls that hold and the attack they stop. NIST SP 800-63 no longer accepts
security questions, so new software should not use them at all; this covers the harm reduction when you are stuck
with them.

## The attack it stops

Security questions fail because their answers are easy to guess or dig up. A question like a date of birth or a
favorite movie has a small range of likely answers or is posted on social media, so an attacker who knows a little
about the target, or who just tries the common answers, can defeat the check and reset or log into the account.
The flow itself can also leak which accounts exist if it shows the questions before proving the person controls
the registered email. Treating a password plus a question as two factors is a further trap, because both are
things you know, so one compromise can give up both.

## Controls

### Choosing questions

1. **Meet all five characteristics.** A usable question must be memorable (recallable years later), consistent
   (the answer does not change), applicable (the user can answer it), confidential (hard for an attacker to get),
   and specific (clear to the user).
2. **Judge questions in the app's context.** A question safe on one site can be weak on another (a teacher's name
   is easy to guess among classmates on a school platform but stronger on a gaming site).
3. **Reject bad questions.** Avoid anything missing those traits: date of birth or a memorable date (easy to find
   or just the birthday), favorite movie (changes over time), favorite sports team (not applicable to many), make
   and model of a first car (few likely answers), or a nickname (visible on social media).
4. **Offer a list of good questions.** Give users a menu of specific questions with harder answers, so everyone
   finds one they can answer, for example the name of a college applied to but not attended, the first school
   remembered, a memorable field trip destination, a teacher's surname in a given school year, a first stuffed
   toy, or a driving instructor's first name.
5. **Make questions unique to the app.** Because people reuse recovery questions across sites, prefer targeted
   questions unlikely to be shared, such as finance questions on a share-dealing platform.
6. **Do not let users write their own questions.** Some write strong ones, but many write weak ones, and some set
   the question to a password hint, so it is generally best not to allow it.
7. **Restrict answers.** Enforce a minimum answer length to block entries like "a" or "123", but keep it low
   enough for legitimate short answers (a two-letter name or a four-letter color). Check answers against a
   denylist that includes the username or email, the current password, and common strings like "123" or
   "password".
8. **Renew questions periodically.** If the questions are not part of normal login, prompt users now and then (for
   example at password change) to review them and confirm they still know the answers.
9. **Treat system-defined questions as weak.** Questions built from stored personal details (name, address, date
   of birth) are easily found on social media, so weigh whether the user will recall it, whether an attacker can
   obtain it, and whether the answer is common or guessable.

### Using questions

10. **Never use them as the only check, and never call them MFA.** A password plus a security question is not MFA,
    because both are something you know. Use questions only as an extra layer when stronger factors are missing,
    in cases like login, forgotten-password reset, and lost-MFA recovery.
11. **Count wrong answers as failed logins.** In the main authentication flow, ask the questions after a correct
    username and password, and increment the account lockout counter on a wrong answer.
12. **Prove email ownership before showing questions in recovery.** To avoid enumeration, take the email, show a
    generic "if the address is correct, we sent an email" message, email a random single-use link, and only after
    the user follows it present the questions, then let them set a new password.
13. **Store answers like passwords.** Answers can be personal and reused, so hash them with a secure algorithm
    such as bcrypt per the password storage guidance.
14. **Compare case-insensitively.** Lowercase the answer before hashing it at storage, and lowercase the submitted
    answer before comparing, and hint at the expected format (for example "DD/MM/YYYY" for a date) so users match
    what they entered.
15. **Require re-authentication to change answers.** Treat updating questions as sensitive and make the user
    re-enter their password (or ideally use MFA), so someone with brief access cannot change the questions.
16. **Handle multiple questions correctly.** Asking several diverse questions (a mix of user- and system-defined)
    raises assurance. If one question is drawn from a bank, do not rotate to a different one until the user
    answers the current one correctly, so an attacker cannot shop for the easiest question.

## @security scenario

```gherkin
@security @owasp:security-questions @usecase:recovery-enumeration-and-single-factor
Scenario: Security questions are gated behind email proof and never stand alone
  Given a password reset flow that uses security questions as a secondary layer
  When an attacker enters an email address to start recovery
  Then the response is a generic message that does not reveal whether the account exists
  And the security questions are shown only after the user follows a single-use emailed link
  And a correct answer alone does not authenticate without the prior factor
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's shared
feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and wire it into CI
(its "CI/CD wiring") so it runs as a blocking autotest in the same place as every other Gherkin scenario.

## The real guarantee

The thing that actually limits the damage is never trusting a security question on its own: it only follows a
proven factor (a correct password, or control of the registered email shown through a single-use link), so a
guessed answer by itself opens nothing. The deeper guarantee is to not use security questions at all, since NIST
rejects them; where they remain, gating them behind another factor is what holds. The `@security` scenario checks
one recovery attempt; the requirement that a question never stands alone is what makes every attempt safe. A test
is a check; the always-secondary gating is the guarantee.

## Sources

- OWASP Choosing and Using Security Questions Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Choosing_and_Using_Security_Questions_Cheat_Sheet.html>, retrieved 2026-10-11): the NIST warning against security questions, the five desired characteristics, bad and good question examples, rules on user-written questions, answer restrictions and denylists, renewal, system-defined weakness, the never-sole and not-MFA rules, the enumeration-safe recovery flow, and storing, comparing, updating, and asking multiple questions. `[documented]`
