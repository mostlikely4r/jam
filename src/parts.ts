import type { GlyphId } from "./glyphs";

/**
 * A part's icon: a glyph drawn in its two colours, in a border-coloured frame, with the mark
 * in the bottom-right corner (at most its first 3 characters). Chosen in the part designer
 * over the code's default.
 */
export interface PartIcon {
  glyph: GlyphId;
  primary: string;
  secondary: string;
  border: string;
  /** Free text drawn in the corner, such as `*`, `+`, `!`, `2` or `360`. */
  mark?: string;
  /** Items only: the colour an item glows when it floats loose in the world. */
  glow?: string;
}

/** The items the game ships with ids of their own. A module's item is the module's own id, so it's already here. */
type ItemId = "ore" | "oreB" | "partA" | "partB";

export type PartId =
  | ItemId
  | "spinStabilizer"
  | "reverse"
  | "strafe"
  | "retro"
  | "meters"
  | "gun2"
  | "clickMove"
  | "clickRoute"
  | "tractor"
  | "tractorAll"
  | "clickTurn"
  | "turret"
  | "bay"
  | "largeBay"
  | "smallBay"
  | "smallTank"
  | "mediumTank"
  | "largeTank"
  | "starmap"
  | "autopilot"
  | "targeting"
  | "relativeLines"
  | "turretTracking"
  | "autoMine"
  | "autoMine2"
  | "faceTarget"
  | "racerMain"
  | "floaterMain"
  | "turnThrusters"
  | "gun1"
  | "basicComputer"
  | "flightComputer"
  | "navComputer"
  | "cockpitKite"
  | "cockpitBar"
  | "cockpitDome"
  | "cockpitVisor";

/**
 * Where a part goes: on a mount of that kind, or (a program) into a computer's slots.
 * Programs are software: they belong to the pilot, not the ship, and have their own records
 * (see src/programs.ts).
 */
export const PART_KINDS = ["thruster", "gun", "turret", "tractor", "computer", "section", "tank", "program", "cockpit", "item"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/**
 * The hulls there are. The racer is the quick ship with an arrow shape. The floater is slow and
 * square. The defender, drone and pirate hulls are drawn and fitted in the hull designer.
 */
export const SHIP_MODELS = ["racer", "floater", "defender", "drone", "pirate"] as const;
export type ShipModel = (typeof SHIP_MODELS)[number];

/** How many cells something takes on a grid, unturned: `w` across, `h` down. */
export interface Shape {
  w: number;
  h: number;
}

/** A cell on a grid: x across from the left, y down from the top. */
export interface Cell {
  x: number;
  y: number;
}

/**
 * A cargo bay's grid, front up: its size in cells and its entry, which sits on an edge, `size`
 * cells long from its cell (across on the top or bottom edge, down a side).
 */
export interface BayGrid extends Shape {
  entry: Cell & { size?: number };
}

export interface Part {
  id: PartId;
  label: string;
  /** For compact lists of what a ship has. */
  short: string;
  price: number;
  /** Added to the ship's weight, which divides all of its thrust. */
  weight: number;
  /** A cargo bay: the grid it holds, in cells, with the one cell on its edge everything comes in through. */
  bay?: BayGrid;
  /** A fuel tank: how much fuel it holds (docs/fuel-plan.md). A ship's tank is the sum of its own. */
  tank?: number;
  description: string;
  /** The ships it can be fitted to. Without this, any ship. */
  fits?: ShipModel[];
  /** 0 = sold from the start, 1 and 2 = once haulers have bought enough of the station's ore. */
  tier: 0 | 1 | 2;
  /**
   * Nobody sells its blueprint: only a base that holds one can sell the part, whatever the
   * tier and whether or not shops need blueprints. Which bases hold it is set in the designer.
   */
  held?: boolean;
  kind: PartKind;
  // Which mounts it goes on is in src/hulls.json: the mount types it fits.
  /** Sold and fitted this many at a time, one per mount (a pair of strafe thrusters). Without this, 1. */
  set?: number;
  /** A main thruster sets the power of all a ship's thrusters: the racer's full, the floater's a fraction. */
  engine?: ShipModel;
  /** A computer: how many programs it runs at once. */
  slots?: number;
  /** Part of a hull as it comes from the yard. Only sold to fill a mount that has none. */
  builtIn?: boolean;
  /** The cells it takes in a bay or locker, unturned. Programs and cockpit glass have none. */
  shape?: Shape;
  /** Items only: how much room it takes where it is stored. Without one, its shape's area. */
  volume?: number;
  /** When the ship it's on explodes, it goes up too, wearing every other module by this many hull points. */
  explosive?: number;
  /** How it shows in the shop, on the blueprint and in the bay: glyph, colours and mark. */
  icon: PartIcon;
}

/** The controls a thruster can answer to: which one fires it is up to its mount. */
export type ThrusterRole = "thrusterMain" | "thrusterReverse" | "thrusterStrafeLeft" | "thrusterStrafeRight" | "thrusterRotateLeft" | "thrusterRotateRight";

export function partFits(part: Part, model: ShipModel): boolean {
  return part.fits === undefined || part.fits.includes(model);
}

/**
 * The icon colour families, one per kind of part, so a shop grid reads by category at a glance:
 * the frame (border) carries the family, the glyph colours the ship art's own tones.
 */
const ENGINE_COLORS: PartIcon = { glyph: "engineLarge", primary: "#8c9bb2", secondary: "#bec8d8", border: "#f0a868" };
const GUN_COLORS: PartIcon = { glyph: "gun", primary: "#5a6272", secondary: "#bec8d8", border: "#e88a8a" };
const TRACTOR_COLORS: PartIcon = { glyph: "coneBeam", primary: "#467870", secondary: "#96e6d2", border: "#7fdfe6" };
const COMPUTER_COLORS: PartIcon = { glyph: "chip", primary: "#2e3d59", secondary: "#8fb4ff", border: "#8fb4ff" };
const BAY_COLORS: PartIcon = { glyph: "crate", primary: "#566274", secondary: "#c8d4e8", border: "#f0d86a" };
const TANK_COLORS: PartIcon = { glyph: "gauge", primary: "#6a5a3a", secondary: "#ffd479", border: "#e0a83a" };
const COCKPIT_COLORS: PartIcon = { glyph: "kite", primary: "#2b4a74", secondary: "#a0d7ff", border: "#a0d7ff" };

export const PARTS: Part[] = [
  {
    id: "reverse",
    kind: "thruster",
    shape: { w: 1, h: 2 },
    label: "Reverse thruster",
    short: "rev",
    price: 200,
    weight: 0.15,
    description: "Brake without flipping",
    tier: 1,
    icon: { ...ENGINE_COLORS, glyph: "reverse" },
  },
  {
    id: "strafe",
    kind: "thruster",
    set: 2,
    shape: { w: 1, h: 2 },
    label: "Strafe thrusters",
    short: "strafe",
    price: 300,
    weight: 0.25,
    description: "Move sideways",
    tier: 1,
    icon: { ...ENGINE_COLORS, glyph: "strafe" },
  },
  {
    id: "gun2",
    kind: "gun",
    shape: { w: 1, h: 2 },
    label: "Gun 2",
    short: "gun2",
    price: 250,
    weight: 0.05,
    description: "A slower gun that hits free ore that stays with the rock. No flung ore",
    tier: 0,
    icon: { ...GUN_COLORS, glyph: "gun", mark: "2" },
  },
  {
    id: "tractor",
    kind: "tractor",
    shape: { w: 2, h: 2 },
    label: "Tractor beam",
    short: "tractor",
    price: 300,
    weight: 0.1,
    description: "Catches loose ore ahead and pulls it in",
    fits: ["floater"],
    tier: 2,
    icon: { ...TRACTOR_COLORS, glyph: "coneBeam" },
  },
  {
    id: "tractorAll",
    kind: "tractor",
    shape: { w: 2, h: 2 },
    label: "All-round tractor",
    short: "tractor 360",
    price: 600,
    weight: 0.1,
    description: "Catches loose ore all round, not just ahead",
    tier: 2,
    held: true,
    icon: { ...TRACTOR_COLORS, glyph: "ringBeam", mark: "360" },
  },
  {
    id: "turret",
    kind: "turret",
    shape: { w: 2, h: 2 },
    label: "Turret mount",
    short: "turret",
    price: 300,
    weight: 0.1,
    description: "Your gun turns to follow the mouse, with a third of its range",
    fits: ["floater"],
    tier: 1,
    icon: { ...GUN_COLORS, glyph: "turret" },
  },
  {
    id: "bay",
    kind: "section",
    shape: { w: 2, h: 3 },
    label: "Cargo bay",
    short: "bay",
    price: 250,
    weight: 0.1,
    bay: { w: 4, h: 5, entry: { x: 1, y: 0, size: 2 } },
    description: "Room for 20 more ore, for a little more weight",
    tier: 1,
    icon: { ...BAY_COLORS, glyph: "crate" },
  },
  {
    id: "largeBay",
    kind: "section",
    shape: { w: 3, h: 4 },
    label: "Large cargo bay",
    short: "bay+",
    price: 600,
    weight: 0.25,
    bay: { w: 5, h: 10, entry: { x: 1, y: 0, size: 3 } },
    description: "Room for 50 more ore, and you'll feel the weight",
    tier: 2,
    icon: { ...BAY_COLORS, glyph: "openCrate", mark: "+" },
  },
  // The bay every bare hull comes with: with none of these, a ship carries no ore at all. It
  // weighs nothing: the hull's own base weight was tuned with its hold already in it.
  {
    id: "smallBay",
    kind: "section",
    builtIn: true,
    shape: { w: 2, h: 2 },
    label: "Small cargo bay",
    short: "bay-",
    price: 100,
    weight: 0,
    bay: { w: 2, h: 5, entry: { x: 0, y: 0, size: 2 } },
    description: "The bay a bare hull comes with. Room for 10 ore",
    tier: 0,
    icon: { ...BAY_COLORS, glyph: "crate", mark: "-" },
  },
  // Fuel tanks: how far a ship gets between docks. Every hull comes with two, and what it holds
  // is their sum (docs/fuel-plan.md, step 2b). They weigh nothing until the tune says otherwise.
  {
    id: "smallTank",
    kind: "tank",
    tank: 10,
    builtIn: true,
    shape: { w: 2, h: 2 },
    label: "Small fuel tank",
    short: "tank-",
    price: 160,
    weight: 0,
    description: "Holds 10 fuel. The tank a bare hull comes with",
    tier: 0,
    icon: { ...TANK_COLORS, mark: "10" },
  },
  {
    id: "mediumTank",
    kind: "tank",
    tank: 20,
    shape: { w: 2, h: 2 },
    label: "Fuel tank",
    short: "tank",
    price: 320,
    weight: 0,
    description: "Holds 20 fuel: twice the trip before you go home for more",
    tier: 1,
    icon: { ...TANK_COLORS, mark: "20" },
  },
  {
    id: "largeTank",
    kind: "tank",
    tank: 40,
    shape: { w: 3, h: 3 },
    label: "Large fuel tank",
    short: "tank+",
    price: 640,
    weight: 0,
    description: "Holds 40 fuel: a long haul without a dock",
    tier: 2,
    icon: { ...TANK_COLORS, mark: "40" },
  },
  {
    id: "flightComputer",
    kind: "computer",
    slots: 4,
    shape: { w: 1, h: 1 },
    label: "Flight computer",
    short: "comp4",
    price: 500,
    weight: 0.03,
    description: "Runs 4 programs at once",
    tier: 1,
    icon: { ...COMPUTER_COLORS, glyph: "chip", mark: "4" },
  },
  {
    id: "navComputer",
    kind: "computer",
    slots: 6,
    shape: { w: 1, h: 1 },
    label: "Navigation computer",
    short: "comp6",
    price: 1200,
    weight: 0.04,
    description: "Runs 6 programs at once",
    tier: 2,
    icon: { ...COMPUTER_COLORS, glyph: "chip", mark: "6" },
  },
  // A hull's own gear, as it comes from the yard.
  {
    id: "gun1",
    kind: "gun",
    builtIn: true,
    shape: { w: 1, h: 2 },
    label: "Gun 1",
    short: "gun1",
    price: 100,
    weight: 0,
    description: "A quick gun. Breaks rocks and sometimes flings ore off, worth more",
    tier: 0,
    icon: { ...GUN_COLORS, glyph: "gun", mark: "1" },
  },
  {
    id: "racerMain",
    kind: "thruster",
    engine: "racer",
    builtIn: true,
    shape: { w: 2, h: 2 },
    label: "Racer main thruster",
    short: "main",
    price: 300,
    weight: 0,
    description: "Full power for every thruster on the ship",
    tier: 0,
    icon: { ...ENGINE_COLORS, glyph: "engineLarge" },
  },
  {
    id: "floaterMain",
    kind: "thruster",
    engine: "floater",
    builtIn: true,
    shape: { w: 2, h: 2 },
    label: "Floater main thruster",
    short: "main",
    price: 200,
    weight: 0,
    description: "Gentle power for every thruster on the ship",
    tier: 0,
    icon: { ...ENGINE_COLORS, glyph: "engineSmall" },
  },
  {
    id: "turnThrusters",
    kind: "thruster",
    set: 2,
    builtIn: true,
    shape: { w: 1, h: 1 },
    label: "Turning thrusters",
    short: "turn",
    price: 100,
    weight: 0,
    description: "Turn the ship",
    tier: 0,
    icon: { ...ENGINE_COLORS, glyph: "turn" },
  },
  {
    id: "basicComputer",
    kind: "computer",
    slots: 2,
    builtIn: true,
    shape: { w: 1, h: 1 },
    label: "Basic computer",
    short: "comp2",
    price: 150,
    weight: 0,
    description: "Runs 2 programs at once",
    tier: 0,
    icon: { ...COMPUTER_COLORS, glyph: "chip", mark: "2" },
  },
  // Cockpit glass: looks only. In the hull designer these are flagged as decals, which only go
  // on decal mounts and are never sold or fitted for real.
  {
    id: "cockpitKite",
    kind: "cockpit",
    label: "Kite cockpit",
    short: "kite",
    price: 0,
    weight: 0,
    description: "A pointed glass canopy. Looks only",
    tier: 0,
    icon: { ...COCKPIT_COLORS, glyph: "kite" },
  },
  {
    id: "cockpitBar",
    kind: "cockpit",
    label: "Bar cockpit",
    short: "bar",
    price: 0,
    weight: 0,
    description: "A wide glass strip across the front. Looks only",
    tier: 0,
    icon: { ...COCKPIT_COLORS, glyph: "bar" },
  },
  {
    id: "cockpitDome",
    kind: "cockpit",
    label: "Dome cockpit",
    short: "dome",
    price: 0,
    weight: 0,
    description: "A round glass bubble. Looks only",
    tier: 0,
    icon: { ...COCKPIT_COLORS, glyph: "dome" },
  },
  {
    id: "cockpitVisor",
    kind: "cockpit",
    label: "Visor cockpit",
    short: "visor",
    price: 0,
    weight: 0,
    description: "A narrow slit of glass. Looks only",
    tier: 0,
    icon: { ...COCKPIT_COLORS, glyph: "visor" },
  },
];

/** Whether a part is for fitting and selling: cockpit glass is looks only. */
export function isGear(part: Part): boolean {
  return part.kind !== "cockpit";
}

/** The cells a part takes, unturned: its own shape, or one cell for anything without one. */
export function shapeOf(id: PartId): Shape {
  return PARTS_BY_ID.get(id)?.shape ?? { w: 1, h: 1 };
}

/** A part by its id. */
export function partOf(id: PartId): Part {
  return PARTS_BY_ID.get(id)!;
}

/** A program goes into a computer's slots and belongs to the pilot. Anything else is fitted. */
export function isProgram(id: PartId): boolean {
  return PARTS_BY_ID.get(id)?.kind === "program";
}

const PARTS_BY_ID = new Map(PARTS.map((part) => [part.id, part]));

/**
 * Lets `partOf` answer for an item or a program as well, so everything that holds a module (the
 * bay, the locker, a base's store, loot) takes them without knowing the difference. Neither is
 * in `PARTS`, so nothing that lists the parts lists them. See src/items.ts and src/programs.ts.
 */
export function registerThing(part: Part): void {
  PARTS_BY_ID.set(part.id, part);
}

/** Takes an item out of what `partOf` answers for. */
export function forgetThing(id: PartId): void {
  if (!PARTS.some((part) => part.id === id)) PARTS_BY_ID.delete(id);
}

/** Whether an id is an item rather than a part. */
export function isItem(id: PartId): boolean {
  return PARTS_BY_ID.get(id)?.kind === "item";
}

/** How much room a part or item takes where it is stored: its volume, or else the area of its shape. */
export function volumeOf(id: PartId): number {
  const part = PARTS_BY_ID.get(id);
  if (part?.volume !== undefined) return part.volume;
  const { w, h } = shapeOf(id);
  return w * h;
}

/** The order a drone buys in: its gun and engine work first, its comfort comes last. */
export const DRONE_BUY_ORDER: PartId[] = ["spinStabilizer", "reverse", "strafe", "retro", "meters"];

/**
 * What traffic and the player's drones buy, in order: only what their autopilot makes good
 * use of. Click parts and retro add little to it, so they're left out.
 */
export const TRAFFIC_BUY_ORDER: Record<ShipModel, PartId[]> = {
  racer: ["reverse", "strafe", "spinStabilizer", "bay"],
  floater: ["tractor", "turret", "reverse", "strafe", "spinStabilizer", "bay"],
  defender: [],
  drone: [],
  pirate: [],
};

/** What the station builds on site from its own parts, rather than having a hauler bring it. */
export const PROJECTS = ["deposit", "stationGuards", "depositGuards"] as const;
export type ProjectId = (typeof PROJECTS)[number];

/** What the station saves up for in one queue: blueprints for its shop, and projects it builds. */
export type BlueprintId = PartId | "drone" | ProjectId;

export function isProject(id: BlueprintId): id is ProjectId {
  return (PROJECTS as readonly BlueprintId[]).includes(id);
}
