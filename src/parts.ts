export type PartId =
  | "spinStabilizer"
  | "reverse"
  | "strafe"
  | "retro"
  | "meters"
  | "gun2"
  | "clickMove";

export interface Part {
  id: PartId;
  label: string;
  /** For compact lists of what a ship has. */
  short: string;
  price: number;
  /** Added to the ship's weight, which divides all of its thrust. */
  weight: number;
  description: string;
}

export const PARTS: Part[] = [
  {
    id: "spinStabilizer",
    label: "Spin stabilizer",
    short: "spin",
    price: 100,
    weight: 0.05,
    description: "Stops your rotation when you let go",
  },
  {
    id: "reverse",
    label: "Reverse thruster",
    short: "rev",
    price: 200,
    weight: 0.15,
    description: "Brake without flipping",
  },
  {
    id: "strafe",
    label: "Strafe thrusters",
    short: "strafe",
    price: 300,
    weight: 0.25,
    description: "Move sideways",
  },
  {
    id: "retro",
    label: "Retro",
    short: "retro",
    price: 300,
    weight: 0.1,
    description: "Cancels drift, using the thrusters you own (X)",
  },
  {
    id: "meters",
    label: "Speed and distance meters",
    short: "meters",
    price: 50,
    weight: 0.02,
    description: "Adds readouts to the arrows",
  },
  {
    id: "gun2",
    label: "Gun 2",
    short: "gun2",
    price: 250,
    weight: 0.05,
    description: "Replaces your gun. Slower, and precision hits release slow ore",
  },
  {
    id: "clickMove",
    label: "Click to move",
    short: "click",
    price: 400,
    weight: 0.02,
    description: "Flies you to where you click",
  },
];

/** The order a drone buys in: its gun and engine work first, its comfort comes last. */
export const DRONE_BUY_ORDER: PartId[] = ["spinStabilizer", "reverse", "strafe", "retro", "meters"];
