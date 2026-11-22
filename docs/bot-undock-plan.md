# Bot undock plan

Written 2026-11-21, after the user watched the dev bot (`G` in `?dev`) sell its ore. Nothing here
is built yet. It makes the no-player bot (`src/bot/bot.ts`) leave the dock out of its open side
before it turns for the field, instead of dragging straight through the station. Items marked
*decided* are the user's calls; the rest is my proposal, open to veto.

## Why

What the user saw (their own play, 2026-11-21): the bot flies home decently, but after selling
its ore it does a huge drag move through the station hull.

What the code does (from reading it; not yet measured):

- On leaving, `Bot.leave` calls `outTo`, which gives one drag: `sim.orderMove(spot, ux *
  CRUISE_SPEED, uy * CRUISE_SPEED)`, a spot 60 units (`DRAG_START`) ahead of the ship, moving
  towards the field's centre at 170 units a second. The direction is straight from the ship to
  the field, whatever is in the way.
- A drag isn't routed round the station. `ClickPilot.routeAround` (`src/pilot.ts`, the override
  near the end of the file) flies straight unless the ship runs the click route program or the
  order is to a station's berth. The station's ring only guards orders aimed at a berth.
- The dock box sits beside the station's solid box, on the station's own +x side
  (`DOCK_OFFSET` = 300, `STATION_HALF` = 150, `src/sim.ts`). When the field lies on the far side
  of the station, the line from the dock to the field crosses the solid box.
- The solid box is solid to ships (the sweep against `STATION_HALF + SHIP_RADIUS` in
  `moveShip`, `src/sim.ts`, rests a ship on the surface). So what the user saw is either the
  ship grinding along the hull, or a gap in that check. Step 1 finds out which.

## The picture

- **Out the open side first, then the field** (mine). Leaving, the bot first drags out of the
  dock along the dock's outward direction (the station's +x axis, turned by `station.rotation`),
  slowly, until it's past the station's ring (`hypot(STATION_HALF, STATION_HALF) + SHIP_RADIUS +
  30` = 254 from the centre, plus a margin). Only then does it give today's drag to the field. A
  field that lies on the dock's side gets the same short first leg, so there is one rule.
- **The player's drag is unchanged** (mine). A player who drags through their own station meets
  the hull, as now. This plan is about the bot, which should fly like a sensible player.

## What to build

1. **Measure it.** A throwaway probe (not committed), in the style of the measured findings in
   `docs/go-home-broken-plan.md`: run `npm run bot -- floater 2 1` with a per-tick log of each
   undock: the ship's position in the station's own axes (`toPoiAxes`), its speed, and whether
   the station sweep hit (`stationHit` in `moveShip`). Write what it shows into this plan: does the
   ship pass inside the solid box (a collision gap, a bug in `src/sim.ts`), or slide along it
   (the bot's line)? If it's a gap, fix the gap first and re-check before step 2. *Built.*
2. **The open-side leg.** In `Bot.leave`: a first drag along the dock's outward direction at a
   low speed (proposal: 60), then `outTo` once the ship is clear of the ring. The bot tracks
   which leg it is on, as `outbound` does today. Tests in `src/bot/bot.test.ts`: a bot docked
   with the field straight behind the station leaves, and over its first 20 seconds the ship
   never comes within `STATION_HALF + SHIP_RADIUS` of the station's box in station axes, and it
   reaches the field. *Built, as two legs rather than one: see step 2 below.*

### Step 1, measured

A throwaway probe (`src/bot/probe-undock.ts`, not committed) ran the floater on the shipped world
and logged every undock for 40 seconds: the ship in the station's own axes, its speed, and a
replay of `moveShip`'s station sweep. Seed 1 for its first 91 game minutes (ten undocks), seed 2
for a full two hours (two undocks), plus a separate check of one drag given straight at a point
behind the station.

- **No collision gap.** Not one tick of either run had the ship inside the solid box. Where it
  crossed, `sweepBox` hit and `moveShip` rested it on the surface, as read. So what the user saw
  is the bot's line, and `src/sim.ts` is not at fault.
- **It is a graze, not a grind, because of where the ship starts.** The station sweep hit on two
  of seed 1's ten undocks, both times leaving from the dock box's corner in station axes,
  `(162, ±150)`, sliding along the `+x` face from `|y|` 150 to 162 and round the corner at 40 to
  50 a second. Seed 2's two undocks never hit it; hull lost with a station within 500 was 1.9 of
  136.
- **The ship often leaves the dock on its own, before `leave` runs.** Docked speed is barely
  damped (`dockDrag` 0.25) and the click order has already ended once the ship is in the box, so
  it drifts out through the dock box's *side*. The undocks measured left from local
  `(261, 150)`, `(372, -150)`, `(364, 150)`, `(162, -150)`, `(450, 21)` and `(172, -150)`, at 40 to
  129 a second: nowhere near the dock's middle, and several outside the berth the picture above
  assumed. Whatever leg is added has to be given from space too, not only from `Bot.leave`.
- **A drag straight at a point behind the station rests on the hull and slides.** From the dock's
  middle, a drag at `CRUISE_SPEED` towards the station's own `-x`: the ship comes to rest at local
  `(162, 1)` for about 25 seconds, then slides along the face at roughly 24 a second and rounds
  the corner at `(162, 162)` after about 30 seconds, ending some 700 units off in `y` and nowhere
  near what the drag aimed at.
- **Which is why step 2 as written can't pass its own test.** The outward leg ends on the dock's
  own `+x` axis, around `(284, 0)` in station axes. A straight line from anywhere on that axis to
  a field straight behind the station passes through the solid box, however far out the leg goes,
  so the drag that follows crosses the hull again; "never within `STATION_HALF + SHIP_RADIUS`"
  would fail within the first second of the turn. Reaching a field behind the station without
  touching it means going round one side of the box, which is a second leg (or an autopilot
  course), not the one leg the picture above names. The user was asked, and chose the second leg
  (*decided*): see step 2 below.

### Step 2, built

`Bot.wayOut` (`src/bot/bot.ts`) is the way out of a station's own space, and `Bot.outTo` calls it
before it gives the trip out's drag. `Bot.dragAt` is the one place both kinds of drag are drawn
from.

- **The station in question** is `nearestDock`'s, while the ship is within `STATION_NEAR` of its
  middle: the far corner of its dock, `hypot(DOCK_OFFSET + STATION_HALF, STATION_HALF)` = 474, so
  a ship anywhere in a berth is leaving it and one passing further out is not. Its own axes come
  from `Poi.rotation`, worked out in the bot (`stationAxes`), so nothing new is exposed on the sim.
- **Two legs, and the second one only when it's needed.** Back out along the dock's open side (the
  station's `+x`, turned by its rotation) at `UNDOCK_SPEED` = 60 until the ship is
  `STATION_CLEAR` = `hypot(STATION_HALF, STATION_HALF) + SHIP_RADIUS + 40` = 264 from the middle.
  Then, while the straight line from the ship to the field still crosses the solid box padded by
  the hull and 20 more (`crossesBox`, a slab test in the station's axes), keep backing out along
  the station's own `±y`, on the side the field lies on, settled once when the way out starts so a
  field dead behind can't flap it. A field on the dock's own side leaves after the first leg
  alone, so the rule is still one rule.
- **A drag of its own speed, not an addition.** `dragAt` draws the drift against the ship's own
  motion (`ux * speed - ship.vx`), which is what the game's `dragAbsolute` setting draws, so a leg
  goes at 60 whatever the ship was doing and the trip out that follows is the cruising speed, not
  the cruising speed plus whatever the backing out left. `outTo`'s drag is drawn the same way.
- **From space as well as from the dock.** The measured dock drift (above) means the ship often
  leaves the berth before `Bot.leave` runs, so `inSpace` carries the way out on with a branch of
  its own, before the trip out's drag has been given.
- **A stop for the impossible.** Past `STATION_GIVE_UP` = 4 × `STATION_CLEAR` from the middle,
  still blocked, it gives the trip out as it used to rather than going round for ever: a field
  that close behind sits in the station's own shadow, and the shipped world has none.
- **Tests** (`src/bot/bot.test.ts`): "backs out clear of the hull with the field behind the
  station" plays the home world with the dock facing straight away from the field and both holding
  still, and checks the ship stays outside `STATION_HALF + SHIP_RADIUS` in the station's axes over
  its first 20 seconds, reaches the field inside them, and said a move round the station at the
  undocking speed. The existing "leaves the dock on a drag towards the field's marker" still holds:
  in the plain home the field is on the dock's side, so the first input is still the cruise drag.

## How we'll know

- `npm run test:fast` while working, then `npm test` and `npm run build`.
- `npm run bot -- floater 2 1` and seed 2: the run's hull lost near the station (from step 1's
  probe, or a `hits taken near the station` count added to `src/bot/log.ts`) drops to zero, and
  trips and credits don't fall.

### Measured, before and after

The same probe replayed `floater` on the shipped world with the bot as it was at `HEAD` and as it
is now: undocks, ticks on which `moveShip`'s station sweep hit, hull lost while a station was
within 500, and trips.

| run | undocks | sweep-hit ticks | hull lost near a station | trips |
| --- | --- | --- | --- | --- |
| seed 1, first 30 game minutes, before | 4 | 14 | 4.1 of 136.2 | 3 |
| seed 1, first 30 game minutes, after | 4 | 0 | 0.0 of 135.5 | 3 |
| seed 1, 2 h, before | 10 | 25 | 6.8 of 253.6 | 8 |
| seed 1, 2 h, after | 5 | 0 | 0.0 of 144.2 | 4 |
| seed 2, 2 h, before | 2 | 0 | 1.9 of 136.1 | 2 |
| seed 2, 2 h, after | 8 | 0 | 0.0 of 318.7 | 5 |

What the plan asked for holds: not one tick inside the solid box in any run, the station sweep
stopped hitting altogether, and hull lost near the station is zero on both seeds. The 30-minute
window, where the two runs still line up tick for tick, has the same four undocks and the same
three trips before and after.

Trips over two hours are not comparable: the first departure already differs by a few units (the
way out is given at the ship's own speed), and the rest of the run is chaotic. Seed 1 fell from
eight trips to four and seed 2 rose from two to five; credits ended at -248 before and 0 after on
seed 1, and -108 before and -400 after on seed 2. Nothing points at the way out being slower —
the 30 minutes agree, and a half-hour run gave exactly two clearing legs (one of each kind) against
hundreds of moves chasing ore — but two seeds can't settle the trips-and-credits half of this
check, and nor can they: a bot run is one long chaotic divergence.

- **Try it:** `npm run dev`, open `/?dev`, pick the Floater, press `G`, and speed time up if you
  like. Watch it come home with a full hold and sell. It backs out of the dock's open side, then
  turns and drags off to the field, clear of the hull, even when the field is behind the
  station.

## Needs first

- `Bot.leave` and `Bot.outTo` in `src/bot/bot.ts`, and `sim.orderMove` with a drag velocity:
  exist.
- A way for the bot to read the station's rotation and dock axis: `Poi.rotation` existed, and
  the rotation is done in the bot (`stationAxes`), so neither `toPoiAxes` nor `toStationAxes` had
  to be exposed.

## What changed from the plan

- **The second leg** (*decided* by the user, after step 1 showed the one leg can't pass the
  test): out along the dock's open side, then along the station's own side when the field is
  behind it. This plan's picture said one leg; it took two.
- **The legs are drags at the ship's own speed, not drags added to it.** A drawn velocity is
  added to the ship's own, so backing out at 60 left sixty units a second of sideways drift that
  the trip out's own drag then added to again, putting the approach at 221 a second where
  `CRUISE_SPEED`'s braking distance was measured at 170. `dragAt` draws against the ship's motion
  instead, the way the game's `dragAbsolute` setting draws, so each leg and the trip out arrive at
  the speed they name. The trip out's drag goes through it too, so its speed is now the cruising
  speed rather than the cruising speed plus the drift it started with.
- **The way out is also given from space.** Step 1 found the ship leaves the berth before
  `Bot.leave` runs, so `inSpace` carries the leg on rather than only `leave` starting it.
- **The test's world is built for it.** A field can't be moved in the test: a field rides its
  orbit and `applyLayout` puts it back every tick. The test builds the home with the station's
  dock facing away from the field and both holding still, which is the same geometry.

## Not in this build

- Routing a player's drag round stations.
- The bot's mining in the field: `docs/bot-mining-plan.md`.
- **The dock drift itself.** The ship still slides out of the berth at 40 to 144 units a second
  while it is selling, because `dockDrag` is 0.25 and the click order has ended by then. This plan
  only makes the way out tidy once it is out; holding a ship in its berth is its own change, and
  worth its own plan.
