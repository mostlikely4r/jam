# Auto targeting plan

Written 2026-11-25, from an inbox note (I-13) the user wrote while mining with Targeting and
Auto-mine. Builds on `docs/targeting-plan.md`. Built 2026-11-26 (Q-31): both steps, tests and
all. What landed differently from the proposal is under **Built**.

## Why

The note (*decided*, the user's own words): "Targeting system tweak: 'next main target
nearest/most in front/collision'. Auto targeting program. Tweak: max range."

Today (`src/sim.ts`, around `sim.ts:2020`–`2080`): targets are a list on the ship, primary first.
When the primary goes (mined out, picked up, past the lock range `targetRange`, 1500), the next
one in the list, in the order picked, becomes primary. Nothing ever picks a target but the
player. Auto-mine only shoots picked rocks, so a hold fills only as long as the player keeps
picking: idle mining (the vision's first target, rated 3) stops when the queue runs dry.

## The picture

- **A "Next main target" tweak on Targeting** (*decided*, the note; option names proposal). When
  the primary goes, the new one is:
  - *In order picked* (the default: today's rule).
  - *Nearest*: the closest of the queue to the ship.
  - *Most in front*: the smallest angle off the nose (ties: the nearer).
  - *Collision*: the one that will pass closest to the ship soonest, from its motion relative to
    the ship (the same sum Relative lines uses for "Targets that will collide",
    `src/relative.ts`); among those that won't come near, the nearest.
  Only the choice of the next primary changes; the queue stays as picked.
- **An Auto targeting program** (*decided*, the note). New program `autoTarget` in
  `src/programs.json`, needs Targeting loaded (like Relative lines). While the queue is empty, it
  picks the next target itself, by the Next main target rule above (with *In order picked*, it
  uses *Nearest*). It picks one at a time (proposal: the queue doesn't fill up with things the
  player didn't choose; one is enough for Auto-mine to work).
- **What it picks** (proposal): rocks only, as the box picks default. A second tweak "Picks",
  options *Rocks*, *Ore* (loose ore, for the tractor pilot), *Ships*. Never a station, never the
  player's own drones.
- **"Max range" tweak** (*decided*, the note; options proposal): 300, 600, 1000, and *Lock range*
  (the default, `targetRange`). It never picks past it. Lower than the lock range so an idle ship
  works the rocks around it, not across the field.
- **Price and tier** (proposal): 500 credits, tier 1, sold where Auto-mine is.

## The build

### 1. Next main target

The tweak on Targeting, used where the primary drops (`upkeepShipTargets` and the target's death
paths). Tests for each option with three rocks set up around a ship. *Built.*

### 2. Auto targeting

The program, its two tweaks, and a step that runs once a second (not every tick: it searches),
only on a ship that has it loaded and an empty queue, in flight (`programsFly`). Ships other than
the player can own it, but none buys it yet. *Built.*

Stop here for the user to try: park beside a few rocks with Auto-mine and Auto targeting and look
away. Does the hold fill, and does it pick sensibly?

## How we'll know

- Tests in `src/targeting.test.ts`: each Next main target option picks the right rock; Auto
  targeting with an empty queue picks the nearest rock within its max range, nothing past it, and
  picks again when that rock is mined out; with a picked target it does nothing.
- An idle-mining no-player run (`docs/no-player-runs-plan.md`): credits an hour with Auto-mine
  plus Auto targeting against Auto-mine alone with no picks. Background, logged, not a gate.
- `npm test` and `npm run build`.
- **Try it:** buy Targeting, Auto-mine and Auto targeting (or give them from the tab menu's
  Parts group once the dev tools plan is in). Stop in a field, right click Auto targeting in the
  ship screen (I) and set Max range to 300: a turret reaches about 400, so 300 is the mining
  setting, and 600 or more is for the hull's own gun. Don't click anything: the nearest rock gets
  a box and the guns start; when it's mined out, the next one does.

## Needs first

Targeting, its tweaks and Auto-mine are built. Nothing else.

## Not in this build

- Turret tracking per turret (the many mounts plan leaves all turrets on one aim).
- AI ships buying Auto targeting.
- Smarter picks (most ore, rarest ore first): later, with the goods flow.

## Built

2026-11-26, one build, no stop: both steps, `npm test` and `npm run build` passing.

- **The maths** is `closestApproach` in `src/relative.ts`, which `willCollide` now reads, so the
  Next main target rule and Relative lines' "Targets that will collide" are one sum.
- **The rule** is `Sim.pickMain`, run by `settleMain` wherever the main target leaves: the upkeep
  filter each tick, and a rock breaking into pieces (the pieces take its place first, as before).
  Only the head of the queue moves; the rest stays in the order it was picked in.
- **The program** is `autoTarget` in `src/programs.json`: 500 credits, tier 1, needs Targeting.
  Its step, `Sim.autoTarget`, keeps a per-ship wait outside the save (as gun cooldowns are) and
  searches once a second on a ship in flight with nothing picked.

The **empty-queue gate** stands only until Q-42 (*decided* 2026-11-26, queued): floating slowly,
stale picks stayed behind the ship and nothing fresh ever came, since anything picked froze the
search. The gate becomes the program's own Max range — pick again while nothing picked is inside
it, adding at the tail and never touching the head — which keeps the program blind to what reads
the queue: guns now, a tractor or a scan later.

What landed differently from the proposal:

- **"Ore" means anything loose**, dropped loot included, not loose ore alone: both are what a
  tractor pilot would want picked (`"item" in target`, the same test the box's Everything uses).
- **The max range is capped by the lock range**, so raising it past a lowered `targetRange` tuning
  can't pick what the lock range would drop again next tick.
- **A ctrl-click of the player's own still overrules it**: taking the main target out of the queue
  by hand leaves the next in the queue as main, as it did, whatever the tweak says. The tweak is
  for a main target that *goes* (mined out, picked up, out of range, broken), not one removed.
- **Nothing new is saved**, so `SAVE_VERSION` stays as it is: targets were already not saved, and
  the search's wait is a `WeakMap` on the sim.

**How we'll know**, as tested: `src/targeting.test.ts` has each Next main target option against
three rocks round a ship (In order picked, Nearest, Most in front, Collision, the pieces of a
broken main target), and Auto targeting picking the nearest rock in reach, nothing past its max
range and everything once it's raised, nothing while something is picked, picking again when its
rock is mined out, rocks unless the Picks tweak says otherwise (loose ore, then ships), and
nothing at all without Targeting. `src/relative.test.ts` has `closestApproach` and
`src/programs.test.ts` the two shipped programs' tweaks. `Sim.autoTarget` is in `farside.ts` as
running everywhere, since only flown ships hold targets.

The review raised one finding, fixed: with Picks on Ships the search only kept out a ship's own
drones, so a drone with the program could still pick its owner, or a fellow drone. `ownerRoot` now
keeps out any ship whose owner, however many owners up, is the same one: a player and their drones
are one, and two ownerless ships are nobody's together. `src/targeting.test.ts` pins it: nothing
picked with only its own drones round it, and the nearest stranger picked over a nearer drone.

The idle-mining no-player run (background, logged, not a gate): the shipped world, a floater with
the mining kit parked beside its nearest rock and never touched, 10 game minutes each. Auto-mine
alone mined nothing; Auto-mine plus Auto targeting took 36 ore, the first at once and the last at
7.9 minutes — the bay filling up, since nothing docks to sell it. Script thrown away; the numbers
went into this plan.
