# Bot mining plan

Written 2026-11-21, after the user watched the dev bot (`G` in `?dev`) mine in the home field.
Built 2026-11-22: all three steps, with the measurements and the two deviations at the end. It
changes how the no-player bot (`src/bot/bot.ts`, `docs/no-player-runs-plan.md`) works a field:
closer, one rock to the end, and every piece of ore picked up before the next rock. Items marked
*decided* are the user's calls; the rest is my proposal, open to veto.

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

### 1. Closer shots and own ore first (*built*): `src/bot/bot.ts`, `src/bot/log.ts`

The `FIRE_CLOSE` firing rule in `shoot`, and the own-ore reach and order in `inSpace` and
`nearestOre`. Tests in `src/bot/bot.test.ts`: a bot beside a rock at 900 units moves in before it
fires; ore freed by its own shot 600 away is fetched before a second rock is shot.

### 2. One rock to the end (*built*): `src/bot/bot.ts`

The worked-rock set: the marked rock, plus the pieces each break of it makes (pieces are the new
rocks in `sim.rocks` after `breakRock`, at the old rock's spot; `breakRock` passes the picked
place to the largest piece, see its comment). `nearestRock` picks from the set while any of it is
left. Test: after the first break, every shot until the set is empty goes at one of its pieces.

### 3. Gentle bump (*built*): `src/bot/bot.ts`

`fetch` aims just past the ore's edge, and `clearRun` gets an `exclude` rock. Test: ore placed
against a rock, ship on the far side; the order goes through the rock's line, the ore is taken
within 20 seconds, at a speed under `safeImpactSpeed`, with no hull lost.

## How we'll know

- `npm run test:fast` while working, then `npm test` and `npm run build`.
- **A bot run before and after**, on the same seed: `npm run bot -- floater 2 1` (and seed 2).
  The log gains two counts (in `src/bot/log.ts`): ore its own shots freed, and how much of that it
  picked up; and the median distance it fired from. Measured numbers are in "Built" below.
- **Try it:** `npm run dev`, open `/?dev`, pick the Floater, fly to the home field and press `G`.
  Watch one rock: the bot parks close, breaks it, nudges into the rock to scoop the ore lying
  against it, and finishes every piece before it turns to another rock. The rock it worked
  leaves no ore behind.

## Needs first

- The in-game bot on `G` (`toggleBot` in `src/main.ts`) and `npm run bot`: both exist.
- `Loose.from` on freed ore (`src/sim.ts`): exists.
- `safeImpactSpeed` in `src/tuning.ts`: exists (90).
- A move order with an arrival speed: `sim.orderMove(x, y, vx, vy)` takes an end velocity (the
  drag). Checked 2026-11-22: a drifting spot does end the order at that speed, but the spot then
  runs on past a piece of ore that is lying still, so the ship chases it instead of taking it.
  The fallback in this line was used: a plain click just past the ore's edge, which the click
  pilot brakes to (measured 40 to 50 units a second at the rock's edge).

## Not in this build

- **The bot wandering out of the field, and taking minutes to come home.** Both runs before and
  after hit it (seed 2 stalled at 0:28 before this build), and the numbers below show it still
  does. It is the wall `docs/go-home-broken-plan.md` already names, not something this build set
  out to fix: the bot mines rock after rock into the field's far side and the trip back is a
  click order per slip round a rock.
- **A gun that breaks with no credits to repair it** ends the run (seed 2, `docs/go-home-broken-plan.md`).
  It happens sooner with close shots, since a bump at the rock is at the range the gun is hurt at.
- The tractor's part in this: a bot with a tractor already pulls ore in. Whether it should mine
  differently with one is left.
- The bot leaving the dock through the station hull: `docs/bot-undock-plan.md`.
- Any change to how a player mines: this is the bot only.

## Built

Built 2026-11-22, in one commit. What changed from the plan:

- **No drifting arrival for ore.** The plan's move-with-a-low-arrival-speed was tried and
  measured: the order does end the ship at that speed, but a spot drifting at it runs on past a
  piece that is lying still, so the ship chases a moving point instead of taking the ore. It
  starved the shot rate eight times over (5 fires in 15 game minutes, against 40 for the same
  seeds with the fallback). The fallback the plan allowed is what is built: a plain click to just
  past the ore's edge (`ORE_EDGE`, 150), which the click pilot brakes down to 40-50 units a
  second by the time it reaches the rock. Only a piece drifting faster than `ORE_STILL` (30) is
  overtaken the old way, well past where it will be.
- **The standoff spot moved inside the firing line.** A click order stops `ARRIVED` (100) short
  of its spot, so a spot on the line left the ship out of range and ordering the same spot for
  ever; the spot is now a stop's length inside (`fireDistance - ARRIVED * 1.2`). The spot also
  leads a drifting rock by the flight time, since a spot on the rock itself is one the ship
  chases as long as the rock drifts.
- **Two small fixes the mining needed to be worth anything**, neither in the plan:
  - `head` counts "close enough" only at the spot it meant to reach, not at a slip round a rock
    on the way. Stopping on a slip point left the ship beside the rock it was getting past,
    ordering the same slip again (this is how seed 2's before-run stalls).
  - `track` counts a growing hold as progress, so the 15-minute stuck timer doesn't fire while
    the first load is still being filled. Close mining takes longer per load than the wide shots
    it replaced, and being slow at it isn't being stuck.
- **A piece out of reach stays in the worked set** (the code review's finding): it is not chosen
  while it is out of reach, so a rock knocked across the field isn't chased, but it is still the
  bot's work if the ship comes back to it. Nothing of a broken rock is dropped for being far.

Measured with `npm run bot -- floater 2 <seed>` before and after, plus the same counts read from
outside the bot for the run before this build (which has no `Mining:` line):

| seed | run | ended | credits earned | own ore freed / picked up | median fire distance | hull lost |
|---|---|---|---|---|---|---|
| 1 | before | 2 h limit, step 2 at 1:16 | 1,560 (780/h) | 655 / 162 (25%) | 205 | 324 |
| 1 | after | 2 h limit, step 2 at 1:21 | 800 (800/h) | 110 / 95 (86%) | 139 | 254 |
| 2 | before | stuck 0:28 | 100 | not measured | not measured | 19 |
| 2 | after | stuck 0:22, gun broken, no credits to repair it | 200 | 34 / 28 (82%) | 112 | 136 |

What the numbers say:

- **Picking up its own ore works**: 82-86% of what its shots free is collected, against 25%.
- **Firing distance came down**: a median of 112-139 world units from the rock's centre, against
  198-205. That is about rock radius + 50 to + 100, closer than the plan's "about rock radius +
  250" estimate, because the ship parks a stop's length inside the line it fires from.
- **Seed 1 is no worse and no better on credits**: 800 an hour against 780, with less hull lost
  (254 against 324) and step 2 reached at 1:21 against 1:16. It is the same two hours of work for
  the same money, with its ore picked up instead of left behind.
- **Seed 2 ends on the gun**: two breaks by 0:22 and no credits to repair them, so the run stops
  (`docs/go-home-broken-plan.md`). It hit a stall on the trip home before this build (0:28), on
  the wandering wall below. Close shots break more guns: the hull is against the rock at the
  range the gun is hit at.
