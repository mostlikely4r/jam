# Many mounts plan

Written 2026-11-25, from three inbox notes the user wrote while fitting hulls in the designer
(I-1, I-3, I-9). Built 2026-11-25, both steps (`Q-27`).

## Why

A hull can have any mounts the designer gives it, but the code behind turrets and tractors still
expects one of each:

- **Turrets** (I-1, the user's own fitting): only the first turret mount takes a gun.
  `src/fitting.ts` has one gun slot for every turret, the fit key `turretGun`, and
  `turretMount()` (`fitting.ts:820`) stops at the first mount holding a turret. The ship has one
  `turretAngle` (`sim.ts:203`), so two turrets could not point different ways either. Also, once a
  turret is on, `mountsFor` sends every gun to `turretGun` (`fitting.ts:891`), so a plain gun mount
  next to a turret can't be filled.
- **Tractors** (I-3, the user's own fitting): with two tractors only one works and one cone shows.
  `Sim.tractorOn` and `tractorCone` (`sim.ts:6540`) read `ship.parts` (a set of part ids), and
  `pullOre` uses `mountWith(ship, "tractor")` (`fitting.ts:735`), which returns the first. The
  player's cone in `Renderer.drawTractor` (`render.ts:670`) is drawn from the ship's centre along
  its nose: it ignores the mount's place and facing even with one tractor.
- **Other parts on a turret mount** (I-9, the user's question): the data already allows it. A
  mount's `types` is a list, so ticking "tractor" or a thruster type on a turret mount in the
  designer lets those parts on. A thruster also needs the mount's `role` (which control fires
  it), which the designer sets per mount. What stops it working in play is the code above, so
  this plan answers I-9 too: once each mount counts on its own, any part on any mount it fits
  works.

## The picture

- **Every mount counts on its own** (*decided*: the user's notes ask for exactly this). Two
  turrets are two turrets, each with its own gun; two tractors are two beams.
- **A turret's gun slot is named after its turret** (proposal): `turretGun:<mount id>` instead of
  `turretGun`. `mountsOf` adds one gun mount per fitted turret, placed and faced as that turret.
- **A gun goes on a free turret first, then a free gun mount, then swaps** (proposal). Today's
  "a gun always goes on the turret" becomes "on the first turret without a gun"; with every
  turret armed, a plain gun mount takes it.
- **Each turret turns on its own** (proposal): `turretAngles: Partial<Record<MountId, number>>`
  and the matching previous angles, in place of `turretAngle`/`prevTurretAngle`. All of them aim
  at the same thing (the tracked rock or the aim), each from where it sits, at
  `turretTurnSpeed`. A turret's rest angle is its own mount's facing.
- **Each tractor catches with its own cone** (proposal): the cone's apex is the tractor's mount
  (ship position plus the mount offset, turned with the ship), it looks the mount's way, and its
  width is the part's (the 360 tractor all round, the cone tractor `tractorCone`). A piece is
  caught if any working tractor's cone holds it; caught ore is pulled in as today, once per piece
  (two tractors widen what is caught; they don't pull twice as hard). The clamp is left as it is:
  it is one-per-ship by design (`hasClamp`).
- **The player sees one cone per tractor**, from its mount, turned its way.

## The build

### 1. Turrets — *built*

- `fitting.ts`: `turretMounts(ship)` (all of them) replaces `turretMount`; `mountsOf` adds a
  `turretGun:<id>` mount per turret; `mountsFor`, `fitPart` and `unfit` handle the gun of the
  turret being fitted or taken off (a gun on the plain mount moves up onto the first new turret;
  a turret's gun drops back onto that turret's mount when the turret goes, as today).
- `sim.ts`: every `turretGun` use (`turnTurret`, `gunLine`, the hull swap's carry-over around
  `sim.ts:4280` and `4303`, the mount checks at `4577`, `4629`, `4665`), plus `turretAngles`.
  `gunLine` takes the angle of the turret the gun sits on.
- `render.ts:1552` and `shipArt.ts` (`drawTurret`, `outsideParts`): draw each turret with its own
  gun and angle. `inventory.ts:243`: list each turret's gun port.
- Auto-mine's per-gun "Fires" tweak already keys by mount id, so each turret gun gets its own
  row with no extra work: check it does.
- **Saves:** a saved `turretGun` key moves to the first turret's `turretGun:<id>` on load. Bump
  `SAVE_VERSION` (`src/save.ts`, now 10).

### 2. Tractors — *built*

- `sim.ts`: `tractorMounts(ship)` (working tractor modules, the clamp left out); `tractorOn` is
  "any of them, and room in the bay"; `pullOre` catches with each one's cone from its own apex;
  `tractorCone(ship)` goes, replaced by the cone of a part.
- `render.ts`, `drawTractor`: one faint cone or circle per tractor, from its mount, turned its
  way; the lines to caught ore stay as they are.
- AI traffic that buys a tractor keeps buying one; nothing in its buy order changes.

### What changed from the plan

- The helpers live where the other mount helpers are: `turretMounts`, `turretGunId`,
  `isTurretGun` and `tractorMounts` in `fitting.ts`, so the renderer asks them too.
  `mountSpot(ship, mount)` is new in `sim.ts`: where a mount sits in world units, shared by the
  turret aim, a tractor's apex and its cone.
- `tractorCone` keeps its name but takes the tractor's own part instead of the ship, so each beam
  is as wide as the part that makes it.
- Two places asked a single ship-wide turret angle and now ask for the best-lined-up turret:
  `Sim.turretOff`, used by `bot.ts` (when to fire) and `pilot.ts` (whether the gun is on the rock).
- `render.ts` took the turret from `ship.fit.gun` — the mount the floater happens to call "gun" —
  so a turret on any other mount drew nothing. It now draws every turret the ship has.
- `mountWith` had no other caller once `pullOre` stopped needing "the first tractor": it's gone.
- The old `turretGun` key is moved onto the first turret's own mount in `Sim.restore`'s per-ship
  fill, as the plan asked. No save in that shape can reach it — the `SAVE_VERSION` bump turns
  those away at the door — so it's a safety net for a snapshot made by hand or by a test, and
  `src/start.json` was re-warmed for version 11 (`npm run warm -- 60 1 --ship`).
- `src/designer/homepair.test.ts` pins `SAVE_VERSION` so a bump is deliberate: it now pins 11.

## How we'll know

- Tests (`src/fitting.test.ts`, `src/sim.test.ts`): a hull with two turret mounts takes two
  turrets and two guns, and each gun fires along its own turret; with a turret on, a second gun
  goes on the plain gun mount; taking a turret off drops its own gun back. Two tractor mounts
  facing opposite ways catch ore behind and ahead; ore outside both cones isn't caught. A save
  with the old `turretGun` key loads with the gun on the first turret.
- `npm test` and `npm run build`. The tests above are in `src/fitting.test.ts` ("each mount
  counts on its own"), `src/sim.test.ts` ("turret mount"), `src/hullbuy.test.ts` (two turrets
  carried onto a hull with two) and `src/save.test.ts`.
- **Try it:** in the designer, give a hull two turret mounts and two tractor mounts facing
  different ways (or tick "tractor" on a turret mount, for I-9). Start in that hull, buy two
  turrets, two guns and two tractors. Both turrets turn and fire; there are two cones in the right
  places, and ore is caught in both.

## Needs first

Nothing: mounts, turrets and tractors are all built (`docs/fitting-plan.md`, Q-17).

## Not in this build

- Turrets aiming at different targets (each at its own pick): later, with the hunt's fits.
- Clamps on more than one mount.
- Stacked pull strength from several tractors.
- The traffic tractor beam lines (S-45, its own fix).
- The clamp on more than one mount, and turrets picking their own targets: as above.
