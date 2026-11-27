# Roadmap: materials flow

Written 2026-11-27, from a product talk with the user. Not a plan: it gives the web of backlog
ideas a shape, and each step gets its own `docs/<thing>-plan.md` via `/spec` when it comes up.
Items marked *decided* are the user's calls; the rest is proposal. No deadlines (*decided*): we
write down what we have in mind, spec it today or as needed, and see where we get.

## The tree

- **Trunk: the system designer.** Stars, planets, fields and bases, each with a place and a
  purpose. Built.
- **Leaf: the mining life.** The floating idle mining target is at 3 (*decided*): the user built
  an early end-game miner, and the dream's shape works. One click to get in position, it floats and
  fires at rocks on the way and picks them up, another click for the next load, a click home, sell,
  repeat. It needs tweaks and balance, not new features. The floater teaches early shapes of the
  loop; the end-game miner is the goal to work toward.
- **Branches: what makes the leaf grow out of the world** instead of being placed by hand
  (*decided*: branches before balance). Population (who lives here), economy (what moves, and why
  it costs what it costs) and word (how you find out).

The leaf's next level comes from the branches. The end-game miner is sold **somewhere else**
(*decided*): a far base, heard of through news and radio, and the trip is the adventure. That base
**builds it from goods it actually holds** (*decided*, pillar 1 by goods, not by record): short of
parts, you wait or bring them. This one moment pushes idle mining to 4 (reached in normal play) and
gives the shopping journey its missing *want* link.

## The chain of reasons

The user's logic, from the leaf back to the root: scanning needs a reason to scan; the reason is ore
known per rock; that only matters with many ore types; many types flow between stations that need
them; what they are needed for is factories, turning ore into parts and parts into anything.

Built the other way round, from demand to supply: stations with roles and factories first, then
more ore types, then ore per rock, then scanning. Scanning is worthless until ores differ.

## Generic systems, not code for X

The move from proof of concept to framework (*decided*). "It's all code" (behaviour written for one
station or one ship) is temporary. Entities are closed for change and open for extension. The rules
are in `AGENTS.md` (Architecture) and the words and the shape in `docs/framework.md`. In short:

- **An entity is data:** a frame, the parts on its mounts, an anchor or motion, an account.
- **Behaviour comes from parts.** Systems ask about capabilities ("what has a dock?"), never about
  types ("is this the station?").
- **A station is a frame**, drawn in the hull designer like a ship's (*decided*: on the right
  track). Its bare core is who (name, owner, account), where (an anchor) and a frame with mounts.
  Everything else is a part with a recipe: dock, shop, storage, lockers, fuel tanks, refinery,
  repair, factories, turrets. A frame with no parts is a claim or a construction site.
- **One recipe for everything** (*decided*): inputs (consumed), conditions (needed, not consumed:
  a factory, power, a blueprint, a place), output and time. Hulls, modules, programs, fuel (from
  ice?) and station parts all have one. A blueprint is a condition. Programs are information: their
  recipe is mostly conditions.
- **A part declares what it consumes** (fuel, ammo, later power), and the systems read that.
- **Pulled, not up front** (*decided*): each behaviour becomes a part the moment the economy needs
  it. Today's base keeps its code-written shop, refinery and repair until a station without them
  shows up.
- **Not perfect yet** (*decided*): a station may starve or die. We measure and visualise it, we
  don't fix it, and no test blocks on it.

## First milestone: materials flowing

**Authored network** (*decided*): trade lanes drawn in the system designer, run by haulers. A god
transport AI that draws lanes before or during the game is for later.

**Holes** (*decided*): a planet base is where the modelled economy ends. It takes and gives
anything at a fixed price. The moon's fuel is the first case.

The build-up (*decided*):

1. Moon (hole) ↔ mining station (today's base).
2. A second station, a factory: mining station ↔ factory, moon ↔ both.
3. Grow from there.

The first goods (*decided*):

- **Factory 1: ore → parts.** Fills the hole our current base eats parts from (repairs, upgrades,
  modules, drones).
- **Factory 2: parts → ammo.** A new feature, chosen because a flow needs something consumed all
  the time, and it fills the hole of "what is my gun shooting". Ammo is fuel's twin: a part
  consumes an item from where the ship stores it, so no code fuel didn't need.
- **Factory 3: parts → guns or thrusters**, the shop's durable goods.

**Ammo for some guns only** (*decided*): gun 1 uses ammo, so traffic and the player make demand from
day one; one gun stays ammo-free so idle mining can't run dry. Later the laser is the ammo-free
mining tool, a strong want.

Factories are parts, so how many stations hold them is a designer choice. Proposal: the mining
station plus one factory station with factories 1 and 2, and factory 3 on a third.

## Steps

| # | Step | What it decides | Touches |
|---|---|---|---|
| 0 | Framework rules | AGENTS.md Architecture, `docs/framework.md`: the words and the three rules | done with this roadmap |
| 1 | Station frames | A station is a hull in the hull designer: frame, mounts, anchor. Today's base becomes one and plays the same | hull designer, fitting |
| 2 | First capabilities as parts | Dock, counted storage, a trade point where haulers buy and sell. Only what the second station needs | sim's station code |
| 3 | The unified recipe | Inputs, conditions, output, time for every item; blueprints as conditions; a factory part runs recipes | Q-32, Q-7 |
| 4 | Holes | A planet base trades anything at a fixed price; the moon's fuel first | Q-7 |
| 5 | Ammo | The item, guns that name their ammo, where the ship keeps it, running out | guns, bays |
| 6 | Trade lanes | Drawn in the system designer; haulers run them by stock and wants | Q-19 |
| 7 | Prices from stock and wants | A base pays more as it runs short | Q-23 |
| 8 | Watching it | Stock bars and lane lines on the dev map; a no-player run that logs stocks over hours. Background only | dev map, no-player runs |
| 9 | The stations | Factory stations placed in the designer from the pieces above: the proof | designer files |

Three spec sessions:

- **A: framework and station frames** (steps 1–2).
- **B: recipes, factories, holes and ammo** (steps 3–5).
- **C: lanes, prices and watching** (steps 6–8).

A comes first; B and C can be specced and built side by side after it. Step 9 is designer work
once they are built.

Q-7 (fuel supply chain), Q-23 (pricing) and Q-32 (blueprints) wait for spec B and spec C, which
rewrite them; the faces, live shapes and small fixes run alongside, untouched.

## Later milestones

Not specced, in rough order. Each has a backlog id.

- **Ore types and ore per rock**, then **scanning** (S-8's radar pulse is a cousin). The chain of
  reasons above, built from the factory end.
- **Power and the fitting puzzle.** Power is a condition at a base and a budget on a ship. Guns use
  little energy but need ammo; lasers use no ammo but need an expensive reactor or rule out a power-
  hungry tractor; ion thrusters use no fuel but need power. Solar panels, reactors, uranium or a
  fusion fuel all slot into the recipe and transport system. Different in kind, not stronger: the
  fit the hunt wants.
- **The far mining base** that builds the end-game miner from goods it holds, and news of it that
  ships carry, late and going stale.
- **Population:** AI ships on real hulls (Q-19, S-49), pirates, the hunt.
- **A transport AI that draws lanes**, and later a network that grows itself: bases choosing their
  own factories (S-37, expansion as a sim).
