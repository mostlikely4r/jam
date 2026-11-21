# Maybe later

Parked ideas, mostly from 2026-11-04 to 11-20; some have been built since. None are decisions. Check here before calling an idea new, and bring one up only
when it bears on the current choice. Revisits (see `docs/vision.md`) send their leftovers here.


**Movement and aiming**
- Click to turn is built (right click cancels and turns, left click moves). Still open: making it mutually exclusive with click to move on a shared toggle key, needing the spin stabilizer first, and a way to set "face here on arrival".
- Retro as an upgrade of the spin stabilizer, or mutually exclusive with it. Retro already includes spin assist in the code.
- Turret, user's spec 2026-11-05: aims at the mouse, turns at its own speed relative to the ship (faster than turning the ship, slower if the ship turns the other way). Unsure which gun goes in it, given gun 2's ore effect, or whether it's a new hull that starts with one.
- Turrets, earlier: the user says they will exist, just not yet. They rotate fast, so larger slower ships only turn for long distances, and they're a must for combat. They could auto-track the current target (needs target or multi-target selection) or follow the mouse while keys or clicks turn the ship.
- Click to move relative to a clicked object, so it follows a moving rock.
- Thrust ramp, front-only thruster, backward-shooting guns, gentler retro, waypoints and queues.
- Max speed for click to move, tweakable in an equipment screen.
- Radar pulse, raised 2026-11-06: briefly shows relative-motion lines on all nearby rocks, then fades. The same system could ping rich or specific ores. Possible tradeoff: a pulse could give you away to pirates.
- Raised 2026-11-10, after the exact stop shipped: the stop's final settle is a cheat (it eases onto the spot and zeroes speed with no thrust), and the user notices it. The cascade they see: thruster output that scales over time (maybe a shift modifier for fine thrust), the AI using that precise output, the AI needing it (docking), fuel being consumed, then lots of balancing and an open "where does fuel come from". Fuel links to "Fuel and cargo tradeoffs" under Ships and gear. Decided the same day: the cheat bothered the user because nothing visible stopped the ship, not because stopping was free, so only step 1 (a throttle, inspired by KSP) goes ahead. Built 2026-11-10: a Shift throttle and real trim burns. The user approved the base ship's slow settle, with its small turns and a little drift before the final stop. Lesson: the user spots movement that has no visible cause, so honest physics wins over smooth fakes. Fuel is later, not now. The user's reason for it someday: a good coast should be worth something. It punishes the player, who corrects far more than the AI does, but it rewards learning.
- From the mouse thread, 2026-11-06: right click read from what's under it (RTS style), shift kept for queueing, EVE-style commands relative to an object (keep at range, orbit).

**Ships and gear**
- Inventory and fitting screen: ships have slots, some gear fits only some ships, gear is bought, stored and hauled.
- New game with a choice of starting ship. Today it's a panel switch.
- Fuel and cargo tradeoffs, drone upgrades such as cargo. A stronger gun, even though parts should mainly make the game different.
- Tractor beam is nearly overpowered: balance its range and cost later, not now.
- Raised 2026-11-21: a recovery system for a broken module you can't pay to repair. A broken gun or thruster early really kills a run; today the only way out is to wreck yourself and go into debt. Found by the no-player bot (`docs/go-home-broken-plan.md`).

**World**
- Two more fields of different size, rotation and orbit center, so a crowded field means flying to another. Same arc as pirates: first avoid and hide, later fight or ignore.
- Moving rocks suit the quick ship and slow ones suit the floater, so ships pick different targets. The user sees this as a possible feature.
- Rocks and breaking get their own pass, including a gun that changes how rocks break.
- Buffer zone, nomadic fields, ship collisions, drone tiny-delivery behaviour, a money sink for thin fields.
- Different handling of drone scores later. Fine as a challenge for now.

- Raised 2026-11-05: travel to a different place, such as a small moon with gravity as a hazard and rocks in orbit. Some gear is only sold in certain places, known through a remote inventory search; the trip itself is safe, and the point is what you see on the way.
- Raised 2026-11-05: chatter. Traffic shows a circular ping and short text in a corner ("going in to dock", "quiet day in the field"); the station greets you nearby and answers traffic ("Roger, cleared to dock"), with a marker on who is talking. Screen range to receive, except a pirate attack, which sends a long-range "mayday" ping.
- Raised 2026-11-05: haulers. Big rectangles, as long as the station's storage section and a third as wide, arrive from far away decelerating the whole way, rest beside the station, load ore up to a buffer, pay the station credits, then leave very slowly. Would answer the station's negative credits and its unlimited ore pile.

- Raised 2026-11-05: ships thank you over chatter when they pick up ore you broke loose, only when it wasn't near your ship (more like stealing). Lines need care, e.g. "I owe you one".
- Unlock tiers, agreed in outline 2026-11-05, not built: the shop opens as haulers buy ore over the game. From the start gun 2 and spin stabilizer; about 100 ore: reverse, strafe, turret; about 300: retro, click parts, drones, and the tractor (the user moved it there as borderline overpowered). The user is sleeping on how the new ship gets a better start without the tractor.
- Raised 2026-11-05: traffic buying and using a turret.
- Raised 2026-11-05, left as my call: the station unlocks what its shop can sell as haulers buy its ore, turning the ore pile into progress. Matches "station components that visibly unlock things" in the direction doc.

**Testing**
- Automatic runs over ship and upgrade combinations that report income, damage and so on. Limited by run time and by what the pilot knows how to use.
- 100-drone swarm test.

**Far off:** name, worm, pirates, bosses, frequencies, carriers, modules, remote control, planets, phone peeking.

- Object loading, unloading and persistence (raised 2026-11-07). For now, loose ore is simply deleted once it's far from every POI and every ship. The user's rule: removing things is fine when no one will ever see them or know where they could have been. Hauler removal is fine for now.
- Raised 2026-11-10: an inventory key showing the ship's stuff (cargo, credits, parts) as bars and numbers. Later; for now the screen stays clean.
- Raised 2026-11-10: mobile and touch support. Today only the start menu works on a phone.

**Raised 2026-11-11**
- Epic: a ring of rocks low over the moon, inside its pull. Not just richer ore: different materials and "something you can't just find so easy". The user called it "a nice epic". Not now.
- Brainstorm wanted: how goods flow through the system, and which objects belong in the node map (stations and body bases of different types and functions so far). The user feels something is missing there. It leads to logistics.
- Rocks colliding with each other in the live field (2026-11-12): affordable once only one field is live, but it changes how mining feels, so it's its own feature.
- Expansion as a sim (2026-11-13, "that's then, this is now"): the start is one planet; ships (haulers or a new kind) take off and become stations; special stations make traffic and populate nearby fields; ore flows back to the planet to fund the next station further out; maybe the traffic-making bases spread too. The real question behind "where does traffic come from and how does it flow", and the same for bases. Also: a short pre-game simulation so traffic is already en route when the player joins.
- Raised 2026-11-20 (targeting spec thread): a tractor tweak "drag all / drag targets", since ore B, dropped items and limited cargo make a selective tractor matter; future tractors might drag rocks or ships. Not in the targeting spec.
