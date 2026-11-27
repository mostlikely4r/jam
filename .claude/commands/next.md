---
description: Take the next task from QUEUE.md and run it
argument-hint: "[queue id (Q-12) or tier (me, pair, cheap, strong); default: the lane your model runs in]"
---

Read `QUEUE.md` (format and agent rules: `~/Desktop/vibeview/FORMAT.md`) and the Workflow section
of `AGENTS.md`. If there is no `QUEUE.md`, say so and stop. Then see what is yours to take:

    node ~/Desktop/vibeview/scripts/check.ts --pick QUEUE.md

Your lane is the model's, not your guess: the script reads `PI_MODEL` and the `modelTiers` map in
`~/Desktop/vibeview/vibeview.config.json` (`cheap` or `strong`; `me` and `pair` are the user's
hours, with you alongside). It prints one `pick:` line, then what is already `in progress` in your
lane, the entries it passed over as another lane's, and the ones in your lane that wait (`after:`)
and on what.

Take the `pick:` line. The rest are rules for when that isn't the whole answer:

- `$ARGUMENTS` names a queue id: take that one, whatever its lane — say which lane it is. If it
  waits, say on what and ask before going ahead.
- `$ARGUMENTS` names a tier: take that lane for this run instead (`--as=<tier>`).
- **Don't pick up an entry from another lane on your own** — that is how a cheap model starts a
  strong build the user meant for Opus. If the pick is `none`, name the top entry in each other
  lane in one line and stop; the user says `/next strong` or `/next Q-16` to cross.
- If the `pick:` line says your model has no lane, say so in one line and ask which lane to use
  (or add the model to `modelTiers`, one line in `vibeview.config.json`).
- If an entry is already `in progress` in your lane, name it and ask whether to carry on with it
  or take the next one.

If you passed over entries because they wait, name them in one line ("skipped Q-31, waits on Q-11
(play P-4)"). If nothing can run, say what everything waits on and stop. Never edit another lane's
entry to make it takeable.

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
