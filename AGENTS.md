# JAM

Browser game, TypeScript + Vite. Read `docs/vision.md` first: the pillars and the experience
targets that decide what comes next. Parked ideas live in `BACKLOG.md` (vibeview format).

The repo is public and may hold plans and parked ideas; whoever reads it chooses to be spoiled.
Only the README and what a new player sees in the game stay free of later features.

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

## Sessions

- Talk and small changes (under about 3 turns to explain, 1–2 files): build in the same thread.
- Longer design debates, or a mind changed mid-chat: `/spec` writes the plan, then `/build`
  it in a fresh thread, so rejected ideas don't leak into the code.
- Both commands are Markdown in `.claude/commands/`; `.pi/settings.json` loads that directory, so
  pi exposes them too. Edit the one file, not a copy. The same two files are used in the user's
  other projects; what differs per project lives in the Workflow section below. Change them in
  all projects together.

## Workflow

Read by `/spec` and `/build`.

- **Plans:** `docs/<name>-plan.md`, in the style of `docs/fitting-plan.md`. Plans stay after they
  are built, as a record of why. Mark the user's own calls *decided*; the rest is proposal.
- **Private:** nothing that spoils a surprise goes in the README or what a new player sees.
- **Quick check:** `npm run test:fast`.
- **Full check:** `npm test`, then `npm run build`. Both must pass.
- **Background only:** `npm run parity` and the `src/profile` scripts, with output to a log.
- **Review:** from the repo root, against the uncommitted tree:

      codex exec review -m gpt-6-luna --uncommitted "This change builds <plan path>.
      Judge it against that plan and AGENTS.md: report bugs, missed plan requirements, house rules
      broken and tests missing; skip style nits. Touched: <modules and files>. Tests: <added or
      changed>."

- **Queue and inbox:** `QUEUE.md` is the order tasks go to agents (top is next); `INBOX.md`
  holds quick notes the user sent from the vibeview page. When the user asks what is open or
  what's next, read both, then follow `~/Desktop/vibeview/FORMAT.md` for the format and for
  triaging notes with the user.
- **Commits:** the agent commits. Once a change is finished and the full check passes, commit it
  without asking, one commit per change with a clear message, and name the commit in the reply.
  Don't commit when checks fail, work is half done, or a decision from the user is pending.
  Ask before pushing.
