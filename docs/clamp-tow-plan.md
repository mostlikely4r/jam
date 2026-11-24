# Clamp tow plan

Written 2026-11-23, from a talk with the user. A new module, the clamp, holds one outside object
and the ship flies the pair on its own thrusters. The user's main reason is building: later, a
station sells a construction block, pays a hauler to place it, and the build grows from what was
carried (pillar 1, and the candidate target "your work becomes something" in `docs/vision.md`).
Other uses named: towing a stranded ship home for repair, and much later moving a station.

This plan is only the first slice, *decided* by the user as the cheapest test: **towing a whole
asteroid to a station, for more ore than mining it would give.** It needs nothing the game
doesn't already have (rocks, stations, ore, thrusters), and answers whether towing feels good
before anything is built on it. Nothing here is built yet.

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
  with a cross on it. Faint at rest, bright while the clamp holds a rock, and then the catch's
  reach is ringed too. It's the spot the rock is worked on, so where to hand one over is seen.
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

**Stop here for the user to try.** Not built: the notes below are for the next step.

**Stop here for the user to try.**

### 2. The autopilot keeps the load safe

The *decided* "the right systems take care of it", built once step 1 has been played.

- **A program, `towControl`** (proposal: a program sold in shops, in `src/programs.json`, so safety
  is something to buy and a computer slot to spend). With it loaded and a rock held, every
  autopilot move (click move, route, travel) keeps the closing speed toward anything solid in its
  path under `safeImpactSpeed`, and plans braking with the combined weight (already true through
  `shipResponse`, check it holds on long routes).
- **Deliver:** with it loaded, clicking a station while towing flies there, comes to the catch
  slowly on a clear line, and releases. Without it the player releases by hand as in step 1.
- Check the corner path round bodies (`cornerToward`) leaves room for the held rock's radius, not
  only the ship's.

*Played for:* tow a rock with the program and look away. Does it arrive whole every time?

## How we'll know

- **Unit tests** (`src/sim.test.ts` or a new `src/tow.test.ts`, kept in the fast suite where they
  can be): grab in range and slow, refused when far or fast; held mass lowers `shipResponse`;
  the held rock never strays, sleeps or gets mined; release keeps the velocity; a bump over the
  safe speed damages and can break it, a gentle one doesn't; the expected-yield function matches
  a long run of `breakRock` within a few percent; catch, refinery spot, refining pays the owner
  ore by ore, pauses on full storage and enters ore in the ledger; save round trip with a held
  rock and a refining one.
- **Step 2:** a no-player run where a bot with `towControl` delivers rocks from the home field
  many times: rocks arriving whole (target: all), minutes per delivery, credits per hour against
  the same bot mining. Background only, logged, never gates done.
- **Full check:** `npm test`, then `npm run build`.
- **Try it:** new game, floater. Buy the clamp at the home station (it replaces the tractor). Fly
  to the field, come up slowly beside a big rock, press `G`. Feel the ship go heavy. Fly it back,
  slow down near the station and press `G` again. The station pulls it in, it shrinks beside the
  station, and your credits tick up ore by ore, about twice what mining it would have given. Then
  try one too fast and watch it crack on the station.

## Needs first

- The tractor mount and part kinds (`src/fitting.ts`, `src/parts.ts`, `src/items.json`): built.
- `shipWeight` / `shipResponse` dividing all thrust (`src/sim.ts`): built.
- Base storage and `base.ore` (`storageFree`, ore glut work): built.
- Programs and computer slots (`src/programs.json`): built, needed only for step 2.
- Fuel (`docs/fuel-plan.md`): off by default and not needed. If on, towing burns more simply
  through more thrust time.
- Rocks don't collide with each other today; the held rock's collisions are new code, not a
  change to all rocks.

## Not in this build

- Special rocks with something that only survives whole, and a way to see which rocks are special
  (*decided* for later).
- Construction blocks, build sites and paid placing jobs: the main direction, next once towing
  feels right.
- Towing a stranded ship home (overlaps the rescue AI in `docs/fuel-plan.md`; think of them
  together).
- Traffic towing rocks, and towing in the out-of-view trip records.
- Towing loot, modules or anything but rocks.
- A laser cutting the refinery's rock and the ore flowing out of it into the station (S-53).
- The racer's clamp, a stronger clamp, a clamp that isn't on the tractor mount.

## Not doing

- **Making mining worse so towing gets back to today's yield.** Rejected: it would cut idle
  mining income.
- **Docking with the rock attached and being paid at once.** Rejected: the payoff must be seen.
- **Moving stations.** Parked: a late dream on the same mechanic.
