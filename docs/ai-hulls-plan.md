# AI hulls plan: templates, spawn points and station rebuilds

Written 2026-11-24. Fourth of five plans from one talk about reworking the hull designer (see
`docs/designer-comforts-plan.md` for the list). The biggest of the five, and the one that serves
the "alive without you" pillar (`docs/vision.md`) most. Nothing here is built yet.

## Why

The user wants AI ships to use the hulls drawn in the designer, to define pools of them by role,
and to place them in the world from the designer. Today (as read in `src/sim.ts`, 2026-11-24):

- Pirates and defenders are `addFighter`: a default-model ship with reverse and strafe fitted,
  flown by `FighterPilot`. The defender, drone and pirate hulls exist in `src/hulls.json`, but no
  code uses them: their `usedBy` flags (`HULL_USES` in `src/fitting.ts`) are stored and never read.
- Traffic is `addTraffic`: racers and floaters in the counts `trafficRacers` and `trafficFloaters`
  (`src/tuning.ts`), per base, flown by the ship pilot with `buys = "upgrades"` and `flees`.
- A lost traffic ship goes on its nearest base's `lostTraffic` (model only); `spendBaseParts`
  rebuilds a defender first, then the lost ship, at `hullPrice`, from the station's money and
  parts.
- The pirate base builds pirates from `pirateCredits` up to `pirateCap` (`spendPirateCredits`).
- Drones are bought by the player (`dronePrice`) and flown by `DronePilot`.
- Actors have their own money: `ship.credits`, through `accountOf` (a defender spends its base's).

Whether templated, spawned ships make the world feel more alive is a guess, so step 1 is the
smallest version the user can try.

## The picture

Items marked *decided* are the user's calls; the rest is my proposal, open to veto.

**One kind of ship**

- **Every AI ship is a hull with fitted parts, like the player's** (*decided*). No separate
  light-weight ship kind.
- **AI-only hulls and parts are ordinary data with an "AI only" flag** (*decided*). Shops and the
  new-game pick never offer them. The designer gets **copy hull** (from the drawing plan) and
  **copy part** (*decided*), so an AI version starts from an existing one. Proposal for copy part:
  a new part entry in the ship file with `copyOf` the source id; it behaves as its source in code
  and has its own stats and art.
- **Roles say how much of the player's rules a ship follows** (*decided*). The first roles
  (*decided*):
  - **cargo, minimal**: no fuel, a fake computer (no programs; the role's behaviour is built in),
    but it **buys and sells its cargo for real money** (*decided*), so stations feel it either way
    and the closed loop of traffic, pods and money doesn't leak.
  - **cargo, complex**: lives by the player's rules: fuel, computer, programs, buying upgrades.
    Today's traffic is this role.
  - **pirate**, **defender**, **drone**: today's `FighterPilot` (by faction) and `DronePilot`.

  Miners and creatures come later. From outside you can't tell a minimal ship from a complex one
  (*decided*: they "blend seamlessly").

**Loadouts, templates and factions**

- **Loadouts become general** (*decided*: "we can re-purpose this"). Today a `Loadout` in
  `src/fitting.ts` is a name plus core and comfort programs for one loop. It grows into a fit
  (a part per mount) plus programs, with a use: **loop** (as today), **bare hull** (replaces each
  mount's `default`, the "Bare hull comes with" column), **preview** (what the designer overlays,
  today view state keyed `model:mount`) and **spawn**. A spawn loadout is tagged with the role it
  serves (proposal, agreed).
- **A template is a role plus a weighted pool of hulls** (*decided*). Spawning picks a hull by
  weight, then one of that hull's spawn loadouts for the template's role. A hull with no spawn
  loadout for the role can't sit in that pool: the designer warns (proposal, agreed).
- **Faction is not on the template** (*decided*). It is set where ships are spawned: on the spawn
  point, or on a station's rebuild entry. The faction picks the palette (drawing plan) and, for
  fighters, which side they're on. Today's factions are pirate, defender and none (traffic).
- **What drops when an AI ship dies** (*decided* lean, user: "TBA"): its cargo drops; a part drops
  only if its part has the **drops** flag, set in the part designer. Proposal: today's parts start
  with the flag on, so loot is unchanged; AI-only parts and copies start with it off.

**Spawn points**

- **A spawn point is a place in the world designer** (*decided*): spawn X ships from template Y
  with faction Z, when a new game starts. Proposal: a new place kind, `spawn`, placed and orbiting
  like any other place, with fields `template`, `count`, `faction`, `homeLocked`.
- **Home locked or not** (*decided*). Locked: the ships always return to the spawn point. Unlocked:
  their home moves like the player's, to whatever base is closest. Proposal: a cargo ship whose
  home is a bare point still sells at the nearest base that buys; home is where it rests.
- **One-shot** (*decided*): it seeds the new game only. Endless spawning is a backlog item.

**Station rebuilds**

- **Stations get a rebuild option** (*decided*): proposal, a list of entries on the station (and
  the pirate base), each a template, a count to keep and a faction. A lost ship is rebuilt from its
  entry. This replaces `trafficRacers` / `trafficFloaters` / `defenders` and the pirate base's own
  builder, so there is one way to make AI ships (*decided*: today's AI moves onto templates).
- **Who pays** (*decided*): the rebuild costs the hull price plus the parts in the chosen loadout.
  The owner (the lost ship's own money, `accountOf`) pays if it can afford it; only if it can't
  does the station pay, out of its own money and parts as `spendBaseParts` does now. So a station
  hit by pirates gets poorer. Minimal ships are cheap to rebuild because their parts cost little.
  Proposal: `lostTraffic` keeps the lost ship's template, loadout and credits, not just its model.
- **The pirate base** pays from `pirateCredits` as now, keeping its cap as the entry's count.

## The build

### 1. Templates and a spawn point (stop here for the user to try)

The smallest slice: templates (role plus weighted hulls) on a new Templates page of the hull
designer, stored in the ship file. A spawn point place kind in the world designer. On a new game,
each spawn point makes its ships: hull by weight, fitted with that hull's **bare** fit for now,
flown by today's pilot for the role (pirate/defender `FighterPilot`, drone `DronePilot`, complex
cargo the traffic pilot), faction and home as set. The AI-only flag on hulls (hidden from shops
and new game). Existing spawning is untouched.

*Stop here for the user to try:* put a spawn point of five pirates in the pirate hull near the
start and see them live.

### 2. General loadouts

`Loadout` grows a fit, a use and a role tag; bare-hull defaults and the designer preview move onto
loadouts (the ship file reader migrates `default` on mounts into a bare loadout). Spawning picks a
role-tagged spawn loadout. The designer's pool warning. Copy part and the AI-only flag on parts.

### 3. Today's AI moves onto templates

Shipped templates that reproduce today's ships (fighters and traffic as they fly now), station
and pirate-base rebuild entries that reproduce today's counts, player drones from a drone
template. Delete the coded paths (`addFighter`'s fixed fit, the traffic counts, the pirate base's
own builder). The game should look and play the same afterwards. Run `npm run parity` (and the
no-player run in `src/profile`, see `docs/no-player-runs-plan.md`) in the background to compare
the economy before and after.

### 4. Minimal cargo

The role that skips fuel and programs but trades for real. A world can mix minimal and complex
cargo ships from one template pool.

### 5. Rebuild cost and drops

Rebuild at hull plus loadout price, owner first, station second; `lostTraffic` remembers what it
needs. The part drops flag and the death drop rule.

## How we'll know

- Unit tests: weighted hull pick (seeded); loadout pick by role; the pool warning for a hull with
  no loadout for the role; a spawn point makes `count` ships of its faction at new game only;
  home locked returns to the point, unlocked picks the nearest base; AI-only hulls and parts never
  offered in a shop or the new-game pick; ship file round trip of templates and general loadouts,
  and an old file's mount defaults read as a bare loadout; rebuild charges the owner first, then
  the station; a minimal cargo ship burns no fuel and earns credits selling; on death cargo drops
  and only flagged parts drop.
- After step 3, the existing sim tests pass unchanged, and the background parity / no-player runs
  show the economy where it was (logged to `docs/parity-log.md`, not gating).
- `npm test` and `npm run build` pass. Bump `SAVE_VERSION` (now 9 in `src/save.ts`) when ships
  carry a template or loadout in the save.
- **Try it:** in the world designer, add a spawn point near the start: template pirate, count 5,
  faction pirate, home locked. New game: five pirate-hull ships hang around that point and chase
  you like today's pirates. After step 3, a normal new game looks as it did; kill a trader and
  watch its base rebuild it later.

## Needs first

- `docs/hull-drawing-plan.md`: hulls as data (a model is a name) and copy hull. Without it there
  can be no AI-only hulls.
- `docs/designer-comforts-plan.md`: the multi-select, for template pools and station entries.
- Part ids are a TypeScript union today (`PartId` in `src/parts.ts`); copy part needs ids that can
  come from the file. Check this before step 2.

## Not in this build

- Endless spawning from a spawn point (backlog).
- Miners and creatures as roles.
- The station's scripted fuel `Hauler` (`src/sim.ts`), which is not a ship with a hull.
- AI ships buying hulls at stations.
- Whether the player can pick up AI-only parts (the user: "TBA"); for now only flagged parts drop.
