/**
 * Layout recipes: small scripts that build or change a world, so bigger setups for testing
 * and trying things out don't have to be clicked together in the designer. Hand-made layouts
 * stay possible: a recipe starts from the shipped world (or a fresh seed) and only changes
 * what it says it does. Each reports what it did, with trip times where they matter.
 *
 * Run with: npm run layout -- <recipe>             report only
 *           npm run layout -- <recipe> --ship      write the shipped world (src/designer/world.json)
 *           npm run layout -- <recipe> --save name write src/designer/layouts/name.json
 */
import { linkedNodes } from "./link";
import { FLIGHTS, sharedParent, tripSpread } from "./trips";
import { closestApproach, makeChild, parentOf, walk, type World, type WorldNode } from "./world";

export interface Recipe {
  about: string;
  /** What it starts from: the shipped world, or the designer's fresh seed. */
  start: "shipped" | "seed";
  /** Changes the world in place and returns lines to report. */
  apply(world: World): string[];
}

/** "4 min 05 s", for reports. */
export function minutes(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)} min ${String(whole % 60).padStart(2, "0")} s`;
}

/** Racer, floater and traffic trip times between two places, over a span of clock time. */
export function tripReport(world: World, from: WorldNode, to: WorldNode, span: number): string[] {
  return Object.values(FLIGHTS).map(({ label, flight }) => {
    const { min, mean, max } = tripSpread(world, from, to, flight, span);
    return `  ${label}: ${minutes(min)} to ${minutes(max)}, ${minutes(mean)} on average`;
  });
}

/** Takes out any earlier copy of a named node, so running a recipe twice gives the same world. */
function removeNamed(world: World, name: string): void {
  for (const { node } of walk(world)) node.children = node.children.filter((child) => child.name !== name);
}

/**
 * How long until trips between two places repeat, near enough: the slowest orbit below the
 * thing they both go round, as the orbits above it move both alike.
 */
export function tripSpan(world: World, a: WorldNode, b: WorldNode): number {
  const around = sharedParent(world, a, b);
  let span = 0;
  for (const end of [a, b]) {
    for (let node: WorldNode | null = end; node && node !== around; node = parentOf(world, node)) span = Math.max(span, Math.abs(node.orbitPeriod));
  }
  return span;
}

/** The game's own station, by the first field. */
function homeStation(world: World): WorldNode {
  const { station } = linkedNodes(world);
  if (!station) throw new Error("This world has no station by its first field");
  return station;
}

export const RECIPES: Record<string, Recipe> = {
  "far-base": {
    about: "A field and base round the planet; the base holds the all-round tractor's blueprint: the shopping trip test.",
    start: "shipped",
    apply(world) {
      const name = "Planet base";
      const fieldName = "Planet field";
      removeNamed(world, name);
      removeNamed(world, fieldName);
      const planet = walk(world).find((entry) => entry.node.kind === "planet")?.node;
      if (!planet) throw new Error("This world has no planet");
      // Laid out like home: a field, with the base round it. Traffic that mines here sells
      // here, and carries the base's news on to wherever it sells next.
      const home = homeStation(world);
      const field = makeChild(world, planet, "field");
      Object.assign(field, {
        name: fieldName,
        orbitRadius: 50000,
        orbitPeriod: Math.round(3600 * Math.pow(50000 / 20000, 1.5)),
        orbitPhase: 1.2,
      });
      planet.children.push(field);
      const base = makeChild(world, field, "station");
      Object.assign(base, {
        name,
        orbitRadius: home.orbitRadius,
        orbitPeriod: home.orbitPeriod,
        orbitPhase: 0,
        spinPeriod: 300,
        shipyard: true,
        spawns: [],
        blueprints: ["tractorAll"],
      });
      field.children.push(base);
      const span = tripSpan(world, home, base);
      const clear = closestApproach(world, planet, base);
      return [
        `Added ${fieldName}: orbits ${planet.name} at ${field.orbitRadius} every ${minutes(field.orbitPeriod)}.`,
        `Added ${name} round it at ${base.orbitRadius}, holding the all-round tractor.`,
        `Keeps ${Math.round(clear.gap)} clear of ${planet.name}'s pull.`,
        `Trips from ${home.name} over ${minutes(span)}:`,
        ...tripReport(world, home, base, span),
      ];
    },
  },
};
