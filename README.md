# Enforcable AI Skills and CI/CD Checks for Enterprise Engineering Standards
An open source repository made and kept up to date by **[Tech Fleet](https://techfleet.org)**.

# Licensing
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Skills](https://img.shields.io/badge/skills-16-blue.svg)
![Vendor-neutral](https://img.shields.io/badge/vendor-neutral-informational.svg)

# Table of contents
- [Why this exists](#why-this-exists)
- [The skills](#the-skills-1)
- [Skills that make things work for everyone](#skills-that-make-things-work-for-everyone)
- [What is a "skill"?](#what-is-a-skill)
- [How to install and use it](#how-to-install-and-use-it)
- [Always on: use every skill on every job](#always-on-use-every-skill-on-every-job)
- [How a skill gets picked and enforced](#how-a-skill-gets-picked-and-enforced)
- [Set it up and keep it current](#set-it-up-and-keep-it-current)
- [The checks travel to any project (v1.2)](#the-checks-travel-to-any-project-v12)
- [Three examples in plain English](#three-examples-in-plain-english)
- [Turn on the architecture check, step by step](#turn-on-the-architecture-check-step-by-step)
- [How the skills work together](#how-the-skills-work-together)
- [The ideas behind the design](#the-ideas-behind-the-design)
- [How to help](#how-to-help)
- [What's in this project](#whats-in-this-project)
- [License](#license)
- [Thank you](#thank-you)

# About This Repo
This project holds 16 **skills**. A skill is a short checklist written by an expert. An
AI coding tool, or a person, reads it while they work. Each skill holds the know-how a
good senior engineer uses when they make a change: how to keep it safe, how to test it,
how to put it out into the world, and why a choice was made.

# Unique Value 
The rules that these AI skills apply don't just sit there and wait for an AI agent to forget to look at them or apply them. They get checked, and enforced, and verified when AI agents apply them. Agent work is checked against these skills standards. 

Lots of teams write down good rules. But a rule you only *read* is easy to skip, easy to forget, or easy to think you followed when you really didn't. In our own work, an AI tool often skips a rule it read in a skill. So we built three things that work together to fix that. 

You don't need to know what you're doing to apply the enforcements. The system is built to automate the setup, the documentation, and the enforcement of standards. 

**1. It sets itself up.** You don't have to install anything by hand. When you add this
project to your work, the skills and their checks turn themselves on. They stay up to
date every time the project updates. 

**2. It asks the AI to show its work.** Every time the AI makes a change, it leaves a
kind of receipt. The receipt says which skills it used, the exact lines it followed, and
the files it touched. If it quietly skips a skill, the receipt comes up short, and that
gets caught. 

**3. It catches problems before they go live.** Each skill comes with an automatic check.
The check runs when someone hands in new code. If the work didn't follow the skill, the
check fails, and the change has to wait until it's fixed. 

# Overview of the AI Skills Contents
- **13 engineering skills.** They cover safety (security), testing, how the system is
  built, putting out new versions, running the system once it's live, rules for handling
  data, writing down decisions, code review, writing good rules, checking the checks, honest
  self-review, and picking the right way to build something.
- **3 universal accessibility skills.** They make sure what you build works for everyone:
  every browser and device, people with wide ranges of abilities, and user-friendliness standards.

# Why This Exists
The thing that makes software ready for the real world is often **knowledge stuck inside
people's heads**. The security engineer knows the lockout check has to run before the
delete. The SRE wants a reliability goal set before launch. The architect knows why they
picked one database over another. Not everyone has this knowledge. It's easy to forget
when a deadline is close. And it almost never gets used on every single change.

These skills take that knowledge out of people's heads and put it where the tool can read
it. When a person, or an AI tool, works on a feature, it pulls in the right skill and
uses it while doing the work. It checks the input for threats, writes the tests, records
the decision, and plans a safe database change. You don't have to hope a reviewer catches
the problem later.

# Breakdown
## Technical AI Skills Overview Table
| Skill | What it does | When it turns on | Extra files |
|---|---|---|---|
| [`enterprise-architecture-standards`](.claude/skills/enterprise-architecture-standards/) | Designs the system and its data with real trade-offs in mind: structure, strength, and how it grows. | You design, build, or rework a service, database, API, or system. | 9 refs |
| [`pattern-selector`](.claude/skills/pattern-selector/) | Picks the building style that fits, or none, with the good points, bad points, and trade-offs. | You design or rework any feature, class, part, or data flow; "which pattern?" | 5 refs, 1 script |
| [`architectural-decision-records`](.claude/skills/architectural-decision-records/) | Writes down why a big choice was made. | You make an important choice: database, framework, contract, or login setup. | 5 refs, 2 scripts |
| [`owasp-secure-coding-bdd`](.claude/skills/owasp-secure-coding-bdd/) | Turns a safety review into tests that can actually run. | You touch login, input, sessions, files, APIs, permissions, add-ons, or AI code. | 15 refs |
| [`bdd-comprehensive-testing`](.claude/skills/bdd-comprehensive-testing/) | Writes every case and audience as plain-sentence tests, checked on every push. | Any change in how things work: build, add, fix, or push. | 4 refs, 5 scripts |
| [`comprehensive-test-strategy`](.claude/skills/comprehensive-test-strategy/) | Covers the rest of testing beyond the plain-sentence kind. | Any code others rely on: unit, joined-up, end-to-end, contract, load, and stress tests. | 5 refs |
| [`release-deployment-safety`](.claude/skills/release-deployment-safety/) | Puts out new versions at large scale with no outage. | Deploy, release, roll out, move, switch over, quick fix, roll back, or feature switch. | 5 refs |
| [`sre-operational-readiness`](.claude/skills/sre-operational-readiness/) | Checks whether it's safe to run in the real world. | Reliability goals, monitoring, alerts, on-call, problems, and how-to guides. | 5 refs |
| [`compliance-data-lifecycle`](.claude/skills/compliance-data-lifecycle/) | Handles private and regulated data safely. | Personal data, privacy laws, audits, record keeping, backups, and recovery. | 5 refs |
| [`judge-arch`](.claude/skills/judge-arch/) | Reviews a change against four questions and blocks drift. | Before "done" or a PR: reviewing a change, branch, or area. | 4 refs, 1 script |
| [`arch-encode`](.claude/skills/arch-encode/) | Turns a caught mistake into a tested, enforced rule. | After catching drift; "add a rule so this never happens again." | 2 refs |
| [`verifiable-quality-gates`](.claude/skills/verifiable-quality-gates/) | Proves that each automatic check can really catch a problem. | Adding or reviewing a check or guard; a passing build you don't trust. | 3 refs, 2 scripts |
| [`skeptical-audit`](.claude/skills/skeptical-audit/) | Backs every claim with proof you can run again yourself. | Any claim of fact: audits, reviews, status, counts, "I checked X." | 1 ref, 1 script |

## Technical Skills Scope
**`enterprise-architecture-standards`** uses the system design, database, and speed
standards you would expect from a senior team at a big company. It picks a structure on
purpose, builds the database around real trade-offs, chooses whether tasks run at once or
one after another for a good reason, and builds in timeouts, retries, and limits from the
start instead of bolting them on later.

**`pattern-selector`** starts each feature by naming the problem as a set of forces. Then
it checks whether a known building style (a "pattern") is even needed. Often the answer
is no. If one does fit, it picks the right one and spells out the good points, the bad
points, the problem it prevents, the safety and running trade-offs, the simpler option it
turned down, and a test that proves it was used right. It covers the 23 classic patterns
plus some bigger-company and security ones. It also lists the patterns to *avoid* for
when the job is to take structure out. A built-in check keeps every entry complete and
backed by a source.

**`architectural-decision-records`** treats a decision as unfinished until the *why* is
written down. It makes a numbered note (an ADR) in the same request as the code. The note
names the options you did not pick and the downsides you agree to live with. It comes
with little programs to create and check these notes.

**`owasp-secure-coding-bdd`** does a full safety review against the well-known OWASP
checklists, which are kept on disk so there's no need to look anything up online. It
applies the matching safe-coding steps and writes them as tests that can run. It always
runs the "don't lock everyone out" and "don't delete by accident" safety check before any
change to permissions, access, or deletes.

**`bdd-comprehensive-testing`** turns a change into the full set of behavior tests: every
case (the one that goes right and every one that goes wrong), crossed with every audience.
It asks you when the audience isn't clear, and never guesses. The tests are written in
plain-sentence form, and an official reader checks them. They are kept in order on a
shared list, saved in the project with an add-only log, and checked on every push. So
missing or broken tests can't get added in.

**`comprehensive-test-strategy`** owns the testing that the plain-sentence kind doesn't:
small unit tests, joined-up tests, full end-to-end tests, contract tests between
services, load and stress tests, and coverage checks. It also shows how to keep flaky
tests from rotting the whole set.

**`release-deployment-safety`** turns "we added it in" into "it's safely live." It covers
putting out new versions with no downtime, rolling them out slowly to a few users first,
feature switches, instant roll back, and database changes that still work with the old
version. So a release never takes the system down.

**`sre-operational-readiness`** answers "is this safe to run?" before launch. It covers
reliability goals and error budgets, the four key signals to watch, alerts that go off
for real problems and not noise, how to respond to an outage, blame-free write-ups
afterward, how-to guides, and a final readiness review.

**`compliance-data-lifecycle`** handles personal and regulated data with care: sorting
data by how sensitive it is, how long to keep it and when to delete it, logs you can't
tamper with, people's rights over their own data under privacy laws, plus safe database
changes, backups, and disaster recovery.

**`judge-arch`** reads a change the way a careful senior architect would, with fresh eyes,
against four questions. Is it in the right place? Who owns this data? What does it now
depend on? What happens when it breaks? It reports what it finds, not fixes, or it says
PASS. It comes with a small, no-extras check (`arch-gate.mjs`) so the rules that *can* be
checked block a merge instead of just being advice. This is the layer that makes the other
skills' standards actually stick.

**`arch-encode`** turns a caught mistake into a lasting rule: a clear "don't do this" code
example placed right where the code lives, wired into the check when it can be checked,
and then proven to work by undoing the fix and running the task again to see the rule
catch it. It keeps rule files short and free of conflicts.

**`verifiable-quality-gates`** treats your automatic checks as code that can quietly stop
working while still showing green. A tightened pattern, a flipped condition, or a moved
file can break a check without anyone noticing. So each check gets a saved test that runs
the real check and fails if the check is swapped for one that does nothing. This is the
layer that keeps the other skills' checks honest.

**`skeptical-audit`** treats your first answer as a guess until a measurement proves it.
Before any claim of fact goes out, like "it works," "tests pass," "it's unused," "it's
safe," or "I checked X," it attaches three things: how it knows (saw it, figured it out,
read it, was told, or didn't check), a source someone else can run again, and a named
limit (what was *not* checked). An honest "3 confirmed, 2 not checked" beats a confident
"all good." This is the layer that keeps every other skill's findings honest.

## UX and Accessibility AI Skills Overview
| Skill | What it does | When it turns on |
|---|---|---|
| [`universal-browser-device-support`](.claude/skills/universal-browser-device-support/) | Works and looks right on every supported browser and device. | Any web page or screen change, flexible layouts, "broken in Safari," mobile, touch. |
| [`universal-accessibility-wcag`](.claude/skills/universal-accessibility-wcag/) | Meets the WCAG 2.2 AA standard so people who use a keyboard, screen reader, or magnifier aren't shut out. | Forms, images, color and contrast, focus, keyboard, screen readers. |
| [`usability-ux-universal-design`](.claude/skills/usability-ux-universal-design/) | Clear, simple design for the widest range of people. | New screens or flows, menus, first-time setup, empty and error screens, wording. |

Use them in order on any screen change. First **works everywhere**: it loads and runs
wherever the user is. Then **can everyone use it**: people with any ability can, which is
the floor the law often requires. Then **is it easy**: it's simple for anyone on top of
that.

---

## What is an "AI Skill"?
An AI skill is a folder built around one `SKILL.md` file. It can have extra files the tool
reads only when it needs the detail:

```
<skill-name>/
  SKILL.md          # a short header (name + description) plus the instructions
  references/*.md   # deeper material, read only when needed
  scripts/*         # optional helper programs the skill can run
  assets/*          # optional ready-made files (templates, snippets)
```

`SKILL.md` starts with a short header, then plain text instructions:

```yaml
---
name: architectural-decision-records
description: "When to use this skill. This text is what turns it on."
---
# ...instructions here...
```

Two ideas make this work:

- **The description is a switch.** The AI tool reads it to decide if the skill fits the
  job. So it's written as *when to use this*, not *what this is*.
- **Load the detail only when needed.** `SKILL.md` stays short and easy to skim. The heavy
  detail sits in the `references/` files and loads only when the task needs it. This keeps
  the tool from getting overloaded.

This is, on purpose, the simplest shared format. Any tool that knows the SKILL.md format
reads it directly. Any model that doesn't can still read the file as plain text. Nothing
here is tied to one company.

---

# Installation
The skills live in this project under [`.claude/skills/`](.claude/skills/), so you have a
few options:

- **Work inside this project:** copy it down and open a session here. The tool finds the
  skills on its own. No install step.
- **For all your projects, in one command:** run
  `node .claude/skills/bootstrap/scripts/esk-init.mjs --personal --yes --skills` to copy
  every skill into your personal `~/.claude/skills/` folder and turn on the always-on
  reminder. Run it again after you pull updates to stay current. Or copy a single skill
  folder into `~/.claude/skills/` by hand.
- **For one of your own projects, shared with your team:** copy the folder into that
  project's `.claude/skills/` and save it.

```bash
# copy it down, then use the skills right here, or copy one out for all your projects
git clone https://github.com/techfleetworks/enterprise-software-AI-skills
cp -r enterprise-software-AI-skills/.claude/skills/architectural-decision-records ~/.claude/skills/
```

## Rule-based tools (Cursor, Copilot, Windsurf)
Point your project rules at the right `SKILL.md`, or paste its body into your rules file.
Add the `references/` files when you work in that area.

## Any other model, custom tool, or lookup system
Use `SKILL.md` as part of the setup prompt or as a lookup document. Read the description
to check if it fits, then feed in the body and any linked file. It's all plain text, so it
drops right in with no converting.

---

# Always On Functionality
By default a skill turns on only when the job matches its description. That leaves things
to chance, and it can skip the review and check skills right when a change is rushed. The
[`always-on/`](always-on/) folder makes **every skill in this project always on**:
considered on every job, for the main tool and every helper it starts up, added by the
system instead of left to the AI to remember.

It works through "hooks," because the tool has no setting that forces a skill to load. One
hook adds the rule when a session starts, and another adds it to every helper. The rule
names the skills and makes using the right ones required. It does not paste in the full
skill text, since the descriptions are already always there. A lighter option is to add
the rule to a `CLAUDE.md` file.

The hook runs a tiny saved program so it doesn't quietly break on a machine where certain
tools are missing. And if the rule file ever goes missing, it says so loudly instead of
quietly turning the enforcement off.

The easiest way to set this up, and keep it current, is the setup tool described below. It
does it for you with a backup and a check. **Don't copy the rule file into your personal
folder:** a copy freezes in place, and a later update changes the project, not the copy.
That's the exact stale-copy trap this whole system exists to prevent. Full steps are in
the [`always-on/` README](always-on/).

---

# How These AI Skills Get Chosen and Enforced
Two things decide whether a skill actually shapes a change: it has to be **picked**, and
the change has to be **enforced** at the end. Picking is automatic: the description is the
trigger, and the always-on layer makes the right skills required instead of leaving it to
chance. Enforcing happens at the result: a fresh-eyes review plus required checks, so a
change that skipped a step can't get added in. This is the difference between a skill that
was *loaded* and one that was *actually followed*.

## Flow
1. A session starts. The tool puts every skill's name and description into view.
2. The always-on layer makes the right skills required, not optional.
3. A job comes in: build, fix, review, deploy, and so on.
4. The AI matches the job to the descriptions and loads the right skill. The heavy detail
   loads only when needed.
5. It does the work using the skill: reviews for threats, writes the tests, records the
   decision, picks the pattern, plans the safe change.
6. Before "done": it writes a receipt. One entry per skill. Each skill it used names a
   real section it followed, quotes a few words from it, and lists the files it changed.
7. The review skill reads the change with fresh eyes against the four questions. Any
   findings get fixed or set aside on purpose, and recorded.
8. The required checks run. If a needed piece is missing (no decision note for a new skill,
   no test for a new check, no safety test for a login change), the change is **blocked**
   and can't be added in.
9. If everything is there and the checks pass, a **person** reviews the work against the
   receipt and the change. The checks prove the work is backed up, not that it's good.
10. It gets added in.

## Verification
Every change carries a **receipt** (`docs/skill-receipts/log.jsonl`): one
entry that covers every skill. For each one it used, it names a real section, quotes at
least eight exact words from it, and lists the files it shaped. A command checks that the
receipt is complete and that each quote really appears in the section it names. A quiet
skip becomes an empty cell that fails the check. None of this proves the work was done
*well*, so a person still reviews it. See
[`docs/specs/skill-application-receipt.md`](docs/specs/skill-application-receipt.md) and
ADR-0038.

The always-on rule covers sessions working inside this project. A session started outside
the project, or in the cloud, needs the one-time installer. The
[`always-on/` README](always-on/) has the full map of what's covered where.

---

# Setup and Updates
Having the skills in a project does nothing until they're actually loaded. This project
makes the rule automatic for anyone who works in it, and keeps it current on **every
update**, with two saved, project-relative layers. The root cause of a stale setup is
copying the rule into your personal folder, where an update never reaches it. Both layers
below instead point at the project's own files, so the update *is* the fix.

- **Layer 1, no setup, no approval: the saved [`CLAUDE.md`](CLAUDE.md).** The tool loads a
  project `CLAUDE.md` on its own, and a relative import loads with no prompt. `CLAUDE.md`
  imports the rule. So a session started in the project gets the current rule automatically,
  on every update. It reaches the main tool and most helpers, but not a session started
  above or outside the project.
- **Layer 2, stronger, one approval: the saved [`.claude/settings.json`](.claude/settings.json)
  hook.** It adds the same rule to every helper, including the built-in ones that skip
  `CLAUDE.md`. The tool asks each person once to trust the project hooks (a safety prompt,
  not a stale-copy issue). After that, updates apply on every pull.

To use the skills in **another project or machine**, the
[`bootstrap`](.claude/skills/bootstrap/) skill's installer points at this project (never
copies). It's safe by default (it never writes without a `--yes`, backs up first, checks
its work, and puts things back if something fails), records a version marker, and
`esk-init --check` acts as a check in your pipeline that fails if something is missing or
behind.

```bash
node .claude/skills/bootstrap/scripts/esk-init.mjs            # plan only, writes nothing
node .claude/skills/bootstrap/scripts/esk-init.mjs --yes      # install or fix (backs up first)
node .claude/skills/bootstrap/scripts/esk-init.mjs --check    # check: fails if not installed or behind
```

# These Checks Travel to Any Project Repository
## Overview
The setup above turns on the **rule** (the always-on reminder to use the skills). v1.2
adds the other half: the **checks themselves travel into a project that adopts them and
run on that project's own code**. So a skill is not just read, it's enforced on the new
project's own work. A second installer, `esk-genesis`, does this. A fully protected
project runs both installers.

```bash
node .claude/skills/bootstrap/scripts/esk-genesis.mjs            # plan only, writes nothing
node .claude/skills/bootstrap/scripts/esk-genesis.mjs --yes      # install the checks (backs up first)
```
## How it Works
- **One list is the single source of truth.** A file lists every check: its program, a
  fingerprint, and how to run it. The installer copies the check programs and the list into
  the new project and sets up one pipeline step. Nothing is wired by hand.
- **One required check, can't drift.** The pipeline runs every check on the list and rolls
  them into a single required result. Because it runs *whatever the list says*, adding or
  removing a check never needs a settings change.
- **One line per check.** The pipeline shows each check on its own line, so a reviewer can
  see at a glance which one failed. The per-check lines are for seeing; the single summary
  is the one that blocks a merge.
- **Two layers, same programs.** The same checks run on your own machine before you push (a
  fast early catch you *can* skip) and in the pipeline (the real authority you *can't*
  skip). Every check works offline except one, which needs the internet and so runs only in
  the pipeline.
- **It can't be quietly weakened.** One check compares the project's list, including each
  check's fingerprint, against the published version. A project that edits a check or
  narrows what it looks at fails this. The pipeline also runs each check's own "can it
  really catch a problem?" test, so a check that was hollowed out to always pass gets
  caught too.

## Which checks travel, and why
Not every skill can become an automatic check. A check only travels if all five of these
are true: it reads files saved in the project (not a report made only when tests run); it's
safe when there's nothing to check (a project with no database files just passes); it needs
no hand setup to be useful; its data travels with it; and it checks code, not a judgment
call. Run through that test, the checks fall into four groups:

| Group | Count | Why |
|---|---|---|
| **Travel as pipeline checks** | 8 | Pass all five tests. |
| **Protect the check system itself** | 3 | Always run. They keep the set of checks from being tampered with or dropped. |
| **Stay on your own machine only** | 2 | One needs a human-written record; the other needs a live test report. Teams run these where they apply. |
| **Human judgment** | about half the skills | Big design choices, picking a pattern, readiness to run, honest self-review. No computer check is possible, so a person reviews them. |

This is on purpose, and we say it plainly: the checks cover the floors a computer can
check, and the judgment work stays with human review. A green board means the floors held,
not that the work is good.

> The full technical design is in
> [`docs/design/bootstrap-v2/`](docs/design/bootstrap-v2/), and the decisions behind it are
> the ADRs numbered 0047 and 0056 through 0065 in [`docs/adr/`](docs/adr/).

# Turn on the architecture check

The `judge-arch` and `arch-encode` skills come with a **check** so your standards are
enforced, not just suggested. Here is how a team turns it on in a project. It takes about
ten minutes, and your current code does **not** have to be clean first.

> On a **React + Supabase** project, skip the by-hand setup. Use the ready-made
> [`react-supabase` preset](.claude/skills/judge-arch/assets/presets/react-supabase/). It
> does steps 2 and 3 for you.

**1. Get the skills into the project.** Copy this project down. Then copy the two review
skills into your project's saved skills folder so every teammate's tool loads them:

```bash
git clone https://github.com/techfleetworks/enterprise-software-AI-skills
cp -r enterprise-software-AI-skills/.claude/skills/judge-arch   .claude/skills/
cp -r enterprise-software-AI-skills/.claude/skills/arch-encode  .claude/skills/
git add .claude/skills && git commit -m "Add architecture review + gate skills"
```

**2. Turn on the always-on rules.** Copy the starter rules into your project's `AGENTS.md`
(make one if you don't have it), drop the folder-specific rules into the folders they
cover, and start a `decisions.md` that you fill with pointers to your *own* good code:

```bash
cp enterprise-software-AI-skills/.claude/skills/judge-arch/assets/AGENTS.baseline.md      AGENTS.md
cp enterprise-software-AI-skills/.claude/skills/judge-arch/assets/decisions.template.md   decisions.md
# folder-specific rules, for example: src/components/AGENTS.md, src/services/AGENTS.md
```

**3. Install the check.** The scanner needs no extra install:

```bash
cp enterprise-software-AI-skills/.claude/skills/judge-arch/scripts/arch-gate.mjs                 scripts/arch-gate.mjs
cp enterprise-software-AI-skills/.claude/skills/judge-arch/assets/arch-gate.config.example.json  arch-gate.config.json
# edit arch-gate.config.json so its file patterns and banned patterns match your layout
```

**4. Record your current debt, so the check passes on day one.** Make a waiver file that
lets every current problem slide. The check then blocks *new* problems while your backlog
is listed and dated. It only gets stricter over time:

```bash
node scripts/arch-gate.mjs --baseline > arch-gate.waivers.json
```

**5. Wire it into your pipeline and your push.**

```jsonc
// package.json  ->  scripts
"check:architecture":     "node scripts/arch-gate.mjs --changed",  // checks changed files on a request
"check:architecture:all": "node scripts/arch-gate.mjs"             // scans everything
```
```bash
cp enterprise-software-AI-skills/.claude/skills/judge-arch/assets/arch-gate.workflow.yml  .github/workflows/arch-gate.yml
# and add `npm run check:architecture` to your before-push step
```

From now on, **nothing is "done" until the architecture check passes and a `judge-arch`
review is clean or set aside on purpose.** The only way around it is a dated, signed
waiver. Never a self-declared "it's trivial." When you catch a *new* bad pattern, use
`arch-encode` to turn it into a rule and a check so it can't come back.

### Where each file goes, and what to change

Everything here is either the **shared standard**, which you use as-is, or a **template**
you copy into your project and fill in. The full file-by-file map is in
[`.claude/skills/judge-arch/references/adoption.md`](.claude/skills/judge-arch/references/adoption.md).
The main ones:

| From the copy | Copy to your project as | Edit after copying? |
|---|---|---|
| `judge-arch/`, `arch-encode/` (whole folders) | `.claude/skills/...` | **No.** The shared skill and engine. |
| `judge-arch/scripts/arch-gate.mjs` | `scripts/arch-gate.mjs` | **No.** The engine; your config drives it. |
| `judge-arch/assets/AGENTS.baseline.md` | `AGENTS.md` | **Yes.** Add your own specifics below the line. |
| `judge-arch/assets/decisions.template.md` | `decisions.md` | **Yes.** Fill the good/bad lists with pointers to your own code. |
| a preset's `arch-gate.config.json` | `arch-gate.config.json` | **Yes.** Set file patterns and paths to your folders. |
| a preset's `scoped/*.AGENTS.md` | the folder each one covers | Usually **No.** |
| `judge-arch/assets/arch-gate.workflow.yml` | `.github/workflows/arch-gate.yml` | Minor. Your Node version. |
| (made, not copied) | `arch-gate.waivers.json` | `node scripts/arch-gate.mjs --baseline` |

**`AGENTS.md`, `decisions.md`, and `arch-gate.config.json` are templates.** Every team
copies them and points them at *their own* code. Only the skill folders and the check
engine are used as-is.

---

# How the AI Skills Work Together
No skill works alone. One feature usually pulls in several, and they point to each other on
purpose. The system design sets the shape. The decision notes record why. Security and
testing prove it. Release and running-it get it live safely and keep it healthy. The data
rules govern the data under it all.

- The **system design** skill sets the shape, and its big choices get recorded as
  **decision notes**.
- The shape gets **checked for threats** by the security skill and **proven to work** by
  the testing skills.
- Security steps are written as runnable safety tests inside the **behavior tests**.
- The behavior tests and the wider testing both act as a **gate on the release**.
- The release's slow roll-out signals are **watched by the running-it skill**.
- The data rules **limit what the database changes and moves** can do.
- Every change is **reviewed by the architecture review skill**, and real problems it finds
  **become lasting rules** through the "make the rule stick" skill, which feeds back into
  the system design.

The decision-notes skill ties it together. Its notes point to the tests that confirm a
choice, the security steps it needs, and the running-it plan it shapes.

---

# The Idea Behind the Design
- **No company names.** No model, company, or product names in the skills. So a skill works
  with any AI tool, and reads fine to a person.
- **Useful over complete.** Skills are short working standards, not textbooks. `SKILL.md`
  stays easy to skim. Depth goes in the `references/` folder.
- **Load detail only when needed.** Read the short instructions first. Pull the heavy
  reference material only when the task needs it.
- **Standards are required, but applied quietly.** The skills hold a firm bar ("not done
  until it's tested, made safe, and recorded"). They do it by doing the work as part of the
  task, not by lecturing you about process.
- **Right-sized.** A three-line decision note for a small choice. The full set of tests
  only for code others rely on. The skills also tell you when *less* is correct.

---

# How to Contribute
Help and forks are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. In
short:

1. Keep it **company-neutral**: no model, company, or product names.
2. Follow the **format**: a `SKILL.md` with a valid header (put quotes around any
   description that has a colon), depth in the `references/` folder, and a folder name with
   dashes that matches the `name` in the header.
3. Open a request that says what the skill helps a tool do and **when it should turn on**.
   The description is what tools use to pick it.

Adding a new skill can be as small as one file:

```yaml
---
name: your-skill-name
description: "When to use this skill. This text is what turns it on."
---
# Instructions here...
```

---

# What's In This Project

```
.
├── .claude/
│   ├── settings.json                  # the saved always-on hook
│   └── skills/                        # the 16 skills plus the installer
│       ├── enterprise-architecture-standards/
│       ├── architectural-decision-records/
│       ├── judge-arch/                # review a change + the check that blocks drift
│       ├── arch-encode/               # turn a caught mistake into an enforced rule
│       ├── verifiable-quality-gates/  # prove every check can really catch a problem
│       ├── skeptical-audit/           # back every claim with proof you can run again
│       ├── pattern-selector/
│       ├── owasp-secure-coding-bdd/
│       ├── bdd-comprehensive-testing/
│       ├── comprehensive-test-strategy/
│       ├── release-deployment-safety/
│       ├── sre-operational-readiness/
│       ├── compliance-data-lifecycle/
│       ├── universal-browser-device-support/
│       ├── universal-accessibility-wcag/
│       ├── usability-ux-universal-design/
│       └── bootstrap/                 # the installer skill
├── always-on/                         # the rule and the little program the hooks run
├── docs/                              # decision notes, audits, and the review log
├── test/                              # tests for every check program
├── arch-gate.config.json              # the project's own architecture-check rules
├── CLAUDE.md                          # imports the always-on rule
├── package.json
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Every skill folder follows the same shape: a `SKILL.md` file plus a `references/` folder,
and optional `scripts/` and `assets/` folders. All of them live under `.claude/skills/`, so
the tool finds them on its own when you work in the project, and each one still stands on
its own.

---

# License

[MIT](LICENSE) © [Tech Fleet](https://techfleet.org). Use, fork, change, and share freely
with credit.

**One exception:** the `owasp-secure-coding-bdd/vendor/` folder holds OWASP content. OWASP
shares it under a different license (CC-BY-SA-4.0), not MIT. It's pulled from the source
when you run `npm run vendor:owasp` and kept separate under its own license. It's not saved
in this project. If you share that text, you must follow its license: give credit and share
it the same way. The OWASP skill's own files describe the steps in their own words and only
quote short, credited bits, which fits this project's MIT license.

---

# Acknowledgements

The `architectural-decision-records` skill builds on the decision-note practice and
templates from the ADR community ([adr.github.io](https://adr.github.io/)), Michael
Nygard's original idea ("Documenting Architecture Decisions," 2011), and the MADR project
([adr.github.io/madr](https://adr.github.io/madr/)).

The `owasp-secure-coding-bdd` skill is based on the
[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), © the OWASP Foundation.

The `judge-arch` and `arch-encode` skills are based on the certificates.dev workshop
"Who's Designing Your System? You, or Your Agent?"
