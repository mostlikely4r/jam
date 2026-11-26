---
description: Take the next task from QUEUE.md and run it
argument-hint: "[queue id (Q-12) or tier (me, pair, cheap, strong); default: the first that can run]"
---

Read `QUEUE.md` (format and agent rules: `~/Desktop/vibeview/FORMAT.md`) and the Workflow section
of `AGENTS.md`. If there is no `QUEUE.md`, say so and stop. Then see what can run:

    node ~/Desktop/vibeview/scripts/check.ts --ready QUEUE.md

It lists the entries that aren't done, per tier (`who:`, or the tier their stage gives): an entry
already `in progress` says so, and each `queued` one says **can run** or **waits on** an entry that
isn't done or a play item that isn't passed (`PLAY.md`). Then the open play items. Only `queued`
entries are candidates for a new task.

Pick the entry:

- `$ARGUMENTS` names a queue id: take that one. If it waits, say on what and ask before going
  ahead.
- Otherwise, if an entry is already `in progress`, name it and ask whether to carry on with it or
  take the next one.
- `$ARGUMENTS` names a tier: take the first `queued` entry from the top in that tier that can run.
- Nothing given: take the first `queued` entry from the top that can run, in any tier.

If you skipped entries because they wait, name them in one line ("skipped Q-31, waits on Q-11
(play P-4)"). If nothing can run, say what everything waits on and stop.

Say in a few lines what it is: id, title, stage, tier, its notes, the backlog item and plan it
points at. If `INBOX.md` has notes waiting, or `PLAY.md` has open play items, add one line for
each with how many, and leave them unless the user asks. Set the entry to `state: in progress`.
Then run the flow for its stage:

- **spec:** read the backlog item, the notes and any plan or earlier slice it names. Talk the
  design through with the user: say what you'd propose and ask what's needed to decide. Don't
  write the plan until the user agrees; then write it as `/spec` does
  (`.claude/commands/spec.md`), which also moves this entry to Done and queues the build.
- **build:** build the entry's `plan:` as `/build` does (`.claude/commands/build.md`). If the
  entry has no plan, say so and ask whether to spec it first. Builds are best in a fresh thread:
  if this thread already holds a long discussion, give the `/build <path>` line instead.
- **test:** (older entries; new human tests are play items) tell the user how to try it: the
  plan's **Try it** line, or what the notes say. When they report back, mark the entry done (with
  their OK). Turn what they found into queue entries or inbox notes, as they decide.
- **other:** do what the entry describes, under the project's usual rules, and mark it done when
  finished.

Queue and backlog changes go in the same commit as the work, under the commit rule in
`AGENTS.md`. Don't commit a queue change on its own just to mark an entry in progress.
