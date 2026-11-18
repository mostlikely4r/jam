export type PartId =
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
  | "starmap"
  | "autopilot"
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
 * Programs are software: they belong to the pilot, not the ship.
 */
export type PartKind = "thruster" | "gun" | "turret" | "tractor" | "computer" | "section" | "program" | "cockpit";

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

/** A cargo bay's grid: its size in cells and its entry cell, which sits on an edge. */
export interface BayGrid extends Shape {
  entry: Cell;
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
  /** When the ship it's on explodes, it goes up too, wearing every other module by this many hull points. */
  explosive?: number;
}

/** The controls a thruster can answer to: which one fires it is up to its mount. */
export type ThrusterRole = "thrusterMain" | "thrusterReverse" | "thrusterStrafeLeft" | "thrusterStrafeRight" | "thrusterRotateLeft" | "thrusterRotateRight";

export function partFits(part: Part, model: ShipModel): boolean {
  return part.fits === undefined || part.fits.includes(model);
}

export const PARTS: Part[] = [
  {
    id: "spinStabilizer",
    kind: "program",
    label: "Spin stabilizer",
    short: "spin",
    price: 100,
    weight: 0.05,
    description: "Stops your rotation when you let go",
    tier: 0,
  },
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
  },
  {
    id: "retro",
    kind: "program",
    label: "Retro",
    short: "retro",
    price: 300,
    weight: 0.1,
    description: "Cancels drift, using the thrusters you own (X)",
    tier: 2,
  },
  {
    id: "meters",
    kind: "program",
    label: "Speed and distance meters",
    short: "meters",
    price: 50,
    weight: 0.02,
    description: "Adds readouts to the arrows",
    tier: 0,
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
  },
  {
    id: "clickMove",
    kind: "program",
    label: "Click to move",
    short: "click",
    price: 400,
    weight: 0.02,
    description: "Right click shifts you there, double click stops there. Drag to leave with a drift",
    tier: 2,
  },
  {
    id: "clickRoute",
    kind: "program",
    label: "Route planner",
    short: "route",
    price: 200,
    weight: 0.02,
    description: "Click to move steers around what's in the way",
    tier: 2,
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
  },
  {
    id: "clickTurn",
    kind: "program",
    label: "Click to turn",
    short: "turn",
    price: 150,
    weight: 0.02,
    description: "Drag from your ship to set a facing to hold",
    tier: 2,
  },
  {
    id: "starmap",
    kind: "program",
    label: "System chart",
    short: "chart",
    price: 350,
    weight: 0.02,
    description: "Map. Press C to open it",
    tier: 2,
  },
  {
    id: "autopilot",
    kind: "program",
    label: "Autopilot",
    short: "auto",
    price: 800,
    weight: 0.05,
    description: "From the chart, sets a course and flies it: out, coast, brake, round bodies",
    tier: 2,
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
  },
  {
    id: "bay",
    kind: "section",
    shape: { w: 2, h: 3 },
    label: "Cargo bay",
    short: "bay",
    price: 250,
    weight: 0.1,
    bay: { w: 5, h: 4, entry: { x: 2, y: 0 } },
    description: "Room for 20 more ore, for a little more weight",
    tier: 1,
  },
  {
    id: "largeBay",
    kind: "section",
    shape: { w: 3, h: 4 },
    label: "Large cargo bay",
    short: "bay+",
    price: 600,
    weight: 0.25,
    bay: { w: 10, h: 5, entry: { x: 4, y: 0 } },
    description: "Room for 50 more ore, and you'll feel the weight",
    tier: 2,
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
    bay: { w: 5, h: 2, entry: { x: 2, y: 0 } },
    description: "The bay a bare hull comes with. Room for 10 ore",
    tier: 0,
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
  },
];

/** Whether a part is for fitting and selling: cockpit glass is looks only. */
export function isGear(part: Part): boolean {
  return part.kind !== "cockpit";
}

/** The cells a part takes, unturned: its own shape, or one cell for anything without one. */
export function shapeOf(id: PartId): Shape {
  return partOf(id).shape ?? { w: 1, h: 1 };
}

/** A part by its id. */
export function partOf(id: PartId): Part {
  return PARTS_BY_ID.get(id)!;
}

/** A program goes into a computer's slots and belongs to the pilot. Anything else is fitted. */
export function isProgram(id: PartId): boolean {
  return partOf(id).kind === "program";
}

const PARTS_BY_ID = new Map(PARTS.map((part) => [part.id, part]));

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
