# Targeting plan: pick things, see how they move

*2026-11-20. Built 2026-11-20: all three steps, tests and all. Line numbers are from `a257e36`.
A few things landed differently from the proposal, noted at the end. Items marked **decided**
are the owner's calls; everything else is a proposal, open to veto.*

## Why

Many future features act on "that thing": motion orders (face, approach, keep at range, orbit,
follow, dock), attack (auto fire, turret tracking), and module effects (tractor, scan, hack,
analyse). All of them need a way to pick things first. Today left click on the canvas does
nothing (`main.ts:1253` only listens to the right button), and it has been kept free for this.

Picking alone does little, so the first slice also builds the first program that uses it: a
**relative-motion indicator**, which shows how the picked things move against you. Matching a
drifting rock by eye is a skill even on the easy ship, and this program makes it easier.

Adding programs also strains the computer. Today it has 2, 4 or 6 program slots (basic, flight
and navigation computer, `parts.ts`), shared with click to move, click to turn, the spin
stabilizer and the rest. Before any redesign of the computer, we need a way to see whether the
programs a ship needs for a loop still fit. That's the first step here.

## The picture

### Targets

- **Several targets, no limit on how many can be picked** (**decided**). Limits, if any, come
  later and only on things that *act* on targets.
- **Left click selects one target. Ctrl + left click adds or removes one. Left drag selects with a
  box** (**decided**). Right click stays for move orders, as today.
- **A plain box replaces the selection. Ctrl + box adds to it** (proposal).
- **Left click on empty space clears all targets** (proposal).
- **One primary target, and the rest is a queue** (**decided**). The primary is the first one
  picked (proposal). Left click on a target that's already selected makes it primary (proposal).
  When the primary goes, the next one in the queue takes its place.
- **Queue order:** in the order picked. A box adds its catch sorted by distance from the ship,
  nearest first (the owner's suggestion, adopted as a proposal).
- **Visible:** each target gets a box drawn round it, and the primary's is brighter (proposal).
- **Lock range** (**decided**: targets drop past a maximum distance). A target further than the
  range from the ship is dropped and doesn't come back on its own when it returns (proposal).
  The range is a stat of the Targeting program (proposal: a tuning value `targetRange`).
- **What can be targeted:** rocks, ships, stations and loose items, ore included (**decided**:
  ore can be targeted).
- **A rock that breaks keeps its selection on the pieces** (**decided** 2026-11-06). The pieces
  join the queue where the rock was. If the rock was primary, its largest piece becomes primary
  (proposal).
- **A target that leaves the world** (picked up, deleted, docked out of sight) simply drops out.
- **Targets live on the ship, not on the player** (proposal): `targets: string[]` on `Ship`
  (`sim.ts:124`), primary first. Only the player sets them for now, but any ship can hold a
  list. That keeps "the player and other ships use the same commands" open.
- Targets aren't saved. A loaded game starts with none (proposal).

### Programs and tweaks

- **The starter ships come without targeting** (**decided**). It's a program, bought in the
  dock shop like the others (proposal: tier 0).
- **Without the Targeting program loaded, left click does nothing**, as today.
- **Tweaks:** a program can carry tweaks, each a choice between named options (**decided**:
  "two tweaks, one with three options, on purpose", so the system stays open to more).
- **The rule for tweaks** (**decided**): every tweak must have a purpose, and no option may be
  the best pick 95% of the time. A tweak changes *how* a program does its job. A different job
  is a different program.
- **When:** tweaks can be changed any time, in flight too, on programs that are loaded or only
  owned (proposal, agreed in principle). Loading and unloading programs stays a dock-only act
  (`sim.ts:3265`), so docking still decides *which* programs run. That's the line between
  switching loops and adjusting one.
- **Friction** (**decided**): tweaking is mostly for between activities (planning, preparing),
  and some friction is fine. The friction is opening the inventory and clicking. There are no
  hotkeys and no cooldowns in this plan.
- **How** (**decided**): in the inventory screen (I), **right click on a program chip opens its
  tweak menu**. Left click and drag keep moving programs between slots and spares, as today
  (`inventory.ts:347`). The menu lists each tweak as a row of its options. The current pick is
  highlighted and a change applies at once (proposal). A program with no tweaks shows a note
  saying so.
- **The picks belong to the pilot**, held per program next to `ship.software` and saved with
  it, so they survive death the same way the programs do (proposal).

### The Targeting program

One tweak, **"Box picks"** (**decided**: the box selection gets a tweak), with the options
**rocks / ships / everything**, default rocks (proposal). "Everything" includes loose ore and
stations. A click picks whatever is under it, whatever this tweak says. This is what stops a
box across a worked field from filling with scrap.

### The Relative lines program

- **Its own program, separate from Targeting** (**decided**). It needs Targeting loaded, or it
  draws nothing. It's the first program that needs another program.
- **Tweak "Show"** (**decided**): **main target only / all targets / targets that will collide**.
- **Tweak "Relative to"** (**decided**): **player ship / main target**.
- **The line** (proposal): from the target's centre, along the target's velocity minus the
  reference's velocity, as long as that relative velocity × `relativeSeconds` (a tuning value,
  start at 2). So a long line means fast, and no line means matched.
- **Inversion** (**decided**): with "main target only" and "relative to main target", the line
  would be the main target against itself. Instead it draws **the player's ship relative to the
  main target**. With "all targets" and "relative to main target", the main target itself gets
  no line (proposal).
- **"Will collide" means colliding with the reference** (**decided**): with your ship when
  relative to the player ship, with the main target when relative to it. The test (proposal):
  straight-line paths, the closest approach within `collideSeconds` (start at 10) comes closer
  than the two radii added together. It's honest about what it is: the prediction only goes
  wrong when something turns, thrusts or bounces.
- The existing travel line on the player's own ship (`render.ts`, `drawShip`) stays as it is.

### The loadout table (designer)

The question it answers (**decided**): do the program sets a hull is likely to run fit its
computer, and is a misfit a deliberate trade-off or creep from programs that eat capacity?
Having to go to the station to switch from mining to long trips is fine. Not being able to fit
what makes a single loop comfortable and fun is creep.

- **Each hull has its own loadouts** (**decided**: the racer's mining loop isn't the
  floater's). A loadout has a name (such as "mining" or "long trip"), a **core** list (what the
  loop needs to work) and a **comfort** list (what makes it pleasant) (proposal).
- **Not every hull is meant for every loop** (**decided**). A hull lists only its own loops. A
  loop it isn't meant for isn't shown, so a red cell always means creep.
- **A table on the designer, not a test** (proposal, accepted). Hulls down the side, their
  loadouts across. Each cell shows "core fits", "core + comfort fits" or "over by N" against
  the computer the hull comes with, and against the largest computer it can mount. It also
  warns when a loadout holds a program without the program it needs (Relative lines without
  Targeting).
- Stored on each hull's record in `src/hulls.json` and edited on the designer's Hulls page
  (`src/designer/designer.ts`), next to the hull's default programs (around line 409). The
  table can be its own section on the Programs page, or a page of its own.

## What to build

Three steps, each played before the next.

### 1. The loadout table

- Add `loadouts` to the hull records (`src/designer/hulls.ts`, `src/hulls.json`): name, core
  program ids and comfort program ids. Read it defensively, like `readProgram` in
  `programs.ts`: unknown ids are dropped.
- Editing on the Hulls page, and the table, as described above. Slot counts come from the
  computer parts (`slots` in `parts.ts`, and `computerSize` and `programSlots` in `fitting.ts`).
- Fill in a first "mining" loadout and a "long trip" loadout for the starter hulls from today's
  programs, so the table has something to show. Add Targeting and Relative lines to them once
  they exist.
- *Works when:* the table shows today's starters, and moving a program between core and comfort
  changes the cells.

### 2. Targeting, and the tweak system

- **Tweak data:** `ProgramDef` (`programs.ts`) gets `tweaks: { id, name, options: { id, name }[],
  default }[]`, read defensively (a bad default falls back to the first option). Edited on the
  designer's Programs page.
- **Pilot's picks:** per program id, next to `software` on the ship, copied and restored where
  `software` is (`sim.ts:3189`, `sim.ts:3205`), and saved with it. A missing pick reads as the
  default.
- **Tweak menu:** right click on a program chip in `inventory.ts`, for loaded and spare chips.
- **The Targeting program** in `src/programs.json`, with its "Box picks" tweak.
- **Selection input** in `main.ts`: left press, release and drag, read like the right-button
  code at `main.ts:1253` (the same `DRAG_PIXELS` decides click against drag). What's under a
  click: the nearest targetable thing within the same pick reach as `near` (`main.ts:1240`).
  The ship itself isn't a target.
- **Target list on the ship**, with range drop, rock-break hand-over and removal on leaving
  the world, all done in the sim step, not the renderer.
- **Boxes** in `render.ts`, primary brighter. A box preview while dragging.
- *Tests:* box catch sorted by distance; ctrl toggles; plain box replaces; the range drop holds
  after coming back; a broken primary hands over to its largest piece; a picked-up ore piece
  leaves the list; tweak reading from a file with bad data.
- *Play:* buy Targeting, pick a rock, ctrl-pick two more, box a cluster (only rocks come), switch
  "Box picks" to everything in flight and box again (ore comes too), fly out of range and see
  them go.

### 3. Relative lines

- **The program** in `src/programs.json` with its two tweaks.
- **Line and collision maths** as pure functions (its own small module, with a test file), used
  by `render.ts`.
- **Drawing:** a line per shown target per the tweaks, the inversion case, nothing when
  Targeting isn't loaded.
- *Tests:* the relative velocity for each reference; the inversion; the collision test on head-on,
  near-miss and diverging pairs, and a pair that meets only after `collideSeconds`.
- *Play:* pick a slow rock and match it by flying until its line shrinks to nothing. Then pick
  several, set "will collide" relative to the main target, and shoot near it. The pieces heading
  into it should be the ones showing lines.

## Not doing

- **A computer redesign** (memory, processor and storage instead of slots). Later, once the
  loadout table shows where slots pinch.
- **Anything acting on targets** beyond the lines: motion orders, auto fire, turret tracking,
  module effects. Each is its own program or module, later.
- **Other ships locking onto you, and a warning for it.** Targets on the ship keep it possible.
- **Tweak hotkeys, a HUD tweak strip, cooldowns on tweaking.**
- **Shift for anything in targeting.** Shift is the throttle.
- **A limit on how many targets a ship holds.**

## How it went

- **Targets are references, not ids.** Rocks, loose ore and stations have no ids to hang in a
  `string[]`, so `Ship.targets` holds the things themselves and the sim checks each is still in
  the world. They still aren't saved: a restore clears every ship's list.
- **A plain click on a picked target promotes it.** The rest of the queue stays, and it becomes
  the main target; clicking something not picked replaces the queue with it (both proposals,
  landed). Clicking nothing still clears everything.
- **Targeting counts as loaded when it's running.** Every gate reads the working set, like every
  other program, so a damaged computer drops the picks and left click does nothing until it's
  fixed. Clicking a thing past the lock range does nothing at all, rather than clearing.
- **Tweaks sit on the fitting beside `software`.** `ship.tweaks` is program id, then tweak id,
  then the option picked; a missing pick reads as the default. It is copied where `software` is
  (changes in a dock, a rebuild after death) and saved with the ship.
- **A program's needs are data.** `ProgramDef.needs` names programs a program does nothing
  without. Relative lines needs Targeting; the loadout table is what warns about a loadout that
  leaves it out. The game itself just follows the tweaks and the programs' own checks.
- **The loadout table is a section on the Programs page**, with tweak and needs editing beside
  it. The Hulls page edits each hull's loadouts under Default programs. A second loadout with
  a name a hull already has is ignored when read, and the editor refuses to make one.
- **The first loadouts:** the racer's long trip (core: Autopilot; comfort: System chart), and
  the floater's mining (core: Click to move, Click to turn; comfort: Spin stabilizer, Speed and
  distance meters, Targeting, Relative lines) and long trip (core: Click to move, Autopilot;
  comfort: Retro, System chart). Mining runs over the floater's own 4 slots, so it shows
  "core only" against its own computer and fits the 6 it can mount: a real trade-off, and the
  first thing to look at with the table.

