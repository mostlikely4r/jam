/**
 * The shipped world for profiling, with the first field copied `fields` times.
 */
import { Sim } from "../sim";
import { linkedNodes, useLayout, type GameLink } from "../designer/link";
import { shippedWorld } from "../designer/shipped";
import type { World } from "../designer/world";

export function linkTo(sim: Sim): GameLink {
  return {
    tuning: sim.tuning,
    clock: () => sim.now,
    phases: () => sim.orbitPhases(),
    where: () => ({ ship: sim.ship, field: sim.field }),
    apply(phases, bodies, spawns, fields, stations, keep = false) {
      sim.bodies = bodies;
      sim.spawns = spawns;
      sim.startPhases = phases;
      sim.applyLayout(keep ? {} : phases, fields, stations);
    },
  };
}

function worldWith(fields: number): World {
  const world = shippedWorld();
  const { field } = linkedNodes(world);
  if (field) field.count = fields;
  return world;
}

/**
 * Lays the shipped world, with `fields` copies of the first field, into a sim and restarts
 * it. With `away`, the player's ship starts far out in empty space, so the camera has never
 * been near any field but the first.
 */
export function useShippedWorld(sim: Sim, fields = 1, seed = 2, away = false): void {
  useLayout(worldWith(fields), linkTo(sim));
  if (away) {
    const far = [{ radius: 100000, period: 0, phase: 0, sign: 1 as const }];
    sim.spawns = [
      { ship: "racer", orbits: far },
      { ship: "floater", orbits: far },
    ];
  }
  sim.reset(seed);
}
