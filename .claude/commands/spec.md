---
description: Write what we agreed in this thread into a plan, ready to build in a fresh thread
argument-hint: "[short name, e.g. turret]"
---

Write the design we agreed in this thread to a plan named after `$ARGUMENTS` (pick a short name if
none is given). Where plans live, how they are named and which one to copy the style of is in the
Workflow section of `AGENTS.md`. If a plan for this already exists, update that one. Don't write
code.

- Follow the style of the example plan: date, why, the picture, then what to build as numbered
  steps.
- Only what was decided. Leave out options we rejected, and don't mention them except under a
  short "Not doing" list if a fresh reader might reintroduce them.
- Mark the user's own calls *decided*; mark my proposals as such.
- Say where each premise comes from: the user's own use or play, a log or measurement, or a guess.
  If the plan rests on a guess, make step 1 the smallest version the user can try, and write
  "stop here for the user to try" after it.
- Make it self-contained: someone with no access to this chat must be able to build from it.
  Name the files and systems it touches, the rules, edge cases, and how we'll know it works.
- "How we'll know" has the checks (tests, probes, runs) and a **Try it** line: what the user does,
  in a few minutes, to see it working: where to go, what to press, what to expect.
- End with **Needs first** (anything this depends on that may not be built yet; check that it
  exists) and **Not in this build** (open items left for later), so the build doesn't guess.
- Keep out anything `AGENTS.md` says must stay private, or ask first.

If the project has a `QUEUE.md` (format: `~/Desktop/vibeview/FORMAT.md`):

- When you start, set the queue entry for this work to `state: in progress`, if there is one.
- When the plan is saved, move that entry to the top of `## Done` (`state: done`,
  `done: <YYYY-MM-DD>`), and add a `build` entry for the same work at the top of the queue, with
  `plan:` set to the plan path (and `backlog:` if it has an item).
- Give the backlog item `status: specced` and `plan: <path>`.

Save the plan, and commit it if `AGENTS.md` says the agent commits, with the queue and backlog
changes in the same commit. Reply with its path and the line to start the build,
`/build <path>`, to paste into a new thread.
