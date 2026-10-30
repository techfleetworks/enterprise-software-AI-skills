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

  Rule: The formula starts by itself and runs in order

    @audience:agent @usecase:edit-before-selection-held @category:negative @quality:functional @severity:critical
    Scenario: An edit tried before skill selection is held
      Given the agent has not written the skill selection for this task
      When the agent tries to edit a source file
      Then the edit does not run
      And the agent is told to write the skill selection first

  Rule: Step 1, select. Every skill gets a stated verdict for the task

    @audience:agent @usecase:every-skill-gets-verdict @category:happy @quality:functional @severity:critical
    Scenario: Every skill in the directive gets a verdict
      Source: the directive says to treat "not relevant" as "a deliberate, stated judgment for that task, never a silent default".
      Given the directive lists the skills that apply to code, user interface and platform changes
      When the agent writes the skill selection
      Then every listed skill is marked "required", "applies" or "not-applicable"
      And every "applies" and "not-applicable" carries a one-line reason tied to this task

    @audience:agent @usecase:silent-skip-is-empty-cell @category:negative @quality:functional @severity:critical
    Scenario: A skill left out of the selection fails the task
      Source: "A silent skip becomes a failing empty cell" (upstream-contributor-process.md).
      Given the selection does not mention "compliance-data-lifecycle"
      When the finish check runs
      Then the turn does not end
      And "compliance-data-lifecycle" is named as an empty cell

    @audience:agent @usecase:router-adds-required-skills @category:edge @quality:functional @severity:high
    Scenario: The router makes skills required from the files a task changes
      Source: routing rule "schema-change-needs-adr-and-safety".
      Given the task changes a file under "migrations/"
      When the router runs
      Then "architectural-decision-records" and "release-deployment-safety" are marked "required"
      And the agent cannot mark either one "not-applicable"

    @audience:agent @usecase:tiny-change-full-selection @category:boundary @quality:functional @severity:high
    Scenario: A one-line change still gets a full selection and a receipt
      Source: "There is NO triviality exemption: a one-line or copy-only change still ships a receipt."
      Given the task changes 1 line of a code comment
      When the agent ends the task
      Then a selection covering every skill exists
      And most skills may be "not-applicable", each with its reason

    @audience:agent @usecase:no-routed-files-still-selected @category:empty-overflow @quality:functional @severity:medium
    Scenario: A change that matches no routing rule still gets a verdict for every skill
      Given the task changes only a file type no routing rule names
      When the agent writes the skill selection
      Then every skill still has a verdict and a reason
      And the empty router result is recorded, not treated as "nothing applies"

    @audience:agent @usecase:unsure-means-apply @category:edge @quality:functional @severity:high
    Scenario: When the agent is unsure whether a skill applies, it applies it
      Given the agent cannot tell from the task whether personal data is touched
      When it writes the verdict for "compliance-data-lifecycle"
      Then the verdict is "applies"
      And the reason says what was unclear

  Rule: Step 2, load. The text of every selected skill is read in this session

    @audience:agent @usecase:skill-cannot-load @category:error @quality:reliability @severity:high
    Scenario: A selected skill that cannot be loaded blocks the task
      Given the folder for a selected skill is missing on this machine
      When the agent tries to load it
      Then the task does not continue
      And the operator is told which skill is missing and the command that installs it

    @audience:agent @usecase:selected-skills-loaded @category:happy @quality:functional @severity:critical
    Scenario: Every skill marked "required" or "applies" is loaded before planning
      Given the selection marks 6 skills "required" or "applies"
      When the agent reaches the planning step
      Then all 6 skill texts were loaded in this session with the Skill tool
      And the task record holds the hash of each loaded skill file

    @audience:agent @usecase:applies-but-not-loaded @category:negative @quality:functional @severity:critical
    Scenario: A skill marked "applies" but never loaded fails the task
      Source: a consumer project's rule "A skill not read in the current session is not applied from recall".
      Given the selection marks "verifiable-quality-gates" as "applies"
      And that skill's text was never loaded in this session
      When the finish check runs
      Then the turn does not end
      And the agent is told to load the skill and redo the steps that depend on it

  Rule: Step 8, receipt. One grounded entry per task covers every skill

    @audience:agent @usecase:receipt-files-in-change @category:negative @quality:reliability @severity:high
    Scenario: An "applied" entry that points at a file outside the change is refused
      Source: each applied entry must point "at files really in the change" (upstream-contributor-process.md).
      Given the receipt says "pattern-selector" was applied in "docs/old_record.md"
      And that file did not change in this task
      When the receipt check runs with the list of changed files
      Then it fails
      And the turn does not end

    @audience:agent @usecase:receipt-matches-selection @category:negative @quality:functional @severity:high
    Scenario: The receipt must match the selection
      Given the selection marks 6 skills "required" or "applies"
      And the receipt marks only 5 of them "applied"
      When the receipt check runs
      Then it fails
      And the missing skill is named
