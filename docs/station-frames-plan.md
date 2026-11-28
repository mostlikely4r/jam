# Station frames plan

Written 2026-11-27, from the spec A talk (Q-47, backlog S-78). It builds steps 1–2 of
`docs/roadmap.md`: the move from proof of concept to framework (`docs/framework.md`, `AGENTS.md`
Architecture) starts with the things that stand still. Step 1 is built; the rest is not yet.

## Why

Today a station is a node in `src/designer/world.json` (`kind: "station"`) that holds everything
at once: its place (an orbit), its carrying field, its body (the station's position and spin *are*
the POI's), what it does (`shipyard`, `storage`, `projects`, `radio`, `guard*`) and its shop lists
(`unlocked`, `wanted`, `programs`, `hulls`). Its look is code (`Renderer.drawStation`), and the dock,
refinery pad, block pad and hauler berth are offsets written in `src/sim.ts` (`DOCK_OFFSET`,
`REFINERY_OFFSET`, `BLOCK_PAD`, `HAULER_BERTH_X`). The pirate base and the clamp tow's field deposit
are the same kind of thing written three more ways.

The materials flow (factory stations, holes, lanes) needs stations that are made from pieces, not
from code. The premise is the user's own call from the roadmap talk, not a play finding: entities
are data, behaviour comes from parts, systems ask about capabilities (*decided*). The plan doesn't
rest on a guess about fun: every step must **play the same**, and tests say so.

## The picture

Items marked *decided* are the user's calls. The rest is my proposal.

**Frames**

- **One frame type for ships and stations** (*decided*). A station's frame is a hull in
  `src/hulls.json`, drawn in the hull designer. Everything else snaps onto its mounts as parts
  (*decided*).
- **One frame per station; no frames snapped onto frames** (*decided*). An upgrade is a part on an
  outside mount. The frame you draw decides where pieces can go, which gives the Lego feel without
  free snapping.
- **Growing means swapping to a bigger frame, and the swap is built, not bought** (*decided*,
  pillar 1). The new frame starts as a construction site and is built piece by piece from delivered
  goods; shrinking is a take-apart that gives some goods back. The swap itself is a later build; this
  plan makes construction generic so the swap can use it.
- **Three entities in this build** (*decided*): today's station, the pirate base and the field
  deposit. The deposit is a mini-station: storage, ore in and out, its own turrets, built from
  blocks. The factory station, the first *new* entity, waits for spec B1 (Q-48).
- **Converted exactly first** (*decided*). Each of the three becomes shapes on its frame with a
  looks-the-same test against today's drawing, the way Q-17 did the hulls and Q-36 the cockpits.
  The user redraws them in the designer afterwards.
- **Frames carry a "used by" flag for this** (proposal). `HULL_USES` (`src/fitting.ts`) gains
  `station`, `pirate base` and `deposit`. A frame flagged so shows up in the system designer's frame
  picker for that node and never in the ship shop or the start menu. These flags are stored today
  but barely read; this makes them matter.
- **The hull designer zooms out to station scale** (proposal): a station is about 300 across against
  a ship's 20. No new page.

**Place and body**

- **The place is the designer's desired spot on the orbit** (*decided*). You place a station in
  the system designer and its orbit is where it *should* be. The place stays on its rails and is
  never pushed.
- **The station is an entity anchored to its place** (*decided*), with an **offset** from it,
  zero for now. Nothing can push a station yet (ship collisions are parked, S-19), so the offset
  exists in the data and nothing changes it. Station-keeping thrusters, a part that burns fuel and
  pushes the offset back to zero, come when something can push a station.
- **Carrying belongs to whatever is the frame of reference there** (*decided*). A field's carrying
  stays on its place: it has no single body to follow, its rocks are many and get mined and towed.
  A station's, the pirate base's and a deposit's carrying sit on the body: centred where the body
  actually is and turning with its spin, so a pushed station takes its field along and no invisible
  field stays behind. The carrying code (`Sim.carry`, the `Carriers` table) asks "what carries
  here?" and gets places and bodies alike.
- **The spin moves to the body** (proposal). Today the node's `spinPeriod` turns the POI. After the
  split the body spins itself at the same period and phase, so it looks the same.
- **The deposit's spot stays the project's choice** (proposal): `Sim.depositSpot` picks where it
  goes, as today; that spot is its place. Placing a construction site by hand in the designer is
  later.
- **What points at a station points at the body** (proposal): the dev map, the home arrow, the
  starmap, targeting and the autopilot's ring. Today body and place are the same point, so this is
  a rule for later, written into the code now.
- **A world node names its frame** (proposal). The node keeps the place: orbit, desired spot, name,
  owner. It points to a frame by name (`frame`). Copies of a node share the frame.

**Parts**

- **Every capability is a part** (*decided*). A part that isn't there *is* the empty value: the
  pirate base has no refinery part, not a refinery set to 0. No entity carries fields for things it
  doesn't do.
- **Full parts**, the ones the three entities differ in, get real data:
  - **Dock**: where ships dock and how (the station's dock box beside its body, the pirate base's
    round docking zone of `PIRATE_BASE_RADIUS`). The deposit has none.
  - **Storage**: counted items, in a size. The station's `ore` and `stock` maps and its `storage`
    cells (lockers and the store of whole modules), the pirate base's `pirateOre`, the deposit's
    `ore`. The numbers stay as today.
  - **Trade point**: one part with data, not four pieces of code. It lists which items it buys and
    which it sells: the station buys ore and sells to its hauler; the pirate base buys ore from
    pirates; the deposit buys ore from miners and sells it to ships (`depositPays`, `depositSells`,
    `depositCapacity`, `depositReach` in the tuning). Prices stay as today's code: spec C (Q-49)
    rewrites pricing.
  - **Turrets**: the station's and the deposit's batteries (`Battery`, ids `stationGuards`,
    `depositGuards`). The node's `guardCount`, `guardArc` and `guardDistance` (read in
    `src/designer/link.ts`, the tuning's `stationGuard*` without them) become turret mounts on the
    frame at today's positions.
- **Thin parts**, the ones only one entity has today, wrap what exists (*decided*): their presence
  switches the capability on, they hold just what the node holds now, and the code behind them stays.
  The station's **shop** (`unlocked`, `wanted`, `programs`, `hulls`, starting `items`), **refinery**,
  **repair**, **shipyard**, **projects** and **radio**; the pirate base's **black market**. Each one's
  real redesign waits for the spec that owns it: the refinery for B1 (it is a factory), the shop for
  spec C and hull buying, the shipyard for Q-19, the radio for the face cast.
- **Thin parts are marked for their current owner** (*decided*). The designer refuses to fit a thin
  part to any other frame ("station only for now"). The spec that redesigns a part lifts its mark.
- **Pads and berths are mounts** (proposal). The refinery pad, the block pad, the hauler berth and
  the black market's berth become mounts on the frame at exactly today's offsets, read by the code
  that uses those constants now. The constants go.

**Who**

- **Every entity has an owner** (*decided*): another entity (a station owns its deposit; a ship
  owns its drones; a station owns its hauler) or, at the top of the chain, an **agent**.
- **An agent is whoever decides** (*decided*): the player or a faction. It has no body and no
  behaviour in this build; it is where the chain stops. The AI that flies a ship or runs a station
  belongs to that entity, as programs and code; the owner only says on whose behalf. Chains can't
  loop: nothing ends up owning itself.
- **In this build the owner is read for money only** (*decided*): whose account pays. Hostility,
  bounties and defence stay as they work today (`ship.faction`, `ship.owner`, the pirate checks).
- **The deposit is owned by its station and shares that station's account** (*decided*). Its ore
  stays its own (storage is per entity); its credits flow through the station, as today. An account
  can point at its owner's, so spec C can split them when it decides who pays for haulers.
- **Agents and accounts today** (proposal): agents `player`, `stations` and `pirates`. The station's
  account is `Base.account`, the pirate base's is `Sim.pirateCredits` moved into an account, the
  deposit's is its station's. Ships get an `owner` read from their existing links (a drone's
  `owner`, a hauler's base, a pirate's home base, the player's ship to `player`, traffic to its home
  station), without moving where those are stored.

## The question

**Can the three things that stand still in the world be rebuilt from a frame and parts, with
nothing in play changing?**

**It fails if** a test of today's play has to change to pass, or the thin parts leak "this is the
station" checks into the new systems. If a step can't be made to play the same, stop and bring it to
the user rather than change the play.

## The build

Each step plays the same, passes the full check and is committed on its own. No step stops for
the user to try: the checks are tests, and the Try it below is one look at the end.

### 1. Place, body and frames

*Built* 2026-11-27. What differs from the steps below, and why:

- **Place and body.** A station's and the pirate base's body is a `FrameBody` (`src/sim.ts`): a
  `Poi` with its `frame`, its `place` (a `Place` on the rails) and an `offset`. `Base.poi` is now
  `Base.body`, so everything that read a station's position reads the body. The body keeps its
  place's `orbits` and `rings` as the rails it's anchored to; `poiAt` adds the offset. Carrying
  needed no change of its own: it reads the bodies where it read the station POIs.
- **What frames hold.** The station's and the deposit's frames are their decks (a body rect and a
  rim rect at width 3). The pirate base's frame is bare (a 16-sided outline at its zone radius,
  no shapes): all it ever drew was its docking ring and its ore, which are part art. What shapes
  can't carry stays code in `src/stationArt.ts`, as each part's art: the dock's box (dashed, and
  brighter while docked), the deposit's trading ring and the pirate base's docking ring (dashed),
  the ore pile and crates (they grow with what's stored), the station's tank, and the construction
  site (an outline dashed, the deck filling from the bottom). No shape field was added.
- **One reader fix.** A rim shape of any kind now keeps its `width` from the file, as
  `ArtShape.width` always said; only rim polygons, open lines and arcs kept one before.
- **Frames are hulls, not ships.** `isFrame`, `shipModels()` and `framesFor(use)` in
  `src/fitting.ts`. The ship lists (station hull lists, the dev hull switcher, the shop) read
  `shipModels()`; tests that listed every hull as a ship do too.
- **The node's `frame`** is written after `kind` for stations and pirate bases only. The deposit
  has no node, so it draws from `DEPOSIT_FRAME`; its own `frame` comes with step 4.
- **State lights:** a station draws with `stationArtState` (`src/artState.ts`): its approach is the
  nearest ship closing on its dock, by `closingDistance`.
- **Tests:** `src/stationArt.test.ts` (the old drawing as a fixture, played through a recorder that
  compares what's painted after every transform) and `src/frames.test.ts`.

- `src/hulls.json` gets three frames, `station`, `pirateBase` and `deposit`, with `usedBy` set to
  the new uses. Their shapes are today's drawings converted exactly: `Renderer.drawStation`,
  `drawPirateBase`, and `drawDepositFrame` (including the deposit half built, which draws by
  `partsUsed / (partsUsed + partsLeft)`). Where the old drawing changes with state (the deposit
  growing, damage or anything else it reads), the shape fields from Q-36 and Q-38 carry it, or a
  part's art does; if one can't, say so in the Built note rather than invent a field.
- The world node for a station or pirate base gets `frame`, defaulting to the frame above, and the
  system designer shows a frame picker filtered by `usedBy`. `src/designer/link.ts` (`stationsFor`,
  `pirateBaseFor`) passes it through; `npm run world` writes it in the file's key order.
- The sim splits each `Poi` that is a station or the pirate base into its place (orbit, rails) and a
  body (frame, offset, spin, carrying). Deposits already stand at a spot by a POI, so their spot is
  their place. `Poi` keeps serving fields unchanged. The carrying code reads carriers as "places and
  bodies that carry".
- `Renderer` draws the three from their frames. The old drawing code moves into the test file as a
  fixture.
- Everything that read the station's position or spin from its POI reads the body.

### 2. Capabilities as parts

*Built* 2026-11-27. What differs from the steps below, and why:

- **Frame parts are their own list, not ship parts.** `src/frameParts.ts` holds the kinds (dock,
  storage, trade point, turret battery, and the thin shop, refinery, repair, shipyard, projects,
  radio and black market), each with its data, its mount type and its `onlyOn` mark. Ship parts
  (`PARTS`, `PartId`) are items with prices and icons that shops list; putting a dock among them
  would leak into every shop and item check. A frame mount names its part in `framePart` and its
  data in `data` (`src/hulls.json`); `resolveParts(frame, overrides)` is what an entity has.
- **Where the parts live.** A station's and the pirate base's body (`FrameBody.parts`) and a
  deposit (`Deposit.parts`, always its frame's; a save's are re-read from the frame on load).
- **Storage holds capacity, not yet the contents.** The ore and stock maps, `pirateOre` and the
  deposit's ore stay on the entity where they were; moving them into the part is churn for no
  play, and the Saves section's move waits for the step that changes the save anyway.
- **The node's overrides are keyed by mount id** (`WorldNode.parts`, `StationSpec.parts`): an
  entry fits a part with data over the frame's, `null` empties the mount. The designer edits a
  station through `stationSettings` / `writeStationSettings`, which write only what differs from
  the frame; a world with the old loose fields reads into overrides that say the same, and
  `npm run world` rewrote the shipped file (same settings for all three stations, checked).
- **Pads and berths are mounts with no part.** The refinery pad, block pad and hauler berth on the
  station frame, the black market's berth on the pirate base's, at the old numbers (the black
  market uses its berth's distance out, along its lane, as before). The constants are gone;
  `HAND_OVER_REACH` (300) keeps the places that used the dock's length as a reach, not a place.
- **What reads the parts:** docking (`docks`, `dockedAt`, the pirates' ring, the pilots' berth
  and pad checks), the shop lists, storage, shipyard, projects, radio, turrets (count, arc,
  distance, and a battery only where a battery part is), the refinery (a refinery part and a pad),
  repair (a station's repair part; pirates are patched up at their base as before), haulers (a
  trade point that sells ore and a berth), every ore sale (a trade point that buys it), what a
  shop sells (nothing without a shop part, even what it had unlocked) and the black market (it
  only calls at a pirate base with its part).
- **The tuning still stands in** where a place says nothing of its own: storage cells, turrets'
  numbers, and the shipyard switch. A station's turret numbers now follow the tuning sliders
  unless its node sets its own; before, a world node fixed them at the defaults.
- **The hull designer** shows a "Frame comes with" picker on a frame's mounts: every frame part,
  the refused ones greyed with the reason ("Station only for now").
- **Plays the same:** the hour of warm-up `npm run world` runs for `src/start.json` came out
  identical to before, field for field, apart from the new `parts`.
- **Tests:** `src/frameParts.test.ts`. Tests that built stations from loose fields pass them
  through `placeParts`; tests that used `DOCK_OFFSET` read the frame's dock mount.

- New mount types in `mountTypes`: dock, storage, trade, turret battery, refinery pad, block pad,
  berth, and one per thin part (shop, refinery, repair, shipyard, projects, radio, black market).
- New part kinds with their data as listed under **Parts**, fitted to the three frames' mounts as
  their defaults. The node fields they replace (`shipyard`, `storage`, `projects`, `radio`,
  `guardCount`, `guardArc`, `guardDistance`, `unlocked`, `wanted`, `programs`, `hulls`, `items`)
  move into the parts' data. Where a station node needs its own values (two stations sell different
  things), the node holds per-place overrides for its frame's parts, not loose fields.
- Systems ask for the capability: docking asks "what has a dock?", hauler trade asks "what has a
  trade point that buys this?", turrets ask for batteries. `sim.station` (the first station) stays
  only where it means "the first one", as today, never as "the one with a shop".
- Thin parts carry an `onlyOn` mark (the frame use they're limited to); the designer refuses a fit
  elsewhere, and the sim never sees one.
- `DOCK_OFFSET`, `REFINERY_OFFSET`, `BLOCK_PAD`, `HAULER_BERTH_X` and `BLACK_MARKET_BERTH` become
  the positions of mounts on the frames, at the same numbers.

### 3. Owner and account

*Built* 2026-11-28. What differs from the steps below, and why:

- **Where owners live.** `src/owners.ts` has the agents, `Owned` (an id, an owner, an account of
  its own or `"owner"`), the loop check and the walk up a chain to the first own account. A base
  carries `owner: "stations"` beside its `account`; a deposit and a battery carry `owner` (the
  station for a deposit and the station's turrets, the deposit for the deposit's turrets) and use
  their owner's account. The pirate base is the entity `"pirate base"`, owned by `pirates`; its
  account is `Sim.pirateAccount`, and `pirateCredits` reads and writes it (the save keeps the same
  key, so nothing saved changed shape and the bump waits for step 4).
- **Money through the owner:** `Sim.accountFor` gives a project's or the pirate base's account.
  The deposit's sales and purchases, the block deposits held while a block is carried and given
  back, and the pirate base's sales (ore to ships, the black market's share) go through it. All
  of them resolve to the account they used before, so the money is the same.
- **Ships:** `Sim.ownerOf(ship)`: `player` for the player's ship, a drone's owner ship, the pirate
  base for pirates, the home station for defenders and traffic. A hauler is its base's by being
  `base.hauler`; nothing reads it yet. Ships keep their accounts as they were (`accountOf`).
- **The loop check** runs on a save as it is loaded, before anything is read into the world. A
  world node names no owner yet (every station is the stations'), so a world can't loop.
- **Tests:** `src/owners.test.ts`.

- An `owner` on every entity: another entity's id or an agent (`player`, `stations`, `pirates`).
  A check refuses a loop when a world or save is loaded.
- An `account` that is either its own (`{ credits }`) or its owner's. The station keeps
  `Base.account`; the pirate base's `Sim.pirateCredits` becomes its account; the deposit uses its
  station's.
- Money paths (`sellToDeposit`, the deposit's purse and block pay, the pirate base's sales) pay
  through the owner's account. Nothing else reads the owner yet.
- Ships expose an owner read from their existing links, as under **Who**.

### 4. Construction, from the deposit's

- The deposit's construction (`partsLeft`, `partsUsed`, `purse`, `blocks`, `paid`, block jobs,
  `finishDeposit`) becomes the generic way any frame or part is built: a frame or a part **under
  construction** with N blocks to go, funded by its owner's account, filled by delivered blocks, and
  open once the last one is placed. A frame with no parts built is a construction site: it exists and
  is owned, but can't dock, store or trade.
- The deposit and both turret batteries go through it with today's block counts and prices
  (`depositParts`, `stationGuardParts`, `depositGuardParts` and their prices in the tuning). The
  testing switch (`depositFree`) keeps working.
- In this build construction is always "N blocks". B1 gives each frame and part a real recipe.

### Saves

`SAVE_VERSION` goes from 11 to 12. Old saves load into the new shape (proposal): a base's `ore`,
`stock` and lockers go into its storage part, `pirateOre` and `pirateCredits` into the pirate base's
storage and account, and a deposit or battery in an old save becomes an entity or part under
construction with its blocks so far, its purse and its paid amount. The bump lands in the step that
first changes what's saved.

## How we'll know

- **Looks the same**: for the station, the pirate base, and the deposit at 0, half and fully built,
  the fixture drawing and the frame drawing make the same canvas calls (to 1e-4, as in
  `src/hullShapes.test.ts`).
- **Plays the same**: the existing suites pass without their expectations changing, in particular
  `stations.test.ts`, `blocks.test.ts`, `tow.test.ts`, `hullbuy.test.ts`, `shop.test.ts`,
  `save.test.ts`, `farside.test.ts` and `sim.test.ts`. A test may change only where it reached into
  a removed field or constant, never where it checks behaviour.
- **New tests**:
  - Carrying: a station body given an offset carries from where it is and turns with its spin; a
    field's carrying stays on its place.
  - Capabilities: a frame without a dock part can't be docked at; a deposit with a trade point buys
    ore from a miner and sells it to a ship at today's prices; a frame without turret mounts gets no
    battery.
  - Thin parts: fitting a shop to the deposit frame is refused in the designer's fit check.
  - Owner: a loop is refused on load; the deposit's sales and block pay move the station's credits.
  - Construction: a turret battery and a deposit built through the generic path take the same
    blocks and money as before; a construction site can't trade or dock.
  - Saves: a version 11 save with a deposit half built loads, finishes building with the right
    number of blocks, and keeps its ore and purse.
- **No-player run**: `npm run parity` (background, log to `docs/parity-log.md`) shows the same
  credits, stock and traffic curves as before the change, within the run's usual noise.
- Full check: `npm test`, then `npm run build`.

**Try it:** `npm run dev`, play a few minutes: dock, sell ore, take a block job, watch a hauler and
the pirates. It all looks and works as before. Then open the designer (`?dev`), Hulls page: the
station, the pirate base and the deposit are frames you can zoom out to, with their dock, pads,
berths and turrets as mounts. Try fitting a shop to the deposit: it's refused. On the system
designer, pick the station node: it shows its frame, and the shop lists sit on its parts.

## Needs first

- Hull shapes with kinds, gradients and live shapes (Q-36, Q-38): built and passed 2026-11-26.
- The clamp tow's blocks and deposit (Q-22): built 2026-11-24.
- Hull "used by" flags (`HULL_USES`, `HullInfo.usedBy` in `src/fitting.ts`): stored and partly read
  today.

## Not in this build

- Swapping a station to a bigger or smaller frame (the build and take-apart phases).
- Anything that pushes a station, and the station-keeping part.
- A station moving to a new orbit for good (towed by tugs one day).
- Placing a construction site by hand in the system designer.
- Lifting a thin part's mark, and the real redesign of the shop, refinery, repair, shipyard,
  projects, radio and black market (each in its own spec).
- Owners read for anything but money: hostility, bounties, defence, who pays a hauler (spec C).
- Recipes for frames and parts (spec B1), and new stations (B1, then step 9 of the roadmap).
- Inside or outside as a property of a mount: `docs/framework.md` names it, nothing reads it yet.
- Station parts on ships (a dock or shop on a moving ship): the model allows it, nobody needs it
  yet.
- Redrawing the three frames: the user's, in the designer, once this is built.
- **State lights on stations** (live shapes, slice 2, `docs/live-shapes-plan.md`): shapes can be
  driven by an `ArtState` snapshot (approach, running low and more). A station's snapshot — its
  `approach` as the distance to the nearest ship closing on its dock, by that plan's rule — is
  made by this build, since that slice landed first (Q-59, 2026-11-27): call `closingDistance`
  (`src/artState.ts`) for each ship against the station's own dock and keep the nearest; set the
  station's snapshot with `setArtState` around its drawing, as `Renderer.drawShip` does. Until
  then a station draws with the state null, so its lights rest or follow their clock.

## Not doing

- **Every entity carrying every field, zero where unused.** That is the type check in disguise;
  a missing part is the empty value.
- **Splitting fields into place and body.** A field has no body to follow; it stays a place that
  carries.
- **Free snapping of frames onto frames.** One frame per entity; growth is a frame swap.
