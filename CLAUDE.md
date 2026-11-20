# JAM

Browser game, TypeScript + Vite. Read `docs/vision.md` first: the pillars and the experience
targets that decide what comes next. Parked ideas live in `docs/maybe-later.md`.

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

## Plans

Bigger work is planned in `docs/<thing>-plan.md` (see `docs/fitting-plan.md`). Plans stay after
they are built, as a record of why. Mark the user's own calls *decided*; the rest is proposal.

## Sessions

- Talk and small changes (under about 3 turns to explain, 1–2 files): build in the same thread.
- Longer design debates, or a mind changed mid-chat: `/spec` writes the plan, then `/build`
  it in a fresh thread, so rejected ideas don't leak into the code.
