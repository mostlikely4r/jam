# Vision

What JAM is, and the experiences it is steering toward. Read this before planning anything.
Spoilers: everything below is for people who chose to dig.

## Pillars

Agreed 2026-11-20 (*decided*). These say what the game is and don't change lightly.

1. **Nothing comes from nowhere.** Every ship, pirate and cargo is real and traceable. Follow
   any ship and find out where it and its cargo came from.
2. **Choices and watching over aiming and chasing.** Drift, not dance. You make tactical calls
   and systems fly. Manual skill is an option, never the requirement.
3. **Alive without you, and more and more yours.** Purposeful traffic is company. Set things in
   motion, look away for seconds or hours (not the same as pausing), come back to what changed.
   *Current focus.*
4. **A surprise game: looks simple, turns deep.** It looks like asteroids, one ship, mine and
   sell. The rest is found by playing. Only the README and what a new player sees stay clean.
5. **Small and real beats big and abstract.** Name the cheapest test before a big idea goes in.
   Build little, but don't let the foundation rule out known dreams.

## Experience targets

Moments the game should give, some of them "I want this experience again" from other games.
They steer which features come next, can take months to reach, and stay until reached.

A target is also a **licence**: it justifies choices that would normally be friction because they
serve the experience. Long optional trips are bad as waiting, good as room for tinkering.

Each target has its moment, its chain of links, what it licenses, and a rating.

### Rating, 0 to 5 (proposed, to be confirmed at the first revisit)

| | Means | Checked by |
|---|---|---|
| 0 | Named: the moment is described, nothing built | — |
| 1 | Parts: some links exist but don't connect | code |
| 2 | Closes once: end to end, crudely, in one set-up case | code, no-player runs |
| 3 | Felt: played, and it gave the feeling at least once | play only |
| 4 | Repeats: happens again in normal play, with variety | play, plus no-player runs |
| 5 | Reached: happens without set-up, holds over long play, worth showing | play |

0 to 2 is plumbing: it can run ahead and in parallel. Past 2 needs play. Guardrail: one target
at a time is pushed past 2.

### Floating idle mining: 3 (revisit next)

**Moment.** A slow, massive ship drifting beside a rock. Choose, click, look away, come back to a
fuller hold. The trip home is effortless.

**Chain.** Easy ship, mouse orders, ore keeps the rock's velocity, hover and shoot, hold filling,
click the map to go home, automatic docking.

**Licenses.** Slow ships, slow extraction, auto-mining.

**Stands.** Core built 2026-11-06 to 11-08 and felt ("works good", "closer to the feeling I
dreamed about"), but "not exceptional". A long retest from a new game hasn't happened, and items,
inventory, cargo bays, the full system and map flight have all changed underneath it since.
See `docs/shopping-trip-test.md` for the tractor split it also depends on.

### Shopping journey: 2

**Moment.** You see an item that will really change how you play, but it's far away or hidden.
You save, prepare and plan, and the trip is an adventure, not a chore. Roots: EVE, X4, Star Wars
Galaxies.

**Chain.** A want (an item that changes play, not just stats), hearing of it (news carried by
ships), the gap (cost, distance, danger), saving and preparing, the trip, arrival and the change
in play.

**Licenses.** Prices by place, stale news, items missing from most shops.

**Stands.** `docs/shopping-trip-test.md` steps 1 to 3 built and passed 2026-11-13: one far base,
the all-round tractor, news boards. Blocking 3: the want link, since the all-round tractor is a
small upgrade for a floater pilot (the racer's spray-and-swoop set isn't built). Blocking 4: more
such items, step 4's price gap, longer trips.

### Optional tinkering during downtime: 1

**Moment.** The ship is busy (a 10 to 30 minute autopilot trip watching the stars pass, knowing
you'll arrive to something new; or the auto-miner slowly filling the hold) and you could look
away, or do something useful that makes the next phase better. Roots: Space Engineers (flying
slower than needed while finishing the ship, building a small miner to launch on arrival), WoW
flight paths and boats, EVE travel and mining, Star Citizen trade runs.

**Two kinds.** Internal: changing systems, decrypting information, stacking ore, refining,
planning the return trip, repairing, reviewing the last fight. External: sending a probe,
commanding owned ships or stations, hacking a nearby station, ordering or crafting remotely.

**Rules.** Optional (looking away stays a full answer). Useful forward (it pays off on arrival).
Can be dropped at any moment. Never a chore tax that everyone must pay.

**Licenses.** Long optional trips, systems you can open mid-flight, information that arrives
during a trip.

**Pillar 1 check.** Remote orders, crafting and hacking need a carrier: within comms range, or a
message on a real courier ship with the answer coming back later.

**Stands.** Parts exist (bay grid, fitting, route planner, drones, planned program tweaks in
`docs/targeting-plan.md`), but few work as things to do mid-flight, and no trip is long by design.

### Candidates, not yet accepted

- **Come back to what changed:** leave it running, return to a grown station, a moved field, news.
- **Your work becomes something:** hauled ore visibly turns into a deposit, turrets, a big miner.
- **Who was that?** Follow any ship to its errand and its cargo's origin.
- **Hiding from the pirate:** early warning, holding still behind a rock until it passes.
- **The world opens up:** "warning: gravity well", a giant planet, leaving in a bigger ship.

The first two may be one target, and together they are the heart of pillar 3.

## Revisit

How a target moves up. A revisit asks what stands between a target and its next level, and feeds
`/spec`; it doesn't replace it.

1. Restate the moment, the chain and the rating.
2. What's built for each link, and what changed underneath since it was last played.
3. Play it, and write down what it felt like.
4. The gaps per link to the next level.
5. Ideas and already specced features matched to gaps, ranked, **at most three**. The top one
   goes to `/spec`, the rest to `docs/maybe-later.md`.

Update the target's rating and stand here afterwards. The first revisit is free-form; it becomes a
`/revisit` command only once it has worked.
