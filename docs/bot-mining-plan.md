# Bot mining plan

Written 2026-11-21, after the user watched the dev bot (`G` in `?dev`) mine in the home field.
Nothing here is built yet. It changes how the no-player bot (`src/bot/bot.ts`,
`docs/no-player-runs-plan.md`) works a field: closer, one rock to the end, and every piece of ore
picked up before the next rock. Items marked *decided* are the user's calls; the rest is my
proposal, open to veto.

## Why

What the user saw (their own play, 2026-11-21):

- It shoots asteroids from rather far away, and then doesn't move in to get the ore.
- It doesn't finish an asteroid off once ore has dropped.
- It flies around asteroids more than it bumps into them gently to collect the ore.
- It leaves lots of ore lying on the asteroid and moves on to shoot new ones.

Each one matches something in `src/bot/bot.ts` (from reading the code; not yet measured):

- **Far shots.** `shoot` stops and fires as soon as a rock is within `reach * 0.8`
  (`inRange`). With gun 1 that's 1,100 × 1.1 × 0.8 ≈ 970 units. `STANDOFF` (400) only applies
  while the ship is still flying in, so a ship that comes to rest anywhere inside 970 shoots
  from where it is.
- **Not moving in for ore.** `nearestOre` only sees ore within `ORE_REACH` = 250. Ore freed by a
  shot from 900 away is never looked at, so `inSpace` goes on to the next rock.
- **Moving on.** `nearestRock` scores every rock by `distance / (tier + 1)` and only keeps its
  `mark` while that stays within 2.5× of the best score. Once the marked rock breaks, the mark
  is gone (it's no longer in `sim.rocks`) and a bigger rock elsewhere can win over the pieces.
- **Flying around rocks.** `fetch` orders a move to the ore's lead position and on 250 units
  past it, through `head`, and `head` runs every order through `clearRun`, which slips past the
  first rock on the line. Ore resting against its own rock always has that rock on the line, so
  the ship is sent round it, past the ore.

## The picture

- **Shoot from close** (*decided*: "shoots rather far away" is the complaint). The bot fires
  only from a spot near the rock, where the ore it frees lands within its own pickup range. Mine:
  fire only when within `rock.radius + FIRE_CLOSE` (proposal: `FIRE_CLOSE` = 250) and slow, not
  anywhere inside `reach * 0.8`. The approach keeps today's "beside it, on the side it came from"
  spot, moved in to that distance.
- **One rock to the end** (*decided*: "doesn't fully destroy"). After a break, the bot keeps
  working that rock's pieces until none are left (a bottom-tier rock breaks into nothing), before
  it picks a new rock. Mine: the bot keeps a "worked rock" set, the marked rock and the pieces
  its breaks made, and `nearestRock` picks from that set while any of it is left.
- **Every piece of ore before the next rock** (*decided*: "leaving lots of ore on the asteroid").
  Ore its own shots freed (`Loose.from === sim.ship`) is collected before it shoots a new rock,
  however far it has drifted, up to a limit. Mine: `ORE_REACH` for its own ore rises to 800, and
  the order in `inSpace` becomes: own loose ore, then the worked rock's pieces, then a new rock.
  Other ore keeps today's 250 rule. `CHASE_SECONDS` still lets go of a piece that keeps getting
  away.
- **Bump gently, don't fly round** (*decided*: "bump in to them (gently) to get the ore"). Going
  for ore that rests against a rock, the bot flies at it slowly and may touch the rock, rather
  than routing round it. Mine:
  - `fetch` aims at the ore itself, not 250 past it, and arrives slowly: a move with a low
    arrival speed, below `safeImpactSpeed` (90) with room to spare. Proposal: 30.
  - The rock the ore lies against (the nearest rock whose edge is within ~40 of the ore) is left
    out of `clearRun`'s look along the line. Other rocks on the line are still slipped past.
  - A bump at that speed costs no hull (`safeImpactSpeed` guards it), so it stays cheap.

## What to build

1. **Closer shots and own ore first.** In `src/bot/bot.ts`: the `FIRE_CLOSE` firing rule in
   `shoot`, and the own-ore reach and order in `inSpace` and `nearestOre`. Tests in
   `src/bot/bot.test.ts`: a bot beside a rock at 900 units moves in before it fires; ore freed by
   its own shot 600 away is fetched before a second rock is shot.
   Stop here for the user to try.
2. **One rock to the end.** The worked-rock set: the marked rock, plus the pieces each break of
   it makes (pieces are the new rocks in `sim.rocks` after `breakRock`, at the old rock's spot;
   `breakRock` passes the picked place to the largest piece, see its comment). `nearestRock`
   picks from the set while any of it is left. Test: after the first break, every shot until the
   set is empty goes at one of its pieces.
3. **Gentle bump.** `fetch` aims at the ore with a low arrival speed, and `clearRun` gets an
   `exclude` rock. Test: ore placed against a rock, ship on the far side; the ship touches the
   rock below `safeImpactSpeed`, loses no hull, and has the ore within 20 seconds.

## How we'll know

- `npm run test:fast` while working, then `npm test` and `npm run build`.
- **A bot run before and after**, on the same seed: `npm run bot -- floater 2 1` (and seed 2).
  The log gains two counts (in `src/bot/log.ts`): ore its own shots freed, and how much of that it
  picked up; and the median distance it fired from. Expect: freed ore picked up rises well above
  today's share, firing distance drops to about rock radius + 250, and credits per game hour don't
  fall. Write the before and after numbers into this plan when built.
- **Try it:** `npm run dev`, open `/?dev`, pick the Floater, fly to the home field and press `G`.
  Watch one rock: the bot parks close, breaks it, nudges into the rock to scoop the ore lying
  against it, and finishes every piece before it turns to another rock. The rock it worked
  leaves no ore behind.

## Needs first

- The in-game bot on `G` (`toggleBot` in `src/main.ts`) and `npm run bot`: both exist.
- `Loose.from` on freed ore (`src/sim.ts`): exists.
- `safeImpactSpeed` in `src/tuning.ts`: exists (90).
- A move order with an arrival speed: `sim.orderMove(x, y, vx, vy)` takes an end velocity (the
  drag); check it can arrive at a speed short of a full stop, or else arrive at rest just past
  the ore's edge.

## Not in this build

- The tractor's part in this: a bot with a tractor already pulls ore in. Whether it should mine
  differently with one is left.
- The bot leaving the dock through the station hull: `docs/bot-undock-plan.md`.
- Any change to how a player mines: this is the bot only.
