# Auto targeting plan

Written 2026-11-25, from an inbox note (I-13) the user wrote while mining with Targeting and
Auto-mine. Builds on `docs/targeting-plan.md`. Nothing here is built yet.

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
paths). Tests for each option with three rocks set up around a ship.

### 2. Auto targeting

The program, its two tweaks, and a step that runs once a second (not every tick: it searches),
only on a ship that has it loaded and an empty queue, in flight (`programsFly`). Ships other than
the player can own it, but none buys it yet.

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
  ship screen (I) and set Max range to 600. Don't click anything: the nearest rock gets a box and
  the guns start; when it's mined out, the next one does.

## Needs first

Targeting, its tweaks and Auto-mine are built. Nothing else.

## Not in this build

- Turret tracking per turret (the many mounts plan leaves all turrets on one aim).
- AI ships buying Auto targeting.
- Smarter picks (most ore, rarest ore first): later, with the goods flow.
