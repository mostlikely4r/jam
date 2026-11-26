# Backlog

<!-- vibeview backlog v1. Format: see vibeview/FORMAT.md. Vision and pillars: docs/vision.md -->

Parked ideas, mostly from 2026-11-04 to 11-20; some have been built since. None are decisions.
S-1 to S-38 moved here from `docs/maybe-later.md` on 2026-11-23, numbered in that file's order.
Check here before calling an idea new, and bring one up only when it bears on the current choice.
Revisits (see `docs/vision.md`) send their leftovers here, as `parked` items.

## S-1 · Click to turn: shared toggle and face on arrival
- status: parked
- area: Movement and aiming

Click to turn is built (right click cancels and turns, left click moves). Still open: making it mutually exclusive with click to move on a shared toggle key, needing the spin stabilizer first, and a way to set "face here on arrival".

## S-2 · Retro as a spin stabilizer upgrade
- status: dropped
- area: Movement and aiming

Retro as an upgrade of the spin stabilizer, or mutually exclusive with it. Retro already includes spin assist in the code.

Dropped 2026-11-26: Retro and Spin stabilizer are separate programs now.

## S-3 · Turret that aims at the mouse
- status: built
- area: Movement and aiming

Turret, user's spec 2026-11-05: aims at the mouse, turns at its own speed relative to the ship (faster than turning the ship, slower if the ship turns the other way). Unsure which gun goes in it, given gun 2's ore effect, or whether it's a new hull that starts with one. Built: turrets aim at the mouse (confirmed 2026-11-26).

## S-4 · Turrets for combat and tracking
- status: built
- area: Movement and aiming

Turrets, earlier: the user says they will exist, just not yet. They rotate fast, so larger slower ships only turn for long distances, and they're a must for combat. They could auto-track the current target (needs target or multi-target selection) or follow the mouse while keys or clicks turn the ship. Built: with the Auto targeting program they track the target (S-63); without it they follow the mouse (S-3). Turrets in combat belong to the hunt work.

## S-5 · Click to move relative to an object
- status: dropped
- area: Movement and aiming

Click to move relative to a clicked object, so it follows a moving rock.

Merged into S-10 (keep at range, orbit) 2026-11-26.

## S-6 · Waypoint queues
- status: parked
- area: Movement and aiming

Waypoints and queues: line up several moves or orders and the ship flies them in turn.

Was "Thrust ramp, front thruster, backward guns, waypoints". Groomed 2026-11-26: the thrust ramp is
built (the Shift throttle), front-only thrusters and backward guns can be made in the hull designer,
the Route planner steers around obstacles; only waypoint queues stay.

## S-7 · Max speed for click to move
- status: built
- area: Movement and aiming

Max speed for click to move, tweakable in an equipment screen. Delivered by S-59 (the top speed tweak).

## S-8 · Radar pulse
- status: parked
- area: Movement and aiming

Radar pulse, raised 2026-11-06: briefly shows relative-motion lines on all nearby rocks, then fades. The same system could ping rich or specific ores. Possible tradeoff: a pulse could give you away to pirates.

## S-9 · Honest stop: throttle, then fuel
- status: built
- area: Movement and aiming

Raised 2026-11-10, after the exact stop shipped: the stop's final settle is a cheat (it eases onto the spot and zeroes speed with no thrust), and the user notices it. The cascade they see: thruster output that scales over time (maybe a shift modifier for fine thrust), the AI using that precise output, the AI needing it (docking), fuel being consumed, then lots of balancing and an open "where does fuel come from". Fuel links to "Fuel and cargo tradeoffs" under Ships and gear. Decided the same day: the cheat bothered the user because nothing visible stopped the ship, not because stopping was free, so only step 1 (a throttle, inspired by KSP) goes ahead. Built 2026-11-10: a Shift throttle and real trim burns. The user approved the base ship's slow settle, with its small turns and a little drift before the final stop. Lesson: the user spots movement that has no visible cause, so honest physics wins over smooth fakes. Fuel is later, not now. The user's reason for it someday: a good coast should be worth something. It punishes the player, who corrects far more than the AI does, but it rewards learning.

## S-10 · RTS-style right click and EVE-style commands
- status: parked
- area: Movement and aiming

From the mouse thread, 2026-11-06: right click read from what's under it (RTS style), shift kept for queueing, EVE-style commands relative to an object (keep at range, orbit).

Includes S-5 (merged 2026-11-26): click to move relative to a clicked object, so the ship follows a moving rock.

## S-11 · Inventory and fitting screen
- status: built
- area: Ships and gear

Inventory and fitting screen: ships have slots, some gear fits only some ships, gear is bought, stored and hauled.

Built since: the inventory and fitting screen (2026-11-13, proper inventory 2026-11-18).

## S-12 · New game with a choice of starting ship
- status: built
- area: Ships and gear

New game with a choice of starting ship. Today it's a panel switch.

Built since: the start menu picks a ship to begin.

## S-13 · Fuel and cargo tradeoffs, drone upgrades
- status: building
- area: Ships and gear

Fuel and cargo tradeoffs, drone upgrades such as cargo. A stronger gun, even though parts should mainly make the game different.

Being built in `docs/fuel-plan.md`: steps 1, 2 and 2b (tanks as modules) are built; step 3, the
supply chain, waits in the queue as Q-7, and step 4, running dry, after it.

## S-14 · Tractor beam balance
- status: parked
- area: Ships and gear

Tractor beam is nearly overpowered: balance its range and cost later, not now.

## S-15 · Recovery from a broken module
- status: parked
- area: Ships and gear

Raised 2026-11-21: a recovery system for a broken module you can't pay to repair. A broken gun or thruster early really kills a run; today the only way out is to wreck yourself and go into debt. Found by the no-player bot (`docs/go-home-broken-plan.md`).

Related (2026-11-26): damage levels (S-50, Q-20) and in-flight repair (S-52) come close, but neither helps a pilot with no credits.

## S-16 · Two more fields
- status: dropped
- area: World

Two more fields of different size, rotation and orbit center, so a crowded field means flying to another. Same arc as pirates: first avoid and hide, later fight or ignore. Dropped 2026-11-26: overtaken by the filled system's 183 fields.

## S-17 · Moving rocks for quick ships, slow for floaters
- status: parked
- area: World

Moving rocks suit the quick ship and slow ones suit the floater, so ships pick different targets. The user sees this as a possible feature.

## S-18 · Rocks and breaking pass
- status: parked
- area: World

Rocks and breaking get their own pass, including a gun that changes how rocks break.

## S-19 · Ship collisions
- status: parked
- area: World

Ships colliding with each other. Maybe later.

Was "Buffer zone, nomadic fields, collisions, money sink" (buffer zone, nomadic fields, ship
collisions, drone tiny-delivery behaviour, a money sink for thin fields). Groomed 2026-11-26:
nomadic fields are built; buffer zone, drone tiny deliveries and the money sink were too vague to
call and are dropped; only ship collisions stays.

## S-20 · Drone score handling
- status: dropped
- area: World

Different handling of drone scores later. Fine as a challenge for now.

Dropped 2026-11-26: too vague to act on.

## S-21 · Travel to a small moon with gravity
- status: built
- area: World

Raised 2026-11-05: travel to a different place, such as a small moon with gravity as a hazard and rocks in orbit. Some gear is only sold in certain places, known through a remote inventory search; the trip itself is safe, and the point is what you see on the way. Built (groomed 2026-11-26): moons, travel, gravity and local gear exist, or can be designed in the system designer.

## S-22 · Chatter
- status: built
- area: World

Raised 2026-11-05: chatter. Traffic shows a circular ping and short text in a corner ("going in to dock", "quiet day in the field"); the station greets you nearby and answers traffic ("Roger, cleared to dock"), with a marker on who is talking. Screen range to receive, except a pirate attack, which sends a long-range "mayday" ping.

Built since: the radio log, with faces and the regulars Gus and Pip.

## S-23 · Haulers
- status: built
- area: World

Raised 2026-11-05: haulers. Big rectangles, as long as the station's storage section and a third as wide, arrive from far away decelerating the whole way, rest beside the station, load ore up to a buffer, pay the station credits, then leave very slowly. Would answer the station's negative credits and its unlimited ore pile.

Built since: haulers run the route and bring fuel in.

## S-24 · Thanks over chatter for picked-up ore
- status: built
- area: World

Raised 2026-11-05: ships thank you over chatter when they pick up ore you broke loose, only when it wasn't near your ship (more like stealing). Lines need care, e.g. "I owe you one".

Built since: traffic thanks you over chatter for ore it picks up.

## S-25 · Unlock tiers
- status: built
- area: World

Unlock tiers, agreed in outline 2026-11-05, not built: the shop opens as haulers buy ore over the game. From the start gun 2 and spin stabilizer; about 100 ore: reverse, strafe, turret; about 300: retro, click parts, drones, and the tractor (the user moved it there as borderline overpowered). The user is sleeping on how the new ship gets a better start without the tractor.

Built (groomed 2026-11-26), in another form: stations have unlocked and wanted module lists and buy a wanted blueprint with their credits, which players can pay toward. Hulls and programs are not in it yet: that is S-65 (Q-32). Includes S-27.

## S-26 · Traffic buying and using a turret
- status: dropped
- area: World

Raised 2026-11-05: traffic buying and using a turret.

Merged into S-49 (AI ships on real hulls) 2026-11-26, as a later step.

## S-27 · Station shop unlocks as haulers buy ore
- status: dropped
- area: World

Raised 2026-11-05, left as my call: the station unlocks what its shop can sell as haulers buy its ore, turning the ore pile into progress. Matches "station components that visibly unlock things" in the direction doc.

Merged into S-25 2026-11-26.

## S-28 · Automatic ship and upgrade runs
- status: parked
- area: Testing

Automatic runs over ship and upgrade combinations that report income, damage and so on. Limited by run time and by what the pilot knows how to use.

Builds on the no-player bot (`docs/no-player-runs-plan.md`, `npm run run`), which plays one track today (2026-11-26).

## S-29 · 100-drone swarm test
- status: dropped
- area: Testing

100-drone swarm test.

Dropped 2026-11-26: the profile scripts cover performance.

## S-30 · Far off: name, worm, pirates and more
- status: parked
- area: Far off

**Far off:** worm, pirates, bosses, frequencies, carriers, modules, remote control, phone peeking. (Groomed 2026-11-26: name (JAM) and planets are done.)

## S-31 · Object loading, unloading and persistence
- status: parked
- area: Far off

Object loading, unloading and persistence (raised 2026-11-07). For now, loose ore is simply deleted once it's far from every POI and every ship. The user's rule: removing things is fine when no one will ever see them or know where they could have been. Hauler removal is fine for now.

See also S-64, Nothing vanishes in view (Q-30).

## S-32 · Inventory key
- status: dropped
- area: Far off

Raised 2026-11-10: an inventory key showing the ship's stuff (cargo, credits, parts) as bars and numbers. Later; for now the screen stays clean. Dropped 2026-11-26: the ship screen (I) shows parts and cargo, and the ship art shows cargo and fuel in flight; credits and fuel in the ship screen are S-76.

## S-33 · Mobile and touch support
- status: parked
- area: Far off

Raised 2026-11-10: mobile and touch support. Today only the start menu works on a phone.

## S-34 · Ring of rocks low over the moon
- status: parked
- area: Raised 2026-11-11

Epic: a ring of rocks low over the moon, inside its pull. Not just richer ore: different materials and "something you can't just find so easy". The user called it "a nice epic". Not now.

## S-35 · Goods flow: what's left
- status: parked
- area: Raised 2026-11-11

What is left of the goods flow brainstorm (raised 2026-11-11, held 2026-11-12). Its three dreams:
visible production (ore smelted into panels you can see, bases molded piece by piece), the shop
treasure hunt (a distant shop sells an item cheap, word travels with ships and goes stale), and other
races that trade differently.

Built since: the shopping trip test (all-round tractor only at Planet base, news boards, radio word;
passed), blueprints per base (unlocked and wanted), the generic item system with recipes, the
refinery and clamp tow. Specced: price by place (S-55, Q-23).

Still open:
- per-item stock and shop markdowns, so bargains appear and last hours;
- blueprints as counted things that change hands, can be looted or truly lost;
- visible production beyond the refinery (S-53 is one piece);
- races that make and trade different things.

## S-36 · Rocks colliding in the live field
- status: parked
- area: Raised 2026-11-11

Rocks colliding with each other in the live field (2026-11-12): affordable once only one field is live, but it changes how mining feels, so it's its own feature.

## S-37 · Expansion as a sim
- status: parked
- area: Raised 2026-11-11

Expansion as a sim (2026-11-13, "that's then, this is now"): the start is one planet; ships (haulers or a new kind) take off and become stations; special stations make traffic and populate nearby fields; ore flows back to the planet to fund the next station further out; maybe the traffic-making bases spread too. The real question behind "where does traffic come from and how does it flow", and the same for bases. Also: a short pre-game simulation so traffic is already en route when the player joins.

## S-38 · Tractor tweak: drag all or targets
- status: parked
- area: Raised 2026-11-11

Raised 2026-11-20 (targeting spec thread): a tractor tweak "drag all / drag targets", since ore B, dropped items and limited cargo make a selective tractor matter; future tractors might drag rocks or ships. Not in the targeting spec.

## S-39 · Faces from a pool, not one drawing each
- status: specced
- area: Comms
- plan: docs/face-cast-plan.md

Faces are shapes with numbers in `src/voices.json`, so a new face means writing new numbers. The user's hope (2026-11-23), on seeing four of them: name the parts — lids, rings, stars, carets, brows, mouths, marks — and let a face be assembled from the pool, so hundreds of variants can be generated and the good ones kept. That is also how aliens arrive later: a species is a pool with extra shapes in it, not new art. Needs a plan of its own; step 0 of `docs/chatter-faces-plan.md` built the vocabulary it would draw from. Specced 2026-11-26 as the face cast: rolls on the dev page, kept faces interviewed in chat into people with knobs, and the cast dealt to traffic, defenders, pirates and stations at every base.

## S-40 · Settle the face shapes
- status: building
- area: Comms

The faces are on the radio log, but the shapes aren't settled. Gus reads as the same grump in every mood because his brows sit on his lids; plain traffic was too plain until it got a glint and a mouth with mass. The dev page (key F under `?dev`) puts the open calls side by side — Gus's brows (fixed, none, per mood), his scar (none, slash, cross, stitch, hash), Pip's lean, how much craft plain traffic gets, the station's own display — and the pick goes into `src/voices.json` by hand. Waits on the user pointing at letters.

## S-41 · Regulars who remember you
- status: specced
- area: Comms

Gus and Pip are strangers today. Step 2 of `docs/chatter-faces-plan.md`: count meetings, warm the lines up from stranger to regular to friend, save the meetings with the game, and two tweaks beside radio range so the whole arc can be seen in minutes. Their packs get regular and friend lines; a level with no line for a kind falls back a level, then to the shared list.

## S-42 · Clouds: soft places with stacking effects
- status: building
- area: World
- plan: docs/clouds-plan.md

Ellipse clouds (ring, falloff, draw order, opacity, back and front layer) with looks and effects kept apart; one cloud can stack several effects. Step 1 is visuals only; step 2 adds two effects the user picks after flying through one.

## S-43 · Face target faces any target, main or closest
- status: specced
- area: Programs
- effort: S
- from: I-4

Today the face target program only turns toward the main target when it is a rock (`isRock(main)`
in `Sim.faceTarget`, `src/sim.ts`). *Decided* (user, 2026-11-24):
- It faces any target: rock, ship, station, ore, whatever the target list can hold.
- A new tweak picks what it faces: **face main target** (default, as today) or **face closest
  target**, where closest means the nearest entry in the ship's own target list, not the nearest
  object in the world. Closest is re-picked as the ship and targets move.
- Everything else stays as it is: it still yields to a click order, course, turn key or dock.
- No target, no effect.

Tests: faces a non-rock main target; the closest setting picks the nearest listed target and
switches when another gets nearer; an empty list leaves the controls alone.

## S-44 · Cargo bays: buying swaps the smallest, unloading starts at the top
- status: specced
- area: Inventory
- effort: M
- from: I-5, I-6

**Buying a bay (I-5).** Bought gear never swaps what's fitted today (`planBuy` / `buyPart` in
`src/sim.ts`). Bays become the exception. *Decided* (user, 2026-11-24):
- With a free bay mount, nothing changes: it goes there.
- Otherwise a bought bay replaces the smallest fitted bay, but only if it is bigger. A bay that
  doesn't add room is never fitted over a larger one; it goes to the hold or locker as today.
- The cargo moves into the new bay (it is bigger, so it fits; keep auto-place).
- The old bay goes into the locker at this station; if the locker has no room, into the new bay
  if it fits there; if neither, the purchase is refused with a clear reason.
- `whereBuyGoes` and the shop hint show the swap before you buy.

**Unloading order (I-6).** *Decided:* goods leave from the top. The top of the bay is the entry
point, and the point is to unblock it first, so ore nearest the entry sells first. Today
`unloadOre` takes the first ore in `ship.hold` order that holds nothing up; keep that rule (ore
that holds something up stays) but choose by nearness to the entry.

Tests: swap over the smallest bay with cargo moved; no swap when the new bay isn't bigger; old bay
to locker, then to the new bay, then refusal; unload order follows the entry.

## S-45 · Small fixes: fitting by mounts, news links, traffic beams, tank art
- status: specced
- area: Polish
- effort: S
- from: I-1, I-2, I-3, I-7

Four independent fixes, one change each; the first is built, the last is settled elsewhere, two
are left.
- **Fit by mounts (I-7).** *Built 2026-11-25*, with the hull buying fixes: `fits` is gone from
  parts altogether, so mounts alone decide. The racer has a tractor mount but the shop said the
  tractor can't fit: `tractor` carried `fits: ["floater"]` in `src/parts.ts`, which overrode the
  hull's mounts. *Decided:* mounts decide. Drop the hand-written `fits` from `tractor` and `turret` (any other
  part too), so any hull with a matching mount takes the part. Test: the racer can buy and fit
  the tractor.
- **News links (I-1).** Every news board line that names a place gets the click link that sets
  the destination. The all-round tractor (360) line has none today; check every line kind.
- **Traffic tractor beams (I-2).** Traffic that uses a tractor pulls ore but draws no beam. Draw
  the same beam lines the player's tractor draws (render.ts, the per-ore lines; the faint
  full-range cone stays player-only).
- **Longer tank art (I-3).** *Decided:* fuel tanks draw twice as long on the ship
  (`src/shipArt.ts`). Visual only: grid shape, inventory and fuel held stay the same. Check the
  hulls in the designer that the longer tank still sits on the hull.
  *Settled 2026-11-25 by S-60 (Q-26):* no code needed. Part art width and height reach every
  part now, so a width of 2 on each tank's part page draws it twice as long, and the setting
  shows on the ship, in the designer and in game.

## S-46 · Designer comforts: deselect, zoom, undo, layers, multi-select, part art, turret
- status: built
- area: Ships and gear
- effort: M
- plan: docs/designer-comforts-plan.md

From the user's own use of the hull designer, 2026-11-24. Deselect a mount, wheel zoom, Ctrl-Z
undo, show/hide layers, a multi-select drop-down for long id lists, per-part x/y scale, alpha and
base colours, and the turret drawn as a circle with its gun turning.

## S-47 · Hulls as data, and a shape editor for hulls and parts
- status: built
- area: Ships and gear
- effort: L
- plan: docs/hull-drawing-plan.md

Hull shapes move from code into `src/hulls.json`, a model becomes a name, one edge polygon per
hull plus visual shapes with colour roles, mirror drawing and Shift snap, copy hull, optional
drawn part art. Groundwork for S-48 and S-49.

## S-48 · Hulls for sale at stations, with a trade-in
- status: built
- area: Ships and gear
- effort: M
- plan: docs/hull-buying-plan.md

Per-station lists of the items, programs and hulls it sells; buying a hull replaces yours, the
old one is traded in at full price, your parts move over where they fit, the rest to the locker.

## S-49 · AI ships on real hulls: templates, spawn points, station rebuilds
- status: specced
- area: World
- effort: XL
- plan: docs/ai-hulls-plan.md

One kind of ship; AI-only hulls and parts; general loadouts; templates as a role plus a weighted
hull pool; spawn points with faction and home lock; station rebuild entries paid by the owner
first; minimal and complex cargo; today's AI moved onto templates.

Later step (from S-26, 2026-11-26): traffic buys a turret and uses it.

## S-50 · Damage levels: damaged, broken, destroyed
- status: specced
- area: Ships and gear
- effort: M
- plan: docs/damage-levels-plan.md

Per-part thresholds for a middle "works, but worse" level, a look per level, a weaker damaged
thruster first and other kinds after.

## S-51 · Endless spawning from a spawn point
- status: parked
- area: World

From the 2026-11-24 hull designer talk: a spawn point that keeps its count topped up (pirates,
creatures), not just seeding the new game. Waits on S-49's one-shot spawn points.

## S-52 · Repair damaged parts in flight
- status: parked
- area: Ships and gear

From the 2026-11-24 hull designer talk: a damaged part (S-50's middle level) can be fixed in
flight. Open: what does the repairing (a repair part, a program, a drone) and what it costs
(time, parts, power). Broken parts still need a station.

## S-53 · The refinery cuts the rock up with a laser, and the ore flows out
- status: parked
- area: World
- from: the user's play of the clamp tow, 2026-11-24

A whole rock on a station's refinery pad reads as just a rock shrinking. Wanted later: a beam
cutting into it and the ore streaming from the rock into the station, so the payout is something
to watch. Today it pays an ore every few seconds with a sound and floating credits
(`docs/clamp-tow-plan.md`, step 1).

## S-54 · Pilots as people: call-sign plus mood emote, pixel busts for people you know
- status: parked
- area: Comms
- from: a design talk on the faces, 2026-11-24

The glowing robot-screen faces read as AI, not as people flying ships. Tried in throwaway
prototypes (not in the game):

- Flat vector head-and-shoulders busts: rejected, "too childish, like Peppa Pig".
- **Call-sign plus emote** ("looks decent"): every pilot has a picture they chose, generated from a
  seed and biased by job (stitched squadron patch, mascot, slanted name tag, a rare text face), and
  beside it a neon mood emote in their own colour and eye style. The picture says who, the emote
  how they feel. Side by side reads best on the radio; a corner badge loses the mood at 28px.
  Call-signs avoid square frames so they don't look like part icons. Reference: Warframe's KIM
  chat avatars.
- **Pixel busts drawn by code**: a 48-pixel grid, automatic outlines and two-tone shading, with tiny
  eye, brow and mouth stamps. They read as real people at 2x and above with clear moods, but the
  moods are lost at radio size. They fit a contact card for regulars you know, as the payoff of
  S-41. Weaker than hand-drawn (pi-emote) mainly in hair and head size.
- Art sources checked: Avatars In Pixels can't be used (no commercial use, website avatars only).
  AI images could make a fixed set of portraits for regulars, with moods redrawn by inpainting,
  but not a kit of parts.

Parked by the user: the current faces will do for now. Aliens would use the same split: an
unreadable call-sign, and an emote whose features (crest, antennae, glow) you learn to read.

## S-55 · One price for everything: worth, a station's buy share, and contracts
- status: specced
- area: Ships and gear
- effort: L
- plan: docs/pricing-plan.md
- from: the user's questions on the hull shop's prices, 2026-11-25

A single `price(seller, buyer, item, amount)` over an item's worth. Stations buy back at 60%; a
hull is worth its frame plus its parts; ore keeps full price by a standing contract; the hauler,
deposit and black market deals become contracts. Closes the hull-swap money loop.

## S-56 · Hull pictures sized to the hull
- status: idea
- area: Inventory
- from: the user trying hull buying, 2026-11-25

Bigger hulls don't fit their pictures: the ship screen's blueprint, the shop's hull icon and the
start menu cards draw every hull at a scale made for a racer-sized ship. Scale each picture to the
hull's own outline (and its mounts). Maybe part of a later inventory rework.

## S-57 · Hull designer: ellipse and arc shapes, and a default decal
- status: built
- plan: docs/hull-shapes-plan.md
- area: Ships and gear
- from: the user trying hull buying, 2026-11-25

A shape is a polygon, a circle or a rect. The dome cockpit's art has a turned ellipse and the
tractor's an arc, which exist only in the code's own art (`src/shipArt.ts`), so the editor can't
make or match them. Wanted: an ellipse shape (two radii and a turn) and an arc (a radius, start
and end angles, a line width), each with handles in the shape editor; and an "add default decal"
button that adds the polygon our hulls' default shapes use as a decal.

## S-58 · Many mounts: every turret and tractor counts
- status: built
- area: Ships and gear
- effort: M
- plan: docs/many-mounts-plan.md
- from: I-1, I-3, I-9

Only the first turret takes a gun, only one tractor works and its cone ignores the mount. Each
turret gets its own gun slot and angle; each tractor its own cone from its mount. Also answers I-9:
any part on any mount it fits works once the code stops expecting one of each.

## S-59 · Click move: the faster way, thrust while turning, a top speed tweak
- status: built
- area: Movement and aiming
- effort: M
- plan: docs/click-move-thrust-plan.md
- from: I-2, I-14

The click pilot compares turn-and-burn with pushing direct from the real thrusters, fires what
helps while it turns, and Click to move gets a top speed tweak.

## S-60 · Ship art fixes: tanks drain front to back, part art everywhere, hull tint by share
- status: built
- area: Polish
- effort: S
- plan: docs/ship-art-fixes-plan.md
- from: I-4, I-5, I-6

Three independent fixes in `src/shipArt.ts` and `src/render.ts`. The second makes S-45's longer
tank a designer setting.

## S-61 · Dock shop fixes: shift-click sells, programs ignore parts, your credits on top
- status: built
- area: Inventory
- effort: S
- plan: docs/dock-shop-fixes-plan.md
- from: I-8, I-10, I-11

Three small fixes to the dock shop and ship screen. Selling modules back already returns the
station's parts, so I-10's second half needs no change.

## S-62 · Dev tools: programs and hull switch in the tab menu, fit anywhere, hull names
- status: built
- area: Testing
- effort: S
- plan: docs/dev-tools-plan.md
- from: I-7, I-16

The tab menu's Parts group gives programs, switches hull and can allow fitting in flight; the
designer gives a hull a shown name beside its id.

## S-63 · Auto targeting: next main target rule, and a program that picks
- status: built
- area: Programs
- effort: M
- plan: docs/auto-targeting-plan.md
- from: I-13

A Targeting tweak for which target becomes main next (order, nearest, in front, collision), and
an Auto targeting program with a max range, so idle mining doesn't stop when the queue runs dry.

## S-64 · Nothing vanishes in view
- status: specced
- area: World
- effort: M
- plan: docs/in-view-plan.md
- from: I-15

The sim watches the camera, not just the ship, and no sleep, record or forget rule takes anything
the player can see. The guess: it was seen with the camera away from the ship (the pod ride).

## S-65 · Blueprints for programs and hulls
- status: specced
- area: World
- effort: L
- plan: docs/blueprints-plan.md
- from: I-12

Stations get unlocked and wanted lists for programs and hulls, as for modules: funded by the
player or the station, brought by the hauler.

## S-66 · Music: funk under the work
- status: built
- area: Sound
- effort: M
- plan: docs/music-plan.md

Licensed tracks (CC0 or CC BY only) play while the ship is at work, with a now-playing line,
credits and a small music menu. Disco, soul and funk; the Digital Love astronaut in the flow.

## S-67 · Music later: hunt music, place tracks, station and pirate radio
- status: parked
- area: Sound
- effort: L

Rockier music when the player commits to a hunt (never as a warning); tracks only heard at one
place; music from stations that fades with distance, and pirates with their own station, heard
before they're seen. Details in `docs/music-plan.md`, Not in this build.

## S-68 · Chatter faces swing to the music
- status: built
- area: Sound
- effort: S
- priority: P1
- plan: docs/chatter-faces-sway-plan.md

While a track plays, the little faces in front of the radio log sway or bob along with it. The
user, 2026-11-25, after first playing with music: "one thing we definitely need soonish".
Builds on S-66 (music) and the faces of `docs/chatter-faces-plan.md`. Specced 2026-11-25: hand-set
`bpm` per track, a nod per voice, the beat read off the audio position. Built 2026-11-25: the faces
turn inside their screens to six tracks' tempos, a different nod per voice, and the gallery previews
any of them; more kinds of nod to come (S-70).

## S-69 · Station personalities, heard in their music
- status: idea
- area: Sound
- effort: L

Each station has a personality, say a loving mother or a formal butler, and it shows in how it
talks and in the music that starts once you linger docked and shop. Docked, the work music
fades (S-66); after a while the station's own music comes in. The user, 2026-11-25. Touches the
station's voice in `src/voices.json` (`docs/chatter-faces-plan.md`) and the place tracks of S-67.

## S-70 · More ways to sway
- status: idea
- area: Sound
- effort: S

The faces of S-68 have three ways to nod: `yaw` (a head turning left and right), `pitch` (up and
down) and `tilt` (a roll), plus `still`. Every **new** face should be able to pick from more than
those three. The user's call, 2026-11-25, on seeing the first build: "new faces should get more
variations of sway".

Ideas to try, in the same pure shape: a lag or follow-through, the mood marks arriving a beat late
so a nod has weight; a lean (a shift with a one-sided squash, like a shrug); a double-take, or a
turn that holds for a bar; a rate that isn't a whole number of beats (a half-beat sway drifting
across the bar); and moods colouring the motion, once S-68's "the nod is the character" is tested
by play. `Nod` in `src/sway.ts` is the place: `kind` grows a value and `swayAt` gives it a pose,
and both the gallery preview and the `sway` block in `src/voices.json` pick it up with no other
change.

## S-71 · Live elements on hulls and parts
- status: built
- plan: docs/live-shapes-plan.md
- area: Ships and gear
- from: the Q-24 spec talk, 2026-11-26

Shapes that move or react, so ships look alive: blink (nav lights, a beacon, with a period and a
phase), pulse (a slow glow), lights that follow the ship's state (throttle, turning, firing,
damage), spin (a dish or a gyro ring turning on its own), and a glint lit by the star as the ship
turns. The drawing code would get a small "now" (time and the ship's state) once, then each
behaviour is a field on a shape. It serves the reveal: a faint blinking light on the first ship you
only notice on your tenth flight. Its own spec session (the user's call). Particles emitted from
shapes are parked here too: they cost more (emitters per ship, many ships on screen). The shape
kinds it builds on are in `docs/hull-shapes-plan.md`.

First slice specced 2026-11-26 (`docs/live-shapes-plan.md`): colour change (snap or fade) and
glow as options on any shape, each ship on its own timing, tools only. The rest moved out:
state lights to S-72, spin to S-73, the glint and particles to S-74.

## S-72 · Lights that follow the ship's state
- status: idea
- area: Ships and gear
- from: the S-71 spec talk, 2026-11-26

Shapes that change with what the ship is doing: throttle, turning, firing, low fuel, damage, or a
docking light that only blinks on approach. Builds on S-71's first slice
(`docs/live-shapes-plan.md`): a state rule would drive the same "how lit" amount that colour
change and glow use, so no new drawing is needed. The user chose looks first, so this waits until
that slice has been played.

## S-73 · Spinning shapes
- status: idea
- area: Ships and gear
- from: the S-71 spec talk, 2026-11-26

A shape that turns on its own, such as a dish or a gyro ring, with a speed and a pivot. Another
option on any shape, like S-71's colour change and glow, using the same art clock and per-ship
phase (`docs/live-shapes-plan.md`).

## S-74 · Star glint and particles from shapes
- status: parked
- area: Ships and gear
- from: S-71, 2026-11-26

Two later ideas from S-71. A glint on a shape lit by the star as the ship turns. Particles emitted
from shapes, which cost more: an emitter per ship, with many ships on screen.

## S-75 · Designer defaults reach the ship: turret guns and default programs
- status: idea
- area: Ships and gear
- effort: S
- from: grooming, 2026-11-26

Two gaps between the hull designer and the game, both minor. The designer can't set a gun as a
turret mount's default part, so a hull can't come with a gunned turret. And the hull's Default
programs don't reach the ship: neither buying the hull at a station nor switching to it from the tab
menu loads them.

## S-76 · Credits and fuel level in the ship screen
- status: idea
- area: Ships and gear
- effort: S
- from: grooming, 2026-11-26 (S-32)

The ship screen (I) shows parts and cargo but not your credits or how much fuel is in the tanks.
Add both. Minor. In flight the ship art already shows cargo and fuel, which is enough there.

## S-77 · Road to a fun system designed by AI or procedure
- status: idea
- area: World
- from: grooming, 2026-11-26

People keep saying AI can't design a game that is fun. The user wants to test that: have an AI (or
a procedure) design a system that is fun to play, then play it. The road starts with a proper
session (pair) that sets up how a system gets designed this way, what "fun" is measured against
(the experience targets in `docs/vision.md`) and a first system to try. Builds on the system
designer and the layout recipes (`npm run layout`).
