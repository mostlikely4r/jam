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
  | "clickTurn"
  | "turret";

/** The racer is the quick ship with an arrow shape. The floater is slow and square. */
export type ShipModel = "racer" | "floater";

export interface Part {
  id: PartId;
  label: string;
  /** For compact lists of what a ship has. */
  short: string;
  price: number;
  /** Added to the ship's weight, which divides all of its thrust. */
  weight: number;
  description: string;
  /** The ships it can be fitted to. Without this, any ship. */
  fits?: ShipModel[];
  /** 0 = sold from the start, 1 and 2 = once haulers have bought enough of the station's ore. */
  tier: 0 | 1 | 2;
}

export function partFits(part: Part, model: ShipModel): boolean {
  return part.fits === undefined || part.fits.includes(model);
}

export const PARTS: Part[] = [
  {
    id: "spinStabilizer",
    label: "Spin stabilizer",
    short: "spin",
    price: 100,
    weight: 0.05,
    description: "Stops your rotation when you let go",
    tier: 0,
  },
  {
    id: "reverse",
    label: "Reverse thruster",
    short: "rev",
    price: 200,
    weight: 0.15,
    description: "Brake without flipping",
    tier: 1,
  },
  {
    id: "strafe",
    label: "Strafe thrusters",
    short: "strafe",
    price: 300,
    weight: 0.25,
    description: "Move sideways",
    tier: 1,
  },
  {
    id: "retro",
    label: "Retro",
    short: "retro",
    price: 300,
    weight: 0.1,
    description: "Cancels drift, using the thrusters you own (X)",
    tier: 2,
  },
  {
    id: "meters",
    label: "Speed and distance meters",
    short: "meters",
    price: 50,
    weight: 0.02,
    description: "Adds readouts to the arrows",
    tier: 0,
  },
  {
    id: "gun2",
    label: "Gun 2",
    short: "gun2",
    price: 250,
    weight: 0.05,
    description: "Replaces your gun. Slower, and precision hits release slow ore",
    tier: 0,
  },
  {
    id: "clickMove",
    label: "Click to move",
    short: "click",
    price: 400,
    weight: 0.02,
    description: "Flies you to where you click, straight there",
    tier: 2,
  },
  {
    id: "clickRoute",
    label: "Route planner",
    short: "route",
    price: 200,
    weight: 0.02,
    description: "Click to move steers around what's in the way",
    tier: 2,
  },
  {
    id: "tractor",
    label: "Tractor beam",
    short: "tractor",
    price: 300,
    weight: 0.1,
    description: "Pulls in loose ore nearby",
    fits: ["floater"],
    tier: 2,
  },
  {
    id: "clickTurn",
    label: "Click to turn",
    short: "turn",
    price: 150,
    weight: 0.02,
    description: "Right click faces that spot, right away",
    tier: 2,
  },
  {
    id: "turret",
    label: "Turret mount",
    short: "turret",
    price: 300,
    weight: 0.1,
    description: "Your gun turns to follow the mouse, with a third of its range",
    fits: ["floater"],
    tier: 1,
  },
];

/** The order a drone buys in: its gun and engine work first, its comfort comes last. */
export const DRONE_BUY_ORDER: PartId[] = ["spinStabilizer", "reverse", "strafe", "retro", "meters"];

/**
 * What traffic and the player's drones buy, in order: only what their autopilot makes good
 * use of. Click parts and retro add little to it, so they're left out.
 */
export const TRAFFIC_BUY_ORDER: Record<ShipModel, PartId[]> = {
  racer: ["reverse", "strafe", "spinStabilizer"],
  floater: ["tractor", "turret", "reverse", "strafe", "spinStabilizer"],
};

/** What unlocks at each tier, for the station to announce. */
export function partsInTier(tier: 1 | 2): Part[] {
  return PARTS.filter((part) => part.tier === tier);
}
