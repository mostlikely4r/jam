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
   (the bot's line)? If it's a gap, fix the gap first and re-check before step 2.
2. **The open-side leg.** In `Bot.leave`: a first drag along the dock's outward direction at a
   low speed (proposal: 60), then `outTo` once the ship is clear of the ring. The bot tracks
   which leg it is on, as `outbound` does today. Tests in `src/bot/bot.test.ts`: a bot docked
   with the field straight behind the station leaves, and over its first 20 seconds the ship
   never comes within `STATION_HALF + SHIP_RADIUS` of the station's box in station axes, and it
   reaches the field.

## How we'll know

- `npm run test:fast` while working, then `npm test` and `npm run build`.
- `npm run bot -- floater 2 1` and seed 2: the run's hull lost near the station (from step 1's
  probe, or a `hits taken near the station` count added to `src/bot/log.ts`) drops to zero, and
  trips and credits don't fall.
- **Try it:** `npm run dev`, open `/?dev`, pick the Floater, press `G`, and speed time up if you
  like. Watch it come home with a full hold and sell. It backs out of the dock's open side, then
  turns and drags off to the field, clear of the hull, even when the field is behind the
  station.

## Needs first

- `Bot.leave` and `Bot.outTo` in `src/bot/bot.ts`, and `sim.orderMove` with a drag velocity:
  exist.
- A way for the bot to read the station's rotation and dock axis: `Poi.rotation` exists. Check
  whether `toPoiAxes` (`src/pilot.ts`, not exported) or `Sim.toStationAxes` (private) is the one
  to expose, or do the rotation in the bot.

## Not in this build

- Routing a player's drag round stations.
- The bot's mining in the field: `docs/bot-mining-plan.md`.
