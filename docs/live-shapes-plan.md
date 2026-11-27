# Live shapes plan

Written 2026-11-26, from S-71 (live elements on hulls and parts), first slice. Built 2026-11-26
(Q-38). The second slice, state lights and spin (S-72, S-73), was written 2026-11-27 and is under
**Slice 2** at the end; nothing of it is built yet.

## Why

The hull and part designers draw still shapes: polygons, circles, rects, and since Q-36 ellipses,
arcs, rings, wedges, rounded rects, open lines and gradients (`docs/hull-shapes-plan.md`). Nothing
on a ship moves or lights up except the tractor's glow dot going out when the part is damaged
(`working: true`).

The user wants ships that look alive, and the first thing they pictured was **blinking lights**
(the user, 2026-11-26). It serves two pillars from `docs/vision.md`: alive without you (every ship
in a field twinkling as if a crew is at work) and the reveal (a faint light on your first ship
that you only notice on your tenth flight).

The user's framing (*decided*): this isn't a new "light" thing. It's **options on the shapes we
already have**: a shape can change colour periodically, and a shape can glow. A nav light is just
a small circle with those options set.

Nothing here rests on a guess about play: it's designer tooling, and the user draws the lights
themselves. The one guess is the cost of glow, which step 3 measures.

## The picture

The user's calls are marked *decided*. The rest is my proposal.

**Colour change** (*decided*: an option on any shape)

Any shape can carry `blink`. Without it the shape is drawn as today.

- `blink.colour`: the **flash colour**, `#rrggbb`. (*decided*: the names "rest colour" and "flash
  colour")
- `blink.rest`: the **rest colour**, `#rrggbb`. Left out, the rest colour is the shape's own role
  colour, as today. (mine: a nav light needs a dark red lens at rest, which no role gives)
- `blink.on`: seconds the flash lasts, more than 0.
- `blink.off`: seconds at rest between flashes, 0 or more.
- `blink.offset`: seconds the shape's cycle is shifted by, so two lights on one ship can take turns.
  Left out, 0.
- `blink.fade`: snap or fade, chosen per shape (*decided*). Left out, it snaps.

How lit the shape is, from 0 (rest colour) to 1 (flash colour), at time `t` into its cycle of
length `on + off` (mine):

- **Snap** (a blink): 1 for the first `on` seconds, 0 for the next `off`.
- **Fade** (a pulse): `sin(π · t / on)` for the first `on` seconds (up to full and back down),
  then 0 for `off`. With `off` 0 it breathes without a pause.

The colour drawn is the rest colour mixed toward the flash colour by that amount, per channel.

How it sits with what shapes already have (mine):

- The shape's `alpha` still applies on top.
- With a `fade` gradient, the mixed colour takes the place of the role colour at the gradient's
  start; `fade.to` is unchanged.
- On a part, the rest and flash colours are worn by the same `partColor(wear, …)` rule as the
  roles, so a worn light dims with its part. A `working` shape still vanishes when the part is
  damaged, blinking or not.
- A rim shape, an arc or an open line changes its stroke colour the same way.

**Each ship its own timing** (*decided*)

Ships sharing a hull don't blink in step. Each ship has its own **phase**, a number of seconds added
to the clock for every shape on it, so shapes on one ship keep the order their offsets give, and
lights twinkle across a field.

Ships have no id (`Ship` in `src/sim.ts`), so (mine) `src/render.ts` gives each ship a random phase
from 0 to 60 seconds the first time it draws it, kept in a `WeakMap` keyed by the ship object. It
isn't saved: a loaded game gets new phases, which nobody can tell.

**Glow** (*decided*: an option on any shape, tied to the flash when there is one)

Any shape can carry `glow`: a halo's size, in the shape's own units (hull radii on a hull, the
same on a part), more than 0.

- On a shape **without** `blink`, the glow is steady, in the shape's own colour.
- On a shape **with** `blink`, the glow goes with the flash: none at rest, full at the flash, and
  with fade it swells and shrinks with the colour. Its colour is the flash colour.

Drawn (mine) with the canvas's `shadowBlur` and `shadowColor` on the shape's own fill or stroke:
blur `glow × R` times the current scale, colour at alpha equal to how lit it is. That's the
expensive kind of canvas drawing, so step 3 measures it with many ships on screen, and if needed
skips glow on ships drawn small (see step 3).

**The clock** (mine)

`src/shipArt.ts` gets one module-level clock: `setArtTime(seconds | null)`. The game's renderer sets
it to its frame time plus the ship's phase before drawing each ship, and back to `null` after. With
`null`, the art is **still**: every blinking shape at its rest colour and no glow on it; steady glow
still draws. That's what static pictures get without any change to them: the shop icons, the start
menu cards (`src/main.ts`) and the ship screen's blueprint (`src/inventory.ts`, drawn once). The
smoke from broken parts in `drawVectorShip` keeps reading `performance.now()` as it does now.

A module clock rather than a new parameter because the time has to reach `drawShape` through
`drawVectorShip`, `drawHull`, `drawDecals`, `drawDecal`, `drawPartArt`, `drawTurret` and
`drawShapes`, and the designer calls several of those directly.

**The designer** (mine)

In the picked shape's panel, on both the Hulls and the Parts pages, beside the Gradient block:

- A **Colour change** block: none / snap / fade; a flash colour picker; a rest colour picker with a
  "Role colour" checkbox (ticked means no `rest`); and number fields for on, off and offset, in
  seconds, step 0.1.
- A **Glow** number field, empty or 0 for none.
- The preview animates: the designer's canvas already redraws in its `frame()` loop, so it sets
  the art clock to the page's time while drawing the hull and parts.
- A **Still** toggle with the layer toggles, which draws everything at rest, for placing a light
  without it flashing under the cursor.
- The shape list marks a shape that blinks or glows, so "4. Circle, glass ✦" reads at a glance.

**Tools only** (*decided*)

This build adds the options and the editor. It puts no lights on any hull or part: the user draws
them in the designer. `src/hulls.json` changes only in that the build must read and write the new
fields.

## What to build

All four steps are built; see **Built, with what changed** below.

1. **The data.** In `src/fitting.ts`, `ArtShape` gains `blink` (an object: `colour`, `rest`, `on`,
   `off`, `offset`, `fade`) and `glow`, each with a doc comment in the file's style. `readShape`
   reads them with its usual care:
   - a `blink` with a `colour` that isn't `#rrggbb`, an `on` that isn't more than 0, or an `off`
     that's negative or not a number is dropped, and the shape stays still;
   - a bad `rest` is dropped and the role colour is used; a bad `offset` reads as 0; `fade` is only
     `true` or left out;
   - a `glow` that isn't a number more than 0 is dropped.

   `shipFileNow` writes them back, and the round trip through `useShipFile` keeps them.
2. **The drawing.** In `src/shipArt.ts`:
   - `setArtTime(seconds | null)` and a pure `litAmount(blink, seconds)` (the snap and fade rules
     above, with the offset), exported for tests;
   - `paint` uses the mixed colour where a shape blinks, for flat colours and gradients alike;
   - `drawShape` sets the glow's `shadowBlur` and `shadowColor` when a shape has `glow` and is lit
     (steady, or lit above 0), and clears them in its own `save`/`restore`;
   - `drawPartArt` wears the rest and flash colours as it wears the roles.

   In `src/render.ts`, `drawShip` keeps the `WeakMap` of phases and sets the art clock before
   `drawVectorShip` and the turrets, and `null` after.
3. **The glow's cost.** Measure before deciding anything. In a dev build, give a hull that traffic
   flies (a draft, not saved) four glowing, blinking shapes, fill the view with traffic, and compare
   frame times with and without the glow (a short `requestAnimationFrame` timing script in the
   page, or the browser's performance panel). Write the numbers in this plan's "Built" section.
   - If a frame with glow stays within a few milliseconds of one without, leave it.
   - If not, skip glow on any ship drawn with a radius under 12 screen pixels (the renderer knows
     the zoom), and measure again. The flash colour still blinks there; only the halo goes.
4. **The editor.** In `src/designer/hulls.ts`, the Colour change and Glow blocks, the animated
   preview, the Still toggle and the mark in the shape list, as above. Edits go through undo like
   every other field. Any pure rule the panel needs (reading the fields back into a `blink`) goes
   in `src/designer/shapes.ts`, beside the shape handles.

These are one build with no stop.

## How we'll know

- **Unit tests**, in `src/hullShapes.test.ts` with its `recorder()` canvas:
  - `litAmount`: snap is 1 through `on` and 0 through `off`; fade is 0 at the cycle's start, 1 at
    `on / 2`, back to 0 at `on`, and 0 through `off`; the offset shifts the cycle; with `off` 0,
    fade repeats with no flat part;
  - `readShape` drops each bad case in step 1, keeps the good ones, and they survive a
    `shipFileNow` / `useShipFile` round trip;
  - with the clock at `null`, a blinking shape draws in its rest colour (the role colour when there
    is no `rest`) with no `shadowBlur`, and a steady glowing shape still sets `shadowBlur`;
  - with the clock set into the flash, it draws in the flash colour with `shadowColor` in that
    colour; with a gradient, the gradient's first stop is the mixed colour;
  - on a part, the flash colour is worn by `partColor`, and a `working` blinking shape is skipped at
    `DAMAGED_AT`;
  - two ships with different phases draw the same blinking shape in different colours at the same
    moment, and two shapes on one ship with offsets keep their order.
- **No change for today's art**: every hull and part in `src/hulls.json` draws the same calls with
  the clock at `null` and with it set, since none has `blink` or `glow`.
- `npm test` and `npm run build` pass.
- **Try it:** `npm run dev`, open the designer (`?dev`), Hulls page, pick your racer. Add a small
  circle near a wingtip, set Colour change to snap, flash colour bright red, rest colour dark red,
  on 0.15, off 1.2, glow 0.08: it blinks in the preview. Add a second on the other wingtip in
  green with offset 0.6: they take turns. Set one to fade: it breathes. Save, fly, and look at
  traffic on the same hull: their lights blink out of step with yours. Then drop the lights again
  if you don't want them yet (tools only).

## Needs first

Nothing unbuilt. It builds on the shape kinds and gradients of Q-36 (built 2026-11-26, `9330bd2`):
`ArtShape`, `readShape` and `shipFileNow` in `src/fitting.ts`, `paint`, `drawShape` and
`drawShapes` in `src/shipArt.ts`, and the shape panel and `src/designer/shapes.ts` in the designer.

## Built, with what changed from the plan

The four steps are in. The data and the drawing are as the plan has them: `ShapeBlink`, `glow` and
their reading in `src/fitting.ts`; `setArtTime`, `litAmount`, the mixed colours and the halo in
`src/shipArt.ts`; the per-ship phase and the clock in `src/render.ts`'s `drawShip`; and the editor's
blocks, Still toggle and list mark in `src/designer/hulls.ts`. These differ:

- **The halo's size includes how lit the shape is.** The plan gives a blinking shape's halo "none at
  rest, full at the flash, and with fade it swells and shrinks with the colour": its blur is
  `glow × R × scale × lit`, so a pulse's halo breathes with it. A steady glow's is the full size.
  The colour's alpha is the lit amount, as the plan says.
- **The blur takes the scale the ship is drawn at**, read from the canvas's own transform (its `a`
  and `b`, the scale and any turn), since `shadowBlur` is in pixels and not in the ship's units. A
  context that can't say — a test's own canvas — counts as 1.
- **A part wears a light's colours through the same `partColor`.** `ShapePalette` gained an optional
  `worn`, which `drawPartArt` fills in with `partColor(wear, …)`: the rest and flash colours take the
  wear a scorched part takes, and the role colours are still worked out before it, so nothing wears
  twice.
- **The colour change and the glow are read apart.** The plan drops a whole `blink` when its `off`
  "is negative or not a number", which a file without `off` is too; a shape keeps its `glow` when its
  `blink` is dropped, since the two are options of their own. Colours are kept lower-cased, and an
  offset of 0 is left out like the file's other differences.
- **The editor's rules are `blinkStart`, `blinkOf` and `restFor` in `src/designer/shapes.ts`**, beside
  the handles and the shading's start. `blinkOf` is the one that says what a usable colour change is
  (a flash longer than nothing, a rest of 0 or more); the panel never lets a typed number make one.
- **Still is its own toggle in the view bar**, not one of the layer eyes: the layers say what to hide,
  and Still says how to draw. Hidden layers and Still are both view state, never saved.

**Step 3, the glow's cost.** Measured in the dev page with the drawing code itself: 60 racers at the
screen size traffic is drawn at (12 px a hull radius, spread over 1280×720), four lights each, 300
frames a pass, the shapes patched into `HULL_SHAPES.racer` in memory and put back afterwards.

| 240 lights a frame | ms a frame |
| --- | --- |
| no glow | 2.39 – 2.61 |
| glow 0.08, steady | 2.76 |
| glow 0.25, steady | 2.69 |

A whole view of glowing ships costs under half a millisecond, inside the same noise as two runs of
the same drawing, so nothing was skipped: glow draws on every ship, however small. Blinking (the
clock moving) measured 2.69 – 3.11 ms with and without the glow, which is the same picture.

**How we'll know** is tested in `src/hullShapes.test.ts` (the timing rules, the reading, the round
trip, the halo, the gradient's first stop, a part's wear, the offsets, and every hull and part in the
file drawing the same with the clock set as still) and in `src/designer/shapes.test.ts` (the
panel's rules). One thing is covered by construction rather than by a test: the renderer's `WeakMap`
of phases needs the game's own canvas, so its effect is tested as two clocks half a cycle apart —
the same light in two colours at one moment — not by drawing two ships.

The review raised one finding, fixed: a damaged part's light was worn in its fill but its halo
wasn't, so a dimmed shape still glowed bright. The halo now takes the same `partColor` wear, with a
test for it.

## Not doing

- **A separate "light" kind.** Blink and glow are options on any shape (*decided*).
- **Ships blinking in step.** Each ship has its own phase (*decided*).

## Not in this build

The rest of S-71, each for later:

- **Lights that follow the ship's state** (S-72): throttle, turning, firing, fuel, damage. The user chose
  looks first (*decided*); a state rule would later drive the same lit amount.
- **Spin** (S-73): a dish or a gyro ring turning on its own.
- **A glint lit by the star** as the ship turns (S-74).
- **Particles** from shapes (S-74).
- **Lights on today's ships**: tools only (*decided*); the user adds them.

---

# Slice 2: state lights and spinning shapes

Written 2026-11-27, from S-72 (lights that follow the ship's state) and S-73 (spinning shapes),
after slice 1 was played and passed (P-3, 2026-11-26).

## Why

Slice 1 gave every shape a colour change and a glow on a clock: a nav light blinks whatever the
ship does. The user's next picture is lights and moving parts that *say* something: an engine
stripe that brightens with the throttle, a beacon that blinks as a ship comes in to dock, a lamp on
the tank when fuel runs low, a muzzle light on each shot, a radar dish that sweeps on approach. It
serves the same two pillars as slice 1: alive without you (a field of ships whose lights tell you
what each is doing) and the reveal (a light you only notice the first time your tank runs low).

Stations come next. The station frames plan (`docs/station-frames-plan.md`, Q-51) makes a station a
frame drawn in the hull designer from the same shapes, so its lights go through the same art
(*decided*: the user, "stations will soon use the same system").

Nothing here rests on a guess about play: it's designer tooling again, and the user draws the
lights. So there is no stop for the user to try in the middle; the build is one piece.

## The picture

The user's calls are marked *decided*. The rest is my proposal.

**Four states, of three kinds** (*decided*: the list and the kinds)

| State | Kind | On a hull shape it reads | On a part's shape it reads |
| --- | --- | --- | --- |
| Throttle | amount, 0 to 1 | the main thruster (`thrusterMain`) | that thruster's own firing |
| Approach | switch | a dock near and closing | the same, the ship's |
| Running low | switch | the ship's whole stock of the named item | the same, the ship's whole stock |
| Firing | event | any gun's shot | that gun's own shot |

- **An amount** lights the shape as much as the state is.
- **A switch** turns the shape's own blink on: it blinks on its slice 1 timing while the state is
  true, and rests otherwise.
- **An event** starts one flash.

**On a part, a light reads that part; on the hull, the whole ship** (*decided*). A light drawn on a
thruster follows that thruster; a muzzle light on a gun flashes when that gun fires, so a ship with
two guns flashes at the right two moments. A hull's "engines on" stripe reads the main thruster
without knowing which part is which. Running low is the one exception (*decided*): the stock is
shared, so a lamp on each of two tanks reads the ship's whole fuel and they blink together.

**Running low is one generic state** (*decided*: "generic running low is perfect"). The shape
names an item and the share of a full stock that counts as low. Fuel works in this build. Ammo
lights up once Q-54 gives the gun something to consume, with no ammo code here: the ammo build
only fills in its share (a line is added to `docs/ammo-plan.md`). A later consumable, such as power
(S-83), gets its light the same way.

- The share is **how full, 0 to 1**, of what the ship can hold of that item. For fuel that is
  `ship.fuel / tankCapacity(ship)` (`src/fitting.ts`), the number the tank art already draws
  (`Renderer.tankFill` in `src/render.ts`). (mine)
- **Low** means the share is at or below the shape's line. Left out, the line is 0.25, the share
  at which the tank art already turns red (`drawTanks` in `src/shipArt.ts`). (mine)
- **Empty counts as low** (mine): a share of 0 is lit, so a dry tank keeps blinking.
- A ship that can't hold the item at all (no tanks, or fuel off, which is when `tankFill` returns
  null) **has no share**, and the light rests. (mine)

**Approach is a relation between a ship and a dock** (*decided*: from where the ship is and how it
moves, not from what its pilot means to do; and both sides can show it)

- **On a ship:** lit when a dock is within the shape's range and the ship is closing on it.
- **On a station:** lit when any ship is within range of its dock and closing. Stations aren't
  drawn from shapes yet; see **Stations** below.

The rule (mine):

- A **dock** is any entry of `Sim.docks` (`src/sim.ts`, "every station with a dock"), at its dock
  point, `Sim.dockPoint(false, station)`. When Q-51 lands, docks are what has a dock part; the rule
  asks the same question.
- **Closing** means the ship's velocity relative to the dock point has a part toward the dock point
  of more than a small minimum, 2 world units a second (a constant, `APPROACH_MIN_CLOSING`), so a
  ship holding still beside a dock or sitting in it doesn't light up. The dock point's own velocity
  comes from `dockPoint(false, …)` and `dockPoint(true, …)` over the tick, since stations orbit
  and turn.
- The state is the **distance to the nearest dock the ship is closing on** (infinite when none is),
  so each shape compares it with its own range: a long-range beacon and a short landing light can
  sit on one ship.
- **Range**, per shape, in world units. Left out, 600: the dock point is 300 out from the station's
  centre (`DOCK_OFFSET`), so this lights up about a station's width out. (mine)
- A ship passing close and slowing also counts. That reads as "looking for a berth", which is fine.
- **No flicker:** once lit, the state holds for half a second after it stops being true. (mine)

**Firing is an event** (mine, on the user's list)

The sim keeps no record of a shot today; cooldowns count down, and a cooldown doesn't say a shot
happened. So `Ship` gains `shotAgo: Map<MountId, number>`: seconds since each gun mount last fired,
set to 0 in `fireGun` (`src/sim.ts`) and counted up where `gunCooldowns` count down. Not saved: a
loaded game has no recent shots. A hull shape reads the smallest of them (any gun); a gun's shape
reads its own mount's, which for a turret's gun is the turret's gun mount (`turretGunId`).

**How each kind uses slice 1's fields** (mine)

The state picks what drives a shape's colour change. Everything from slice 1 (rest and flash
colours, glow, wear, `working`, still art) applies unchanged.

- **Clock** (no drive, as today): `litAmount(blink, seconds)`.
- **Amount** (throttle): lit is the amount, 0 to 1. `on`, `off`, `offset` and `fade` are ignored.
- **Switch** (approach, running low): `litAmount(blink, seconds)` while the state is true, 0
  otherwise.
- **Event** (firing): with `t` the seconds since the shot, lit is 1 while `t < on` with snap, and
  `1 − t / on` with fade, so a faded flash dies away instead of cutting off; 0 after. `off` and
  `offset` are ignored.

Glow follows the lit amount as it does now, so an engine stripe's halo grows with the throttle.

**Spin** (*decided*: a speed and a pivot, steady or driven by a state)

Any shape can carry `spin`:

- `spin.speed`: degrees a second, negative for the other way, not 0.
- `spin.x`, `spin.y`: the pivot, in the shape's own units. Left out, the shape's own centre: its
  `x`, `y` for the kinds that have them, the middle of its points' bounds for a polygon. (mine)
- `spin.drive`: left out, it turns steadily. With a drive (*decided*: "driven too"):
  - **Amount** (throttle) scales the speed: a turbine that winds up.
  - **Switch** (approach, running low): full speed while true, stopped otherwise: a dish that
    sweeps on approach.
  - **Events don't drive spin** (*decided*); a spin with a firing drive loses the drive when read.
  - A driven spin **eases** toward its target speed over about a second, up and down, so it never
    snaps. (*decided*: easing; one second is mine)

A steady spin's angle is `speed × clock`, on the ship's own phase like the blink, so two ships'
dishes don't turn in step. A driven one has to remember its angle and its current speed between
frames: the renderer keeps that per ship, beside its `WeakMap` of phases, keyed by the shape and
the mount it sits on. Not saved. (mine)

Still art (the clock at `null`: icons, menu cards, the ship screen's blueprint) draws every spinning
shape at angle 0, as drawn in the designer.

**The snapshot: what's happening, handed to the art** (mine)

The art can't read a `Ship`: a station will draw through it too (*decided*). So each entity hands
the drawing a small snapshot, set the way slice 1 sets the clock:

```ts
/** What's happening to the thing being drawn, for shapes driven by a state. */
interface ArtState {
  /** Each thruster's firing, 0 to 1, by its role. Missing is 0. */
  thrust: Partial<Record<ThrusterRole, number>>;
  /** Distance to the nearest dock it's closing on (a station: to the nearest ship closing on its dock). Infinity for none. */
  approach: number;
  /** How full it is of each item it consumes, 0 to 1. An item it can't hold is missing. */
  supply: Partial<Record<ItemId, number>>;
  /** Seconds since each gun mount last fired. Missing means never (or not since loading). */
  shotAgo: Partial<Record<MountId, number>>;
}
```

- `src/shipArt.ts` gets `setArtState(state | null)` beside `setArtTime`, and a module-level
  **current mount**: `drawFitted` sets it to the part's mount for the length of the part's drawing,
  and `drawTurret` to the turret's gun mount (`turretGunId`) while it draws the gun. With no current
  mount, a shape is the hull's (or a decal's) and reads the whole ship. A thruster part's mount
  reads `thrust[mount.role]`; a gun part's mount reads `shotAgo[mount.id]`.
- **Null state** (static pictures, and the designer with no preview state) means nothing is
  happening: throttle 0, no approach, nothing low, no shots. Clock-driven blinks still blink when
  the clock is set, as today.
- The ship's snapshot is built by one function, `shipArtState(sim, ship)`, in a new
  `src/artState.ts` with the pure rules (closing, low, the event's lit, the spin's easing) beside
  it, so they can be tested without a canvas. `Renderer.drawShip` calls it and sets the state next
  to the clock, and `null` after. The approach's half-second hold is kept per ship in the renderer.
- Throttle reads `ship.firing` (already 0 to 1 per thruster, what the flames draw).

**The data** (mine)

`ShapeBlink` gains `drive`, and the new `ShapeSpin` has one too, of one shape:

```ts
type ShapeDrive =
  | { state: "throttle" }
  | { state: "approach"; range?: number }        // world units, default 600
  | { state: "low"; item: ItemId; share?: number } // 0 to 1, default 0.25
  | { state: "fired" };                           // colour change only
```

The blink and the spin each take their own drive, so a dish can sweep on approach while a lamp on it
reads low fuel.

**Stations** (*decided*: the same system; mine, how)

Whichever of this build and Q-51 lands second makes the station's snapshot: `approach` is the
distance to the nearest ship closing on its dock, by the same rule; its supply is its stock's share
once its storage is a part. Lines saying so go into both plans: this one, and a note under **Not in
this build** in `docs/station-frames-plan.md`.

**The designer** (mine)

- In the Colour change block, a **Driven by** choice at the top: Clock, Throttle, Approach, Running
  low, Firing. Approach shows a Range field; Running low shows an item picker (items from
  `src/items.json`) and a Low at % field. The timing fields grey out where the drive ignores them.
- A **Spin** block beside it: a speed field (degrees a second), a Driven by choice (none, Throttle,
  Approach, Running low), and a pivot handle on the canvas, dragged like the shape handles, with a
  "Centre" button that clears it back to the shape's own centre.
- A **State** row in the view bar, next to Still, so a driven light can be seen while drawing it: a
  throttle slider, an Approach toggle, a Low toggle (every item at 0.1) and a Fire button (every
  gun mount fires, `shotAgo` 0). The preview builds its snapshot from these. Still wins over them.
  View state only, never saved.
- The shape list's mark: ✦ as now for blink or glow, and ⟳ for a spinning shape.

**Tools only** (*decided*)

This build adds the states, spin and the editor. It puts no light and no spin on any hull or part:
the user draws them. `src/hulls.json` changes only in that the build must read and write the new
fields.

## What to build

1. **The data.** In `src/fitting.ts`: `ShapeDrive`, `ShapeBlink.drive`, `ShapeSpin` and
   `ArtShape.spin`, with doc comments in the file's style. `readShape` reads them with its usual
   care:
   - a drive with an unknown `state` is dropped: the blink keeps its clock, the spin turns steadily;
   - `range` that isn't a number above 0 is dropped (the default applies); `share` outside 0 to 1
     is dropped; a `low` drive without an `item` string is dropped;
   - a `fired` drive on a spin is dropped;
   - a spin whose `speed` isn't a number other than 0 is dropped whole; a bad pivot coordinate is
     dropped (the centre applies).

   `shipFileNow` writes them back, defaults left out, and the round trip through `useShipFile` keeps
   them.
2. **The record of shots.** `Ship.shotAgo` in `src/sim.ts`: made empty with every ship, set to 0
   for the mount in `fireGun`, counted up by `dt` beside `gunCooldowns`. Not saved, not loaded.
3. **The snapshot and its rules.** `src/artState.ts`: `ArtState`; `shipArtState(sim, ship)`
   (throttle from `firing`, approach from `Sim.docks` and `dockPoint`, supply from fuel and
   `tankCapacity`, `shotAgo` copied); and the pure rules, exported for tests: `closingDistance`
   (ship, dock now and a tick ago, the tick's length), `isLow(share, line)`, `firedLit(blink, t)`
   and `easeSpeed(current, target, dt)`.
4. **The drawing.** In `src/shipArt.ts`: `setArtState`, the current mount set by `drawFitted` and
   `drawTurret`, the lit amount by drive as above, and spin: the shape drawn turned about its pivot
   by its angle (`translate` to the pivot, `rotate`, `translate` back, inside `drawShape`'s own
   `save`/`restore`). A steady spin's angle comes from the clock; a driven one's from the
   renderer's memory, handed in with the state (`ArtState` may carry a `spins` store the drawing
   reads and updates; the designer's preview keeps its own). In `src/render.ts`, `drawShip` sets
   the state with the clock, keeps the approach hold and the spin memory per ship, and clears both
   after.
5. **The editor.** In `src/designer/hulls.ts`: Driven by, the Spin block and its pivot handle, the
   State row and the list mark, as above. Edits go through undo like every other field. Pure panel
   rules (reading the fields back into a drive or a spin) go in `src/designer/shapes.ts`, beside
   `blinkOf`.
6. **The cross notes.** A line in `docs/ammo-plan.md` saying the ammo build fills `supply` for its
   item so running-low lights work (added with this plan); a line in
   `docs/station-frames-plan.md` saying a station's snapshot (approach from its dock's side, its
   stock's supply) is filled by whichever of Q-51 and this build lands second (added with this
   plan). The build checks both are still true and updates them if not.

These are one build with no stop.

## How we'll know

- **Unit tests**, in `src/hullShapes.test.ts` with its `recorder()` canvas, and a new
  `src/artState.test.ts`:
  - `readShape` drops each bad case in step 1, keeps the good ones, and they survive a
    `shipFileNow` / `useShipFile` round trip;
  - each drive's lit amount: throttle at 0, 0.5 and 1; a switch blinks on its timing while true and
    rests while false; a fired snap is 1 until `on` and 0 after; a fired fade falls from 1 to 0
    over `on`;
  - `closingDistance`: a ship flying at a dock in range gives its distance; flying away, sitting
    still beside it, or sitting in it gives infinity; a dock that moves toward a still ship counts
    as closing; the nearest of two closing docks wins;
  - `isLow`: at and under the line is low, above isn't, 0 is low, a missing share isn't;
  - `shipArtState` on a sim ship: fuel's share is `fuel / tankCapacity`; a ship with no tank has no
    fuel share; a shot sets its mount's `shotAgo` to 0 and a tick counts it up;
  - a part reads its own mount: a light on a strafe thruster follows `thrust.thrusterStrafeLeft`,
    not the main thruster's; a light on one of two guns flashes only on its own mount's shot; the
    same light on the hull follows the main thruster and any gun;
  - a running-low lamp on each of two tanks reads the same ship share;
  - spin: a steady shape at clock `t` is turned `speed × t` about its pivot (the recorder sees the
    `rotate`); still art turns nothing; `easeSpeed` reaches its target in about a second and never
    overshoots; a switch-driven spin eases down when the switch goes off;
  - the approach hold keeps the state lit for half a second after it stops being true.
- **No change for today's art**: every hull and part in `src/hulls.json` draws the same calls with
  the state null and with a busy state set (full throttle, approach, every item low, every gun just
  fired), since none has a drive or a spin.
- `npm test` and `npm run build` pass.
- **Try it:** `npm run dev`, open the designer (`?dev`), Hulls page, pick your racer. Add a thin
  rect along the back, Colour change driven by Throttle, flash colour orange, glow 0.1: move the
  State row's throttle slider and it brightens. Add a small circle on the nose driven by Approach,
  snap, on 0.2, off 0.4: toggle Approach and it blinks. On the Parts page, add a circle on the tank's
  art driven by Running low, item fuel; on gun 1's art, one driven by Firing, on 0.15, fade: press
  Fire and it flashes and dies away. Add a small rect, Spin 90, driven by Approach: it winds up when
  Approach is on and winds down when it's off. Save and fly: burn and watch the stripe, fly at the
  station and see the nose blink, mine with auto-mine and see each gun flash on its own shot, burn
  the tank under a quarter and see the lamp. Then drop what you don't want (tools only).

## Needs first

- Slice 1 (Q-38): `ShapeBlink`, `glow`, `setArtTime`, `litAmount`, the phases in `drawShip` and the
  designer's Colour change block, Still toggle and `blinkOf`. Built 2026-11-26 and passed (P-3).
- Thrusters' firing (`Ship.firing`), `tankCapacity`, `Sim.docks`, `dockPoint`, `fireGun`,
  `gunCooldowns` and `turretGunId`: all built (checked 2026-11-27).
- Nothing unbuilt. Ammo's light waits on Q-54 and the station's on Q-51, but this build needs
  neither.

## Not in this build

- **More states:** turning, damage, target lock, docked, cargo full. The four here set the shape of
  the feature (*decided*: one or two of each kind first); more go in as rows of the same table.
- **Station snapshots:** whichever of this build and Q-51 lands second (see Stations).
- **Ammo's share:** filled in by the ammo build (Q-54).
- **Events driving spin** (*decided*: not done).
- **Lights on today's ships and stations:** tools only (*decided*); the user draws them.
- A star glint and particles: still S-74.

## Not doing

- **Approach from what the pilot means to do.** It's read from where the ship is and how it moves
  (*decided*), so the player, traffic and haulers all light up the same way without each pilot
  having to report a goal.
- **Separate fuel and ammo lights.** One running-low state that names its item (*decided*).
- **The art reading a `Ship`.** It reads the snapshot, so stations can use the same shapes.
