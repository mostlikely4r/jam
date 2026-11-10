/**
 * The layout of a star system as a tree: each thing orbits its parent on a fixed circle
 * and spins at its own pace. Positions are worked out from time, not added up tick by
 * tick, so any moment can be looked at directly (see docs/open-world-plan.md, 3.2).
 *
 * The system designer edits this. The game doesn't read it yet.
 */

export const WORLD_VERSION = 1;

/** Bodies are solid and drawn filled. The rest are places, drawn as outlines. */
export const BODY_KINDS = ["star", "planet", "moon", "asteroid"] as const;
export const PLACE_KINDS = ["anchor", "field", "station", "pirate base"] as const;
export type NodeKind = (typeof BODY_KINDS)[number] | (typeof PLACE_KINDS)[number];

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
  /** A body's surface, or a place's size. */
  radius: number;
  /** Bodies only: how far out the pull reaches, measured from the centre. 0 for none. */
  pull: number;
  /** Distance from the parent's centre. Ignored for the root. */
  orbitRadius: number;
  /** Seconds per orbit. 0 stands still; negative goes the other way round. */
  orbitPeriod: number;
  /** Where on its orbit it is at time 0, in degrees. */
  orbitPhase: number;
  /** Seconds per turn about its own centre. 0 doesn't spin; negative turns the other way. */
  spinPeriod: number;
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
    pull: kind === "planet" || kind === "moon" ? radius * 2.5 : kind === "star" ? radius * 3 : 0,
    orbitRadius,
    orbitPeriod,
    orbitPhase: 0,
    spinPeriod: 0,
    children: [],
  };
}

/**
 * Today's game, with the planet the field already circles made real. The station and
 * pirate base use the game's defaults: field radius plus their distance from its edge.
 * The planet's size is the user's first guess of about ten screens across.
 */
export function seedWorld(): World {
  const node = ({ id, name, kind, ...fields }: Partial<WorldNode> & Pick<WorldNode, "id" | "name" | "kind">): WorldNode => ({
    id,
    name,
    kind,
    radius: 0,
    pull: 0,
    orbitRadius: 0,
    orbitPeriod: 0,
    orbitPhase: 0,
    spinPeriod: 0,
    children: [],
    ...fields,
  });
  const field = node({
    id: "field",
    name: "Field",
    kind: "field",
    radius: 5200,
    orbitRadius: 20000,
    orbitPeriod: 3600,
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
    pull: 30000,
    orbitRadius: 3000000,
    orbitPeriod: 36 * 3600,
    spinPeriod: 6 * 3600,
    children: [field],
  });
  return { version: WORLD_VERSION, root: node({ id: "star", name: "Star", kind: "star", radius: 150000, pull: 600000, children: [planet] }) };
}

/** Reads a saved world, or null when it doesn't look like one. Missing numbers become 0. */
export function parseWorld(text: string): World | null {
  try {
    const data = JSON.parse(text) as { version?: unknown; root?: unknown };
    if (data.version !== WORLD_VERSION || typeof data.root !== "object" || data.root === null) return null;
    const kinds = [...BODY_KINDS, ...PLACE_KINDS] as string[];
    const read = (raw: Record<string, unknown>): WorldNode | null => {
      if (typeof raw.id !== "string" || typeof raw.kind !== "string" || !kinds.includes(raw.kind)) return null;
      const num = (key: string) => (typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : 0);
      const children = Array.isArray(raw.children) ? raw.children.map((child) => read(child as Record<string, unknown>)) : [];
      if (children.some((child) => child === null)) return null;
      return {
        id: raw.id,
        name: typeof raw.name === "string" ? raw.name : raw.kind,
        kind: raw.kind as NodeKind,
        radius: num("radius"),
        pull: num("pull"),
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
