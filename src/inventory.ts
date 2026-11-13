import { mountsOf, programSlots, computerSize, DAMAGED_AT, type Module, type MountId } from "./fitting";
import { partOf, PARTS } from "./parts";
import type { ItemPlace, Sim } from "./sim";

/** What each mount is called on the ship screen. */
const MOUNT_NAMES: Record<MountId, string> = {
  thrusterMain: "Main thruster",
  thrusterRotateLeft: "Turn left",
  thrusterRotateRight: "Turn right",
  thrusterReverse: "Reverse",
  thrusterStrafeLeft: "Strafe left",
  thrusterStrafeRight: "Strafe right",
  gun: "Gun mount",
  turretGun: "On the turret",
  tractor: "Tractor mount",
  computer: "Computer",
  section: "Section",
};

function condition(module: Module): string {
  if (module.wear >= 1) return " (destroyed)";
  if (module.wear >= DAMAGED_AT) return " (damaged, not working)";
  if (module.wear > 0) return ` (${Math.round(module.wear * 100)}% worn)`;
  return "";
}

/**
 * The ship screen (I) and the locker screen (L): what's fitted, what rides in the bay, the
 * pilot's programs, and what's kept at the base the ship is docked at. Moving things about
 * only works in a dock; out in space the screens just show.
 */
export class Inventory {
  showShip = false;
  showLocker = false;
  private state = "";

  constructor(
    private readonly box: HTMLDivElement,
    readonly sim: Sim,
  ) {}

  toggleShip(): void {
    this.showShip = !this.showShip;
    this.sim.discovered.add("used:inventory");
  }

  toggleLocker(): void {
    this.showLocker = !this.showLocker;
    this.sim.discovered.add("used:locker");
  }

  openBoth(): void {
    this.showShip = this.showLocker = true;
    this.sim.discovered.add("used:inventory");
    this.sim.discovered.add("used:locker");
  }

  close(): void {
    this.showShip = this.showLocker = false;
  }

  /** Rebuilds the screen when what it shows has changed. */
  update(): void {
    const { sim } = this;
    const { ship } = sim;
    const base = sim.baseAt();
    const open = this.showShip || this.showLocker;
    const state = open
      ? JSON.stringify([this.showShip, this.showLocker, base?.id, ship.fit, ship.hold, ship.programs, [...ship.software], ship.ore, ship.credits, base ? sim.lockerAt(base) : null])
      : "closed";
    if (state === this.state) return;
    this.state = state;
    this.box.hidden = !open;
    if (!open) return;
    this.box.replaceChildren();
    if (this.showShip) this.drawShip();
    if (this.showLocker) this.drawLocker();
  }

  private heading(text: string): void {
    const h = document.createElement("h2");
    h.textContent = text;
    this.box.append(h);
  }

  private row(text: string, actions: [string, () => boolean][]): void {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = text;
    row.append(label);
    for (const [name, act] of actions) {
      const button = document.createElement("button");
      button.textContent = name;
      button.addEventListener("click", () => {
        act();
        button.blur();
        this.state = "";
      });
      row.append(button);
    }
    this.box.append(row);
  }

  private note(text: string): void {
    const p = document.createElement("p");
    p.textContent = text;
    this.box.append(p);
  }

  private drawShip(): void {
    const { sim } = this;
    const { ship } = sim;
    const docked = sim.baseAt() !== null;
    this.heading(`Ship - bay ${ship.ore} ore + ${sim.holdSize(ship)} in modules, of ${sim.bayTotal(ship)}`);
    for (const mount of mountsOf(ship)) {
      const module = ship.fit[mount.id];
      if (!module && mount.id === "turretGun") continue;
      const text = `${MOUNT_NAMES[mount.id]}: ${module ? partOf(module.part).label + condition(module) : "empty"}`;
      const place: ItemPlace = { at: "mount", mount: mount.id };
      const actions: [string, () => boolean][] =
        module && docked
          ? [
              ["to locker", () => sim.toLocker(ship, place)],
              ["to bay", () => sim.toHold(ship, place)],
            ]
          : [];
      this.row(text, actions);
    }
    if (ship.hold.length > 0) {
      this.heading("In the bay");
      ship.hold.forEach((item, index) => {
        const place: ItemPlace = { at: "hold", index };
        const actions: [string, () => boolean][] = docked
          ? [
              ["fit", () => sim.fitItem(ship, place)],
              ["to locker", () => sim.toLocker(ship, place)],
              [`sell ${sim.moduleValue(item)}`, () => sim.sellItem(ship, place)],
            ]
          : [["drop", () => sim.dropItem(ship, index)]];
        this.row(`${partOf(item.part).label}${condition(item)}`, actions);
      });
    }
    this.heading(`Programs - ${programSlots(ship)} running of ${computerSize(ship)} slots`);
    const owned = PARTS.filter((part) => ship.software.has(part.id));
    if (owned.length === 0) this.note("None yet. They're sold in the dock shop, and they're yours: they stay with you, whatever ship you fly.");
    for (const part of owned) {
      const loaded = ship.programs.includes(part.id);
      const running = ship.parts.has(part.id);
      const text = `${part.label}: ${running ? "running" : loaded ? "loaded, computer down" : "not loaded"}`;
      this.row(text, docked ? [[loaded ? "unload" : "load", () => sim.setProgram(ship, part.id, !loaded)]] : []);
    }
    if (!docked) this.note("Fitting, loading and storing are done in a dock.");
  }

  private drawLocker(): void {
    const { sim } = this;
    const { ship } = sim;
    const base = sim.baseAt();
    if (!base) {
      const kept = [...sim.lockers].filter(([, items]) => items.length > 0).map(([id, items]) => `${sim.baseName(id)} (${items.length})`);
      this.heading("Locker");
      this.note(kept.length > 0 ? `Not docked. You have things kept at ${kept.join(", ")}.` : "Not docked. Every base has a locker for you.");
      return;
    }
    const locker = sim.lockerAt(base);
    this.heading(`Locker at ${sim.baseName(base.id)}`);
    if (locker.length === 0) this.note("Empty. What you take off or leave here stays here.");
    locker.forEach((item, index) => {
      const place: ItemPlace = { at: "locker", index };
      this.row(`${partOf(item.part).label}${condition(item)}`, [
        ["fit", () => sim.fitItem(ship, place)],
        ["to bay", () => sim.toHold(ship, place)],
        [`sell ${sim.moduleValue(item)}`, () => sim.sellItem(ship, place)],
      ]);
    });
  }
}
