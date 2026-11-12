/**
 * Times each part of the simulation step, so we can see what grows with what. Dev only:
 * set `sim.profile` to one of these, step, then read `report()`.
 */
import type { DronePilot, FighterPilot } from "../pilot";

export class StepProfile {
  /** Milliseconds spent in each part, summed over every step since the last reset. */
  totals = new Map<string, number>();
  steps = 0;
  private last = 0;
  private readonly lap = (name: string): void => {
    const now = performance.now();
    this.totals.set(name, (this.totals.get(name) ?? 0) + now - this.last);
    this.last = now;
  };

  begin(): (name: string) => void {
    this.last = performance.now();
    return this.lap;
  }

  end(): void {
    this.steps++;
  }

  reset(): void {
    this.totals.clear();
    this.steps = 0;
  }

  /** Average milliseconds per step for each part, largest first, with the total. */
  report(): { total: number; parts: { name: string; ms: number }[] } {
    const parts = [...this.totals]
      .map(([name, sum]) => ({ name, ms: sum / Math.max(1, this.steps) }))
      .sort((a, b) => b.ms - a.ms);
    return { total: parts.reduce((sum, part) => sum + part.ms, 0), parts };
  }
}

/** What a pilot is, for the profile: traffic, the player's drones, pirates or defenders. */
export function pilotKind(pilot: DronePilot | FighterPilot): string {
  const ship = pilot.ship;
  if (ship.faction) return `${ship.faction}s`;
  return ship.owner ? "player's drones" : "traffic";
}
