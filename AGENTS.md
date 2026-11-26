# JAM

Browser game, TypeScript + Vite. Read `docs/vision.md` first: the pillars and the experience
targets that decide what comes next. Parked ideas live in `BACKLOG.md` (vibeview format).

The repo is public and may hold plans and parked ideas; whoever reads it chooses to be spoiled.
Only the README and what a new player sees in the game stay free of later features.

Hull art has its own guide: `docs/hull-art-guide.md`, for drawing a hull, placing its mounts and
matching a draft to a test.

## Commands

- `npm run dev`: play locally
- `npm test`: unit suite (vitest, about two and a half minutes). Must pass before a change counts
  as done.
- `npm run test:fast`: the pure-logic suites only, about 1.5 s. Use it while iterating.
- `npm run build`: typecheck, the editor-boundary check, then build. Must pass too.
- `npm run layout -- <recipe>`: make sectors from recipes in `src/designer/recipes.ts`
- `npm run world`: rewrite `src/designer/world.json` in its fixed key order and re-warm `src/start.json`.
  Run it after editing the world file by hand or by script.
- `npm run parity` and the other `src/profile` scripts are slow checks. Run them in the
  background; they log results and never gate done.
<!-- vibeview:commands start -->
- **Project files:** `QUEUE.md` (the order tasks go to agents), `BACKLOG.md` (the pool of ideas
  and features) and `INBOX.md` (quick notes) are plain markdown, edited by hand or from the
  vibeview page. Format and agent rules: `~/Desktop/vibeview/FORMAT.md`; check a file with
  `node ~/Desktop/vibeview/scripts/check.ts <file>`.
<!-- vibeview:commands end -->

## Sessions

- Talk and small changes (under about 3 turns to explain, 1–2 files): build in the same thread.
- Longer design debates, or a mind changed mid-chat: `/spec` writes the plan, then `/build`
  it in a fresh thread, so rejected ideas don't leak into the code.
- `/next` takes the top task from `QUEUE.md` and runs the flow for its stage (spec, build,
  test, other).
- The commands are Markdown in `.claude/commands/`; `.pi/settings.json` loads that directory, so
  pi exposes them too. The same files are used in the user's other projects; what differs per
  project lives in the Workflow section below. Their source is `~/Desktop/vibeview/prompts/`:
  change them there and run `node scripts/sync-prompts.ts` in vibeview; never edit a copy here.

## Workflow

Read by `/spec` and `/build`.

- **Plans:** `docs/<name>-plan.md`, in the style of `docs/fitting-plan.md`. Plans stay after they
  are built, as a record of why. Mark the user's own calls *decided*; the rest is proposal.
- **Private:** nothing that spoils a surprise goes in the README or what a new player sees.
- **Designer files:** `src/hulls.json`, `src/items.json`, `src/programs.json` and
  `src/designer/world.json` are what the designer's Save buttons write, through the dev server,
  straight into the files. A change in one that isn't yours is the user's work, never a leftover:
  do not revert it (`git checkout`, `git restore`, a stash) or fold it into a commit of your own —
  say what it holds and ask.
- **Quick check:** `npm run test:fast`.
- **Full check:** `npm test`, then `npm run build`. Both must pass.
- **Background only:** `npm run parity` and the `src/profile` scripts, with output to a log.
- **Review:** from the repo root, against the uncommitted tree:

      codex exec review -m gpt-6-luna --uncommitted "This change builds <plan path>.
      Judge it against that plan and AGENTS.md: report bugs, missed plan requirements, house rules
      broken and tests missing; skip style nits. Touched: <modules and files>. Tests: <added or
      changed>."

<!-- vibeview:workflow start -->
- **Queue and inbox:** `QUEUE.md` is the order tasks go to agents (top is next); `BACKLOG.md`
  holds the pool of ideas and features; `INBOX.md` holds quick notes the user sent from the
  vibeview page. When the user asks what is open or what's next, read all three, then follow
  `~/Desktop/vibeview/FORMAT.md` for the format and for triaging notes with the user. Triage one
  note at a time, with the user: fix it now, queue it, backlog it or drop it; delete the note in
  the same change, and name the id it became in the commit message (`inbox: I-3 → F-41`) — or in
  the handoff, where the operator owns commits.
- **Shared files:** the commands in `.claude/commands/` and this block come from
  `~/Desktop/vibeview`. The full check must leave
  `node ~/Desktop/vibeview/scripts/sync-prompts.ts --check` clean (exits 1 on a drifted prompt or
  block); fix the drift in vibeview, never in the copy here.
<!-- vibeview:workflow end -->
- **Commits:** the agent commits. Once a change is finished and the full check passes, commit it
  without asking, one commit per change with a clear message, and name the commit in the reply.
  Don't commit when checks fail, work is half done, or a decision from the user is pending.
  Ask before pushing.
