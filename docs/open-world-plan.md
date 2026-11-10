# Open world plan

A plan for moving the game from one sector to a seamless world of stars, planets and moons.
Written 2026-11-10 for an implementing model that has not seen the conversation behind it.
Read it all before starting. Work the phases in order.

## 1. What the user wants

- Stars with planets, planets with moons, and places (stations, fields and others) around them.
- Travel exactly as today: burn, counter-burn. No map change, no loading screen, no jump drive.
- Places move closer and farther apart over time, so the surroundings change.
- Ships fly between places to do their work.
- The camera can jump to a ship or place anywhere in the world. A short delay is fine.
- The world can't be simulated in full everywhere, so detail must switch with distance from
  the camera. **The bar is plausibility, not exactness.** The user's own example: "If I was at
  station A with 20 ore and saw a ship moving towards it, jump to a different system and back,
  I am OK seeing 15 ore in the station and a ship carrying 5. Not the station having 200 ore
  or the ship not being anywhere in sight."

### Decisions the user made

| Topic | Decision |
|---|---|
| Trip times (floater engine, about 84 units/s²) | Moon to moon about 1 min, planet to planet about 5 min, star to star about 25 min |
| Distances that follow | Moons about 100,000 apart, planets about 2 million, stars about 50 million |
| Scope of the engine | Built and tested for about 10 stars, 5 planets each, 1 to 3 moons each |
| Scope of the delivered world | Home star fully furnished (about 5 planets, 10 moons, 15 to 20 places), plus a second, sparser star to prove the crossing. More stars are content, not code |
| Full detail | Only around the camera. Everything else, the player's own parked ship and drones included, runs in a cheaper mode |
| Jump targets | Any ship or place |
| Kinds of place | Today's kinds (mining station, asteroid field, pirate base, field deposit), a trade hub and a factory. Room for more kinds later |
| Stability | Not promised. Places may run dry or die. Places must be able to appear and disappear while the game runs (colonisation is a later feature, not in this plan) |
| Unseen pirates | Losses are real at every level of detail, by a plausible rule |
| Levels of detail | Three: full, an in-between level for recently seen surroundings, and a simple level once enough time has passed that a jump back can't look strange |

### Standing rules of this project

- Nothing comes from nowhere. If you can follow it, it holds up. Known holes are listed, not hidden.
- The user notices motion without a visible cause. Honest physics beats a smooth fake.
- Dozens of fully real ships, not thousands. Cheap ships may number in the thousands.
- The simulation runs independently of the display, at any time speed, for hours unattended.
- Game commands stay usable by tests and by LLMs (see the `window` commands at the end of `src/main.ts`).
- Balance is not your job. Add tuning values with sensible defaults and leave balance to the user.

## 2. The code today

- `src/sim.ts` (2,600 lines): one `Sim` class stepping everything at 120 Hz (`TICK`). It owns
  exactly one `field`, one `station`, an optional `pirateBase`, and the station's state as
  loose fields (`stationAccount`, `stationOre`, `stationParts`, `blueprints`, `blueprintPaid`,
  `blueprintsOrdered`, `lostTraffic`, `haulerTimer`, `hauler`), plus `pirateOre`, `deposits`,
  `batteries`, `rocks`, `ores`, `shots`.
- `Poi` already has a `parent`, moves on a fixed circle (`movePoi`) and carries nearby bodies
  (`carry`, `carryShares`). Velocities are relative to whatever carries the body. This is the
  seed of the whole design and must be kept.
- `src/pilot.ts`: `DronePilot` (miners: drones and traffic), `FighterPilot` (pirates and
  defenders), `ClickPilot` (the player's click orders). They read `sim.station`, `sim.field`,
  `sim.rocks` and so on directly.
- The `Hauler` is not a `Ship`. It is scripted: it appears `HAULER_APPROACH` away, docks,
  trades ore for parts and blueprints, and vanishes at `HAULER_GONE`.
- `src/render.ts` draws the one sector and its edge markers. `src/chatter.ts` is radio lines.
- Tests: about 95 in `src/sim.test.ts` and 28 in `src/pilot.test.ts`, with about 300
  references to `sim.station`, `sim.field` and friends. They are the safety net.
- `src/economy/` is a separate flow calculator (`npm run economy`). `probes/` holds one-off scripts.

## 3. The design

### 3.1 Three words

- **Body**: a star, planet or moon. It only moves and is drawn. It has no gameplay of its own.
- **Place**: something ships go to. It has a kind, a parent (a body or another place), state and
  a position on a fixed path around its parent. Today's `Poi` becomes a place.
- **Agent**: the lasting record of a ship and what it is doing. It exists at every level of
  detail. The `Ship` with physics exists only while the agent is in full detail.

### 3.2 Paths are a function of time

Every body and place has `parent`, `orbitRadius`, `orbitPeriod`, `orbitPhase`, and for places
`rotationPeriod`. Its position at time `t` is computed, not accumulated:

```
angle(t) = orbitPhase + 2π · t / orbitPeriod
pos(t)   = parent.pos(t) + orbitRadius · (cos angle, sin angle)
```

This lets anything ask where a place will be at arrival time, and lets unseen parts of the
world skip ticks without drifting. `movePoi` currently adds to `orbitAngle` every tick;
replace that with the formula (keep `px`, `py`, `prevRotation`, `turn` for the live code that
needs per-tick deltas). Stars do not move.

Suggested starting numbers, all tunable or in the world file:

| Thing | Orbit radius | Period |
|---|---|---|
| Planet around star | 2 to 10 million, about 2 million between neighbours | 20 to 60 hours |
| Moon around planet | 60,000 to 300,000, about 100,000 between neighbours | 2 to 6 hours |
| Place around moon or planet | 5,000 to 30,000 | as today (15 to 60 min) |
| Star to star | about 50 million | fixed |

Coordinates reach about 3×10⁸. Doubles are exact enough there (steps of about 6×10⁻⁸). Two
things must be checked: the renderer subtracts the camera position in JavaScript before it
hands numbers to the canvas, and nothing compares positions with a fixed tiny epsilon.

### 3.3 Carrying, extended to a tree

Keep the rule "a body is carried by what it is near, and its velocity is relative to its
carrier". Extend it from a flat list to the tree:

- Every node has a zone radius. Places keep `reach` plus the existing blend ranges. A moon's
  zone is about 50,000, a planet's about 400,000, a star's is everything nearest to it.
- A body is carried by the deepest node whose zone contains it, blending toward the parent
  across the edge of the zone exactly as `carryShares` blends today.
- Inside a star's zone and outside any planet's, nothing moves the body: deep space is at rest.
- Only work out carriers for the nodes near the live area (section 3.5), not for the whole world.

`poiFullRange` and `poiNoneRange` default to `Infinity` today, which means "the nearest place
carries everything, however far". That cannot stay the default in a big world. Give zones
finite sizes in the world file, and keep the old behaviour available for the existing tests.

### 3.4 Places

One `Place` record with a `kind` and kind-specific state. Kinds in this plan:

| Kind | State | Notes |
|---|---|---|
| `field` | rock counts by size, loose ore count, inflow rate, radius | Individual rocks exist only in full detail and in a remembered scene |
| `station` | credits, ore, parts, blueprints, paid and ordered blueprints, lost traffic list, turrets | Everything that is `station*` on `Sim` today moves here |
| `pirateBase` | ore | `pirateOre` moves here |
| `deposit` | ore, parts built in, turrets | Already a placed thing. Its parent is a field |
| `hub` | credits, ore, parts, blueprint catalogue | New. One per star. Where haulers are based |
| `factory` | credits, ore, parts, work rate | New. Turns ore into parts over time |

Rules:

- Places live in a map by id. `world.addPlace` and `world.removePlace` work at any time, and
  no code may assume a fixed set or a fixed count of any kind. A place can be `dormant`.
- A **cluster** is the set of places that share a parent body, for example the station, field
  and pirate base around one moon. Miners, pirates and defenders belong to a cluster through a
  home place and a work place. Nothing else is special about a cluster.
- **Every transaction is one function used at every level of detail**: selling ore, buying a
  part, repair, rebuild, blueprint funding, a hauler's trade, a factory's conversion. Only
  movement, mining and fighting are approximated when unseen. Pull these out of `Sim` into
  plain functions over place and agent state (`src/world/trade.ts`).

Hub and factory, kept small:

- Haulers are based at a hub and fly real routes: hub to station (ore back, parts and ordered
  blueprints out), hub to factory (ore out, parts back), and one long hub-to-hub route between
  the two stars. They no longer appear from nowhere or vanish.
- The factory converts ore to parts at a fixed rate and ratio. That replaces the off-screen
  conversion the hauler implied until now.
- The second star has a hub and no factory, so it depends on the long route. That is on
  purpose: it shows the multi-star flow and the instability the user accepts.
- Remaining holes, to list in the code where they sit: blueprint money ends at the hub with
  nothing to spend it on; the hub and factory start with stock and credits from nowhere.

### 3.5 Three levels of detail

| Level | Where | What runs | What is kept |
|---|---|---|---|
| **Live** | Within the live radius of the camera's focus | Today's simulation at 120 Hz: thrusters, collisions, shots, rocks, pilots | Everything |
| **Remembered** | Left live less than `sceneMemorySeconds` ago (start with 600) | The coarse simulation (below) | The scene as it was: each rock, each piece of loose ore, each ship's last position and velocity, with a timestamp |
| **Summary** | Everywhere else | The same coarse simulation | Counts and agent states only |

The important choice: **there is only one unseen simulation, not two.** The in-between level is
the coarse simulation plus a kept scene. When the camera returns, the scene is brought up to
date from what the coarse simulation did in the meantime, instead of being built fresh. This
gives the user's three levels with one set of unseen rules to write, test and tune, so pirates
have one plausible system when unseen rather than two that can disagree.

**Live area.** A circle around the focus: things enter at 40,000 and leave at 60,000, so
nothing flickers at the edge. A field is in if any part of it is. Ships enter and leave one by
one; places enter and leave with their rocks. Nothing may appear or vanish within sight: the
radius is far larger than the largest view, and a test must hold the zoom cap to that.

**Going from live to remembered** (the camera left):
1. Each ship's pilot state becomes an agent step with an honest estimate of what is left
   (section 3.6): "flying to the dock, 14 s to go", "mining, 6 of 10 aboard".
2. Rocks, loose ore, and ship positions are stored relative to their carrier, with the time.
3. Shots are dropped. Fights in progress become a coarse fight at the stage they were in.

**Coming back to a remembered scene:**
1. Rocks drift on from their stored velocity, kept inside the field.
2. Ore the coarse simulation mined is taken out of real rocks: first the rocks miners were
   working on, then the ones nearest to them, breaking big rocks into smaller ones so the
   counts by size match the field's summary.
3. Loose ore the coarse simulation collected is removed, nearest to the collectors first.
4. Ships are placed from their agent step (section 3.6), not from their old position.
5. Pilots are created in the state that matches the step.

**Going from remembered to summary** (time ran out): the scene is thrown away. Loose ore goes
into the field's loose ore count. Nothing else changes, because the summary was the truth
all along.

**Going from summary to live**: rocks are placed from the field's counts using a random
generator seeded from the place id and the time, loose ore is scattered near where it was
last produced or evenly, ships are placed from their steps.

**The ledger.** Add `world.ledger()`: total ore (in rocks by size, loose, in holds, in every
pile), total parts, total credits. Changing the level of detail must not change the ledger by
a single unit. This is the test that enforces "nothing comes from nowhere".

### 3.6 Agents and steps

```ts
interface Agent {
  id: string; name: string;
  role: "miner" | "pirate" | "defender" | "hauler" | "player";
  model: ShipModel; parts: PartId[]; hull: number; ore: number; partsCargo: number;
  credits: number; ownerId: string | null;
  homeId: string;            // where it sells, repairs, is rebuilt
  workId: string | null;     // the field it mines or hunts in
  marked: boolean; wanted: boolean;
  step: Step;                // what it is doing now
  // plus the counters Ship has today: earned, upkeep, trips, wrecks
}

type Step =
  | { kind: "travel"; toId: string; from: Spot; startedAt: number; arrivesAt: number }
  | { kind: "mine"; fieldId: string; spot: Spot; rate: number }
  | { kind: "dock"; placeId: string; until: number }      // selling, repairing, buying, loading
  | { kind: "patrol"; placeId: string; spot: Spot }
  | { kind: "fight"; fightId: string }
  | { kind: "flee"; toId: string; from: Spot; startedAt: number; arrivesAt: number }
  | { kind: "idle"; spot: Spot };
```

`Spot` is a position relative to a place or body, so it stays valid as things move.

- A step is the shared language between levels. Live, a pilot carries it out with thrusters
  and reports when it is done. Unseen, the coarse simulation finishes it by clock and rule.
  Deciding the next step ("hold is full, go sell", "pirate sighted, flee", "hull low, repair")
  is one function used by both: `nextStep(agent, world)`. Today that logic is spread through
  `DronePilot` and `FighterPilot`; move the deciding out and leave the flying in.
- **Every step maps to a position at any time**, which is what makes a jump back plausible:
  - `travel` and `flee`: along the line from `from` to where the target will be at
    `arrivesAt`, following the burn and counter-burn profile (distance covered goes with the
    square of time in the first half, mirrored in the second). `src/world/legs.ts` holds the
    duration and the position along a leg. Duration from distance `d` and acceleration `a` is
    `2·√(d/a)` plus a fixed allowance for turning and docking.
  - `mine`, `patrol`, `idle`: at `spot`, moved a little by a slow seeded wander.
  - `dock`: at the place's dock.
  - `fight`: near the victim.
- All state is plain data and refers to things by id, never by object. A save later becomes
  "turn everything live into remembered, then write the world as JSON". Saving is not part of
  this plan, but do not rule it out.
- The player is an agent too. When the camera is elsewhere, the player's ship holds its step
  (usually `idle` or `dock`) and is subject to the same rules as any ship.
- Haulers become agents with a route. In live they keep today's scripted approach and docking
  (`moveHauler`), starting from where their leg actually brings them in.

### 3.7 The coarse simulation

`src/world/coarse.ts`, stepped once per game second for every agent and place not live.
It must stay simple. Per tick:

- **Travel**: arrive when the clock passes `arrivesAt`, then ask `nextStep`.
- **Mining**: add ore at `rate`, taken from the field's counts (loose ore first). The rate
  comes from the ship's gear and how many rocks the field has left. Full hold or empty field
  ends the step.
- **Docking**: run the same transactions as live, at the same per-second rates.
- **Places**: station spending, blueprint queue, project building, pirate base spending,
  factory conversion, field inflow. These already run on rates; reuse the functions.
- **Sightings**: a pirate patrolling a field may spot a miner carrying ore there (or a marked
  one), with a chance per second from the vision range against the field's size. Miners spot
  pirates the same way and flee, as they do live.
- **Fights**: a fight is a record with attacker, victim and a stage. Every few seconds it
  applies expected damage with a random spread: from the attacker's gun and hit rate, reduced
  while the victim flees, plus turret fire when inside turret range, plus a defender once it
  has travelled there. It ends by death, by the victim reaching the dock or the guns, or by
  the hurt attacker breaking off under the same hull rule as live. Death runs the same wreck
  code as live: ore dropped into the field's loose ore, rebuild on credit or loss for good,
  marks cleared.
- The aggro rules (marked, wanted, grudges) are decided by the same functions as live.

**Rates come from measurement, not guesses.** Write `npm run calibrate`: it runs the live
simulation headless for the standard sector and prints mining ore per second by gear,
average docking time, pirate hit rate against fleeing and fighting targets, and spotting
frequency. Put the results in one table (`src/world/rates.ts`) with a note of the command
that produced them.

### 3.8 Camera and jumping

- `world.focus` is an agent id, a place id, or a free point. The view follows it.
- `world.jump(target)` sets the focus, turns everything outside the new live area into
  remembered scenes, and brings the new surroundings to live. Aim for under 100 ms.
- The player's controls only act while the focus is the player's ship.
- Interface for now: a plain list in the tab menu of places and ships to jump to, a key to
  return to the player's ship, and `jump`, `places`, `agents` on the `window` commands.
  A map is a separate later feature. Do not build one.
- Edge markers: show the places of the current cluster, the bodies above it, and a chosen
  destination, not all places in the world.

### 3.9 Travel for the player and pilots

- Pilots get "travel to a place": aim at where the place will be on arrival (work it out from
  the path formula, repeating two or three times until the arrival time settles), burn,
  flip, counter-burn, and hand over to the existing approach near the place.
- The player gets the same as an order (`orderTravel(placeId)`) through `ClickPilot`, when
  the ship has the click parts. Flying it by hand must work with no extra help.
- At the midpoint of a star crossing a ship moves about 65,000 units a second, or about 540 a
  tick. Collision sweeps already exist; add a test that a ship at that speed cannot pass
  through a rock or a station.
- Time speedup already exists (`timeScale` in `main.ts`). Check the frame loop cannot fall
  into a spiral when many ticks are owed; cap ticks per frame.

### 3.10 Bodies on screen

Stars, planets and moons are drawn as large discs under the play area and are not solid.
Ships fly over them. This avoids route planning around bodies and wrecking on a planet in a
first version. Gravity, landing and solid bodies are later ideas the design must not block:
keep a radius on every body.

## 4. Files

```
src/world/world.ts      World: clock, bodies, places, agents, focus, step(), ledger()
src/world/paths.ts      position of any node at any time
src/world/def.ts        types for a world definition; classicWorld(tuning); loading
src/world/home.ts       the delivered two-star world, as data
src/world/generate.ts   seeded generator for a ten-star world (tests and stress only)
src/world/trade.ts      every transaction, as plain functions
src/world/agents.ts     Agent, Step, nextStep()
src/world/legs.ts       leg duration and position along a leg
src/world/coarse.ts     the unseen simulation
src/world/detail.ts     live <-> remembered <-> summary, scene keeping
src/world/rates.ts      measured rates for the coarse simulation
src/world/calibrate.ts  npm run calibrate
```

`Sim` stays as the live layer: it holds the ships, rocks, ore and shots that are live, and
steps them as today. `World` owns `Sim`. `new Sim(seed, tuning)` with no world given builds
`classicWorld(tuning)`, which is exactly today's sector, so existing tests and the game keep
working. Keep `sim.station`, `sim.field`, `sim.pirateBase`, `sim.stationOre` and the rest as
accessors that mean "the cluster the player is in".

## 5. Phases

Each phase ends with all tests passing, the game playable, and a commit. Do not start a
phase before the one before it is committed. Stop and ask the user after phases 2, 4 and 5:
they will want to play it.

### Phase 0: start clean
The working tree had uncommitted changes on `drones-and-parts` when this was written
(`chatter.ts`, `main.ts`, `pilot.ts`, `pilot.test.ts`, `sim.ts`, `tuning.ts`, `probes/`).
Ask the user whether they are finished before doing anything. Then branch `open-world`.

### Phase 1: places become things (no change in behaviour)
- Move station, field, pirate base and deposit state into `Place` records in a map.
- Pull transactions out into `trade.ts`.
- Pilots take `homeId` and `workId` instead of reading `sim.station` and `sim.field`.
- Chatter, hauler, turrets and blueprints refer to a given place.
- Keep the old names on `Sim` as accessors.
- **Done when**: every existing test passes unchanged, and a new test builds two clusters
  200,000 apart, each with its own traffic, and each station's ore, credits and blueprints
  move independently over 30 minutes. (Everything is still live. That is fine for now.)

### Phase 2: bodies, paths and distance
- `paths.ts`, the tree of carriers with finite zones, the world definition, `classicWorld`.
- A small test world: one star, two planets, three moons, three clusters.
- Renderer: camera-relative drawing, body discs, markers by relevance.
- Travel for pilots and `orderTravel` for the player.
- **Done when**: flight tests pass unchanged at an offset of 2×10⁸; a floater pilot flies moon
  to moon in 60 to 90 s and planet to planet in 5 to 7 min and docks; a ship drifting in deep
  space is not moved by anything; the fast-collision test passes. Still all live.
- **Ask the user to play it.** This is the first time the game is bigger than one sector, and
  what travel feels like decides whether the distances in section 1 are right.

### Phase 3: agents, steps, hub and factory
- `Agent`, `Step`, `nextStep`. Pilots carry out steps and report completion.
- Haulers as agents on routes. Hub and factory places and their transactions.
- **Done when**: existing tests pass; a hauler leaves the hub, trades at a station and returns
  with the ledger unchanged apart from the trade; the factory turns ore into parts; with all
  haulers removed, stations run out of parts and say so. Still all live.

### Phase 4: the coarse simulation and switching detail
Start with the cheapest test of the whole idea, before building the switching:
- Write the coarse simulation and `calibrate` for today's sector only. Run 2 hours, 8 seeds,
  live against coarse, player parked. Compare medians of ore delivered to the station, trips
  per ship, ships lost, and station credits.
- **If the coarse simulation cannot be brought within about 30% of live on those medians by
  measured rates alone, stop and tell the user.** Do not add special cases to force it.

Then:
- The live area, scenes, the four transitions in section 3.5, `world.focus`, `world.jump`,
  the jump list.
- **Done when**:
  - The ledger is identical before and after every transition, in a test that jumps back and
    forth 50 times at random moments.
  - The user's example passes as a test: a station holds 20 ore, a miner with 5 is inbound;
    jump to the other star for 60 s and back; the station's ore plus the miner's ore is
    still 25 less anything provably spent, and the miner is docked or within its expected
    path. The same after 30 minutes, with the totals explained by the ledger.
  - Returning within the memory time finds a rock the player left untouched in the same
    place relative to its neighbours; returning later than that is free to differ.
  - Nothing enters or leaves live within the largest possible view.
- **Ask the user to play it**, and to try to catch it out.

### Phase 5: unseen fights and losses
- Sightings, fights, fleeing, turrets, defenders and wrecks in the coarse simulation.
- Extend `calibrate` and the comparison to losses, with pirates at caps 1, 2 and 3.
- **Done when**: over 2 hours and 8 seeds, ships lost and ore taken by pirates are within
  about a factor of 1.5 of live; a fight left in progress continues when the camera leaves
  and is found at a believable stage (or over, with a wreck's ore in the field) on return;
  the player's parked ship can be lost while unseen, and is safe when docked.
- **Ask the user to play it.**

### Phase 6: the delivered world and the stress test
- `home.ts`: home star with about 5 planets, 10 moons and 15 to 20 places, including a hub and
  a factory; second star with a hub, two or three clusters, no factory. Hand-placed. The
  player's start is one cluster of the home star, set up as today's sector.
- `generate.ts`: 10 stars, 5 planets each, 1 to 3 moons each, a cluster at about half the
  moons. Used only by tests.
- **Done when**: the generated world runs one game hour unseen in under 2 s of real time; a
  jump anywhere takes under 100 ms; 8 game hours of the home world unattended finish without
  errors, with the ledger changing only through the listed holes; frame rate in the home
  cluster is no worse than before the change.

## 6. Not in this plan

A map. Saving and loading. Colonisation and new stations being built. Gravity, solid bodies,
landing. New ship types. Taking control of other ships. Balancing the economy. Any change to
how flying feels. If one of these seems needed to finish a phase, stop and ask.

## 7. Working rules

- Commit each finished, passing change yourself with a plain message. Never push.
- Run `npm test` and `npm run build` before every commit.
- Existing tests are the safety net: change one only when its meaning has truly changed, and
  say so in the commit.
- New values go in `src/tuning.ts` with a line in the tab menu, as the others do.
- When a choice changes what the player sees or feels and this plan doesn't settle it, ask the
  user one question at a time. Expect them to push back on anything that looks faked.
- Choices made here without asking the user, which they may overturn: bodies are not solid;
  one unseen simulation with a kept scene rather than two unseen simulations; scene memory of
  10 minutes; live radius of 40,000 to 60,000; the second star has no factory; the player's
  unattended ship is as exposed as any other.
