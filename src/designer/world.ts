/**
 * The layout of a star system as a tree: each thing orbits its parent on a fixed circle (or
 * ellipse, with the parent at a focus) and spins at its own pace. Positions are worked out from time, not added up tick by
 * tick, so any moment can be looked at directly (see docs/open-world-plan.md, 3.2).
 *
 * The system designer edits this. See link.ts for the parts the game flies in.
 */

import { clampEccentricity, orbitSpeeds, orbitState, type OrbitShape } from "../kepler";
import { itemDef } from "../items";
import { framesFor, newGameHulls, shipModels, type FrameUse } from "../fitting";
import { type PartId, type ShipModel } from "../parts";
import { PROGRAMS } from "../programs";
import { DEFAULTS } from "../tuning";

export const WORLD_VERSION = 1;

/** Bodies are solid and drawn filled. The rest are places, drawn as outlines. */
export const BODY_KINDS = ["star", "planet", "moon", "asteroid"] as const;
export const PLACE_KINDS = ["anchor", "field", "station", "pirate base", "cloud"] as const;
export type NodeKind = (typeof BODY_KINDS)[number] | (typeof PLACE_KINDS)[number];

export const SURFACES = ["none", "damage", "death"] as const;
/** A cloud's two looks: a smooth glow, or a dimmer grainy one. */
export const CLOUD_LOOKS = ["gas", "dust"] as const;
export type CloudLook = (typeof CLOUD_LOOKS)[number];
/** Which side of the ships a cloud is drawn on: behind the stations, rocks and ships, or over them. */
export const CLOUD_LAYERS = ["back", "front"] as const;
export type CloudLayer = (typeof CLOUD_LAYERS)[number];
/** The hulls a new game offers, by name: those `src/hulls.json` marks `newGame`. */
export function shipChoices(): ShipModel[] {
  return newGameHulls();
}
/** A hull name, as the game reads it. */
export type ShipChoice = ShipModel;
export type Surface = (typeof SURFACES)[number];

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
  /**
   * Stations and pirate bases: the frame it is drawn from, a hull flagged for its kind. Copies share
   * it. Every other kind has none ("").
   */
  frame: ShipModel;
  /** A body's surface, or a place's size. */
  radius: number;
  /** Bodies only: what touching the ground does. */
  surface: Surface;
  /** Bodies only: how far out the pull starts, measured from the centre. 0 for none. */
  pull: number;
  /** Bodies only: from here down to the ground the pull is at full strength. It grows evenly from `pull` to here. */
  pullFull: number;
  /** Bodies only: the full pull, in units/s². */
  pullAccel: number;
  /** Bodies only: how far out the air reaches, from the centre. 0 for none. */
  atmosphere: number;
  /** Bodies only: in the air, faster than this against the ground burns. */
  burnSpeed: number;
  /** Distance from the parent's centre; for an ellipse, its semi-major axis. Ignored for the root. */
  orbitRadius: number;
  /** 0 is a circle. Up to 0.9: the closest point is `orbitRadius × (1 − e)`, the farthest `× (1 + e)`. */
  eccentricity: number;
  /** Degrees: the direction from the parent to the closest point. Means nothing for a circle. */
  periapsisAngle: number;
  /** Seconds per orbit. 0 stands still; negative goes the other way round. */
  orbitPeriod: number;
  /** Where on its orbit it is at time 0, in degrees: the mean longitude, which for a circle is just the angle. */
  orbitPhase: number;
  /** Seconds per turn about its own centre. 0 doesn't spin; negative turns the other way. */
  spinPeriod: number;
  /** Where its spin is at time 0, in degrees. */
  spinPhase: number;
  /** Fields only: how many rocks, how fast they drift at the start, and big ones drifting in per minute. */
  rocks: number;
  rockDrift: number;
  rockInflow: number;
  /**
   * Fields, stations and pirate bases: within `carryFull` of its edge it carries things
   * fully, fading to nothing at `carryNone`. A `carryNone` of 0 carries everything, everywhere.
   */
  carryFull: number;
  carryNone: number;
  /** Places only: the ships a new game can start at. */
  spawns: ShipChoice[];
  /** Stations only: wrecked ships are rebuilt at the nearest station with a shipyard. */
  shipyard: boolean;
  /** Stations only: cells of storage. The player's lockers and the station's store of whole modules come out of it. */
  storage: number;
  /** Stations only: the modules it starts able to sell. None, and it sells no module at all. */
  unlocked: PartId[];
  /** Stations only: the modules it buys the blueprint for, when it can afford them. */
  wanted: PartId[];
  /**
   * Stations only: the programs it sells. A new station sells every program, as every station
   * did before stations had a list. A program blueprint it buys later is sold as well.
   */
  programs: PartId[];
  /** Stations only: the hulls it sells, by name. None, and it sells no hull. */
  hulls: ShipModel[];
  /** Fields only: the items its rocks drop as well as plain ore, each with its chance on every ore roll. */
  drops: { item: string; chance: number }[];
  /** Stations only: the items in its store when the game starts (they come from nowhere). */
  items: { item: string; n: number }[];
  /** Stations only: whether it builds projects: a deposit by its field, and turrets for itself and the deposit. */
  projects: boolean;
  /** Stations only: whether its news (new blueprints, projects built) goes out on the radio. */
  radio: boolean;
  /** Stations only: its own turrets, once built: how many, the arc they stand in (degrees), and how far out. */
  guardCount: number;
  guardArc: number;
  guardDistance: number;
  /** Clouds only: gas glows smoothly; dust is dimmer and grainy. */
  look: CloudLook;
  /** Clouds only: the colour it glows, `#rrggbb`. */
  color: string;
  /** Clouds only: how far it reaches the long way and the short way. `radius` follows the longer. */
  width: number;
  height: number;
  /** Clouds only: an inner edge that leaves a hole, as a share of the distance to the edge. 0 is none. */
  ringInner: number;
  /** Clouds only: how far the edge fades, the same share. 0 is a hard edge. */
  falloff: number;
  /** Clouds only: how much it covers where its strength is 1. */
  opacity: number;
  /** Clouds only: back draws over the planets and under the stations, rocks and ships; front over the ships. */
  layer: CloudLayer;
  /** Clouds only: lower draws first. Ties go in tree order. */
  drawOrder: number;
  /** How many go round in this orbit, itself included. Copies are the same thing without children. */
  count: number;
  /** How far each copy may wander from even spacing, as a % of half the gap between them. */
  angleVariance: number;
  /** How far each copy's orbit may be from this one's, as a % of it, in or out. */
  orbitVariance: number;
  children: WorldNode[];
}

export interface World {
  version: number;
  root: WorldNode;
}

export function isBody(kind: NodeKind): boolean {
  return (BODY_KINDS as readonly string[]).includes(kind);
}

const TAU = Math.PI * 2;

function rate(period: number): number {
  return period === 0 ? 0 : TAU / period;
}

/** A node's orbit, or a copy's (which has its own size and start), as the shared orbit maths takes it. */
export function orbitShape(node: WorldNode, copy: Pick<Copy, "orbitRadius" | "orbitPhase"> | null = null): OrbitShape {
  return {
    radius: copy?.orbitRadius ?? node.orbitRadius,
    eccentricity: clampEccentricity(node.eccentricity ?? 0),
    periapsis: ((node.periapsisAngle ?? 0) * Math.PI) / 180,
    phase: ((copy?.orbitPhase ?? node.orbitPhase) * Math.PI) / 180,
    period: node.orbitPeriod,
  };
}

/** Rotation about its own centre in radians at time `t`. */
export function spinAngle(node: WorldNode, t: number): number {
  return ((node.spinPhase ?? 0) * Math.PI) / 180 + rate(node.spinPeriod) * t;
}

/** Every node's centre at time `t`, the root at the origin. */
export function positions(world: World, t: number): Map<WorldNode, { x: number; y: number }> {
  const out = new Map<WorldNode, { x: number; y: number }>();
  const visit = (node: WorldNode, px: number, py: number, isRoot: boolean) => {
    // The root sits at the middle of everything: its own orbit counts for nothing.
    const at = isRoot ? { x: 0, y: 0 } : orbitState(orbitShape(node), t);
    const x = px + at.x;
    const y = py + at.y;
    out.set(node, { x, y });
    for (const child of node.children) visit(child, x, y, false);
  };
  visit(world.root, 0, 0, true);
  return out;
}

/** Speed along its orbit relative to its parent, in units per second: at the closest point and at the farthest, which are the same for a circle. */
export function orbitSpeed(node: WorldNode): { near: number; far: number } {
  return orbitSpeeds(orbitShape(node));
}

/** How near and far from its parent it gets. */
export function orbitDistances(node: WorldNode): { near: number; far: number } {
  const { radius, eccentricity } = orbitShape(node);
  return { near: radius * (1 - eccentricity), far: radius * (1 + eccentricity) };
}

/** Every node with its parent, depth first. */
export function walk(world: World): { node: WorldNode; parent: WorldNode | null; depth: number }[] {
  const out: { node: WorldNode; parent: WorldNode | null; depth: number }[] = [];
  const visit = (node: WorldNode, parent: WorldNode | null, depth: number) => {
    out.push({ node, parent, depth });
    for (const child of node.children) visit(child, node, depth + 1);
  };
  visit(world.root, null, 0);
  return out;
}

export function parentOf(world: World, target: WorldNode): WorldNode | null {
  return walk(world).find((entry) => entry.node === target)?.parent ?? null;
}

/**
 * A first guess at a body's ground and pull for its size. The Floater pushes 84 units/s² and
 * the Racer 420, so a full pull between them traps one and not the other.
 */
export function bodyDefaults(
  kind: NodeKind,
  radius: number,
): Pick<WorldNode, "surface" | "pull" | "pullFull" | "pullAccel" | "atmosphere" | "burnSpeed"> {
  const bare = { atmosphere: 0, burnSpeed: 0 };
  if (kind === "star") return { surface: "death", pull: radius * 4, pullFull: radius * 2, pullAccel: 300, atmosphere: radius * 1.5, burnSpeed: 0 };
  if (kind === "planet") return { surface: "death", pull: radius * 2.5, pullFull: radius * 1.25, pullAccel: 150, atmosphere: radius * 1.15, burnSpeed: 300 };
  if (kind === "moon") return { surface: "death", pull: radius * 2.5, pullFull: radius * 1.25, pullAccel: 100, ...bare };
  if (kind === "asteroid") return { surface: "damage", pull: 0, pullFull: 0, pullAccel: 0, ...bare };
  return { surface: "none", pull: 0, pullFull: 0, pullAccel: 0, ...bare };
}

/**
 * A place's own settings, as the game starts them. Places carry only what's near them, so
 * open space between them carries nothing: a spinning station carrying everything would
 * sweep a ship far out sideways faster than it can fly.
 */
/** The colour each look comes in, so a new cloud looks right before anyone touches it. */
export const CLOUD_LOOK_COLORS: Record<CloudLook, string> = { gas: "#7fb2e6", dust: "#b9a089" };

/** A new cloud's first look: gas, in the colour gas comes, six thousand across, half covering. */
export const CLOUD_DEFAULTS: Pick<WorldNode, CloudKey> = {
  look: "gas",
  color: CLOUD_LOOK_COLORS.gas,
  width: 6000,
  height: 3000,
  ringInner: 0,
  falloff: 0.4,
  opacity: 0.5,
  layer: "back",
  drawOrder: 0,
};

/** A cloud's reach, as picking, drawing and culling read it: half its longer side. */
export function cloudRadius(width: number, height: number): number {
  return Math.max(width, height) / 2;
}

/** The frame use a node of this kind is drawn from, or null for a kind that has no frame. */
export function frameUse(kind: NodeKind): FrameUse | null {
  return kind === "station" ? "station" : kind === "pirate base" ? "pirateBase" : null;
}

/** The frame a new node of this kind starts with: the first hull flagged for it, or "" for a kind with none. */
export function defaultFrame(kind: NodeKind): ShipModel {
  const use = frameUse(kind);
  if (!use) return "";
  const usual = use === "station" ? "station" : "pirateBase";
  const frames = framesFor(use);
  return frames.includes(usual) ? usual : (frames[0] ?? usual);
}

/** The frames a node of this kind can be drawn from: none for a kind without a frame. */
export function framesForKind(kind: NodeKind): ShipModel[] {
  const use = frameUse(kind);
  return use ? framesFor(use) : [];
}

/** A node's frame read from a file: one flagged for its kind, or its kind's default. */
function readFrame(kind: NodeKind, raw: unknown): ShipModel {
  const use = frameUse(kind);
  if (!use) return "";
  return typeof raw === "string" && framesFor(use).includes(raw) ? raw : defaultFrame(kind);
}

export function placeDefaults(kind: NodeKind): Pick<WorldNode, PlaceKey> {
  const none = { frame: defaultFrame(kind), ...CLOUD_DEFAULTS, unlocked: [], wanted: [], programs: [], hulls: [], drops: [], items: [], ...NOT_A_BASE };
  if (kind === "field") return { rocks: 520, rockDrift: 12, rockInflow: 1, ...CARRY.field, shipyard: false, storage: 0, ...none };
  if (kind === "station") {
    // A new station builds nothing and keeps quiet until the designer says; its turrets, once it has them, are the game's usual.
    const guards = { guardCount: DEFAULTS.stationGuardCount, guardArc: DEFAULTS.stationGuardArc, guardDistance: DEFAULTS.stationGuardDistance };
    return { rocks: 0, rockDrift: 0, rockInflow: 0, ...CARRY.station, shipyard: true, storage: DEFAULTS.stationStorage, ...none, programs: allPrograms(), ...guards };
  }
  if (kind === "pirate base") return { rocks: 0, rockDrift: 0, rockInflow: 0, ...CARRY.station, shipyard: false, storage: 0, ...none };
  return { rocks: 0, rockDrift: 0, rockInflow: 0, carryFull: 0, carryNone: 0, shipyard: false, storage: 0, ...none };
}

type PlaceKey = "frame" | "rocks" | "rockDrift" | "rockInflow" | "carryFull" | "carryNone" | "shipyard" | "storage" | "unlocked" | "wanted" | "programs" | "hulls" | "drops" | "items" | BaseKey | CloudKey;

/** A cloud's own settings. Left out of every node that isn't a cloud, so other layouts save as they always did. */
type CloudKey = "look" | "color" | "width" | "height" | "ringInner" | "falloff" | "opacity" | "layer" | "drawOrder";

/** Every program there is, by id, in the programs file's order: what a station sells unless its list says otherwise. */
export function allPrograms(): PartId[] {
  return PROGRAMS.map((program) => program.id as PartId);
}

/** Whether a station's program list is every program there is, so the file can leave it out. */
function sellsEveryProgram(programs: readonly string[]): boolean {
  return allPrograms().every((id) => programs.includes(id));
}
type BaseKey = "projects" | "radio" | "guardCount" | "guardArc" | "guardDistance";

/** What a place that isn't a station has for a station's own settings. */
const NOT_A_BASE: Pick<WorldNode, BaseKey> = { projects: false, radio: false, guardCount: 0, guardArc: 0, guardDistance: 0 };

/** Default carrying, from each place's edge: full out to the first, fading to nothing by the second. */
export const CARRY = {
  field: { carryFull: 2000, carryNone: 8000 },
  station: { carryFull: 2000, carryNone: 6000 },
} as const;

/** Places still carrying everywhere, as every place did before carrying had a range, get the defaults. */
export function limitCarrying(world: World): void {
  const visit = (node: WorldNode) => {
    const isPlace = node.kind === "field" || node.kind === "station" || node.kind === "pirate base";
    if (isPlace && node.carryFull === 0 && node.carryNone === 0) Object.assign(node, node.kind === "field" ? CARRY.field : CARRY.station);
    node.children.forEach(visit);
  };
  visit(world.root);
}

/** A copy's own place: its orbit and where on it it is at time 0, in degrees. */
export interface Copy {
  orbitRadius: number;
  orbitPhase: number;
}

/** The same numbers from the same text every time, so copies scatter the same way on every load. */
function seeded(text: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) state = Math.imul(state ^ text.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The copies of a node beyond itself: evenly spaced round its orbit, then scattered. */
export function copiesOf(node: WorldNode): Copy[] {
  const count = Math.max(1, Math.floor(node.count));
  const random = seeded(node.id);
  const spacing = 360 / count;
  const copies: Copy[] = [];
  for (let i = 1; i < count; i++) {
    const angle = random() * 2 - 1;
    const radius = random() * 2 - 1;
    copies.push({
      orbitPhase: node.orbitPhase + i * spacing + (angle * node.angleVariance * spacing) / 200,
      orbitRadius: node.orbitRadius * (1 + (radius * node.orbitVariance) / 100),
    });
  }
  return copies;
}

/** Where every copy is at time `t`, by the node it copies. */
export function copyPositions(
  world: World,
  t: number,
  at: Map<WorldNode, { x: number; y: number }> = positions(world, t),
): Map<WorldNode, { x: number; y: number }[]> {
  const out = new Map<WorldNode, { x: number; y: number }[]>();
  for (const { node, parent } of walk(world)) {
    if (!parent || node.count <= 1) continue;
    const centre = at.get(parent)!;
    out.set(
      node,
      copiesOf(node).map((copy) => {
        const at = orbitState(orbitShape(node, copy), t);
        return { x: centre.x + at.x, y: centre.y + at.y };
      }),
    );
  }
  return out;
}

let nextId = 1;

export function newId(world: World): string {
  const used = new Set(walk(world).map((entry) => entry.node.id));
  while (used.has(`n${nextId}`)) nextId++;
  return `n${nextId++}`;
}

/** A sensible first guess for a new child: small, just outside its parent and siblings. */
export function makeChild(world: World, parent: WorldNode, kind: NodeKind): WorldNode {
  const outermost = parent.children.reduce(
    (far, child) => Math.max(far, child.orbitRadius * (1 + child.eccentricity) + child.radius),
    Math.max(parent.radius, parent.pull),
  );
  const radius =
    kind === "star" ? 100000
    : kind === "planet" ? 12000
    : kind === "moon" ? 3000
    : kind === "asteroid" ? 600
    : kind === "field" ? 5200
    : kind === "cloud" ? cloudRadius(CLOUD_DEFAULTS.width, CLOUD_DEFAULTS.height)
    : 300;
  const orbitRadius = Math.round(outermost + radius * 3 + 2000);
  // Kepler-ish: further out goes round slower. Only a starting point.
  const orbitPeriod = Math.round(3600 * Math.pow(orbitRadius / 20000, 1.5));
  return {
    id: newId(world),
    name: kind[0].toUpperCase() + kind.slice(1),
    kind,
    radius,
    ...bodyDefaults(kind, radius),
    ...placeDefaults(kind),
    spawns: [],
    orbitRadius,
    eccentricity: 0,
    periapsisAngle: 0,
    orbitPeriod,
    orbitPhase: 0,
    spinPeriod: 0,
    spinPhase: 0,
    count: 1,
    angleVariance: 0,
    orbitVariance: 0,
    children: [],
  };
}

/**
 * Today's game, with the planet the field circles made real. The station and pirate base
 * use the game's defaults: field radius plus their distance from its edge. The planet is
 * about ten screens across, and the field far enough out to keep the station clear of its
 * pull. The field's orbit time keeps it at the speed it has always moved at.
 */
export function seedWorld(): World {
  const node = ({ id, name, kind, ...fields }: Partial<WorldNode> & Pick<WorldNode, "id" | "name" | "kind">): WorldNode => ({
    id,
    name,
    kind,
    radius: 0,
    surface: "none",
    pull: 0,
    pullFull: 0,
    pullAccel: 0,
    atmosphere: 0,
    burnSpeed: 0,
    ...placeDefaults(kind),
    spawns: [],
    orbitRadius: 0,
    eccentricity: 0,
    periapsisAngle: 0,
    orbitPeriod: 0,
    orbitPhase: 0,
    spinPeriod: 0,
    spinPhase: 0,
    count: 1,
    angleVariance: 0,
    orbitVariance: 0,
    children: [],
    ...fields,
  });
  const field = node({
    id: "field",
    name: "Field",
    kind: "field",
    radius: 5200,
    orbitRadius: 60000,
    orbitPeriod: 10800,
    spinPeriod: 1800,
    children: [
      node({ id: "station", name: "Station", kind: "station", radius: 300, orbitRadius: 10200, orbitPeriod: 900, orbitPhase: 180, spinPeriod: 300, projects: true, radio: true }),
      node({ id: "pirates", name: "Pirate base", kind: "pirate base", radius: 200, orbitRadius: 9200, orbitPeriod: 900 }),
    ],
  });
  const planet = node({
    id: "planet",
    name: "Planet",
    kind: "planet",
    radius: 12000,
    ...bodyDefaults("planet", 12000),
    orbitRadius: 3000000,
    orbitPeriod: 36 * 3600,
    spinPeriod: 6 * 3600,
    children: [field],
  });
  return { version: WORLD_VERSION, root: node({ id: "star", name: "Star", kind: "star", radius: 150000, ...bodyDefaults("star", 150000), children: [planet] }) };
}

/** A field's drops read from a file: each an item id with a chance from above 0 up to 1. */
function readDrops(raw: unknown): { item: string; chance: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((each): each is { item: string; chance: number } => !!each && typeof each.item === "string" && typeof each.chance === "number" && Number.isFinite(each.chance) && each.chance > 0)
    .map((each) => ({ item: each.item, chance: Math.min(1, each.chance) }));
}

/** A station's starting items read from a file: each an item id and a whole number of at least 1. */
function readItems(raw: unknown): { item: string; n: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((each): each is { item: string; n: number } => !!each && typeof each.item === "string" && typeof each.n === "number" && Number.isFinite(each.n) && each.n >= 1)
    .map((each) => ({ item: each.item, n: Math.floor(each.n) }));
}

/** A station's module lists read from a file: the module items there are. */
function isModuleList(raw: unknown): PartId[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((id): id is string => typeof id === "string" && itemDef(id)?.type === "module");
  return [...new Set(ids)] as PartId[];
}

/** A station's program list read from a file: the programs there are. */
function isProgramList(raw: unknown): PartId[] {
  if (!Array.isArray(raw)) return [];
  const known = allPrograms();
  return [...new Set(raw.filter((id): id is PartId => typeof id === "string" && known.includes(id as PartId)))];
}

/** A station's hull list read from a file: the hulls there are, by name. */
function isHullList(raw: unknown): ShipModel[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is ShipModel => typeof id === "string" && shipModels().includes(id)))];
}

/** Reads a saved world, or null when it doesn't look like one. Missing numbers become 0. */
export function parseWorld(text: string): World | null {
  try {
    const data = JSON.parse(text) as { version?: unknown; root?: unknown };
    if (data.version !== WORLD_VERSION || typeof data.root !== "object" || data.root === null) return null;
    const kinds = [...BODY_KINDS, ...PLACE_KINDS] as string[];
    const read = (raw: Record<string, unknown>): WorldNode | null => {
      if (typeof raw.id !== "string" || typeof raw.kind !== "string" || !kinds.includes(raw.kind)) return null;
      const num = (key: string, missing = 0) =>
        typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : key in raw ? 0 : missing;
      const children = Array.isArray(raw.children) ? raw.children.map((child) => read(child as Record<string, unknown>)) : [];
      if (children.some((child) => child === null)) return null;
      const kind = raw.kind as NodeKind;
      // Saved before bodies had ground and full pull: those come from the kind's defaults.
      const defaults = bodyDefaults(kind, num("radius"));
      const places = placeDefaults(kind);
      // A cloud's own numbers: a bad one falls back to the default rather than to nothing.
      const cloudNum = (key: CloudKey) =>
        typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : (places[key] as number);
      const share = (key: CloudKey) => Math.min(1, Math.max(0, cloudNum(key)));
      const width = Math.max(1, cloudNum("width"));
      const height = Math.max(1, cloudNum("height"));
      return {
        id: raw.id,
        name: typeof raw.name === "string" ? raw.name : raw.kind,
        kind,
        frame: readFrame(kind, raw.frame),
        radius: kind === "cloud" ? cloudRadius(width, height) : num("radius"),
        surface: (SURFACES as readonly unknown[]).includes(raw.surface) ? (raw.surface as Surface) : defaults.surface,
        pull: num("pull", defaults.pull),
        pullFull: num("pullFull", defaults.pullFull),
        pullAccel: num("pullAccel", defaults.pullAccel),
        atmosphere: num("atmosphere", defaults.atmosphere),
        burnSpeed: num("burnSpeed", defaults.burnSpeed),
        rocks: num("rocks", places.rocks),
        rockDrift: num("rockDrift", places.rockDrift),
        rockInflow: num("rockInflow", places.rockInflow),
        carryFull: num("carryFull"),
        carryNone: num("carryNone"),
        spawns: Array.isArray(raw.spawns) ? shipChoices().filter((ship) => (raw.spawns as unknown[]).includes(ship)) : [],
        shipyard: typeof raw.shipyard === "boolean" ? raw.shipyard : places.shipyard,
        storage: num("storage", places.storage),
        unlocked: isModuleList(raw.unlocked),
        wanted: isModuleList(raw.wanted),
        // A station saved without a program list sells every program, as it did before it had one.
        programs: kind === "station" && !("programs" in raw) ? allPrograms() : kind === "station" ? isProgramList(raw.programs) : [],
        hulls: kind === "station" ? isHullList(raw.hulls) : [],
        drops: readDrops(raw.drops),
        items: readItems(raw.items),
        projects: typeof raw.projects === "boolean" ? raw.projects : places.projects,
        radio: typeof raw.radio === "boolean" ? raw.radio : places.radio,
        guardCount: Math.max(0, Math.floor(num("guardCount", places.guardCount))),
        guardArc: num("guardArc", places.guardArc),
        guardDistance: num("guardDistance", places.guardDistance),
        look: (CLOUD_LOOKS as readonly unknown[]).includes(raw.look) ? (raw.look as CloudLook) : places.look,
        color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : places.color,
        width,
        height,
        ringInner: share("ringInner"),
        falloff: share("falloff"),
        opacity: share("opacity"),
        layer: raw.layer === "front" ? "front" : places.layer,
        drawOrder: Math.round(cloudNum("drawOrder")),
        count: Math.max(1, Math.floor(num("count", 1))),
        angleVariance: num("angleVariance"),
        orbitVariance: num("orbitVariance"),
        orbitRadius: num("orbitRadius"),
        eccentricity: clampEccentricity(num("eccentricity")),
        periapsisAngle: num("periapsisAngle"),
        orbitPeriod: num("orbitPeriod"),
        orbitPhase: num("orbitPhase"),
        spinPeriod: num("spinPeriod"),
        spinPhase: num("spinPhase"),
        children: children as WorldNode[],
      };
    };
    const root = read(data.root as Record<string, unknown>);
    return root && { version: WORLD_VERSION, root };
  } catch {
    return null;
  }
}

/**
 * The order a node's keys are written in: the order `parseWorld` reads them. Fixed, so saving
 * a layout changes only the lines that changed, however the node was made.
 */
const NODE_KEYS: (keyof WorldNode)[] = [
  "id", "name", "kind", "frame", "radius", "surface", "pull", "pullFull", "pullAccel", "atmosphere", "burnSpeed",
  "rocks", "rockDrift", "rockInflow", "carryFull", "carryNone", "spawns", "shipyard", "storage", "unlocked", "wanted", "programs", "hulls", "drops", "items",
  "projects", "radio", "guardCount", "guardArc", "guardDistance", "look", "color", "width", "height", "ringInner", "falloff", "opacity", "layer", "drawOrder",
  "count", "angleVariance", "orbitVariance", "orbitRadius", "eccentricity", "periapsisAngle", "orbitPeriod", "orbitPhase",
  "spinPeriod", "spinPhase", "children",
];

/** A station's own settings, left out where they're the kind's default, so only a station that differs says so. */
const BASE_KEYS: BaseKey[] = ["projects", "radio", "guardCount", "guardArc", "guardDistance"];

/** The cloud's own settings, in the order they're written. Only a cloud keeps them. */
const CLOUD_KEYS: CloudKey[] = ["look", "color", "width", "height", "ringInner", "falloff", "opacity", "layer", "drawOrder"];

/** A node's keys in the fixed order, then anything else it carries, as it came. */
function ordered(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const usual = placeDefaults(node.kind as NodeKind);
  for (const key of NODE_KEYS) {
    if (!(key in node)) continue;
    // Only a station or a pirate base has a frame.
    if (key === "frame" && frameUse(node.kind as NodeKind) === null) continue;
    if ((BASE_KEYS as string[]).includes(key) && node[key] === usual[key as BaseKey]) continue;
    // Only a cloud has a cloud's settings: every other node saves without them, as it always did.
    if ((CLOUD_KEYS as string[]).includes(key) && node.kind !== "cloud") continue;
    // Only a station has a program list, and one that sells every program is left out: that's what a missing list reads as.
    if (key === "programs" && (node.kind !== "station" || sellsEveryProgram(node.programs as string[]))) continue;
    out[key] = node[key];
  }
  for (const key of Object.keys(node)) if (!(NODE_KEYS as string[]).includes(key)) out[key] = node[key];
  return out;
}

export function stringifyWorld(world: World): string {
  // A spin start angle of 0, and a circular orbit, are left out, so layouts from before they existed read and save the same.
  const left = ["spinPhase", "eccentricity", "periapsisAngle"];
  // So are no drops, no starting items and no module lists, for the same reason.
  const lists = ["drops", "items", "unlocked", "wanted", "hulls"];
  const isNode = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value && "children" in value;
  const replacer = (key: string, value: unknown) => {
    if ((left.includes(key) && value === 0) || (lists.includes(key) && Array.isArray(value) && value.length === 0)) return undefined;
    return isNode(value) ? ordered(value) : value;
  };
  return JSON.stringify(world, replacer, 2) + "\n";
}

/** The chain from the root down to a node, both included. */
export function pathTo(world: World, target: WorldNode): WorldNode[] {
  const find = (node: WorldNode, trail: WorldNode[]): WorldNode[] | null => {
    const here = [...trail, node];
    if (node === target) return here;
    for (const child of node.children) {
      const found = find(child, here);
      if (found) return found;
    }
    return null;
  };
  return find(world.root, []) ?? [];
}

/** How far a body reaches: its pull when it has one, else its surface. */
export function reachOf(node: WorldNode): number {
  return isBody(node.kind) ? Math.max(node.radius, node.pull) : node.radius;
}

/**
 * The smallest gap between `place`'s edge and `body`'s reach as they move, and the time it
 * happens. Only motion below their nearest shared parent matters, so the time span and step
 * come from those orbits alone. Negative means it passes inside.
 */
export function closestApproach(world: World, body: WorldNode, place: WorldNode): { gap: number; at: number } {
  const a = pathTo(world, body);
  const b = pathTo(world, place);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  const below = [...a.slice(shared), ...b.slice(shared)];
  const moving = below.map((node) => Math.abs(node.orbitPeriod)).filter((period) => period > 0);
  if (moving.length === 0) moving.push(1);
  const span = Math.max(...moving);
  // An eccentric orbit swings round its closest point faster than a circle of its period does.
  const quickest = Math.max(...below.map((node) => (1 + node.eccentricity) ** 2 / (1 - node.eccentricity ** 2) ** 1.5));
  const step = Math.min(...moving) / 360 / quickest;
  const samples = Math.min(200000, Math.ceil(span / step));
  const relative = (chain: WorldNode[], t: number) => {
    let x = 0;
    let y = 0;
    for (const node of chain) {
      const at = orbitState(orbitShape(node), t);
      x += at.x;
      y += at.y;
    }
    return { x, y };
  };
  const belowA = a.slice(shared);
  const belowB = b.slice(shared);
  const gapAt = (t: number) => {
    const pa = relative(belowA, t);
    const pb = relative(belowB, t);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) - reachOf(body) - place.radius;
  };
  let best = { gap: Infinity, at: 0 };
  for (let i = 0; i <= samples; i++) {
    const t = (span * i) / samples;
    const gap = gapAt(t);
    if (gap < best.gap) best = { gap, at: t };
  }
  // The samples can step over a sharp pass, so look closer round the best of them when an orbit is eccentric.
  if (quickest > 1) {
    let low = best.at - span / samples;
    let high = best.at + span / samples;
    for (let i = 0; i < 40; i++) {
      const one = low + (high - low) / 3;
      const two = high - (high - low) / 3;
      if (gapAt(one) < gapAt(two)) high = two;
      else low = one;
    }
    const at = (low + high) / 2;
    const gap = gapAt(at);
    if (gap < best.gap) best = { gap, at };
  }
  return best;
}
