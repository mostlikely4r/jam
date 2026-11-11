/**
 * What the game flies from the designer's layout. The game's own world is fixed in shape: a
 * planet at the centre of a field's orbit, with a station and a pirate base round the field.
 * The designer's tree is free, so this finds those four in it. Anything else is map only.
 *
 * The tuning is the one channel between them. The designer writes into the same values the
 * sliders use, and reads them back when it opens, so whichever was changed last wins.
 */
import type { Orbit, Poi, SolidBody, Spawn } from "../sim";
import type { Tuning } from "../tuning";
import { SHIP_CHOICES, copiesOf, isBody, parentOf, pathTo, walk, type Copy, type NodeKind, type World, type WorldNode } from "./world";

/** Each POI's orbit angle at clock 0, in radians. */
export type Phases = Partial<Record<Poi["name"], number>>;

/** The designer's way into the running game. */
export interface GameLink {
  tuning: Tuning;
  clock(): number;
  phases(): Phases;
  apply(phases: Phases, bodies: SolidBody[], spawns: Spawn[]): void;
  /** Where the player's ship and the field are now, in the game's own frame. */
  where(): { ship: { x: number; y: number }; field: { x: number; y: number } };
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
        orbits: place(node, copy),
      }));
    });
}

/** Every place a new game can start, copies included, by ship. */
export function spawnsFor(world: World): Spawn[] {
  const place = placer(world);
  return walk(world)
    .map((entry) => entry.node)
    .filter((node) => node !== world.root && !isBody(node.kind))
    .flatMap((node) => [null, ...copiesOf(node)].flatMap((copy) => node.spawns.map((ship) => ({ ship, orbits: place(node, copy) }))));
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

export function writeGame(world: World, tuning: Tuning): void {
  const { field, station, pirates } = linkedNodes(world);
  if (!field) return;
  tuning.fieldRadius = field.radius;
  tuning.fieldOrbitRadius = field.orbitRadius;
  tuning.fieldOrbitPeriod = field.orbitPeriod;
  tuning.fieldRotationPeriod = field.spinPeriod;
  if (station) {
    tuning.stationDistance = station.orbitRadius - field.radius;
    tuning.orbitPeriod = station.orbitPeriod;
    tuning.stationRotationPeriod = station.spinPeriod;
  }
  if (pirates) {
    tuning.pirateBaseDistance = pirates.orbitRadius - field.radius;
    tuning.pirateOrbitPeriod = pirates.orbitPeriod;
    tuning.pirateRotationPeriod = pirates.spinPeriod;
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
  // Every body is real. Of the places, only the ones the game has.
  const real = nodes.filter((node) => isBody(node.kind) || linkedPlaces.includes(node));
  const places = nodes.filter((node) => !real.includes(node));
  const lines = [`In the game: ${real.map((node) => node.name).join(", ") || "nothing"}`];
  if (places.length > 0) lines.push(`Map only: ${places.map((node) => node.name).join(", ")}`);
  const starts = SHIP_CHOICES.map((ship) => {
    const places = nodes.filter((node) => node.spawns.includes(ship)).map((node) => node.name);
    return `${ship}: ${places.length > 0 ? places.join(" or ") : "by the field"}`;
  });
  lines.push(`New games start ${starts.join(", ")}`);
  lines.push("A new field radius or rocks need a new game (R).");
  return lines.join("\n");
}
