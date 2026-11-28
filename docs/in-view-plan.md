# In view plan

Written 2026-11-25, from an inbox note (I-15). Step 1 *built* 2026-11-28; step 2 waits on the user trying it.

## Why

The note (*decided*, the user's own words): "Objects should not 'despawn' when in the view of the
player." It holds pillar 1: nothing comes from nowhere, and nothing goes to nowhere while you watch.

The user saw it in play; which object and when wasn't written down. What can vanish today, and
what it measures from:

| What | When it goes | Measured from |
|---|---|---|
| Traffic, pirates, defenders | become trip records, not drawn (`render.ts:392`, `399`) past `TRAFFIC_SLEEP_DISTANCE` 12000 (`Sim.recordTraffic`, `recordFighters`) | `Sim.viewer()` |
| A field's rocks | put to sleep past `FIELD_SLEEP_DISTANCE` 9000 beyond the field's edge (`sleepAndWake`) | `viewer()` and flown ships |
| Loose ore and loot | forgotten past `oreForgetDistance` 6000 from every POI and ship (`moveOres`, `sim.ts:7240`) | POIs and ships |
| A leaving hauler | gone at `HAULER_GONE` 15000 from its station (`sim.ts:2432`) | its station |

`Sim.viewer()` (`sim.ts:6362`) is the player's ship. The camera (`Renderer`, `render.ts:350`)
isn't always there: it holds on a wreck, then rides the escape pod across the system at
`podSpeed`; at speed it leads the ship by `velocity × lookahead`; and the system chart shows
traffic everywhere when `showTraffic` is on. At the widest zoom (0.35) the screen covers about
2700 units each side of the camera, well inside the distances above, so when the camera sits on
the ship nothing should vanish in view. **The guess** (mine): the user saw it while the camera
was away from the ship, most likely riding the pod, where every ship near the pod is a record and
every field it passes is asleep; or a hauler leaving a station they were watching from afar.

## The picture

- **The sim watches what the player watches** (proposal). The main loop hands the sim the
  camera's centre and the half-diagonal of the screen at the current zoom each frame
  (`sim.setView({ x, y, reach })`), and `viewer()` returns that instead of the ship. With no view
  set (tests, no-player runs, the bots) it stays the ship, so those keep running as they do.
- **Nothing goes while in view** (*decided*, the note). Each rule in the table also checks "not
  inside the view's reach plus a margin" (proposal: a margin of 1000) before it puts something
  to sleep, records it or forgets it; a hauler past `HAULER_GONE` but in view flies on until it
  isn't. A rule that wakes things (a record near the viewer, a sleeping field) uses the same view.
- **The chart is a map, not a view** (proposal). Dots on the system chart are where trip records
  are, which they already show; the chart doesn't keep things awake. Waking every field the chart
  shows would wake the whole system.

## The build

### 1. The camera is the viewer

`setView` and `viewer()` as above, the main loop (`src/main.ts`, where it calls the renderer)
handing over the renderer's view. Fields and traffic then wake and sleep around the camera.

*Built* 2026-11-28. `Renderer.viewArea()` gives the last frame's camera centre and half-diagonal;
the main loop hands it to `sim.setView` after each draw, and `viewer()` returns it (the ship when
none is set; `reset` and `restore` clear it). Beyond the plan: a field's drifting-in rocks now
start clear of the camera's whole screen rather than 2000 from the ship (`driftInto`, and the
regrowth laid when a field wakes), so none appears in view of the pod or at the widest zoom. The
rest of `reach` waits for step 2's checks. Tests: `records.test.ts` (traffic
the camera watches stays flown), `sim.test.ts` (a field the camera is on stays awake).

Stop here for the user to try: die near traffic and watch the pod fly home; fly fast past a
field. Does anything still vanish in view?

### 2. The in-view check on every rule

The reach check on each rule in the table, with `farside.ts`'s list updated to say so (its test
fails when a rule changes without it).

## How we'll know

- Tests in `src/farside.test.ts` or `src/sim.test.ts`: with the view set far from the ship, a
  traffic ship inside the view isn't turned into a record and a field inside it stays awake;
  with no view set, the old behaviour holds. Loose ore inside the view isn't forgotten.
- `npm run parity` (in the background, logged to `docs/parity-log.md`): the no-player runs don't
  change, since they set no view.
- A frame-time check (a `src/profile` script, background): a long pod ride shouldn't wake so much
  that frames drop.
- `npm test` and `npm run build`.
- **Try it:** with traffic on, die near a busy station (fly into a rock at speed) and watch the pod
  ride: ships and rocks along the way stay drawn. Zoom all the way out next to a station and wait
  for a hauler to leave: it flies out of the screen rather than vanishing.

## Needs first

Nothing.

## Not in this build

- What the system chart shows of records (their positions are already estimates).
- Persistence of things out of view (S-31).
