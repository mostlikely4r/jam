import { computerSize, DAMAGED_AT, isTurretGun, mountsOf, programSlots, tankCapacity, tweakMounts, type Module, type Mount, type MountId } from "./fitting";
import { canPlace, entryCells, fits, footprint, reachable, sticks, type GridSpec, type Placed } from "./grid";
import { isItem, partOf, PARTS, type PartId } from "./parts";
import { pickOf, programDef, PROGRAM_PARTS, type ProgramTweak } from "./programs";
import { partIcon } from "./icons";
import { setTip } from "./tooltip";
import { drawVectorShip } from "./shipArt";
import { dragging, makeDraggable, setDragHandlers, type DragAt, type DragPayload } from "./drag";
import type { BuyInto, ItemPlace, Sim, Spot } from "./sim";

/** One grid cell on screen, in pixels. */
const CELL = 24;
/** The blueprint's size on screen, in pixels. */
const PRINT = 240;
/** The ship art's unit: a ship radius in its own world units. */
const ART_R = 12;
/** How far apart port labels are kept, in pixels. */
const PORT_GAP = 26;

function condition(module: Module): string {
  if (module.wear >= 1) return " (destroyed)";
  if (module.wear >= DAMAGED_AT) return " (damaged, not working)";
  if (module.wear > 0) return ` (${Math.round(module.wear * 100)}% worn)`;
  return "";
}

/** The icon an item shows on a grid tile: a larger one the larger the item, up to its shorter side. */
function tileIconSize(w: number, h: number): number {
  return Math.max(14, Math.min(w, h) * CELL - 8);
}

/** A module's look on screen: its class for damaged and destroyed. */
function wearClass(module: Module): string {
  return module.wear >= 1 ? " destroyed" : module.wear >= DAMAGED_AT ? " damaged" : "";
}

type Selected = { kind: "item"; place: ItemPlace } | null;

/**
 * The ship screen (I) and the locker screen (L). The ship is a blueprint: the hull drawn large
 * with a port on each mount, its computer's program slots beside it, and the bay as a grid
 * with its entry cell marked. The locker at the base is a grid too. In a dock, everything can
 * be dragged (R turns what's held) or clicked for its buttons; out in space the screens show.
 */
export class Inventory {
  showShip = false;
  showLocker = false;
  private state = "";
  private selected: Selected = null;
  /** Why the last move was refused, shown until the next one. */
  private message = "";
  /** The ports on the blueprint, by mount, while the screen is up. */
  private ports = new Map<MountId, HTMLElement>();
  /** The footprint shown where a dragged item would land. */
  private preview: HTMLDivElement | null = null;
  /** The open tweak menu, if any. */
  private menu: HTMLDivElement | null = null;


  constructor(
    private readonly box: HTMLDivElement,
    readonly sim: Sim,
  ) {
    setDragHandlers({
      start: (payload) => this.dragStart(payload),
      hover: (payload, at) => this.dragHover(payload, at),
      drop: (payload, at) => this.dragDrop(payload, at),
      end: () => this.dragEnd(),
    });
    // A click anywhere else puts the tweak menu away.
    document.addEventListener("pointerdown", (event) => {
      if (this.menu && !this.menu.contains(event.target as Node)) this.closeTweaks();
    });
  }

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
    this.closeTweaks();
  }

  /** Rebuilds the screen when what it shows has changed. Never mid-drag. */
  update(): void {
    if (dragging()) return;
    const { sim } = this;
    const { ship } = sim;
    const base = sim.baseAt();
    const open = this.showShip || this.showLocker;
    const state = open
      ? JSON.stringify([
          this.showShip,
          this.showLocker,
          this.selected,
          this.message,
          base?.id,
          ship.fit,
          ship.hold,
          ship.programs,
          [...ship.software],
          ship.tweaks,
          ship.credits,
          base ? sim.lockerAt(base) : null,
          base ? sim.storageFree(base) : null,
          // The designer can change a part's icon in place: it reaches a screen already open.
          PARTS.map((part) => part.icon.glyph + (part.icon.mark ?? "")).join(),
        ])
      : "closed";
    if (state === this.state) return;
    this.state = state;
    this.box.hidden = !open;
    // The screen going away takes its menu with it.
    if (!open) {
      this.closeTweaks();
      return;
    }
    this.ports.clear();
    this.preview = null;
    this.box.replaceChildren(this.statusBar());
    const columns = document.createElement("div");
    columns.className = "columns";
    if (this.showShip) columns.append(this.shipColumn(), this.bayColumn());
    if (this.showLocker) columns.append(this.lockerColumn());
    this.box.append(columns);
  }

  private get docked(): boolean {
    return this.sim.baseAt() !== null;
  }

  private redraw(): void {
    this.state = "";
  }

  private heading(text: string): HTMLHeadingElement {
    const h = document.createElement("h2");
    h.textContent = text;
    return h;
  }

  private note(text: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.textContent = text;
    return p;
  }

  private button(text: string, act: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.addEventListener("click", () => {
      act();
      button.blur();
      this.redraw();
    });
    return button;
  }

  /** Why a move was refused, or what's selected and its buttons, or how it all works. */
  private statusBar(): HTMLDivElement {
    const bar = document.createElement("div");
    bar.className = "status";
    if (this.message) {
      bar.classList.add("refused");
      bar.textContent = this.message;
      return bar;
    }
    const item = this.selected ? this.sim.itemAt(this.sim.ship, this.selected.place) : null;
    if (this.selected && item) {
      const label = document.createElement("span");
      label.textContent = `${partOf(item.part).label}${condition(item)}`;
      bar.append(label, ...this.actionsFor(this.selected.place, item), this.button("x", () => (this.selected = null)));
      return bar;
    }
    this.selected = null;
    bar.textContent = this.docked
      ? "Drag things to move them, R turns what you hold. Click one for its buttons, shift click sells it. Drop on the shop to sell."
      : "Fitting, loading and storing are done in a dock.";
    return bar;
  }

  /** The buttons for what's selected: the click way of doing what a drag does. */
  private actionsFor(place: ItemPlace, item: Module): HTMLButtonElement[] {
    const { sim } = this;
    const { ship } = sim;
    const act = (text: string, change: () => boolean) =>
      this.button(text, () => {
        if (change()) this.selected = null;
        else this.message = this.refusal({ from: "item", place, module: item, turned: false, grab: { x: 0, y: 0 } }, null);
      });
    if (!this.docked) return place.at === "hold" ? [act("Drop", () => sim.dropItem(ship, place.index))] : [];
    const out: HTMLButtonElement[] = [];
    // An item isn't a module: nothing to fit.
    if (place.at !== "mount" && !isItem(item.part)) out.push(act("Fit", () => sim.fitItem(ship, place)));
    if (place.at !== "hold") out.push(act("To bay", () => sim.toHold(ship, place)));
    if (place.at !== "locker") out.push(act("To locker", () => sim.toLocker(ship, place)));
    if (place.at !== "mount") {
      const placed = place.at === "hold" ? ship.hold[place.index] : sim.lockerAt(sim.baseAt()!).items[place.index];
      const turned: Spot = { x: placed.x, y: placed.y, turned: !placed.turned };
      out.push(act("Turn", () => (place.at === "hold" ? sim.toHold(ship, place, turned) : sim.toLocker(ship, place, turned))));
      out.push(this.button(`Sell ${sim.moduleValue(item)}`, () => this.sellAt(place, item)));
    } else if (!partOf(item.part).builtIn) out.push(act(`Sell ${sim.moduleValue(item)}`, () => sim.sellPart(ship, item.part)));
    return out;
  }

  /**
   * Sells what's in the bay or the locker: the Sell button and a shift click make the same sale,
   * and the message line says why when the station won't take it.
   */
  private sellAt(place: ItemPlace, module: Module): void {
    const { sim } = this;
    if (sim.sellItem(sim.ship, place)) {
      this.message = "";
      this.selected = null;
    } else this.message = sim.sellRefused ?? this.refusal({ from: "item", place, module, turned: false, grab: { x: 0, y: 0 } }, null);
    this.redraw();
  }

  // The ship: blueprint, ports and programs.

  private shipColumn(): HTMLDivElement {
    const { sim } = this;
    const { ship } = sim;
    const column = document.createElement("div");
    column.className = "column";
    column.append(this.heading(`Ship - ${ship.model}`));
    const print = document.createElement("div");
    print.className = "blueprint";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PRINT;
    const ctx = canvas.getContext("2d");
    const scale = PRINT / (ART_R * 3.2);
    if (ctx) {
      // Nose up.
      ctx.translate(PRINT / 2, PRINT / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.scale(scale, scale);
      // Its tanks, at how full they are: out of play they aren't drawn at all, as in the game.
      const capacity = tankCapacity(ship);
      drawVectorShip(ctx, ship, [111, 122, 140], sim.tuning.fuel ? (capacity > 0 ? ship.fuel / capacity : 0) : null);
    }
    print.append(canvas);
    const mounts = mountsOf(ship).filter((mount) => !mount.decal && (ship.fit[mount.id] || !isTurretGun(mount.id)));
    const spots = this.portSpots(mounts, scale);
    const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lines.setAttribute("width", String(PRINT));
    lines.setAttribute("height", String(PRINT));
    lines.classList.add("leaders");
    print.append(lines);
    mounts.forEach((mount, i) => {
      const { x, y, ax, ay } = spots[i];
      const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leader.setAttribute("x1", String(ax));
      leader.setAttribute("y1", String(ay));
      leader.setAttribute("x2", String(x));
      leader.setAttribute("y2", String(y));
      lines.append(leader);
      print.append(this.port(mount, x, y));
    });
    column.append(print);
    column.append(...this.programs());
    return column;
  }

  /**
   * Where each mount's port goes on the blueprint: at the mount, pushed apart from the others
   * so none overlap, with the mount's own spot kept for the leader line.
   */
  private portSpots(mounts: Mount[], scale: number): { x: number; y: number; ax: number; ay: number }[] {
    const anchors = mounts.map((mount) => ({ ax: PRINT / 2 + mount.y * ART_R * scale, ay: PRINT / 2 - mount.x * ART_R * scale }));
    const spots = anchors.map(({ ax, ay }, i) => ({ x: ax + (i % 3) * 0.1, y: ay + (i % 2) * 0.1, ax, ay }));
    for (let round = 0; round < 80; round++) {
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = spots[i];
          const b = spots[j];
          // Labels are wider than tall: keep them apart more across than down.
          const dx = (b.x - a.x) / 1.8;
          const dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 0.01;
          if (distance >= PORT_GAP) continue;
          const push = (PORT_GAP - distance) / 2;
          a.x -= (dx / distance) * push * 1.8;
          a.y -= (dy / distance) * push;
          b.x += (dx / distance) * push * 1.8;
          b.y += (dy / distance) * push;
        }
      }
      for (const spot of spots) {
        spot.x = Math.max(30, Math.min(PRINT - 30, spot.x));
        spot.y = Math.max(10, Math.min(PRINT - 10, spot.y));
      }
    }
    return spots;
  }

  private port(mount: Mount, x: number, y: number): HTMLDivElement {
    const { sim } = this;
    const { ship } = sim;
    const module = ship.fit[mount.id];
    const port = document.createElement("div");
    port.className = `port${module ? wearClass(module) : " empty"}`;
    port.style.left = `${x}px`;
    port.style.top = `${y}px`;
    if (module) {
      const part = partOf(module.part);
      port.append(partIcon(part, 18));
      setTip(port, () => `${mount.name}: ${part.label}${condition(module)}`);
    } else {
      port.textContent = "+";
      setTip(port, () => `${mount.name}: empty. Takes ${mount.types.join(", ")}`);
    }
    if (this.docked) port.dataset.drop = `mount:${mount.id}`;
    this.ports.set(mount.id, port);
    if (!module) return port;
    const place: ItemPlace = { at: "mount", mount: mount.id };
    if (this.isSelected(place)) port.classList.add("selected");
    port.addEventListener("click", () => this.select(place));
    if (this.docked) makeDraggable(port, () => ({ from: "item", place, module, turned: false, grab: this.centre(module, false) }), partOf(module.part).label);
    return port;
  }

  /** The computer's slots, and the pilot's programs that aren't loaded: click or drag between them. */
  private programs(): HTMLElement[] {
    const { sim } = this;
    const { ship } = sim;
    const size = computerSize(ship);
    const heading = this.heading(`Programs - ${programSlots(ship)} running of ${size} slots`);
    const slots = document.createElement("div");
    slots.className = "slots";
    slots.dataset.drop = "slots";
    for (let i = 0; i < Math.max(size, ship.programs.length); i++) {
      const id = ship.programs[i];
      const slot = document.createElement("div");
      slot.className = `slot${id ? "" : " empty"}${id && !ship.parts.has(id) ? " damaged" : ""}`;
      if (id) {
        const part = partOf(id);
        slot.append(partIcon(part, 20));
        const click = this.docked ? ". Click to unload" : "";
        setTip(slot, () => `${part.label}: ${ship.parts.has(id) ? "running" : "loaded, computer down"}${click}${this.tweaksTip(id)}`);
        this.programHandle(slot, id, true);
      }
      slots.append(slot);
    }
    const owned = document.createElement("div");
    owned.className = "software";
    owned.dataset.drop = "software";
    const spare = PROGRAM_PARTS.filter((part) => ship.software.has(part.id) && !ship.programs.includes(part.id));
    for (const part of spare) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.append(partIcon(part, 20));
      setTip(chip, () => `${part.label}: yours, not loaded${this.docked ? ". Click to load" : ""}${this.tweaksTip(part.id)}`);
      this.programHandle(chip, part.id, false);
      owned.append(chip);
    }
    if (ship.software.size === 0) owned.append(this.note("No programs yet. They're sold in the dock shop, and they stay with you, whatever ship you fly."));
    return [heading, slots, owned];
  }

  /** The last line of a program chip's tooltip: what right clicking it does. */
  private tweaksTip(id: PartId): string {
    return (programDef(id)?.tweaks?.length ?? 0) > 0 ? "\nRight click for its tweaks" : "";
  }

  private programHandle(element: HTMLElement, id: PartId, loaded: boolean): void {
    // Right click adjusts how the program works, whether it's loaded or only owned: it isn't
    // the click that loads or unloads it.
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openTweaks(id, event.clientX, event.clientY);
    });
    if (!this.docked) return;
    element.addEventListener("click", () => {
      if (!this.sim.setProgram(this.sim.ship, id, !loaded)) this.message = loaded ? "It can't come out here" : "No free slot in the computer";
      else this.message = "";
      this.redraw();
    });
    makeDraggable(element, () => ({ from: "program", part: id, loaded }), partOf(id).label);
  }

  /** The tweak menu for a program: a row of buttons for each tweak, the current pick lit. */
  private openTweaks(id: PartId, clientX: number, clientY: number): void {
    this.closeTweaks();
    const { ship } = this.sim;
    const menu = document.createElement("div");
    menu.id = "tweakmenu";
    const title = document.createElement("b");
    title.textContent = partOf(id).label;
    menu.append(title);
    const tweaks = programDef(id)?.tweaks ?? [];
    if (tweaks.length === 0) {
      const note = document.createElement("span");
      note.textContent = "This program has no tweaks.";
      menu.append(note);
    }
    for (const tweak of tweaks) {
      // A tweak that repeats per mount is a row for each mount it covers: "Fires: Turret gun".
      if (tweak.each) {
        const mounts = tweakMounts(ship, tweak);
        if (mounts.length === 0) {
          const note = document.createElement("span");
          note.textContent = `${tweak.name}: ${tweak.each === "gun" ? "No guns fitted" : "Nothing it applies to is fitted"}`;
          menu.append(note);
        }
        for (const mount of mounts) menu.append(this.tweakRow(id, tweak, `${tweak.name}: ${mount.name}`, mount.id, clientX, clientY));
        continue;
      }
      menu.append(this.tweakRow(id, tweak, tweak.name, undefined, clientX, clientY));
    }
    document.body.append(menu);
    // Keeps the whole menu on the screen, wherever the click was.
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - box.height - 8))}px`;
    this.menu = menu;
  }

  /** One row of the tweak menu: its name and a button for each option, the current pick lit. */
  private tweakRow(id: PartId, tweak: ProgramTweak, label: string, mount: MountId | undefined, clientX: number, clientY: number): HTMLElement {
    const { ship } = this.sim;
    const row = document.createElement("div");
    row.className = "tweak";
    const name = document.createElement("span");
    name.textContent = label;
    row.append(name);
    const picked = pickOf(ship.tweaks, id, tweak.id, mount);
    for (const option of tweak.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.name;
      if (option.id === picked) button.className = "on";
      button.addEventListener("click", () => {
        this.sim.setTweak(ship, id, tweak.id, option.id, mount);
        this.openTweaks(id, clientX, clientY);
        this.redraw();
      });
      row.append(button);
    }
    return row;
  }

  private closeTweaks(): void {
    this.menu?.remove();
    this.menu = null;
  }

  // The bay and the locker: grids.

  private bayColumn(): HTMLDivElement {
    const { sim } = this;
    const { ship } = sim;
    const column = document.createElement("div");
    column.className = "column";
    const grid = sim.bayGrid(ship);
    column.append(this.heading(grid ? `Bay - ${sim.oreIn(ship)} ore, room for ${sim.cargoSpace(ship)}` : "Bay - none fitted"));
    if (!grid) {
      column.append(this.note("Without a working bay the ship carries nothing."));
      return column;
    }
    column.append(this.gridView("hold", grid, ship.hold));
    const packed = sim.packed(ship);
    const free = reachable(grid, packed).size;
    const empty = grid.w * grid.h - packed.reduce((sum, item) => sum + footprint(item).w * footprint(item).h, 0);
    if (free === 0) column.append(this.note("The entry is blocked: no ore can come in."));
    else if (free < empty) column.append(this.note("Shaded cells are sealed off from the entry: ore can't reach them."));
    return column;
  }

  private lockerColumn(): HTMLDivElement {
    const { sim } = this;
    const column = document.createElement("div");
    column.className = "column";
    const base = sim.baseAt();
    if (!base) {
      const kept = [...sim.lockers].filter(([, { items }]) => items.length > 0).map(([id, { items }]) => `${sim.baseName(id)} (${items.length})`);
      column.append(this.heading("Locker"), this.note(kept.length > 0 ? `Not docked. You have things kept at ${kept.join(", ")}.` : "Not docked. Every base has a locker for you."));
      return column;
    }
    const locker = sim.lockerAt(base);
    const grid = sim.lockerGrid(locker);
    column.append(this.heading(`Locker at ${sim.baseName(base.id)}`), this.gridView("locker", grid, locker.items));
    const free = Math.max(0, sim.storageFree(base));
    column.append(this.note(`The station has ${free} cells of storage free.`));
    if (free >= sim.tuning.lockerWidth) {
      column.append(
        this.button(`Buy a row: ${sim.tuning.lockerRowPrice} credits`, () => {
          this.message = sim.buyLockerRow() ? "" : "Not enough credits";
        }),
      );
    }
    return column;
  }

  /** A bay or locker grid: its cells, the entry and sealed pockets in a bay, and the items on it. */
  private gridView(kind: "hold" | "locker", spec: GridSpec, items: Placed[]): HTMLDivElement {
    const view = document.createElement("div");
    view.className = "grid";
    view.style.width = `${spec.w * CELL}px`;
    view.style.height = `${spec.h * CELL}px`;
    if (this.docked) view.dataset.drop = kind;
    const bay = kind === "hold";
    if (spec.entry) {
      const packed = bay ? this.sim.packed(this.sim.ship) : items;
      const open = reachable(spec, packed);
      const taken = new Set(packed.flatMap((item) => [...cellKeys(spec, item)]));
      for (let k = 0; k < spec.w * spec.h; k++) {
        if (open.has(k) || taken.has(k)) continue;
        view.append(this.block("pocket", k % spec.w, Math.floor(k / spec.w), 1, 1));
      }
      for (const cell of entryCells(spec)) {
        const entry = this.block("entry", cell.x, cell.y, 1, 1);
        setTip(entry, () => "The entry: everything comes in through here");
        view.append(entry);
      }
    }
    items.forEach((item, index) => {
      const place: ItemPlace = { at: kind, index };
      const { w, h } = footprint(item);
      const tile = this.block(`item${wearClass(item.module)}`, item.x, item.y, w, h);
      const part = partOf(item.module.part);
      tile.append(partIcon(part, tileIconSize(w, h)));
      setTip(tile, () => {
        const lines = [`${part.label}${condition(item.module)}`];
        if (this.docked) lines.push(`Sell value ${this.sim.moduleValue(item.module)} credits. Shift click sells it`);
        return lines.join("\n");
      });
      if (this.isSelected(place)) tile.classList.add("selected");
      // Shift click sells it: the quick way, without picking it up first.
      tile.addEventListener("click", (event) => {
        if (this.docked && event.shiftKey) this.sellAt(place, item.module);
        else this.select(place);
      });
      if (this.docked) {
        let grab = this.centre(item.module, item.turned);
        // Held where it was picked up, so it lands the way it's carried.
        tile.addEventListener("pointerdown", (event) => {
          const rect = tile.getBoundingClientRect();
          grab = { x: Math.floor((event.clientX - rect.left) / CELL), y: Math.floor((event.clientY - rect.top) / CELL) };
        });
        makeDraggable(tile, () => ({ from: "item", place, module: item.module, turned: item.turned, grab }), part.label);
      }
      view.append(tile);
    });
    return view;
  }

  private block(className: string, x: number, y: number, w: number, h: number): HTMLDivElement {
    const block = document.createElement("div");
    block.className = className;
    block.style.left = `${x * CELL}px`;
    block.style.top = `${y * CELL}px`;
    block.style.width = `${w * CELL}px`;
    block.style.height = `${h * CELL}px`;
    return block;
  }

  /** The cell of an item's footprint to hold it by: its middle. */
  private centre(module: Module, turned: boolean): { x: number; y: number } {
    const { w, h } = footprint({ module, turned });
    return { x: Math.floor((w - 1) / 2), y: Math.floor((h - 1) / 2) };
  }

  private isSelected(place: ItemPlace): boolean {
    return JSON.stringify(this.selected?.place) === JSON.stringify(place);
  }

  private select(place: ItemPlace): void {
    this.selected = this.isSelected(place) ? null : { kind: "item", place };
    this.message = "";
    this.redraw();
  }

  // Dragging.

  /** The module a payload would put on a grid. */
  private moduleOf(payload: DragPayload): Module | null {
    if (payload.from === "shop") return { part: payload.part, wear: 0 };
    if (payload.from === "item") return payload.module;
    return null;
  }

  /** Where on a grid the held item would land, from where the pointer is. */
  private spotAt(view: HTMLElement, payload: DragPayload, at: DragAt): Spot | null {
    const module = this.moduleOf(payload);
    if (!module) return null;
    const rect = view.getBoundingClientRect();
    const cx = Math.floor((at.x - rect.left) / CELL);
    const cy = Math.floor((at.y - rect.top) / CELL);
    const grab = payload.from === "item" && at.turned === payload.turned ? payload.grab : this.centre(module, at.turned);
    return { x: cx - grab.x, y: cy - grab.y, turned: at.turned };
  }

  /** What dropping here would do, or null if nothing. */
  private action(payload: DragPayload, at: DragAt): (() => boolean) | null {
    const drop = at.target?.dataset.drop;
    if (!drop) return null;
    const { sim } = this;
    const { ship } = sim;
    if (drop.startsWith("mount:")) {
      const mount = drop.slice("mount:".length);
      if (payload.from === "shop") return () => sim.buyPart(ship, payload.part, { at: "mount", mount });
      if (payload.from === "item") return () => sim.fitItem(ship, payload.place, mount);
      return null;
    }
    if (drop === "hold" || drop === "locker") {
      const spot = this.spotAt(at.target!, payload, at);
      if (!spot) return null;
      if (payload.from === "shop") return () => sim.buyPart(ship, payload.part, { at: drop, spot } as BuyInto);
      if (payload.from !== "item") return null;
      return drop === "hold" ? () => sim.toHold(ship, payload.place, spot) : () => sim.toLocker(ship, payload.place, spot);
    }
    if (drop === "shop" && payload.from === "item") {
      const { place, module } = payload;
      return place.at === "mount" ? () => sim.sellPart(ship, module.part) : () => sim.sellItem(ship, place);
    }
    if (drop === "slots" && payload.from === "program" && !payload.loaded) return () => sim.setProgram(ship, payload.part, true);
    if (drop === "software" && payload.from === "program" && payload.loaded) return () => sim.setProgram(ship, payload.part, false);
    return null;
  }

  /** Lights up the mounts the held item can go on, and dims the rest. */
  private dragStart(payload: DragPayload): void {
    this.message = "";
    for (const [mount, port] of this.ports) {
      const act = this.action(payload, { target: port, x: 0, y: 0, turned: false });
      const legal = act !== null && this.sim.dryRun(this.sim.ship, act);
      port.classList.add(legal ? "legal" : "dim");
      if (payload.from === "item" && payload.place.at === "mount" && payload.place.mount === mount) port.classList.add("lifted");
    }
  }

  /** Over a grid, shows where the held item would land: green if it can, red if not. */
  private dragHover(payload: DragPayload, at: DragAt): void {
    const view = at.target;
    const grid = view && (view.dataset.drop === "hold" || view.dataset.drop === "locker") ? view : null;
    const module = this.moduleOf(payload);
    if (!grid || !module) {
      this.preview?.remove();
      this.preview = null;
      return;
    }
    const spot = this.spotAt(grid, payload, at)!;
    const { w, h } = footprint({ module, turned: spot.turned });
    const act = this.action(payload, at);
    const legal = act !== null && this.sim.dryRun(this.sim.ship, act);
    const preview = this.block(`preview ${legal ? "ok" : "bad"}`, spot.x, spot.y, w, h);
    this.preview?.remove();
    grid.append(preview);
    this.preview = preview;
  }

  private dragDrop(payload: DragPayload, at: DragAt): void {
    const act = this.action(payload, at);
    if (!act) return;
    if (act()) {
      this.message = "";
      this.selected = null;
    } else this.message = this.refusal(payload, at);
  }

  private dragEnd(): void {
    this.preview?.remove();
    this.preview = null;
    this.redraw();
  }

  /** Why a move was refused, in words. */
  private refusal(payload: DragPayload, at: DragAt | null): string {
    const { sim } = this;
    const { ship } = sim;
    if (payload.from === "shop") return sim.buyRefused ?? "It can't go there";
    if (payload.from !== "item") return "It can't go there";
    const { place, module } = payload;
    if (place.at === "hold") {
      const floating = sim.floatingWithout(ship, place.index);
      const staying = at?.target?.dataset.drop === "hold";
      if (floating.length > 0 && !staying) return `Taking it out would leave your ${floating.map((each) => partOf(each.part).label.toLowerCase()).join(" and ")} floating`;
    }
    const drop = at?.target?.dataset.drop;
    if (drop === "hold" && at) {
      const grid = sim.bayGrid(ship)!;
      const spot = this.spotAt(at.target!, payload, at)!;
      const rest = sim.packed(ship, place.at === "hold" ? ship.hold.filter((_, index) => index !== place.index) : ship.hold);
      const item = { module, ...spot };
      if (!fits(grid, rest, item)) return "It doesn't fit there";
      if (!canPlace(grid, rest, item) || ![...rest, item].every((each) => sticks(grid, [...rest, item], each))) return "In the bay everything has to touch a wall, or something that does";
      return "The ore aboard wouldn't fit any more";
    }
    if (drop === "locker") return "It doesn't fit there";
    if (drop?.startsWith("mount:")) return "That mount won't take it, or what's on it has nowhere to go";
    if (drop === "shop") {
      if (isItem(module.part) && sim.sellRefused) return sim.sellRefused;
      return partOf(module.part).builtIn ? "The hull's own gear isn't sold back from its mount" : "The shop won't take it";
    }
    return "No room for it there";
  }
}

/** The cells an item covers, each as y * w + x. */
function cellKeys(grid: GridSpec, item: Placed): Set<number> {
  const { w, h } = footprint(item);
  const keys = new Set<number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) keys.add((item.y + y) * grid.w + item.x + x);
  return keys;
}
