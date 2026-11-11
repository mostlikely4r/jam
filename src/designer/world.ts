/**
 * The layout of a star system as a tree: each thing orbits its parent on a fixed circle
 * and spins at its own pace. Positions are worked out from time, not added up tick by
 * tick, so any moment can be looked at directly (see docs/open-world-plan.md, 3.2).
 *
 * The system designer edits this. See link.ts for the parts the game flies in.
 */

export const WORLD_VERSION = 1;

/** Bodies are solid and drawn filled. The rest are places, drawn as outlines. */
export const BODY_KINDS = ["star", "planet", "moon", "asteroid"] as const;
export const PLACE_KINDS = ["anchor", "field", "station", "pirate base"] as const;
export type NodeKind = (typeof BODY_KINDS)[number] | (typeof PLACE_KINDS)[number];

export const SURFACES = ["none", "damage", "death"] as const;
export type Surface = (typeof SURFACES)[number];

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
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
  /** Distance from the parent's centre. Ignored for the root. */
  orbitRadius: number;
  /** Seconds per orbit. 0 stands still; negative goes the other way round. */
  orbitPeriod: number;
  /** Where on its orbit it is at time 0, in degrees. */
  orbitPhase: number;
  /** Seconds per turn about its own centre. 0 doesn't spin; negative turns the other way. */
  spinPeriod: number;
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

/** Orbit angle in radians at time `t`. */
export function orbitAngle(node: WorldNode, t: number): number {
  return (node.orbitPhase * Math.PI) / 180 + rate(node.orbitPeriod) * t;
}

/** Rotation about its own centre in radians at time `t`. */
export function spinAngle(node: WorldNode, t: number): number {
  return rate(node.spinPeriod) * t;
}

/** Every node's centre at time `t`, the root at the origin. */
export function positions(world: World, t: number): Map<WorldNode, { x: number; y: number }> {
  const out = new Map<WorldNode, { x: number; y: number }>();
  const visit = (node: WorldNode, px: number, py: number, isRoot: boolean) => {
    const angle = orbitAngle(node, t);
    const r = isRoot ? 0 : node.orbitRadius;
    const x = px + Math.cos(angle) * r;
    const y = py + Math.sin(angle) * r;
    out.set(node, { x, y });
    for (const child of node.children) visit(child, x, y, false);
  };
  visit(world.root, 0, 0, true);
  return out;
}

/** Speed along its orbit relative to its parent, in units per second. */
export function orbitSpeed(node: WorldNode): number {
  return Math.abs(rate(node.orbitPeriod)) * node.orbitRadius;
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
        const angle = (copy.orbitPhase * Math.PI) / 180 + rate(node.orbitPeriod) * t;
        return { x: centre.x + Math.cos(angle) * copy.orbitRadius, y: centre.y + Math.sin(angle) * copy.orbitRadius };
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
    (far, child) => Math.max(far, child.orbitRadius + child.radius),
    Math.max(parent.radius, parent.pull),
  );
  const radius = kind === "star" ? 100000 : kind === "planet" ? 12000 : kind === "moon" ? 3000 : kind === "asteroid" ? 600 : kind === "field" ? 5200 : 300;
  const orbitRadius = Math.round(outermost + radius * 3 + 2000);
  // Kepler-ish: further out goes round slower. Only a starting point.
  const orbitPeriod = Math.round(3600 * Math.pow(orbitRadius / 20000, 1.5));
  return {
    id: newId(world),
    name: kind[0].toUpperCase() + kind.slice(1),
    kind,
    radius,
    ...bodyDefaults(kind, radius),
    orbitRadius,
    orbitPeriod,
    orbitPhase: 0,
    spinPeriod: 0,
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
    orbitRadius: 0,
    orbitPeriod: 0,
    orbitPhase: 0,
    spinPeriod: 0,
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
      node({ id: "station", name: "Station", kind: "station", radius: 300, orbitRadius: 10200, orbitPeriod: 900, orbitPhase: 180, spinPeriod: 300 }),
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
      return {
        id: raw.id,
        name: typeof raw.name === "string" ? raw.name : raw.kind,
        kind,
        radius: num("radius"),
        surface: (SURFACES as readonly unknown[]).includes(raw.surface) ? (raw.surface as Surface) : defaults.surface,
        pull: num("pull", defaults.pull),
        pullFull: num("pullFull", defaults.pullFull),
        pullAccel: num("pullAccel", defaults.pullAccel),
        atmosphere: num("atmosphere", defaults.atmosphere),
        burnSpeed: num("burnSpeed", defaults.burnSpeed),
        count: Math.max(1, Math.floor(num("count", 1))),
        angleVariance: num("angleVariance"),
        orbitVariance: num("orbitVariance"),
        orbitRadius: num("orbitRadius"),
        orbitPeriod: num("orbitPeriod"),
        orbitPhase: num("orbitPhase"),
        spinPeriod: num("spinPeriod"),
        children: children as WorldNode[],
      };
    };
    const root = read(data.root as Record<string, unknown>);
    return root && { version: WORLD_VERSION, root };
  } catch {
    return null;
  }
}

export function stringifyWorld(world: World): string {
  return JSON.stringify(world, null, 2) + "\n";
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
  const moving = [...a.slice(shared), ...b.slice(shared)]
    .map((node) => Math.abs(node.orbitPeriod))
    .filter((period) => period > 0);
  if (moving.length === 0) moving.push(1);
  const span = Math.max(...moving);
  const step = Math.min(...moving) / 360;
  const samples = Math.min(200000, Math.ceil(span / step));
  const relative = (chain: WorldNode[], t: number) => {
    let x = 0;
    let y = 0;
    for (const node of chain) {
      const angle = orbitAngle(node, t);
      x += Math.cos(angle) * node.orbitRadius;
      y += Math.sin(angle) * node.orbitRadius;
    }
    return { x, y };
  };
  const belowA = a.slice(shared);
  const belowB = b.slice(shared);
  let best = { gap: Infinity, at: 0 };
  for (let i = 0; i <= samples; i++) {
    const t = (span * i) / samples;
    const pa = relative(belowA, t);
    const pb = relative(belowB, t);
    const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y) - reachOf(body) - place.radius;
    if (gap < best.gap) best = { gap, at: t };
  }
  return best;
}
