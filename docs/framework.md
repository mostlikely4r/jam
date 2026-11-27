# Framework: entities, parts and capabilities

Written 2026-11-27 with `docs/roadmap.md`. The shape the code moves toward, from proof of concept
to framework. The user's principle (*decided*): entities are closed for change and open for
extension; things that share characteristics share them (a station and a ship can both be drawn in
the hull designer, and much more). "It's all code", behaviour written for one station or one ship,
is temporary. The rules for agents are the Architecture section of `AGENTS.md`.

## Composition, not a parent tree

The shared part comes from composition, not from a class tree. Trees break in games: is a carrier a
ship or a station? A drone dock on a moving ship? A derelict? So:

- **An entity is data:** a frame, the parts fitted to its mounts, how it is anchored or moves, an
  account.
- **Behaviour comes from parts.** A dock part makes something dockable, a shop part makes it sell,
  a factory part runs recipes, a thruster makes it move.
- **Systems ask about capabilities, never about types.** The docking code asks "what has a dock?",
  never "is this the station?".

A new behaviour is a new part kind plus the system that reads it. Nothing existing changes.

## Words

- **Frame:** the designed body of a ship or a station, drawn in the hull designer. (In code and in
  the designer it is still a hull.)
- **Mount:** a place on a frame, inside (bays, tanks, a computer, a vault) or outside (turrets,
  tractors, a dock, cargo blocks, a radar dish). Inside or outside is a property of the mount, not
  of ship against station.
- **Part:** whatever is fitted to a mount. "Station module" is not a separate idea: a station's
  upgrades are outside parts on its frame.
- **Capability:** what a part lets its entity do (dock, store, trade, refine, repair, produce,
  thrust, fire). Systems read these.

## A station's core

Strip everything that can be built and a station is:

1. **Who:** a name, an owner, an account.
2. **Where:** an anchor, an orbit or a fixed point.
3. **A frame with mounts.**

Everything else is a part with a recipe. A frame with no parts is a claim or a construction site:
it can't trade, store or dock, but it exists, owns things and can be built on. Building happens by
delivery: materials go to the part under construction, not into a station hold, as the clamp tow's
blocks already build a deposit and its turrets.

## Recipes

One shape for every item (*decided*): ore, materials, parts, ammo, fuel, hulls, programs, station
parts.

- **Inputs:** consumed.
- **Conditions:** needed, not consumed. A factory part, power (later), a blueprint, a place
  (sunlight, a nebula, low gravity).
- **Output and time.**

A blueprint is a condition: holding it lets a factory run the recipe. A program is information, so
its recipe is mostly conditions (a blueprint and compute time).

## What parts consume

A part declares what it consumes: an item from where its entity stores it (fuel for thrusters, ammo
for gun 1), and later power. Thrusters, guns, lasers and ion drives then differ only in their data.
Power on a ship (a budget: what can run at once) and power at a base (a production condition) may
share items, a reactor and its fuel, but are designed as two things.

## Behaviour by choice, not by type

Unifying ships and stations changes no behaviour by itself. Solid to ships is a capability a frame
has or lacks: stations have it, ships don't, and ship collisions (S-19) stay parked.

## Pulled, not up front

Each behaviour becomes a part the moment the economy needs it (*decided*). The first move turns
today's base into a frame that plays the same, with a test that says so; then the second station
pulls dock, counted storage and a trade point; shop, refinery and repair follow when a station
without them shows up. Until then they stay code, marked as temporary.
