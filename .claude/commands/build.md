---
description: Build a plan in this (fresh) thread, have it reviewed, then fix what holds up
argument-hint: "<path to the plan>"
---

Build the plan in `$ARGUMENTS` (if no path is given, list the plans where `AGENTS.md` says they
live, and ask which). The Workflow section of `AGENTS.md` names this project's checks, review and
commit rule; read it first.

## Before you start

- Check the plan's **Needs first**. If something there isn't built, stop and say so.
- If the plan has *built* marks already, this is a continuation: read the marks and
  `git status`, and pick up where it stopped.
- If the project has a `QUEUE.md` (format: `~/Desktop/vibeview/FORMAT.md`), find the queue entry
  for this plan (its `plan:` is this path, or it is the `build` entry for the same backlog item).
  If the plan is queued as several slices (one entry per slice, each with this `plan:`), it is
  the first one not done; build only that slice's steps. Before you change it, check whether it
  waits (its `after:` isn't done, or has an open play item:
  `node ~/Desktop/vibeview/scripts/check.ts --ready QUEUE.md`); if it does, say what it waits on
  and ask before going ahead. Then set it to `state: in progress`. If there is no entry, don't
  add one. A backlog item at `specced` becomes `building`.

## While building

- The plan is the brief. Where it is unclear or wrong once you're in the code, ask instead of
  guessing, unless the answer is small and obvious.
- Mark each step *built* in the plan as you finish it, so a cut-off thread can carry on.
- If the plan says to stop for the user to try something, that is the end of this build: finish
  it (full check, review, commit) and hand the trying over as a play item (see **Done**). Don't
  wait for the user in this thread, unless the next step of this same build can't go on without
  their answer. A test an agent can do (probes, a scripted run) is part of the checks, not a play
  item.
- Use the quick check while working. Run the full check once at the end, and again after review
  fixes, not after every edit.
- Anything else that takes more than a couple of minutes (measurements, soaks, long runs) runs in
  the background with its output in a log. Don't wait on it with sleep loops, and it never gates
  done: report it if it lands, or say where the log is.
- Keep the work uncommitted until the review is dealt with, so the review can see it.

## Review

When the full check passes, run the review `AGENTS.md` names, giving it the plan path and the
files you touched rather than a summary. If the reviewer is missing or fails, say so in one line
and carry on; it never blocks the build.

Then judge every finding yourself. The reviewer is a second pair of eyes, not the authority:

- Real problem (a bug, a plan requirement missed, a house rule broken, a needed test absent): fix it.
- Wrong, or outside what the plan asked for: leave the code alone and keep a one-line reason.
- Don't resolve a finding by editing the plan to agree with the code; the plan being wrong is a
  finding of its own, so say so and fix the plan deliberately.

Re-run the full check after fixing. A second review round only if the fixes were large; two
rounds is the limit.

## Done

- Update the plan: *built* marks, what changed from the plan, and what is left under **Not in
  this build**. Don't delete it.
- Queue and backlog, if the project has them: move the queue entry to the top of `## Done`
  (`state: done`, `done: <YYYY-MM-DD>`), and set the backlog item to `status: built` (`building`
  if this was one slice of more).
- If the plan stopped for the user to try, or you judge the build wants a human look before what
  builds on it goes ahead, the entry is still marked done. Add an item to the project's `PLAY.md`
  (create it with the preamble in `FORMAT.md` if there is none): the next free `P-` id, a short
  title for what to look at, `from:` the queue entry, `plan:`, `added:` today, and the plan's
  **Try it** line as its text. Entries with `after:` on this one wait until the user passes it.
  Never pass a play item yourself.
- Follow the commit rule in `AGENTS.md`. Where the agent commits, the code, the plan update and
  the queue, backlog and play changes go in one commit. Where the user owns commits, leave it
  uncommitted and list the files.
- Reply with: what was built, the review (raised, fixed, dismissed and why), anything still
  running in the background, and the plan's **Try it** line (with the play item's id, if you
  added one).
