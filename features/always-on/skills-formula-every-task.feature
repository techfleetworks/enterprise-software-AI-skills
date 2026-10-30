Feature: Every task runs the full enterprise-skills formula, with no reminder
  The agent does not choose whether to follow the skills. Every task runs the same steps in the same order,
  and it cannot end until each step has left its proof: 1 select, 2 load, 3 plan with the skills, 4 build with
  tests that can fail, 5 prove, 6 fresh-context review until clean, 7 encode caught mistakes, 8 receipt, 9 finish.
  Sources (skills repo commit 569cd30): always-on/enterprise-skills-always-on.md lines 3-7 ("Before you act on a
  change, and again before you call any work done"); each skill's "Definition of done"; the receipt rule in
  always-on/upstream-contributor-process.md lines 20-28; the routing map in
  .claude/skills/judge-arch/assets/example/routing-rules.config.json.
  Audit evidence: the main thread used the Skill tool 5 times in about 2.7 days, and 15 operator messages in about
  40 hours had to remind it (audit of one private agent session, 2026-10-26).

  Background:
    Given the enterprise skills enforcement is installed for this machine
    And the skill router maps file patterns to the skills and artifacts they require
    And every task keeps a task record outside the work folder

  Rule: Step 2, load. The text of every selected skill is read in this session

    @audience:agent @usecase:skill-cannot-load @category:error @quality:reliability @severity:high
    Scenario: A selected skill that cannot be loaded blocks the task
      Given the folder for a selected skill is missing on this machine
      When the agent tries to load it
      Then the task does not continue
      And the operator is told which skill is missing and the command that installs it
