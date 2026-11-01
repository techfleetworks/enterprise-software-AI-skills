# What we found, in plain words

This is the short, plain version of the [full audit](poeaa-adversarial-audit.md). The full audit has the
proof for each point: the quote from the book, the page, and the line in our files.

## What we checked

Our skills teach an AI helper how to build business software. Part of that is picking a "pattern." A
pattern is a tried and tested way to solve a common problem. Think of it like a recipe.

Many of our recipes come from one famous book. It is *Patterns of Enterprise Application Architecture*, by
Martin Fowler. Our skills say they follow that book. They even list page numbers from it.

So we checked it ourselves (observed). We read the book and compared it to our skills, one pattern at a time. We tried hard to
find what was wrong, not what was right.

## The score

The book has 51 patterns. Here is how our skills did:

- **4 are covered well.** What we say matches what the book says.
- **7 are covered poorly.** We cover them, but we get part of it wrong or leave out key advice.
- **1 points to the wrong place.** Part of what we say is in the book, but not on the page we name.
- **39 are missing.** We say nothing about them at all.

So fewer than 1 in 10 are done well. That is the main result.

## The good news

Every page number we list is right. We checked all 15 of them against the book itself (observed). Every quote we
found in the skills is really in the book too.

## The biggest problems, and why they matter

**1. Our checker can't spot a wrong page.** We have a tool that is supposed to check our sources. We
tested it. We changed every page number to 999, and it still said "all good" (observed). We deleted the
page numbers, and it still said "all good" (observed). It only checks that *some* source is listed, not that it is right.

*Why it matters:* Our skills are strict about proof. But the one tool that checks our proof would let a
made-up page slip in. Today our pages are right only because people were careful.

**2. Some advice says the opposite of the book.**

- For one pattern (Service Layer), the book says a thin version with no logic in it is fine. Our skill
  calls that thin version a mistake.
- For another (Gateway), the book says it is worth adding even when the outside service never changes,
  because it makes testing easy. Our skill says to skip it in that case.
- For a third (Unit of Work), our skill mixes up a user's task, which can take many screens, with one
  quick save to the database.

*Why it matters:* The helper trusts these notes. When a note is wrong, the helper builds the wrong thing,
and it does so with confidence.

**3. One example teaches a money bug.** Our example for money stores amounts as a kind of number that
can't hold cents exactly. The book says to never do this. Tiny errors add up. Split $0.05 the wrong way
and you "make" an extra penny out of thin air.

*Why it matters:* Helpers copy examples. This one teaches the exact mistake the book warns about, in the
one place where small errors mean real money.

**4. The book's first big choice is missing.** The first question the book asks is how to set up the
business rules. Should they be simple steps, or a full model? We have nothing on this. Worse, the one
time we mention the simple option, we call it a mess. The book says simple problems deserve simple
answers.

*Why it matters:* The helper may build a big, complex design for a small, simple job.

**5. Nothing stops two people from erasing each other's work.** Say two people open the same order and
both make changes. The second person saves, and the first person's changes are gone without a warning.
The book has patterns to stop this. We have none.

*Why it matters:* This is one of the most common data bugs in business apps, and our skills give no help.

**6. We can't prove a pattern was used right.** Our skills say "write a rule that proves it." But they
never give the rule. The tool to run such rules exists. We just never wrote any rules for these patterns.

*Why it matters:* Naming a pattern is easy. Proving it is used right is the hard, useful part. We promise
the proof but don't deliver it.

**7. The helper has nowhere to look for most problems.** We have a table that says "if you see this
problem, try this pattern." It covers only a few of the problems the book solves.

## The smaller problems

Some notes are right on the main point but leave out a rule the book gives. For example, the book says to
split screen code into two parts that matter a lot and a third split that often isn't needed. We treat all
three as equal. Other groups of patterns are missing entirely, such as how to store family trees of data
types in tables, and how web pages get built.

## What we will fix in version 1.4

We wrote a full plan, called a spec. It splits the work into nine steps, done one at a time:

1. This report and the plan.
2. **Fix the checker first.** Give it a list of the right page for all 51 patterns. Make it fail on any
   wrong page. Make it fail if any pattern is missing and nobody wrote down why.
3. Fix the notes we already have so they match the book, including the money example.
4. to 8. Add the missing patterns, in groups.
9. Add ready-made rules and tests that prove each pattern is used right.

## How we will know it worked

For every problem above, we wrote a short test story. Each one has three parts:

- **Given:** the starting point. For example, "a note cites page 17 for Repository."
- **When:** what happens. For example, "the checker runs."
- **Then:** what must be true. For example, "the checker fails, and says the right page is 322."

There are 178 of these test cases. As each step is built, its stories become real tests that run on
every change. If one fails, the change can't go in.

## A choice you made

Today the helper can skip the pattern choice. Even when it writes one, a note with "x" in every box
passes. You chose to make the choice required. So after step 3, any change to the parts of the code that
hold the main rules and data (folders like services, domain, and repositories) needs a real choice. The
helper may still choose "no pattern," but it has to say why. Only you can let it skip the choice.

One limit: this check only runs where the strict helper hooks are turned on. The check at pull request
time does not get the list of changed files yet, so it can't enforce this there. That is a known gap, and
it is written down in the spec.

There are also 11 stories about the helper's choices, like "two people edit the same order, so the
helper picks a lock." A choice like that can't be graded by a simple pass or fail. So we will test these
by giving the helper each problem and grading its answer.

## What this report does not cover

We did not check our other pattern list, which comes from a different book. It may have the same checker
problem. We also did not check how each tool in use today handles these patterns. Those are good next
steps.
