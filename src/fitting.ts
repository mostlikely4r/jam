import { isProgram, partFits, partOf, type PartId, type PartKind, type ShipModel, type ThrusterRole } from "./parts";

/**
 * Where things fit on a hull. Each ship has its six thrusters, a gun, a tractor, a computer
 * and a section at the back. A turret on the gun mount brings a gun mount of its own.
 */
export type MountId = ThrusterRole | "gun" | "turretGun" | "tractor" | "computer" | "section";

export interface Mount {
  id: MountId;
  /** The kinds of part it takes. */
  accepts: PartKind[];
  /** The most demanding part it takes: see `Part.class`. */
  class: number;
  /** Where it sits on the hull, in ship radii: x toward the nose, y to the right. */
  x: number;
  y: number;
}

/** One fitted part: what it is and how worn. */
export interface Module {
  part: PartId;
  /** 0 is as new. From `DAMAGED_AT` it stops working, and at 1 it's destroyed. */
  wear: number;
}

/** Everything a ship carries that isn't ore: its fitted modules and its pilot's programs. */
export interface Fitting {
  fit: Partial<Record<MountId, Module>>;
  /** Programs the pilot owns. They go wherever the pilot goes, and need a computer to run. */
  software: Set<PartId>;
  /** The programs loaded in the computer, in the order they were loaded. */
  programs: PartId[];
  /** What works right now: every working module's part and every running program. Kept up by `refresh`. */
  parts: Set<PartId>;
}

export const DAMAGED_AT = 0.5;

const ANY = 9;

function thrusters(cls: number, rear: number): Mount[] {
  const thruster = (id: ThrusterRole, x: number, y: number): Mount => ({ id, accepts: ["thruster"], class: cls, x, y });
  return [
    thruster("thrusterMain", rear, 0),
    thruster("thrusterRotateLeft", -0.7, -0.55),
    thruster("thrusterRotateRight", -0.7, 0.55),
    thruster("thrusterReverse", 0.9, 0),
    thruster("thrusterStrafeLeft", 0, 0.45),
    thruster("thrusterStrafeRight", 0, -0.45),
  ];
}

/** Each hull's mounts. The racer's thrusters take anything; the floater's only floater-class ones. */
export const HULL_MOUNTS: Record<ShipModel, Mount[]> = {
  racer: [
    ...thrusters(2, -0.8),
    { id: "gun", accepts: ["gun"], class: ANY, x: 1.05, y: 0 },
    { id: "tractor", accepts: ["tractor"], class: ANY, x: 0.45, y: 0 },
    { id: "computer", accepts: ["computer"], class: ANY, x: -0.25, y: 0 },
    { id: "section", accepts: ["section"], class: ANY, x: -1.35, y: 0 },
  ],
  floater: [
    ...thrusters(1, -1),
    { id: "gun", accepts: ["gun", "turret"], class: ANY, x: 0.1, y: 0 },
    { id: "tractor", accepts: ["tractor"], class: ANY, x: 0.8, y: 0 },
    { id: "computer", accepts: ["computer"], class: ANY, x: -0.55, y: 0 },
    { id: "section", accepts: ["section"], class: ANY, x: -1.45, y: 0 },
  ],
};

/** What every hull of a model comes with from the yard. */
export const HULL_DEFAULTS: Record<ShipModel, Partial<Record<MountId, PartId>>> = {
  racer: {
    thrusterMain: "racerMain",
    thrusterRotateLeft: "turnThrusters",
    thrusterRotateRight: "turnThrusters",
    gun: "gun1",
    computer: "basicComputer",
  },
  floater: {
    thrusterMain: "floaterMain",
    thrusterRotateLeft: "turnThrusters",
    thrusterRotateRight: "turnThrusters",
    gun: "gun2",
    computer: "flightComputer",
  },
};

/** The mount a turret brings: where the gun goes once the turret is on. */
const TURRET_GUN: Omit<Mount, "x" | "y"> = { id: "turretGun", accepts: ["gun"], class: ANY };

export function newFitting(model: ShipModel): Fitting {
  const fitting: Fitting = { fit: {}, software: new Set(), programs: [], parts: new Set() };
  for (const [mount, part] of Object.entries(HULL_DEFAULTS[model])) fitting.fit[mount as MountId] = { part, wear: 0 };
  refresh(fitting);
  return fitting;
}

/** The mounts a ship has now: its hull's, plus a turret's gun mount while one is on. */
export function mountsOf(ship: Fitting & { model: ShipModel }): Mount[] {
  const mounts = HULL_MOUNTS[ship.model];
  const gun = ship.fit.gun;
  if (!gun || partOf(gun.part).kind !== "turret") return mounts;
  const base = mounts.find((mount) => mount.id === "gun")!;
  return [...mounts, { ...TURRET_GUN, x: base.x, y: base.y }];
}

export function works(module: Module | undefined): module is Module {
  return module !== undefined && module.wear < DAMAGED_AT;
}

export function destroyed(module: Module | undefined): boolean {
  return module !== undefined && module.wear >= 1;
}

/** How many programs the fitted computer runs, if it works. */
export function programSlots(ship: Fitting): number {
  const computer = ship.fit.computer;
  return works(computer) ? partOf(computer.part).slots ?? 0 : 0;
}

/** The computer's slots, whether it works or not: what can be loaded into it. */
export function computerSize(ship: Fitting): number {
  const computer = ship.fit.computer;
  return computer && !destroyed(computer) ? partOf(computer.part).slots ?? 0 : 0;
}

/** Works out what the ship can use right now. Call after any change to its modules or programs. */
export function refresh(ship: Fitting): void {
  ship.parts.clear();
  for (const module of Object.values(ship.fit)) if (works(module)) ship.parts.add(module.part);
  const slots = programSlots(ship);
  ship.programs.slice(0, slots).forEach((id) => ship.parts.add(id));
}

/** The mounts a part would go on, each taking one of a set: none if it can't be fitted. */
export function mountsFor(ship: Fitting & { model: ShipModel }, id: PartId): MountId[] {
  const part = partOf(id);
  if (part.kind === "program" || !partFits(part, ship.model)) return [];
  const fits = (mount: Mount) => mount.accepts.includes(part.kind) && (part.class ?? 1) <= mount.class;
  let mounts = HULL_MOUNTS[ship.model].filter(fits);
  if (part.roles) mounts = mounts.filter((mount) => part.roles!.includes(mount.id as ThrusterRole));
  // A gun goes on the turret when there is one.
  if (part.kind === "gun" && ship.fit.gun && partOf(ship.fit.gun.part).kind === "turret") return ["turretGun"];
  const ids = mounts.map((mount) => mount.id);
  return ids.length >= (part.set ?? 1) ? ids.slice(0, part.set ?? 1) : [];
}

/** Whether the ship has the part on, or (a program) owns it, working or not. */
export function owns(ship: Fitting, id: PartId): boolean {
  if (isProgram(id)) return ship.software.has(id);
  return Object.values(ship.fit).some((module) => module?.part === id);
}

/**
 * Puts a part on its mounts. What was there comes off and is returned, except that a gun
 * makes way for a turret by moving onto it, and moves back off when the turret goes.
 */
export function fitPart(ship: Fitting & { model: ShipModel }, id: PartId, wear = 0): Module[] {
  const mounts = mountsFor(ship, id);
  if (mounts.length === 0) return [];
  const off: Module[] = [];
  for (const mount of mounts) {
    const old = ship.fit[mount];
    if (old) off.push(old);
    ship.fit[mount] = { part: id, wear };
  }
  // A gun that was on the gun mount moves up onto the new turret.
  if (partOf(id).kind === "turret") {
    const gun = off.find((module) => partOf(module.part).kind === "gun");
    if (gun) {
      ship.fit.turretGun = gun;
      off.splice(off.indexOf(gun), 1);
    }
    // Swapping one turret for another, the gun stays on: its mount is the same.
  }
  refresh(ship);
  return off;
}

/** Takes whatever is on a mount off, and returns it. A turret's gun drops back onto the gun mount. */
export function unfit(ship: Fitting & { model: ShipModel }, mount: MountId): Module | null {
  const module = ship.fit[mount];
  if (!module) return null;
  delete ship.fit[mount];
  if (mount === "gun" && partOf(module.part).kind === "turret") {
    const gun = ship.fit.turretGun;
    delete ship.fit.turretGun;
    if (gun) ship.fit.gun = gun;
  }
  refresh(ship);
  return module;
}

/** Every mount holding this part. */
export function mountsHolding(ship: Fitting, id: PartId): MountId[] {
  return (Object.entries(ship.fit) as [MountId, Module | undefined][]).filter(([, module]) => module?.part === id).map(([mount]) => mount);
}

/** Loads a program the pilot owns into the computer, if there's a free slot. Returns whether it went in. */
export function install(ship: Fitting, id: PartId): boolean {
  if (!ship.software.has(id) || ship.programs.includes(id)) return false;
  if (ship.programs.length >= computerSize(ship)) return false;
  ship.programs.push(id);
  refresh(ship);
  return true;
}

export function uninstall(ship: Fitting, id: PartId): boolean {
  const at = ship.programs.indexOf(id);
  if (at < 0) return false;
  ship.programs.splice(at, 1);
  refresh(ship);
  return true;
}

/** After a computer is swapped for a smaller one, the programs that no longer fit come out. */
export function trimPrograms(ship: Fitting): void {
  ship.programs.length = Math.min(ship.programs.length, computerSize(ship));
  refresh(ship);
}

/** The mount whose module a hit at this spot (relative to the ship, in world units) lands on. */
export function nearestMount(ship: Fitting & { model: ShipModel; angle: number }, dx: number, dy: number, radius: number): MountId | null {
  const cos = Math.cos(-ship.angle);
  const sin = Math.sin(-ship.angle);
  const x = (dx * cos - dy * sin) / radius;
  const y = (dx * sin + dy * cos) / radius;
  let best: MountId | null = null;
  let bestDistance = Infinity;
  for (const mount of mountsOf(ship)) {
    if (!ship.fit[mount.id] || destroyed(ship.fit[mount.id])) continue;
    const distance = Math.hypot(mount.x - x, mount.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = mount.id;
    }
  }
  return best;
}
