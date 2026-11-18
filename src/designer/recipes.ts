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
import { bodyDefaults, closestApproach, isBody, makeChild, parentOf, walk, type NodeKind, type World, type WorldNode } from "./world";

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

/** Everything filled-system adds, by name. */
const FILLED = [
  "Ember", "Ember scatter", "Mire", "Speck", "Tessel", "Tessel drift", "Kettle", "Kettle belt",
  "Bulwark", "Bulwark inner ring", "Bulwark outer ring", "Ferrum", "Ferrum shoals", "Ringside",
  "Pale", "Duo", "Duo minor", "Gloam", "Gloam reach",
];

/**
 * full-system's moons: two round each planet (one more round home and round Bulwark, which have
 * one), and the gap each needs. Each moon carries two rings of plain rock fields, four inside
 * going one way and six outside going the other: ten fields a moon.
 */
const MOON_SIZE = 2500;
const RING_FIELD = 3500;
const INNER_RING = { orbit: 12000, count: 4, period: -5200, rocks: 300 };
const OUTER_RING = { orbit: 22000, count: 6, period: 9800, rocks: 260 };
/** How far a moon's rings reach from its middle. */
const MOON_REACH = OUTER_RING.orbit + RING_FIELD;
const MOON_GAP = 5000;
const NUMERALS = ["I", "II", "III"];

/** How far a node and everything round it reaches from its middle, copies and all. */
function reach(node: WorldNode): number {
  let far = Math.max(node.radius, node.pull);
  for (const child of node.children) {
    const out = child.orbitRadius * (1 + Math.max(0, child.orbitVariance) / 100);
    far = Math.max(far, out + reach(child));
  }
  return far;
}

/** The game's own station, by the first field. */
function homeStation(world: World): WorldNode {
  const { station } = linkedNodes(world);
  if (!station) throw new Error("This world has no station by its first field");
  return station;
}

export const RECIPES: Record<string, Recipe> = {
  "full-system": {
    about: "The home system at full count: filled-system, then two moons a planet with ten plain fields round each, planets spaced so their moons never meet.",
    start: "shipped",
    apply(world) {
      const lines = RECIPES["filled-system"].apply(world);
      const star = world.root;
      const homePlanet = walk(world).find((entry) => entry.node.kind === "planet" && entry.parent === star)!.node;
      const homeMoon = homePlanet.children.find((child) => child.kind === "moon")!;
      const like = { radius: homePlanet.orbitRadius, period: homePlanet.orbitPeriod };
      const moonLike = { radius: homeMoon.orbitRadius, period: homeMoon.orbitPeriod };
      const period = (radius: number, of: { radius: number; period: number }) => Math.round(of.period * Math.pow(radius / of.radius, 1.5));
      const planets = star.children.filter((child) => child.kind === "planet");
      // What it adds is named after its planet with a numeral, so it can all come out again.
      const ours = (name: string) => planets.some((planet) => NUMERALS.some((numeral) => name.startsWith(`${planet.name} ${numeral}`)));
      for (const { node } of walk(world)) node.children = node.children.filter((child) => !ours(child.name));

      const add = (parent: WorldNode, kind: NodeKind, name: string, settings: Partial<WorldNode>): WorldNode => {
        const node = makeChild(world, parent, kind);
        const radius = settings.radius ?? node.radius;
        Object.assign(node, bodyDefaults(kind, radius), { name, radius }, settings);
        parent.children.push(node);
        return node;
      };
      const ring = (moon: WorldNode, name: string, spec: typeof INNER_RING, phase: number) =>
        add(moon, "field", name, {
          radius: RING_FIELD,
          orbitRadius: spec.orbit,
          orbitPeriod: spec.period,
          orbitPhase: phase,
          count: spec.count,
          rocks: spec.rocks,
        });

      let moons = 0;
      for (const planet of planets) {
        const have = planet.children.filter((child) => child.kind === "moon").length;
        // Home's moon is far out with its fields round an anchor; the new one goes in the gap inside it.
        const inside = planet === homePlanet;
        for (let i = have; i < 2; i++) {
          const name = `${planet.name} ${NUMERALS[i]}`;
          let orbit: number;
          if (inside) {
            const below = Math.max(...planet.children.filter((child) => child !== homeMoon).map((child) => child.orbitRadius + reach(child)));
            const above = homeMoon.orbitRadius - reach(homeMoon);
            // Halfway across the gap, which is a little narrower than the usual spacing.
            orbit = Math.round((below + above) / 2);
            if (orbit - MOON_REACH - 1000 < below) throw new Error(`No room for ${name} inside ${homeMoon.name}`);
          } else orbit = Math.round(reach(planet) + MOON_GAP + MOON_REACH);
          const moon = add(planet, "moon", name, {
            radius: MOON_SIZE,
            orbitRadius: orbit,
            orbitPeriod: period(orbit, moonLike) * (i % 2 ? -1 : 1),
            orbitPhase: (planet.orbitPhase * 7 + i * 150) % 360,
          });
          ring(moon, `${name} inner ring`, INNER_RING, (i * 45) % 360);
          ring(moon, `${name} outer ring`, OUTER_RING, (i * 30 + 15) % 360);
          moons++;
        }
      }
      // The giant's two ring fields become rings of fields.
      for (const [name, count] of [["Bulwark inner ring", 6], ["Bulwark outer ring", 8]] as const) {
        const node = walk(world).find((entry) => entry.node.name === name)?.node;
        if (node) node.count = count;
      }

      // Space the planets out so none's moons ever meet another's: home stays where it is, the
      // rest go out from the star in their order, each clear of the one before.
      const GAP = 40000;
      // There's no room for Speck's moons between Mire and home: it goes out past home.
      const speck = star.children.find((child) => child.name === "Speck");
      if (speck && speck.orbitRadius < homePlanet.orbitRadius) speck.orbitRadius = homePlanet.orbitRadius + 1;
      const order = [...star.children].sort((a, b) => a.orbitRadius - b.orbitRadius);
      const home = order.indexOf(homePlanet);
      const moved: string[] = [];
      const place = (node: WorldNode, orbit: number) => {
        if (node.orbitRadius === orbit) return;
        moved.push(`${node.name} ${Math.round(node.orbitRadius / 1000)}k -> ${Math.round(orbit / 1000)}k`);
        node.orbitRadius = orbit;
        node.orbitPeriod = period(orbit, like);
      };
      // Inward of home: each as far out as it can be, inside the next.
      for (let i = home - 1; i >= 0; i--) {
        const next = order[i + 1];
        const most = next.orbitRadius - reach(next) - GAP - reach(order[i]);
        if (order[i].orbitRadius > most) place(order[i], Math.floor(most / 10000) * 10000);
      }
      // Outward: each where it is, unless that's too close to the one inside.
      for (let i = home + 1; i < order.length; i++) {
        const last = order[i - 1];
        const least = last.orbitRadius + reach(last) + GAP + reach(order[i]);
        if (order[i].orbitRadius < least) place(order[i], Math.ceil(least / 10000) * 10000);
      }
      const inner = order[0];
      if (inner.orbitRadius - reach(inner) < Math.max(star.radius, star.pull)) throw new Error(`${inner.name}'s moons would reach the star's pull`);

      const count = (kind: NodeKind) => walk(world).reduce((sum, entry) => sum + (entry.node.kind === kind ? Math.max(1, entry.node.count) : 0), 0);
      lines.push(
        `Full count: added ${moons} moons with two rings of fields each.`,
        `Now ${count("planet")} planets, ${count("moon")} moons, ${count("field")} fields, ${count("station")} bases.`,
        moved.length ? `Moved apart: ${moved.join(", ")}.` : "No planet needed moving.",
      );
      for (const planet of order) lines.push(`  ${planet.name} at ${Math.round(planet.orbitRadius / 1000)}k reaches ${Math.round(reach(planet) / 1000)}k round it.`);
      return lines;
    },
  },
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
        // The all-round tractor is made from a part B (docs/items-plan.md): a few to begin with, which come from nowhere.
        items: [{ item: "partB", n: 3 }],
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
  "filled-system": {
    about: "A basic but filled home system: ten planets, two moons, a dozen fields and a third base, on top of far-base.",
    start: "shipped",
    apply(world) {
      const lines = RECIPES["far-base"].apply(world);
      const star = world.root;
      const home = homeStation(world);
      const homePlanet = walk(world).find((entry) => entry.node.kind === "planet" && entry.parent === star)?.node;
      if (!homePlanet) throw new Error("This world has no planet round its star");
      // Everything this recipe adds is named in FILLED, so it can take it all out and run again.
      for (const name of FILLED) removeNamed(world, name);
      // Orbit times grow like the home planet's does with distance: further out, slower round.
      const period = (radius: number, like: { radius: number; period: number }) => Math.round(like.period * Math.pow(radius / like.radius, 1.5));
      const round = { radius: homePlanet.orbitRadius, period: homePlanet.orbitPeriod };
      const add = (parent: WorldNode, kind: NodeKind, name: string, settings: Partial<WorldNode>, like = round): WorldNode => {
        const node = makeChild(world, parent, kind);
        const radius = settings.radius ?? node.radius;
        Object.assign(node, bodyDefaults(kind, radius), { name, radius }, settings);
        if (settings.orbitPeriod === undefined) node.orbitPeriod = period(node.orbitRadius, like);
        parent.children.push(node);
        return node;
      };

      // Inner: a small scorched rock, a heavy cloud world and a speck.
      const ember = add(star, "planet", "Ember", { radius: 7000, orbitRadius: 820000, orbitPhase: 200, atmosphere: 7000 * 1.6, burnSpeed: 200 });
      add(ember, "field", "Ember scatter", { orbitRadius: 36000, orbitPeriod: 5200, orbitPhase: 40, rocks: 380 });
      add(star, "planet", "Mire", { radius: 16000, orbitRadius: 1150000, orbitPhase: 95, atmosphere: 16000 * 1.7, burnSpeed: 160, pullAccel: 170 });
      add(star, "planet", "Speck", { radius: 3500, orbitRadius: 1380000, orbitPhase: 320, pullAccel: 70, atmosphere: 0, burnSpeed: 0 });
      // Past home: a rock you can scrape along, and a belt round a big asteroid.
      const tessel = add(star, "planet", "Tessel", { radius: 9000, orbitRadius: 2150000, orbitPhase: 150, surface: "damage", atmosphere: 0, burnSpeed: 0, pullAccel: 120 });
      add(tessel, "field", "Tessel drift", { orbitRadius: 42000, orbitPeriod: 7400, orbitPhase: 300 });
      const kettle = add(star, "asteroid", "Kettle", { radius: 1800, orbitRadius: 2700000, orbitPhase: 30 });
      add(kettle, "field", "Kettle belt", { radius: 6500, orbitRadius: 10500, orbitPeriod: -4200, orbitPhase: 0, rocks: 640 });
      // The giant: a wall forty thousand across that traps a Floater, two ring fields, and a moon with a base.
      const bulwark = add(star, "planet", "Bulwark", { radius: 40000, orbitRadius: 3600000, orbitPhase: 250, pull: 100000, pullFull: 52000, pullAccel: 150, atmosphere: 46000, burnSpeed: 260 });
      // Its rocks drop ore B as well as plain ore: the one far field of the items plan.
      add(bulwark, "field", "Bulwark inner ring", { orbitRadius: 112000, orbitPeriod: 9000, orbitPhase: 10, rocks: 600, drops: [{ item: "oreB", chance: 0.2 }] });
      add(bulwark, "field", "Bulwark outer ring", { orbitRadius: 128000, orbitPeriod: 11000, orbitPhase: 190, rocks: 600 });
      const ferrum = add(bulwark, "moon", "Ferrum", { radius: 3500, orbitRadius: 300000, orbitPeriod: 21000, orbitPhase: 120 });
      const shoals = add(ferrum, "field", "Ferrum shoals", { orbitRadius: 22000, orbitPeriod: 5600, orbitPhase: 0 });
      const ringside = add(shoals, "station", "Ringside", {
        orbitRadius: home.orbitRadius,
        orbitPeriod: home.orbitPeriod,
        orbitPhase: 90,
        spinPeriod: 420,
        shipyard: true,
        spawns: [],
        blueprints: [],
      });
      // Outer: an ice ball, a pair of planets round each other, and a dark far world with one lonely field.
      add(star, "planet", "Pale", { radius: 11000, orbitRadius: 4600000, orbitPhase: 10, atmosphere: 0, burnSpeed: 0 });
      const duo = add(star, "planet", "Duo", { radius: 8000, orbitRadius: 5500000, orbitPhase: 140, atmosphere: 0, burnSpeed: 0 });
      add(duo, "planet", "Duo minor", { radius: 5000, orbitRadius: 70000, orbitPeriod: 30000, orbitPhase: 0, atmosphere: 0, burnSpeed: 0, pullAccel: 110 });
      const gloam = add(star, "planet", "Gloam", { radius: 20000, orbitRadius: 7000000, orbitPhase: 285, atmosphere: 20000 * 1.25, burnSpeed: 240 });
      add(gloam, "field", "Gloam reach", { orbitRadius: 62000, orbitPeriod: 12000, orbitPhase: 200, rocks: 700 });

      const count = (kind: NodeKind) => walk(world).filter((entry) => entry.node.kind === kind).length;
      lines.push(`Filled: ${count("planet")} planets, ${count("moon")} moons, ${count("field")} fields, ${count("station")} bases, ${count("asteroid")} big asteroid.`);
      for (const { node, parent } of walk(world)) {
        if (!parent || !FILLED.includes(node.name) || isBody(node.kind)) continue;
        const clear = closestApproach(world, parent, node);
        if (isBody(parent.kind)) lines.push(`  ${node.name} keeps ${Math.round(clear.gap)} clear of ${parent.name}'s pull.`);
      }
      const span = tripSpan(world, home, ringside);
      lines.push(`Trips from ${home.name} to ${ringside.name} over ${minutes(span)}:`, ...tripReport(world, home, ringside, span));
      return lines;
    },
  },
};
