# Keeps mining plan

Written 2026-11-20, talked through with the user the same day. *Built* 2026-11-23 (see **What
changed from the plan** at the end). It is
the first bundle of `docs/idle-mining-road.md`: auto-fire plus measurement.

## Why

The floating idle mining target in `docs/vision.md` wants a major decision every 10+ minutes once
reached, and idle earning 10 to 30% of active play early. Today nothing on the ship extracts
without you: a floater with a turret still needs Space held, and its turret follows the mouse
cursor (`main.ts`, `sim.ship.aim` set from the mouse each frame), so looking away stops mining.

This bundle lets the ship keep mining the rocks you picked, and puts the first numbers on the gap:
the no-player bot (`docs/no-player-runs-plan.md`, code in `src/bot/`) buys the new programs on its
floater journey, stops firing and aiming by hand, and its report shows inputs before and after.

## The picture

*Decided* marks the user's calls; the rest is my proposal.

**Four programs, one job each** (*decided*). A different job is a different program, as the
tweak rule in `docs/targeting-plan.md` says.

| Program | Job |
|---|---|
| **Auto-mine** | Pulls the trigger: each gun it's on for fires when it is likely to hit a picked rock. Checks facing only. |
| **Auto-mine II** | The same, and also holds a gun's fire when the rock will be gone by the time the shot arrives. It doesn't aim ahead. |
| **Turret tracking** | Turns the turret toward the rock it should shoot. |
| **Face target** | Turns the hull's nose toward the primary rock, so fixed guns line up. |

- **Programs, bought in the dock shop** (*decided*). A new player sees plain asteroids; the
  floater road earns its automation step by step.
- **Any gun, not only turrets** (*decided*). Each gun mount decides for itself, so with two
  guns, one may fire while the other holds.
- **Rocks only** (*decided*). Auto-mine never fires at ships, stations or loose ore, even if
  they are picked. Firing on a ship stays a deliberate act (Space).
- **The turret's aim is its own program** (*decided*), not part of Auto-mine or Face target.
  Without Turret tracking the turret follows the mouse as today.
- **Face target only acts when nothing else is steering** (*decided*): no click order running,
  no autopilot course, no turn key held. It only turns, never thrusts.
- All four need Targeting loaded, as Relative lines does (proposal: `"needs": ["targeting"]`).
  Without it they do nothing.

**Tweaks**

- **Per mount on/off, on both auto-mine programs** (*decided*): a tweak "Fires" with options
  On and Off, one row for each mount that holds a gun, the turret's gun mount included.
- **This is a new, general kind of tweak** (*decided*): a tweak that repeats per mount. It
  must work for any number of mounts and any part kind, so a later program can carry, say, a
  per-thruster tweak with the same machinery.
- **The setting belongs to the mount**, kept with the pilot's other picks (*decided*). Moving a
  gun to another mount leaves the setting with the mount.
- **"Shoots at": Primary only / Any picked** (*decided*, as a tweak), on both auto-mine
  programs. Any picked: each enabled gun shoots the primary if it's likely to hit it, otherwise
  any other picked rock it's likely to hit. Primary only: only the primary. Default: Any picked
  (proposal).
- A mount without a pick reads **On** (proposal), so buying the program just works.

**Names** (*decided* "Auto-mine"; the other names are my proposals, easy to change in
`programs.json`): Auto-mine, Auto-mine II, Turret tracking, Face target. "Auto-fire" is kept
for a combat version some day.

## What to build

### 1. Per-mount tweaks: `src/programs.ts`, `src/programs.json`, `src/inventory.ts` (*built*)

- `ProgramTweak` gains an optional `each?: PartKind` (the part kind it repeats for: `"gun"` now;
  any kind later). `readTweaks` (`programs.ts` ~line 90) reads and checks it: a known part kind,
  or the tweak is rejected as other bad data is.
- Picks stay in the existing `TweakPicks` shape (program → tweak key → option), so saves need no
  new format. A per-mount pick is stored under the key `"<tweak>@<mount>"`, for example
  `fires@turretGun` (proposal). `pickOf` and `setPick` (`programs.ts` ~177) take an optional mount
  id; a tweak with `each` needs one, a plain tweak ignores it. No pick: the tweak's default.
- Which mounts a tweak with `each` covers: every mount of the ship whose fitted, non-destroyed
  module is a part of that kind (`mountsOf`, `partOf(...).kind` in `fitting.ts`; this is the
  filter `fireShots` already uses, `sim.ts` ~6578). With a turret fitted, the gun on the turret's
  `turretGun` mount counts as one gun mount. Add a helper `tweakMounts(ship, tweak)` in
  `fitting.ts` or `programs.ts` that both the menu and the sim use.
- `sim.setTweak` (called by the menu) takes the optional mount id too. The bot uses the same call.
- The tweak menu (`inventory.ts`, `openTweaks` ~line 381): a tweak with `each` shows one row per
  covered mount, named "<tweak name>: <mount name>" (for example "Fires: Turret gun"), each with
  the tweak's options. No covered mounts: one line "No guns fitted" (for kind gun; a general
  "Nothing it applies to is fitted" for others).
- The designer's program editor (`src/designer/`) keeps `each` when it saves and shows it; a
  select of part kinds (or none) to edit it.
- Saving: picks already save with the pilot (`ship.tweaks`, `sim.ts` ~3351) and survive death.
  Picks for mounts the current hull doesn't have are kept, not pruned, so a hull swap back
  finds them.

### 2. The four programs: `src/programs.json` (*built*)

Prices and tiers are proposals, to be tuned by play and by the bot's report.

| id | name | short | price | tier | needs | tweaks |
|---|---|---|---|---|---|---|
| `turretTracking` | Turret tracking | `trk` | 250 | 0 | targeting | — |
| `autoMine` | Auto-mine | `mine` | 400 | 1 | targeting | Shoots at; Fires (each gun) |
| `faceTarget` | Face target | `face` | 300 | 1 | targeting | — |
| `autoMine2` | Auto-mine II | `mine2` | 750 | 2 | targeting | Shoots at; Fires (each gun) |

- Descriptions in the voice of the others, short, no spoilers beyond what the item does.
- Icons: the usual program colours; glyph picked in the designer (an existing glyph is fine).
- Auto-mine II doesn't need Auto-mine. If both are loaded, II rules and plain Auto-mine does
  nothing (proposal). Each keeps its own picks.

### 3. Shooting gun by gun: `src/sim.ts` (*built*)

Today every working gun fires together on one ship cooldown, waiting on the slowest
(`fireShots`, ~line 6576).

- Give each gun mount its own cooldown (proposal: `ship.gunCooldowns: Map<MountId, number>`,
  ticked down where `ship.cooldown` is now). Not saved, as `cooldown` isn't.
- **Space held: exactly as today.** Every working gun fires together and they wait on the
  slowest, which sets every gun's cooldown. Manual fire overrides auto-mine for that tick.
- **Space not held, an auto-mine program loaded and working:** for each covered gun mount whose
  "Fires" pick is On, whose module works, and whose cooldown is done, fire that one gun if it is
  likely to hit a rock it may shoot (below). Its own cooldown follows its own rate (`gun2` or the
  standard rate, as in `fireShots`).
- Split `fireShots` so one function fires one mount's shot; both paths use it, so shot spawn,
  range (`turretRange` for the turret gun) and events stay one piece of code.

**Rocks it may shoot:** rocks in `ship.targets` (`sim.ts` ~176), in list order (primary first).
With "Shoots at: Primary only", just `targets[0]`, and only if it's a rock. Never ships, stations
or loose items.

**Likely to hit, Auto-mine** (proposal): with the gun's world direction `d` (ship angle plus
`turretAngle` for the turret gun, or the mount's facing), the rock's centre is ahead along `d`,
within the gun's reach (shot speed × shot life, × `turretRange` for the turret), and its distance
from the line through the gun along `d` is under the rock's radius.

**Likely to hit, Auto-mine II** (proposal): the same check, and also: shots carry the ship's
velocity (`fireShots` adds `ship.vx, ship.vy`), so relative to the ship a shot flies at shot speed
along `d`. Take the rock's position relative to the ship plus its relative velocity
(`rock.v − ship.v`) times the flight time (distance along `d` / shot speed). Fire only if that
predicted spot is still within the rock's radius of the line and within reach.

**Never through a ship** (proposal, both versions): hold a gun's fire when a ship (not the
player's own) lies on its line closer than the rock, within that ship's radius. Rocks only must
not turn into hitting a trader that drifted across.

### 4. Turret tracking: `src/sim.ts` (*built*)

In `turnTurret` (~line 5525): when Turret tracking is loaded and working and there is a rock to
track, the turret turns toward it instead of `ship.aim`. Otherwise `ship.aim` as today (the mouse
in the game, the bot's aim in a run).

- The rock to track (proposal): the first rock it may shoot (same list and "Shoots at" rule as
  section 3, read from the loaded auto-mine program; without one, the primary if it's a rock)
  that is within the turret gun's reach. None in reach: the primary rock, so the turret is
  already turned when it comes in reach. No rock picked: the mouse.
- It turns at the turret's normal speed toward the rock's current spot. No leading (*decided* for
  Auto-mine II: it holds fire, it doesn't aim ahead; the turret follows the same idea).

### 5. Face target: `src/sim.ts` (*built*)

Each tick for a ship with Face target loaded and working, when nothing else steers (*decided*):

- no click order running (`clickPilot.active` false) and no autopilot course;
- no turn input from the pilot this tick (`controls.turn` is 0; held turn keys always win);
- not docked or docking;
- the primary target is a rock.

Then it turns the nose toward the primary rock's current spot, using the turning thrusters the
ship owns, the way the click pilot's face hold does (`orderFace` → `clickPilot.face`, ~line
2428), and settles there. Reuse that turning code; don't require the `clickTurn` program. It never
thrusts. Turning stops when the nose is within a small angle (proposal: the click pilot's own
settle tolerance).

### 6. The bot and the measurement: `src/bot/` (*built*)

The bot (`src/bot/`, from `docs/no-player-runs-plan.md`) is in the working tree, uncommitted at
the time of writing. Build on it as it stands.

**The floater journey** in `src/bot/plan.ts` becomes (*decided*: Auto-mine after Targeting, with a
computer step for the room; Turret tracking right before Auto-mine):

| Step | Own | Why |
|---|---|---|
| 1 | `bay` | The small bay holds 10 ore |
| 2 | `turret` | Shoot without turning the slow hull |
| 3 | `tractor` | Ore comes to you |
| 4 | `targeting` | Pick the rock |
| 5 | `flightComputer` | The basic computer runs 2 programs; the journey needs more |
| 6 | `turretTracking` | The turret aims at the picked rock |
| 7 | `autoMine` | The trigger finger goes: the gaps should open here |
| 8 | `largeBay` | Longer gaps between trips home |
| 9 | `navComputer` | Six programs: the next step fills it exactly |
| 10 | `clickRoute`, `starmap`, `autopilot` | Click the map to go home |

Auto-mine II and Face target are not on the floater journey (*decided*): the turret already
tracks, and II pays off on fast-moving targets. They are racer-track material, tested here by
unit tests and by hand.

Update the journey table in `docs/no-player-runs-plan.md` to match.

**How the bot plays with them** (proposal):

- With Turret tracking working, the bot stops setting `ship.aim` itself.
- With Auto-mine working, the bot stops setting `controls.fire`. Its mining loop becomes: park
  beside a cluster of rocks in reach, pick them (`boxTargets` or `selectTarget`, logged as one
  input), then wait while the hold fills, re-picking only when no picked rock is left in reach or
  the hold is full (go home as today).
- The bot leaves the tweaks at their defaults. Add `setTweak` to its allowed calls (and to the
  allowed-list test) so later runs can change them.

**The report** (`src/bot/log.ts`) adds (*decided*):

- inputs per hour **before and after Auto-mine** was first working, as two numbers;
- the **longest quiet gap after** Auto-mine: the road's "minutes between decisions";
- the same as flat keys in `--json` (proposal: `inputsPerHourBeforeAutoMine`,
  `inputsPerHourAfterAutoMine`, `longestGapAfterAutoMine`). Absent when the run never got there.

## Edge cases

- **A picked rock breaks:** its pieces take its place in the queue (already built); auto-mine
  and tracking simply see the new list.
- **The primary isn't a rock** (a ship, a station, ore): with Primary only, auto-mine holds; with
  Any picked, it shoots other picked rocks. Face target and Turret tracking skip it, and the
  turret falls back to the next rock, then the mouse.
- **A gun broken or destroyed:** it isn't covered (no working module), so it neither fires nor
  shows a row. Its pick is kept for when it's repaired.
- **The computer goes down** (`programSlots` is 0 when it doesn't work): no programs run, so
  nothing auto-fires or turns. Space still fires.
- **Not enough slots:** the program is owned but not loaded, so it doesn't run. The bot logs it
  as a refusal, as the no-player plan says.
- **Docked, or wrecked and rebuilding:** nothing fires or turns.
- **Space held with auto-mine on:** manual wins for that tick; all guns fire as today.
- **Face target and the spin stabilizer, Retro, click orders:** Face target yields to any order and
  to the pilot's turn input; it doesn't fight the stabilizer, it uses the same turn control.
- **A rock outside the lock range** drops out of the targets (already built), so auto-mine stops
  shooting it.
- **The watch switch** (`?dev`, bot plays): unchanged; the bot simply uses the programs it owns.
- **Other ships:** the code reads the ship's own programs, picks and targets, so any ship could
  use it later. Only the player has targets today.

## How we'll know it works

**Unit tests** (a new `src/automine.test.ts`, which builds a `Sim`, so add `automine` to the slow
exclusion list of `test:fast` in `package.json`):

- A per-mount tweak: `readTweaks` accepts `each: "gun"` and rejects an unknown kind; `pickOf`
  reads On for an unset mount, the stored pick for a set one; `setPick` with and without a mount;
  a save round trip keeps per-mount picks (in `save.test.ts`).
- Auto-mine fires a gun lined up on a picked rock, with Space not held, and doesn't fire:
  without Targeting loaded, at a picked ship, with that mount's Fires set Off, at a non-primary
  rock under Primary only, or when a ship sits on the line before the rock.
- Two guns, one lined up and one not: only the lined-up one fires, each on its own cooldown.
- Space held: the shots and their timing match today's for a two-gun ship (check against a
  snapshot of the current behaviour taken before the change).
- Auto-mine II: a rock crossing the line fast is fired at by Auto-mine and held by II; a rock
  drifting slowly is fired at by both.
- Turret tracking turns the turret to the picked rock and back to `ship.aim` when no rock is
  picked; without the program it follows `ship.aim` as today.
- Face target turns the nose to the primary rock when idle; does nothing while a click order
  runs, while a turn key is held, or when the primary is a ship.
- `src/bot/bot.test.ts`: once Auto-mine works, the bot never sets `controls.fire`; the allowed
  list includes `setTweak`.

**In the game:** a floater with turret, Targeting, Turret tracking and Auto-mine: box a few rocks,
take your hand off the mouse and keyboard, and watch the turret work through them while the
tractor brings ore in. Set the turret gun's Fires to Off in the tweak menu (I, right click the
program) and it stops. On the racer with Face target and Auto-mine: pick a rock, let go of the
keys, and the nose swings onto it and the gun fires; touch a turn key and you have the hull back.

**The bot:** `npm run bot` (in the background, it's slow, as the parity checks are) runs the new
journey; the report shows steps 5 to 7 bought and fitted, inputs per hour dropping after
Auto-mine, and a longest gap that is the first measured "minutes between decisions". Write the
numbers into the Progress table of `docs/idle-mining-road.md`; they never gate done.

## What changed from the plan

Built 2026-11-23. Where the code differs from the text above:

- **Journey step 10 is the system chart and the autopilot, without the route planner.** The route
  planner left the journey later on 2026-11-20 (commit d01bed8: it only routes click moves, and a
  course routes itself). With it gone, the navigation computer's six slots fill exactly: click to
  move, Targeting, Turret tracking, Auto-mine, chart, autopilot.
- **A per-mount tweak covers mounts with a *working* part**, not just a non-destroyed one, so a
  broken gun neither fires nor shows a row, as the edge cases say. Its pick is kept.
- **"Likely to hit" takes the rock's near edge within reach**, not its centre: a big rock whose
  edge the shot reaches is fired at.
- **An auto-mine shot also holds Space's shared wait**, so a press of Space right after doesn't
  double the rate of fire. Space held is unchanged, checked against a snapshot of the old code.
- **Auto-mine II judges a ship in the way against where the rock will be**, not where it is (from
  the review).
- **`gunCooldowns` goes into saves**, since a save keeps the whole ship (so does `cooldown`). It's
  harmless, and an older save gets an empty one from the load's template.
- **Face target** sets the turn for its tick only and puts the pilot's controls back after, so a
  pilot's key is never mistaken for its own turn on the next tick. Its hands are a `FacePilot`
  (`src/pilot.ts`) reusing the shared turning code; `src/farside.ts` lists it as flown wherever
  its ship is.
- **The bot** picks with `selectTarget` alone (no box): one pick per rock, the pieces join by
  themselves. While any rock it picked is within its close firing distance it waits, with no
  moves, turns or fetches; with Turret tracking it stops turning the hull under the turret, and
  stops setting the aim. `selectTarget` and `setTweak` are on its allowed list.
- **Icons:** Turret tracking uses the turret glyph, both auto-mines the gun glyph (II marked
  "II"), Face target the turn glyph.

## Not in this build

- **Played by hand:** the "In the game" checks above are for the user.
- **The bot's numbers** go in the Progress table of `docs/idle-mining-road.md` once a run lands.

## Next, not in this step

- **Auto-targeting** ("Picks its own work", road step 2): the ship chooses the next rock by your
  priorities. On today's small rocks Auto-mine empties a picked cluster in seconds; that step is
  what stretches the gap.
- The racer track, where Face target and Auto-mine II get their real test.

## Not doing

- No firing at ships, stations or loose ore, even when picked. A combat auto-fire is a later,
  separate program.
- No aiming ahead (leading) in any of the four programs.
- No module tweaks: tweaks stay on programs. Per-mount tweaks are a program's tweak that repeats
  over mounts.
- Face target never thrusts and never fights an order or the pilot's turn keys.
