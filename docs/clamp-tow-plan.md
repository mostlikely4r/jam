# Clamp tow plan

Written 2026-11-23, from a talk with the user. A new module, the clamp, holds one outside object
and the ship flies the pair on its own thrusters. The user's main reason is building: later, a
station sells a construction block, pays a hauler to place it, and the build grows from what was
carried (pillar 1, and the candidate target "your work becomes something" in `docs/vision.md`).
Other uses named: towing a stranded ship home for repair, and much later moving a station.

The first slice, *decided* by the user as the cheapest test: **towing a whole asteroid to a
station, for more ore than mining it would give.** It needs nothing the game doesn't already
have (rocks, stations, ore, thrusters), and answers whether towing feels good before anything is
built on it. Built and approved 2026-11-24 (step 1). The second slice (safe towing, tow traffic,
and blocks for the base's projects) starts at "Second slice" below, steps 2 to 4, unbuilt.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

**Towing**

- **A clamp module grabs one object in short range, and you fly the pair on your own thrusters**
  (*decided*, the user's idea). In this slice the object is a rock.
- **Physics sets the limit, not a size rule** (proposal). The rock's mass adds to the ship's
  weight, so a big rock makes the ship slow to speed up, slow to stop and slow to turn. With fuel
  on, the same trip burns more of it. No extra rule needed.
- **The realism is seen, not necessarily felt** (*decided*, the user's words). A towed rock gets
  hurt like the ship does, and a hard bump has consequences. The right systems take care of it:
  with them, the autopilot keeps the load safe and the player need not fly carefully (pillar 2:
  drift, not dance).

**Where the bonus comes from** (*decided*: option B)

- **Mining stays exactly as it is today.** Its yield, and so the idle mining earnings targets,
  don't change.
- **A whole rock holds more ore than lasers can get out of it.** The difference is the dust each
  laser hit wastes. Only a station refinery, working on the whole rock, gets all of it.
- **A bump breaks the rock** (proposal, following from the above). The pieces are ordinary rocks:
  mine them at the normal yield, or tow the biggest one on. What broke off lost its bonus.

**The hand-over** (*decided*)

- **You release the rock near the station.** The station's own tractor catches it and pulls it
  to its refinery, where it slowly shrinks while ore piles up in the station's stock. You are
  paid as it is processed, and are free to leave the moment you let go (pillar 3).
- **Released too fast or on a bad line, it bumps the station** under the same damage rules, and
  may break. A good autopilot does the hand-over cleanly.

## The question

**Does hauling a heavy rock home feel weighty and satisfying, a calm drift with a payoff you can
watch, rather than a slow chore?**

This rests on a guess: nobody has played it. **It fails if** the trip is just waiting, or keeping
the rock safe feels like a skill test. If it fails, keep the clamp code (blocks need it) and
rethink what is worth towing.

## The build

### 1. Clamp, tow, release, refinery (*built 2026-11-24*)

The smallest version the player can try, flown by hand. Built in `src/sim.ts`, `src/parts.ts`,
`src/items.json`, `src/hulls.json`, `src/tuning.ts`, `src/render.ts`, `src/main.ts` and
`src/designer/world.json`, with `src/tow.test.ts` beside them. What differs from the plan:

- **The key is `G`** as proposed. It was the dev bot's key, so the bot moved to `J`.
- **The catch only takes a rock that was let go of** at some point (`rock.releasedBy`, which also
  names who the refinery pays). That is what keeps a caught rock's broken pieces from being
  caught in their turn, and a rock nobody ever towed is left as it was.
- **The refinery's record keeps the rock's tier and outline**, not a `kind`: it's drawn as the
  same rock, shrinking by the square root of the share left.
- **The caught rock's approach is steered**, not just pulled: its speed is turned toward the
  refinery spot with no more than `catchPull` of acceleration, at a speed that falls off near the
  spot, so it lands slowly and a rock let go fast still can't be stopped in time.
- **The clamp is sold wherever a station sells the tractor** (`unlocked` and `wanted` in
  `src/designer/world.json`), so it's a swap on the same mount.
- A held rock that runs into something knocks the pair and the other thing apart by their masses:
  other rocks, ships, stations and solid ground, its path swept as a fast ship's is, so nothing is
  stepped over at speed. It takes the bump's damage; the ground that kills takes it as it takes
  loose ore. A caught rock's bump on the station's box is worked out along its path the same way.

**After the first play** (user's notes, 2026-11-24). The hand-over surprised them, and a rock let
go of in the dock got stuck; the refining read as a rock shrinking, with no clear credits.

- **The refinery pad is drawn**: a dashed ring beside the station, on the side away from the dock,
  with a cross on it, and the catch's reach ringed while there's a rock to hand over. It's the
  spot the rock is worked on, so where to hand one over is seen. It shows only while the clamp
  holds a rock, so it's not litter on every station; and it steps out of the way while the
  station's hauler is parked on it, since the berth is on that side too.
- **The catch goes round the station**, not through it: a rock let go of on the dock side is
  steered round at its own distance until the pad is in line, instead of being pulled into the
  station's box over and over. That pulling-into-the-box loop was the "stuck" one.
- **The clamp takes a caught rock back**: `G` works on a rock the catch has, whatever speed it's
  at, so a hand-over that goes wrong is never a dead end.
- **Letting go says what happens**: "Station is taking it in", "… is still working one: it drifts
  on", or "Nothing here takes it: it drifts", as a short word over the ship.
- **The credits are heard and seen**: each ore the refinery pays out makes a soft dock-sale sound
  and floats its credits up from the pad, and the station tooltip gives what's left at the price
  ("Refinery: 9 ore at 10 each"). The shrinking rock, the growing ore pile and these three together
  are the payoff, until the laser and ore flow below.

**The clamp module** (proposals throughout this step).

- A new part `clamp`, kind `tractor`, so it takes the tractor mount: towing or collecting ore is a
  choice of fit, not both. Floater only for now (the floater is the slow hauler; the racer can get
  it later). Sold where the tractor is sold. Defined in `src/parts.ts` and `src/items.json` like
  the tractors, with an icon. `tractorOn` must not count it as a tractor.
- **Grab:** with the clamp fitted, a key (proposal: `G`, check it's free in `src/main.ts`) grabs
  the nearest rock whose edge is within `clampRange` (tuning, proposal 40) of the ship's edge and
  whose speed relative to the ship is under `clampSpeed` (proposal 30). Too fast: refused with a
  short message. The same key releases.
- **Held:** the rock sits at a fixed distance in front of the clamp mount, rigidly, and turns with
  the ship. The pair moves as one body. The rock's mass, `radius² / 400` as in `resolveImpact`,
  times `towMassScale` (tuning, proposal 1), adds to `shipWeight`. Since `shipResponse` divides
  all thrust by weight, the pilot code in `src/pilot.ts` (braking, click move, autopilot) takes
  the heavier ship into account without changes. On release the rock keeps the ship's velocity at
  its spot.
- **A held rock leaves its field.** Mark it (`rock.held = "tow"`). Held, caught or refining rocks
  are never contained in a field, never counted as strayed (`moveRocks` deletes strayed rocks),
  never put to sleep with a field (`sleepFields`), and not picked by auto-mine or anyone's guns'
  targeting. A rock released out in the open, not caught by a station, is an ordinary stray from
  then on.
- Rendering in `src/render.ts`: the rock where it is held, and a short clamp arm drawn from the
  mount to it.

**Bumps** (proposal).

- The held rock now collides with other rocks, stations, solid bodies and ships (today rocks
  touch only ships). Use the closing speed as `bounceOff` does: over `safeImpactSpeed`, the rock
  takes `damagePerSpeed × over` from its `hp`, scaled by `towDamageScale` (tuning, proposal 1).
  At 0 hp it breaks through `breakRock`, with its normal ore rolls. The clamp keeps the biggest
  piece if it is in clamp range, otherwise lets go. The bump also pushes the pair, using the
  combined mass.
- A rock touching deadly ground is destroyed, like loose ore.

**Whole-rock value** (*decided* in principle, numbers proposed).

- A rock's true ore is its expected mining yield times `wholeRockBonus` (tuning, proposal 2).
  Expected yield, from `breakRock` today: tier 0 gives `oreChance`; tier t gives
  `(t + 1) × oreChance` plus 2.5 pieces of tier t−1. At `oreChance` 0.45 that's about 0.45, 2.0
  and 6.4 for tiers 0, 1, 2. Work it out from the tuning (a pure function with a test), don't
  hard-code it.
- No hidden extra item: it is plain ore, `item: "ore"`, entered in the ledger with `flow` as it
  is refined, so nothing comes from nowhere.

**The station catch and the refinery** (*decided* shape, numbers proposed).

- Every base with a station gets a catch: a released rock (not held) whose centre comes within
  `catchRange` (proposal 900) of the station is caught, if the station's refinery is free. Caught
  rocks are pulled toward the refinery spot (proposal: beside the station on the side opposite the
  dock) with an acceleration of at most `catchPull` (proposal 15), so a rock let go fast isn't
  stopped in time. It can then hit the station's box (the same `sweepBox` shape ships hit) and
  take bump damage there. A broken caught rock's pieces are not caught.
- When the caught rock reaches the refinery spot slowly (under `clampSpeed`) it leaves `rocks`
  and becomes the base's `refining` record: `{ ore left, total, radius, kind, owner }`. Owner is
  whoever released it. One rock at a time. A second one coming in isn't caught and drifts on.
- **Refining:** one ore every `refineSeconds` (proposal 4). Each ore goes into `base.ore` as plain
  ore and pays the owner the station's plain ore price, as selling it at the dock would. The drawn
  rock shrinks with what's left (radius by the square root of the share left). The refinery pays
  out from the base's account as a dock sale does. When the base's storage is full (`storageFree`),
  refining pauses and the station tooltip says so (the ore-glut tooltip in `docs/ore-glut-plan.md`
  is the place).
- It runs while the player is away: the base keeps it, not the field, so sleeping fields don't
  touch it. A radio line or news entry when it's done is welcome but not required.
- **Save:** the clamp state (which rock is held) and each base's `refining` go in the save
  (`src/save.ts`), with a round-trip test.

*Played for:* tow a big rock from the home field to the station by hand. Is it weighty and
calm, or slow and dull? Does watching it shrink while the credits come in feel like a payoff?

*Played, 2026-11-24:* weighty enough to try twice. The loop above came out of it, and three of the
notes are fixed (pad, going round, taking it back, the payout's sound and credits). The fourth,
the refinery cutting into the rock with a laser and the ore flowing out, is parked as S-53.

*Played again after those fixes, 2026-11-24:* "looks good". This slice is done (Q-5): hauling a
rock home is worth the trip, and the hand-over reads.

## Second slice: safe towing, tow traffic, and blocks

Written 2026-11-24, from a short talk with the user after the first slice was played and
approved. Nothing in this section is built yet.

**Why.** The first slice answered its question (towing a rock home feels weighty and worth it).
The user asked for the next slice to be *both* halves left open: the autopilot keeping the load
safe (the old step 2), and then the clamp's main reason, construction (*decided*: "both, step 2
first"). Construction is what makes the clamp more than a better pickaxe: a base's projects get
built from blocks somebody really carried out to the site, so you can watch the deposit grow and
know whose trips built it (pillar 1, and the candidate target "your work becomes something").
Traffic does that carrying too, so a base grows while you look away (pillar 3).

### The picture

Items marked *decided* are the user's calls. The rest is my proposal, open to veto.

- **Blocks build today's projects** (*decided*). The field deposit and the deposit's turrets are
  no longer built out of the base's stock where they stand: the base turns its part A into
  blocks at the station, and each block has to be carried to the site and placed there. The
  half-built frame out by the field grows block by block. No new kinds of building.
- **Carrying a block is a paid job with a deposit** (*decided*, the user's idea from 2026-11-23:
  bought for X, placed for X + Y). You pay the block's worth to take it, and get it back with
  pay on top when it's placed. Lose it and the base keeps your deposit.
- **Traffic does the jobs too, and earns by it** (*decided*: "they need a deposit in credits and
  a clamp, but this earns money"). A project never waits on the player; the player taking jobs
  only makes it go faster and earns the pay.
- **A few traffic floaters turn tow ships** (*decided*: "a few turn builder / asteroid hauler").
  One buys the clamp in place of its tractor. From then on it carries blocks when a base has
  them, and otherwise tows whole rocks home to the refinery, as the player does since slice 1.
  The clamp is both, which is why one ship does both.
- **Safe towing is a program you buy** (proposal, from the old step 2). With it loaded the
  autopilot keeps a towed load from bumping hard and does the hand-over itself. Tow traffic buys
  it before it buys the clamp, so the ships you watch don't smash their loads.

### 2. Safe towing: the `towControl` program

The smallest piece the user can try, flown by the player's own autopilot. It also is what the
tow traffic in steps 3 and 4 flies with.

- **The program** (proposal): `towControl`, "Tow control", in `src/programs.json` like the
  others (price proposal 400, tier 1, an icon with the existing program colours; glyph: pick or
  add one in `src/glyphs.ts`). Takes a computer slot. Bought from a blueprint like any program.
- **Its rule** (proposal): while the ship holds something in its clamp and the program is
  loaded (`ship.programs`, not only owned), every autopilot move (click move, click route,
  travel to a place, the `ClickPilot` in `src/pilot.ts` and `DronePilot` alike) caps its speed
  so that it could stop, at the braking it really has with the combined weight, before
  anything solid ahead: rocks, ships, stations, deposits, bodies. Closing speed on a contact
  then stays under `safeImpactSpeed` (90). Braking already uses the heavier weight through
  `shipResponse`; check it holds on long routes, where the ship is fastest.
- **Room for the load** (proposal): `routeAround` and `cornerToward` treat the ship plus its
  load as one wider body (the held rock's far edge from the ship's centre), so the corners round
  bodies and rocks leave room for it. Without the program nothing changes from slice 1.
- **Deliver** (proposal): with the program loaded and a rock held, clicking a station (or a
  station in the map) means "deliver": fly to the refinery pad's side (`refinerySpot`), come
  inside `catchRange` on a clear line, stop under `clampSpeed`, and release. If the refinery is
  still working a rock, wait beside the pad, holding the rock, and release when it's free
  (pillar 3: you can look away). The short word over the ship says "Waiting for the refinery".
  A normal click elsewhere cancels the delivery and keeps the rock.
- **Manual flight is untouched**: the program only governs the autopilot. Flying by hand you can
  still smash a rock (pillar 2: skill optional, never required).

*Played for:* buy the program, clamp a big rock, click the station and look away. Does it arrive
whole every time, and is the drift home calm, not slow to the point of dull?

**Stop here for the user to try.** Steps 3 and 4 lean on this autopilot; if it's not right yet,
fix it before traffic flies it.

### 3. Tow traffic: a few floaters haul whole rocks

- **Who turns** (proposal): traffic floaters (`DronePilot`, `buys === "upgrades"`, model
  `floater`) only. At a dock, a floater that has already bought everything ahead of it in its
  list rolls `towShipChance` (tuning, proposal 0.25) once per stay; on a hit, `towControl` and
  then `clamp` join the end of its wishlist (`TRAFFIC_BUY_ORDER` in `src/parts.ts` stays as it
  is; the tow pair is per ship). Buying the clamp swaps out the tractor through the normal
  fitting code (the tractor goes to the base's locker or is sold back, whatever buying a
  replacement does today). Cap: at most `towShipShare` (proposal 0.2) of a base's traffic is tow
  ships, so the belt never empties of miners. A tow ship stays one for good.
- **What a tow ship does** at each dock stay, in order: repair as today; a block job if a base
  in reach has one and it can afford the deposit plus `trafficBuffer` (step 4); otherwise a rock
  run. Its task word says which ("towing", "carrying a block").
- **A rock run** (proposal): it picks a field the way `chooseField` does, flies there, and picks
  the biggest rock it can clamp that isn't targeted, held, or picked by another tow ship. It
  comes alongside under `clampSpeed`, grabs (the same `grabRock` path as the player), and
  delivers with `towControl` as in step 2. The refinery pays it as it pays the player
  (`releasedBy`). No rock big enough (tier 1 or more, proposal): it mines a load the slow way,
  with guns and no tractor, and sells it like any traffic.
- **A busy refinery**: one rock at a time per base, as today. A tow ship whose base's refinery is
  taken goes to the next nearest base with a free one, if the trip is under the same cutoff that
  puts traffic off the next station over (`pilot.ts`, the turn-away code); otherwise it waits by
  the pad as in step 2.
- **Fleeing**: a tow ship that flees (`watchForPirates`) lets go of its load first. The rock is
  then an ordinary stray. Pirates don't steal a towed rock (not in this build).
- **Out of view** (proposal, `src/farside.ts` must say it, or `farside.test.ts` fails): a new
  `TripRecord` goal `"tow"`. The record travels to the field, takes one rock from it at arrival
  (from the sleeping field's own list; a field never woken is laid first, as mining one does),
  and travels to the base on the route planner's path with the trip time of the heavier ship
  (the planner gets the combined weight). Records never bump (their routes never touch a body),
  so the rock arrives whole. At arrival it goes straight into the base's `refining` record if the
  refinery is free, or the record waits at the dock until it is. If the camera comes near, the
  record wakes as a flown ship holding its rock (`wakeRecord`), placed by its route as today.
  Update the `towRocks` and `catchRocks` lines in `STEP_PARTS` to match.
- **Save**: a tow ship is a traffic ship with a clamp fitted; nothing new to save except a held
  rock on a traffic ship (`ship.tow`, already saved for the player: check it is for any ship)
  and the new record goal. Bump `SAVE_VERSION` if the record shape changes.

*Played for:* watch the home station for ten minutes. Do tow ships show up, bring rocks in now
and then, and read as purposeful company rather than clutter?

### 4. Blocks: projects built from carried blocks

**Blocks** (proposal throughout, numbers to tune).

- **What a block is**: a new body, not a bay item: a square crate of `blockParts` (tuning,
  proposal 10) part A. It has mass like a tier-1 rock, `hp` like one, and takes bumps under the
  same rules as a towed rock (`towImpact`). Broken, it's gone: debris for show, nothing to mine,
  and its parts are lost. Drawn as a plain square with the base's colour.
- **Made at the station**: a base with a project still building turns spare part A (past
  `stationReserveParts`, as `buildProjects` takes it today) into a block at the station's
  **block pad**, a spot beside the station like the refinery pad (on the dock side, clear of the
  dock's approach; put it in a function next to `refinerySpot`). At most `blocksWaiting`
  (proposal 2) blocks sit at a pad at once. The parts leave the stock when the block is made.
- **A job**: each waiting block is one job: carry it to the project's site, the deposit spot
  (`depositSpot`) or the deposit itself for its turrets. The deposit is the block's worth,
  `blockParts × part A's item price`. The pay is the project's funding shared over its blocks:
  a project's price (`depositPrice`, `depositGuardPrice`) is no longer spent into nothing when
  funded; it is held as the project's **purse** and each placed block pays `price / blocks` from
  it. So the money comes from the base and nothing comes from nowhere.

**Taking a job.**

- **Player**: docked at a base with a waiting block and a clamp fitted, the station screen
  shows the job ("Field deposit: 12 blocks to go. Deposit 120, pays 250") with a "Take a block"
  button. Taking it pays the deposit and marks a block at the pad as yours. Undock, come
  alongside the pad and press `G`: the clamp takes your block as it takes a rock. Someone else's
  marked block can't be clamped.
- **Tow traffic**: at its dock stay, a tow ship takes a job when a base it would trade with has
  one and it can pay the deposit and keep `trafficBuffer` (step 3). It then flies as the player
  would, with `towControl`.

**Placing it.**

- The site has a catch like the station's: a block let go of within `siteRange` (proposal 300)
  of the site, slower than `clampSpeed`, is pulled in gently (reuse the catch's steering), set
  into the frame, and the project's `partsUsed` goes up by `blockParts` (and `partsLeft` down).
  The carrier gets the deposit back plus the pay, with the floating credits and the sound the
  refinery's payout uses. The last block finishes the project (`finishDeposit`,
  `finishBattery`) as today.
- With `towControl` loaded, clicking the site while holding a block means "place": the step 2
  delivery, aimed at the site.
- Let go of too fast or on a bad line, the block bumps the frame and may break under the same
  rules. Let go of anywhere else, it drifts as a stray; whoever takes it back with a clamp can
  still place it, and the pay goes to whoever placed it, the deposit back to whoever paid it.
- `buildProjects` no longer builds the deposit and its turrets from stock. The **station's own
  turrets** (`stationGuards`) stay as today: they stand on the station, so there is no trip to
  make.
- The testing switch (`depositFree`) and projects already part-built in old saves keep working:
  a part-built project just needs the rest in blocks.

**Out of view** (proposal): a new `TripRecord` goal `"block"`: the record takes the block from
the pad at departure, travels to the site, and places it at arrival with the same payout. Blocks
at a pad and on a flown carrier are bodies only while their base is in view; out of view a
waiting block is a number on the base (`blocksReady`). Add both to `STEP_PARTS`.

**Save**: blocks waiting (per base, and whose they are), blocks in the open or held, the
projects' purses. Bump `SAVE_VERSION`, with a round-trip test.

*Played for:* fund the deposit (or let the base fund it), take a block or two yourself, then
leave the area for a while. Do you come back to a deposit further along, built by ships you can
follow? Does placing a block feel like a payoff, like the refinery does?

## How we'll know

- **Unit tests** (`src/tow.test.ts`, plus a new `src/blocks.test.ts`; fast suite where they can
  be):
  - Step 2: with `towControl`, a towed rock flown at a station or a rock field never closes
    faster than `safeImpactSpeed`; without it, slice 1 behaviour is unchanged. Deliver releases
    inside the catch at under `clampSpeed`, and waits while the refinery is busy. The route
    clears a body by the load's radius.
  - Step 3: a floater rolled a tow ship buys `towControl` then the clamp, losing its tractor; the
    share cap holds; a tow ship takes a rock and is paid by the refinery; two tow ships never pick
    the same rock; a fleeing tow ship lets go; a `"tow"` record takes a rock from a sleeping
    field and fills the refinery on arrival; a record woken mid-trip holds its rock.
  - Step 4: a base with a funded deposit makes blocks from spare part A, never past the reserve
    or `blocksWaiting`; taking a job takes the deposit; placing pays deposit plus share, from the
    purse; a broken block keeps the deposit with the base and loses its parts; the last block
    finishes the project; the station's guards still build from stock; a `"block"` record
    places its block; save round trip with blocks waiting, held and in the open.
  - `farside.test.ts` passes with the new step parts and record goals.
- **No-player runs** (background, logged to `docs/parity-log.md`, never gate done): tow traffic
  over an hour, rocks arriving whole (target: all with `towControl`), minutes per delivery, and
  credits per hour for a tow ship against a miner; a deposit funded at the start of a run, and
  how long traffic alone takes to build it (proposal target: under an hour of game time), in
  view and as records (parity: the two within reason of each other).
- **Full check:** `npm test`, then `npm run build`.
- **Try it, step 2:** new game, floater, plenty of credits (dev menu). Buy the clamp and Tow
  control at the home station and load the program. Clamp a big rock in the field, click the
  station and take your hands off. The ship drifts home slow and careful, stops by the pad and
  lets go; the rock goes in whole and credits tick up. Click the station again while it's still
  refining one: the ship waits by the pad.
- **Try it, steps 3 and 4:** start a game with the deposit not built, fund it at the station (or
  give the base the credits in the dev menu and wait). Watch the station: blocks appear on the
  pad, a tow ship clamps one and drifts it out to the field, where the deposit's frame fills in.
  Take one yourself from the station screen, place it, and see your deposit come back with pay.

## Needs first

- Slice 1: clamp, tow, release, catch, refinery, `releasedBy`, `towImpact`: built (Q-5).
- Programs, computer slots and program blueprints (`src/programs.json`, `src/programs.ts`):
  built. Check the floater has a free computer slot for a fourth program at the level traffic
  reaches; if not, `towControl` replaces the least useful one for a tow ship.
- Projects, their frames and `buildProjects` (`src/sim.ts`, `drawDepositFrame` in
  `src/render.ts`): built.
- Trip records, `farside.ts` and its test, `wakeRecord`: built.
- Traffic buying, `wishlistFor`, the fitting swap when a part replaces another: built.
- Fuel: off by default, not needed. If on, towing burns more through thrust time, as in slice 1.

## Not in this build

- Special rocks that only survive whole, and a way to see them (*decided* for later).
- Towing a stranded ship home (think of it with the rescue AI in `docs/fuel-plan.md`).
- Pirates stealing a towed rock or block, or hunting tow ships.
- New kinds of buildings from blocks, a station that grows, building where the player picks.
- The station's own turrets from blocks.
- A laser cutting the refinery's rock and the ore flowing out (S-53).
- The racer's clamp, a stronger clamp, a clamp off the tractor mount.
- Racer traffic as tow ships.

## Not doing

- **Projects that fall back to building from stock when nobody carries.** Traffic carries; a
  project with blocks waiting just waits.
- **Projects that wait only for the player.** Rejected: a base must grow without you.
- **Traffic keeping a tractor and a clamp and swapping per job, or a second mount for the
  clamp.** The user chose a few ships that turn tow ships for good.
- **Making mining worse so towing gets back to today's yield.** Rejected: it would cut idle
  mining income.
- **Docking with the rock attached and being paid at once.** Rejected: the payoff must be seen.
- **Moving stations.** Parked: a late dream on the same mechanic.
