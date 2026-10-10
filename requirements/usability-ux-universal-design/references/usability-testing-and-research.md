# Usability Testing & Research

Usability is an empirical property — you find out whether something is usable by watching
real people try to use it, not by arguing about it in a review. Opinions (including expert
ones) are hypotheses; testing is evidence.

## Test with real tasks, not opinions

- Give participants **realistic tasks to accomplish** ("Find and cancel your subscription"),
  and **watch what they do** — where they hesitate, misclick, misread a label, backtrack, or
  give up. Behavior is the data.
- **Don't ask "do you like it?"** — people are polite and unreliable narrators of their own
  behavior. Ask them to *do* things and observe.
- Use the **think-aloud** method: ask them to narrate what they're thinking, expecting, and
  looking for. Their confusion points straight at the defects.
- Measure **task success rate, time on task, and error count** for comparison over time.
- The facilitator stays neutral — don't lead, hint, or rescue; a struggling user is
  revealing a real problem.

## You need far fewer participants than you'd think

- **~5 users per round** typically surface the large majority of usability problems for a
  given design — diminishing returns kick in fast. (Nielsen & Landauer / NN/g,
  <https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/>, retrieved
  2026-10-10 `[documented]`. The "5 users ≈ 85%" figure is **debated and task-dependent** — it
  assumes one homogeneous user group; distinct audiences each need their own ~5, and quantitative
  studies need far more. Treat it as a floor for a qualitative round, not a law.)
- **Prefer several small rounds over one big study**: test 5, fix the top issues, test
  another 5 on the fixed version. Iteration finds and confirms fixes faster than one large
  test.
- You don't need a lab. **Moderated remote** sessions, hallway tests, or even a quick
  in-person walkthrough beat no testing at all. Unmoderated tools scale a bit further for
  simpler questions.

## Test across the spectrum, not just power users

The whole point of universal design is defeated if you only test with people like the
team. Deliberately recruit across:

- **Ability** — including people who use assistive technology (this doubles as real
  accessibility validation; see `universal-accessibility-wcag`).
- **Tech literacy and domain knowledge** — novices reveal what experts have learned to
  tolerate.
- **Language** — non-native speakers expose jargon and ambiguous copy.
- **Device and context** — mobile, small screens, slow networks, one-handed, distracted.
- **Age** — older and younger users have different expectations and needs.

Colleagues and enthusiasts are the *least* representative testers; use them only for the
earliest rough checks.

## Other research methods (fit to the question)

- **Heuristic evaluation** (see `usability-heuristics.md`) — cheap expert review to catch
  obvious defects *before* spending user sessions.
- **First-click / tree testing** — is the information architecture and navigation
  discoverable?
- **A/B testing** — quantitative comparison of two options at scale, once you have traffic.
- **Analytics + session replays** — where do real users drop off, rage-click, or loop?
  Great for finding *where* to look; qualitative testing tells you *why*.
- **Surveys / standardized scores** (e.g. a post-task ease rating, SUS) — track perceived
  usability over time; a supplement to behavioral data, not a substitute.

## Close the loop

Testing only helps if it changes the product: triage findings by severity and frequency,
**fix the most severe issues first**, and **retest** to confirm the fix worked and didn't
introduce new problems. Usability is iterative — build, test, learn, refine.
