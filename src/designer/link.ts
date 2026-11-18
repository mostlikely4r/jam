/**
 * What the game flies from the designer's layout. The game's own world is fixed in shape: a
 * planet at the centre of a field's orbit, with a station and a pirate base round the field.
 * The designer's tree is free, so this finds those four in it. Anything else is map only.
 *
 * The tuning is the one channel between them. The designer writes into the same values the
 * sliders use, and reads them back when it opens, so whichever was changed last wins.
 */
import { TICK, type AnchorSpec, type FieldSpec, type Orbit, type OrbitRing, type Poi, type Sim, type SolidBody, type Spawn, type StationSpec } from "../sim";
import type { Tuning } from "../tuning";
import { SHIP_CHOICES, copiesOf, isBody, parentOf, pathTo, walk, type Copy, type NodeKind, type World, type WorldNode } from "./world";

/** Each POI's orbit angle at clock 0, in radians. */
export type Phases = Partial<Record<Poi["name"], number>>;

/** The designer's way into the running game. */
export interface GameLink {
  tuning: Tuning;
  clock(): number;
  phases(): Phases;
  /** `keep`: the places carry on from where they are, as after loading a save, rather than jump to `phases`. */
  apply(phases: Phases, bodies: SolidBody[], spawns: Spawn[], fields: FieldSpec[], stations: StationSpec[], keep?: boolean, anchors?: AnchorSpec[]): void;
  /** Where the player's ship and the field are now, in the game's own frame. */
  where(): { ship: { x: number; y: number }; field: { x: number; y: number } };
  /** Every other ship in the world now, the player's left out, in the game's frame. */
  ships(): ShipMark[];
}

export type ShipMarkKind = "traffic" | "pirate" | "defender" | "drone" | "hauler" | "black market";

/** A ship as the designer marks it: where it is and how fast it moves, both in the game's frame. */
export interface ShipMark {
  kind: ShipMarkKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Every ship but the player's, cargo ships included. Speed comes from the last tick's move, so
 * it counts the carrying a ship gets from its field, and works for trip records too.
 */
export function shipMarks(sim: Sim): ShipMark[] {
  const mark = (kind: ShipMarkKind, body: { x: number; y: number; px: number; py: number }): ShipMark => ({
    kind,
    x: body.x,
    y: body.y,
    vx: (body.x - body.px) / TICK,
    vy: (body.y - body.py) / TICK,
  });
  const marks: ShipMark[] = [];
  for (const pilot of sim.traffic) marks.push(mark("traffic", pilot.ship));
  for (const pilot of sim.fighters) marks.push(mark(pilot.ship.faction === "defender" ? "defender" : "pirate", pilot.ship));
  for (const pilot of sim.drones) marks.push(mark("drone", pilot.ship));
  for (const base of sim.bases) if (base.hauler) marks.push(mark("hauler", base.hauler));
  if (sim.blackMarket) marks.push(mark("black market", sim.blackMarket));
  return marks;
}

/** Degrees to radians; a node from before spin phases has none. */
function toRadians(degrees: number | undefined): number {
  return ((degrees ?? 0) * Math.PI) / 180;
}

export interface Linked {
  planet: WorldNode | null;
  field: WorldNode | null;
  station: WorldNode | null;
  pirates: WorldNode | null;
}

/** The first field in the tree, the body it directly orbits, and the base and station on it. */
export function linkedNodes(world: World): Linked {
  const field = walk(world).find((entry) => entry.node.kind === "field")?.node ?? null;
  const parent = field && parentOf(world, field);
  const under = (kind: NodeKind) => field?.children.find((child) => child.kind === kind) ?? null;
  return { planet: parent && isBody(parent.kind) ? parent : null, field, station: under("station"), pirates: under("pirate base") };
}

/**
 * Every body in the tree and its copies, placed as the game sees it: round whatever the field
 * orbits, which the game keeps still at its centre. A body's place is the sum of its own chain
 * of orbits, less the chain of that centre.
 */
export function bodiesFor(world: World): SolidBody[] {
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => isBody(node.kind))
    .flatMap((node) => {
      const copies = node === world.root ? [] : copiesOf(node);
      return [null, ...copies].map((copy, index) => ({
        name: index === 0 ? node.name : `${node.name} ${index + 1}`,
        kind: node.kind,
        radius: node.radius,
        surface: node.surface,
        pullStart: node.pull,
        pullFull: node.pullFull,
        pullAccel: node.pullAccel,
        atmosphere: node.atmosphere,
        burnSpeed: node.burnSpeed,
        spinPeriod: node.spinPeriod,
        spinPhase: toRadians(node.spinPhase),
        orbits: place(node, copy),
        rings: ringsOf(world, place, node, copy),
      }));
    });
}

/**
 * Every field beyond the first, and every copy of any field, as rocks the game can fly
 * through. Their stations and other children stay on the map.
 */
export function fieldsFor(world: World): FieldSpec[] {
  const { field: first } = linkedNodes(world);
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => node.kind === "field" && node !== world.root)
    .flatMap((node) =>
      [null, ...copiesOf(node)]
        .map((copy, index) => ({ copy, index }))
        .filter(({ copy }) => node !== first || copy !== null)
        .map(({ copy, index }) => {
          const [carryFull, carryNone] = carrying(node);
          return {
            id: `${node.id}:${index}`,
            name: index === 0 ? node.name : `${node.name} ${index + 1}`,
            radius: node.radius,
            rocks: node.rocks,
            rockDrift: node.rockDrift,
            rockInflow: node.rockInflow,
            // Left out with none, so a field without drops is the spec it always was.
            ...(node.drops.length > 0 ? { drops: node.drops.map((drop) => ({ ...drop })) } : {}),
            carryFull,
            carryNone,
            rotationPeriod: node.spinPeriod,
            spinPhase: toRadians(node.spinPhase),
            orbits: place(node, copy),
            rings: ringsOf(world, place, node, copy),
          };
        }),
    );
}

/**
 * Every station beyond the first, and every copy of any station, as docks that buy ore,
 * repair, and rebuild wrecks if they have a shipyard.
 */
export function stationsFor(world: World): StationSpec[] {
  const { station: first } = linkedNodes(world);
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => node.kind === "station")
    .flatMap((node) =>
      [null, ...copiesOf(node)]
        .map((copy, index) => ({ copy, index }))
        .filter(({ copy }) => node !== first || copy !== null)
        .map(({ copy, index }) => {
          const [carryFull, carryNone] = carrying(node);
          return {
            id: `${node.id}:${index}`,
            name: index === 0 ? node.name : `${node.name} ${index + 1}`,
            rotationPeriod: node.spinPeriod,
            spinPhase: toRadians(node.spinPhase),
            orbits: place(node, copy),
            rings: ringsOf(world, place, node, copy),
            carryFull,
            carryNone,
            shipyard: node.shipyard,
            storage: node.storage,
            blueprints: node.blueprints,
            ...(node.items.length > 0 ? { items: node.items.map((each) => ({ ...each })) } : {}),
          };
        }),
    );
}

/** Every anchor in the tree and its copies, for the game to find and chart. */
export function anchorsFor(world: World): AnchorSpec[] {
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => node.kind === "anchor" && node !== world.root)
    .flatMap((node) =>
      [null, ...copiesOf(node)].map((copy, index) => ({
        id: `${node.id}:${index}`,
        name: index === 0 ? node.name : `${node.name} ${index + 1}`,
        radius: node.radius,
        orbits: place(node, copy),
        rings: ringsOf(world, place, node, copy),
      })),
    );
}

/** Every place a new game can start, copies included, by ship. */
export function spawnsFor(world: World): Spawn[] {
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => node !== world.root && !isBody(node.kind))
    .flatMap((node) => [null, ...copiesOf(node)].flatMap((copy) => node.spawns.map((ship) => ({ ship, orbits: place(node, copy) }))));
}

/** A node's own true orbit for the chart: round where its parent is in the game's frame, whatever the frame's centre is. */
function ringsOf(world: World, place: (node: WorldNode, copy: Copy | null) => Orbit[], node: WorldNode, copy: Copy | null): OrbitRing[] {
  const parent = parentOf(world, node);
  if (!parent || node === world.root) return [];
  return [{ center: place(parent, null), radius: copy?.orbitRadius ?? node.orbitRadius, eccentricity: node.eccentricity, periapsis: toRadians(node.periapsisAngle) }];
}

/** Works out a node's or a copy's chain of orbits, in the game's frame. */
function placer(world: World): (node: WorldNode, copy: Copy | null) => Orbit[] {
  const { field } = linkedNodes(world);
  const centre = (field && parentOf(world, field)) ?? world.root;
  const centreChain = pathTo(world, centre);
  const orbit = (node: WorldNode, sign: 1 | -1, copy: Copy | null): Orbit => ({
    radius: copy?.orbitRadius ?? node.orbitRadius,
    period: node.orbitPeriod,
    phase: ((copy?.orbitPhase ?? node.orbitPhase) * Math.PI) / 180,
    sign,
    eccentricity: node.eccentricity,
    periapsis: toRadians(node.periapsisAngle),
  });
  // The root sits at the middle of everything: its own orbit counts for nothing.
  const own = (nodes: WorldNode[]) => nodes.filter((each) => each !== world.root);
  return (node: WorldNode, copy: Copy | null): Orbit[] => {
    const chain = pathTo(world, node);
    // A copy isn't the node itself, so it shares the centre's chain only as far as its parent.
    const compare = copy ? chain.slice(0, -1) : chain;
    let shared = 0;
    while (shared < compare.length && shared < centreChain.length && compare[shared] === centreChain[shared]) shared++;
    return [
      ...own(chain.slice(shared)).map((each) => orbit(each, 1, each === node ? copy : null)),
      ...own(centreChain.slice(shared)).map((each) => orbit(each, -1, null)),
    ];
  };
}

/** Hands the game a whole layout: the tuning it flies by, and every body, place and start. */
export function useLayout(world: World, game: GameLink, keep = false): void {
  writeGame(world, game.tuning);
  game.apply(phasesFromWorld(world), bodiesFor(world), spawnsFor(world), fieldsFor(world), stationsFor(world), keep, anchorsFor(world));
}

export function writeGame(world: World, tuning: Tuning): void {
  const { field, station, pirates } = linkedNodes(world);
  if (!field) return;
  tuning.fieldRadius = field.radius;
  tuning.fieldOrbitRadius = field.orbitRadius;
  tuning.fieldOrbitPeriod = field.orbitPeriod;
  tuning.fieldEccentricity = field.eccentricity;
  tuning.fieldPeriapsis = toRadians(field.periapsisAngle);
  tuning.fieldRotationPeriod = field.spinPeriod;
  tuning.fieldSpinPhase = toRadians(field.spinPhase);
  if (station) {
    tuning.stationSpinPhase = toRadians(station.spinPhase);
    tuning.stationShipyard = station.shipyard;
    tuning.stationStorage = station.storage;
    tuning.stationDistance = station.orbitRadius - field.radius;
    tuning.orbitPeriod = station.orbitPeriod;
    tuning.stationEccentricity = station.eccentricity;
    tuning.stationPeriapsis = toRadians(station.periapsisAngle);
    tuning.stationRotationPeriod = station.spinPeriod;
  }
  if (pirates) {
    tuning.pirateBaseDistance = pirates.orbitRadius - field.radius;
    tuning.pirateOrbitPeriod = pirates.orbitPeriod;
    tuning.pirateEccentricity = pirates.eccentricity;
    tuning.piratePeriapsis = toRadians(pirates.periapsisAngle);
    tuning.pirateRotationPeriod = pirates.spinPeriod;
    tuning.pirateSpinPhase = toRadians(pirates.spinPhase);
  }
  tuning.rockCount = field.rocks;
  tuning.rockDrift = field.rockDrift;
  tuning.rockInflow = field.rockInflow;
  [tuning.fieldCarryFull, tuning.fieldCarryNone] = carrying(field);
  if (station) [tuning.stationCarryFull, tuning.stationCarryNone] = carrying(station);
  if (pirates) [tuning.pirateCarryFull, tuning.pirateCarryNone] = carrying(pirates);
}

/** A place's carrying in the game's terms: no outer edge means it carries everywhere. */
function carrying(node: WorldNode): [number, number] {
  return node.carryNone > 0 ? [node.carryFull, node.carryNone] : [Infinity, Infinity];
}

/** Degrees, kept to a sensible length: at the field's distance, 0.001 is about a unit. */
function degrees(radians: number): number {
  const turned = (((radians * 180) / Math.PI) % 360) + 360;
  return Math.round((turned % 360) * 1000) / 1000;
}

/**
 * Brings the designer up to date with where the game's places are on their orbits: time
 * has moved them on since. Everything else about them is the designer's own.
 */
export function readGame(world: World, phases: Phases): void {
  const { field, station, pirates } = linkedNodes(world);
  if (field && phases.field !== undefined) field.orbitPhase = degrees(phases.field);
  if (station && phases.station !== undefined) station.orbitPhase = degrees(phases.station);
  if (pirates && phases["pirate base"] !== undefined) pirates.orbitPhase = degrees(phases["pirate base"]);
}

export function phasesFromWorld(world: World): Phases {
  const { field, station, pirates } = linkedNodes(world);
  const radians = (node: WorldNode) => (node.orbitPhase * Math.PI) / 180;
  return {
    ...(field && { field: radians(field) }),
    ...(station && { station: radians(station) }),
    ...(pirates && { "pirate base": radians(pirates) }),
  };
}

/** A few lines for the designer's side panel: what the game will use. */
export function linkSummary(world: World): string {
  const { field, station, pirates } = linkedNodes(world);
  const linkedPlaces = [field, station, pirates];
  const nodes = walk(world).map((entry) => entry.node);
  // Every body and field is real. Of the other places, only the ones the game has.
  const real = nodes.filter((node) => isBody(node.kind) || node.kind === "field" || node.kind === "station" || node.kind === "anchor" || linkedPlaces.includes(node));
  const places = nodes.filter((node) => !real.includes(node));
  const lines: string[] = [];
  if (places.length > 0) lines.push(`Map only: ${places.map((node) => node.name).join(", ")}`);
  const starts = SHIP_CHOICES.map((ship) => {
    const places = nodes.filter((node) => node.spawns.includes(ship)).map((node) => node.name);
    return `${ship}: ${places.length > 0 ? places.join(" or ") : "by the field"}`;
  });
  lines.push(`New games start ${starts.join(", ")}`);
  lines.push("A new field radius or rocks need a new game (R).");
  return lines.join("\n");
}
