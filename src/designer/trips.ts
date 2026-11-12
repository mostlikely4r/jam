/**
 * Trip times between two places in a layout, as the route planner sees them. Shared by the
 * designer's route preview and the layout recipes, which report how far apart things are.
 */
import { planRoute, type Flight, type Route } from "../route";
import { DEFAULTS } from "../tuning";
import { isBody, pathTo, positions, reachOf, type World, type WorldNode } from "./world";

export const FLIGHTS: Record<string, { label: string; flight: Flight }> = {
  floater: { label: "Floater, burn and brake", flight: { accel: DEFAULTS.thrust * DEFAULTS.floaterEngine, cruise: Infinity } },
  racer: { label: "Racer, burn and brake", flight: { accel: DEFAULTS.thrust, cruise: Infinity } },
  traffic: { label: "Traffic at cruise speed", flight: { accel: DEFAULTS.thrust, cruise: DEFAULTS.droneCruiseSpeed } },
};

/**
 * The deepest thing both orbit, directly or not (or one of them, if the other orbits it). The
 * trip is worked out in its frame, and kept out of it if it's a body.
 */
export function sharedParent(world: World, a: WorldNode, b: WorldNode): WorldNode {
  const pa = pathTo(world, a);
  const pb = pathTo(world, b);
  let shared = 0;
  while (shared < pa.length && shared < pb.length && pa[shared] === pb[shared]) shared++;
  return pa[shared - 1] ?? world.root;
}

/** A trip from one place to another leaving at clock `t`, and the thing it goes round. */
export function tripBetween(world: World, from: WorldNode, to: WorldNode, t: number, flight: Flight): { route: Route; around: WorldNode } {
  const around = sharedParent(world, from, to);
  // Everything in the shared parent's own frame, where it stands still.
  const relative = (node: WorldNode) => (time: number) => {
    const at = positions(world, time);
    const p = at.get(node)!;
    const c = at.get(around)!;
    return { x: p.x - c.x, y: p.y - c.y };
  };
  // A place doesn't block, and a trip to or from the body itself has nothing to go round.
  const blocks = isBody(around.kind) && from !== around && to !== around;
  const radius = blocks ? reachOf(around) : 0;
  return { route: planRoute(relative(from), relative(to), t, radius, flight), around };
}

/** Shortest, average and longest trip time, leaving at `samples` moments spread over `span` seconds. */
export function tripSpread(world: World, from: WorldNode, to: WorldNode, flight: Flight, span: number, samples = 24): { min: number; mean: number; max: number } {
  const times = Array.from({ length: samples }, (_, i) => {
    const { route } = tripBetween(world, from, to, (span * i) / samples, flight);
    return route.arrive - route.depart;
  });
  return { min: Math.min(...times), mean: times.reduce((sum, time) => sum + time, 0) / samples, max: Math.max(...times) };
}
