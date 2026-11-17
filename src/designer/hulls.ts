/**
 * Dev only: the hull designer. Three pages:
 * - Hulls: each hull's mounts drawn big, as a blueprint, to add, remove, move, turn and size. A
 *   mount has a name, the mount types it supports and, for a thruster, the control that fires it.
 *   What's on a mount goes with it and works the way it faces: a thruster pushes away from its
 *   flame, a gun fires and a tractor looks the way they point.
 * - Parts: which mount types each part fits. A part goes on a mount that supports one of them.
 * - Mount types: the list both pick from.
 * Changes are in the game at once; Save writes them all to src/hulls.json, which the game ships with.
 */
import {
  facing,
  HULL_DEFAULTS,
  HULL_MOUNTS,
  MOUNT_TYPES,
  mountTakes,
  mountThrust,
  PART_MOUNTS,
  SHIPPED_SHIPS,
  shipFileNow,
  THRUSTER_ROLES,
  useShipFile,
  type Mount,
  type MountId,
  type ShipFile,
} from "../fitting";
import { partFits, partOf, PARTS, type PartId, type ShipModel, type ThrusterRole } from "../parts";
import { drawHull, drawPart } from "../shipArt";

const R = 12;
const DRAFT_KEY = "jam-ships-draft";
const MODELS: ShipModel[] = ["racer", "floater"];
const MODEL_NAMES: Record<ShipModel, string> = { racer: "Racer", floater: "Floater" };
const ROLE_NAMES: Record<ThrusterRole, string> = {
  thrusterMain: "Main (W)",
  thrusterReverse: "Reverse (S)",
  thrusterStrafeLeft: "Strafe left (A)",
  thrusterStrafeRight: "Strafe right (D)",
  thrusterRotateLeft: "Turn left (Q)",
  thrusterRotateRight: "Turn right (E)",
};
/** Controls that mirror each other across the ship's middle line. */
const MIRROR_ROLE: Partial<Record<ThrusterRole, ThrusterRole>> = {
  thrusterRotateLeft: "thrusterRotateRight",
  thrusterRotateRight: "thrusterRotateLeft",
  thrusterStrafeLeft: "thrusterStrafeRight",
  thrusterStrafeRight: "thrusterStrafeLeft",
};
/** The parts that go on mounts, in the parts page's order. */
const FITTED = PARTS.filter((part) => part.kind !== "program");

type Page = "hulls" | "parts" | "types";

const STYLE = `
#hulls { position: fixed; inset: 0; z-index: 50; background: #05070d; display: flex; font: 13px system-ui, sans-serif; color: #cfd8e6; }
#hulls[hidden] { display: none; }
#hulls canvas { position: static; flex: 1; min-width: 0; width: auto; height: 100%; cursor: default; }
#hulls .side { width: 340px; flex: none; box-sizing: border-box; padding: 12px 14px; overflow-y: auto; background: #0b0f18; border-right: 1px solid #222a3a; }
#hulls h1 { font-size: 15px; margin: 0 0 8px; color: #8fb4ff; letter-spacing: 2px; }
#hulls h2 { font-size: 12px; margin: 16px 0 6px; color: #8fe3a1; text-transform: uppercase; letter-spacing: 1px; }
#hulls p { margin: 0 0 6px; color: #7f8ba0; }
#hulls button, #hulls input, #hulls select { background: #1a2233; color: #cfd8e6; border: 1px solid #33405a; font: inherit; padding: 4px 7px; }
#hulls button { cursor: pointer; margin: 0 4px 4px 0; }
#hulls button:hover { background: #26324a; }
#hulls button.on { background: #26324a; border-color: #8fb4ff; }
#hulls button.danger { color: #e88a8a; border-color: #a84f4f; }
#hulls .list button { display: block; width: 100%; text-align: left; margin: 0 0 2px; border-color: transparent; background: none; }
#hulls .list button.on { background: #26324a; border-color: #4a5b80; }
#hulls .list .moved { color: #ffd479; }
#hulls .list .dim { color: #6a7486; }
#hulls .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }
#hulls label { display: block; color: #9aa6ba; margin-top: 6px; }
#hulls label input[type=number], #hulls label input[type=text], #hulls label select { width: 100%; box-sizing: border-box; margin-top: 2px; }
#hulls .checks label { display: inline-block; margin: 2px 10px 2px 0; color: #cfd8e6; }
#hulls .checks input { margin: 0 4px 0 0; vertical-align: middle; }
#hulls .row { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
#hulls .row input[type=text] { flex: 1; min-width: 0; }
#hulls .does { color: #9fd8ff; white-space: pre-line; margin: 8px 0; }
#hulls .status { color: #8fb4ff; min-height: 1.2em; margin-top: 6px; }
#hulls .keys { color: #6a7486; font-size: 12px; white-space: pre-line; }
`;

const round = (value: number, step: number) => Math.round(value / step) * step;
const clean = (value: number) => Math.round(value * 1000) / 1000;
const wrapDegrees = (angle: number) => {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
};

/** What a mount is drawn holding: the hull's own part there, or else the first part that fits it. */
function shownPart(model: ShipModel, mount: Mount): PartId | null {
  const own = HULL_DEFAULTS[model][mount.id];
  if (own && mountTakes(mount, own)) return own;
  return FITTED.find((part) => partFits(part, model) && mountTakes(mount, part.id))?.id ?? null;
}

export class HullDesigner {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly side: HTMLDivElement;
  private page: Page = "hulls";
  private model: ShipModel = "racer";
  private selected: MountId | null = "thrusterMain";
  private part: PartId = FITTED[0].id;
  private hover: MountId | null = null;
  private drag: { kind: "move" | "turn"; moved: boolean } | null = null;
  private status = "";
  /** Screen pixels per world unit, and where the ship's middle is on screen. */
  private zoom = 10;
  private cx = 0;
  private cy = 0;

  /** `onMountsChanged`: mounts came or went, so ships tidy away what's on ones that are gone. */
  constructor(
    private readonly onClose: () => void,
    private readonly onMountsChanged: () => void,
  ) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
    this.element = document.createElement("div");
    this.element.id = "hulls";
    this.element.hidden = true;
    this.side = document.createElement("div");
    this.side.className = "side";
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.element.append(this.side, this.canvas);
    document.body.append(this.element);
    this.listen();
    // Unsaved work from before a reload carries on.
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) useShipFile(JSON.parse(draft) as ShipFile);
    } catch {
      /* no draft */
    }
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    if (this.selected && !this.mount()) this.selected = this.mounts()[0]?.id ?? null;
    this.rebuild();
    requestAnimationFrame(() => this.frame());
  }

  close(): void {
    this.element.hidden = true;
    this.drag = null;
    this.onClose();
  }

  private mounts(): Mount[] {
    return HULL_MOUNTS[this.model];
  }

  private mount(id: MountId | null = this.selected): Mount | undefined {
    return id === null ? undefined : this.mounts().find((mount) => mount.id === id);
  }

  private shippedMount(id: MountId): Mount | undefined {
    return SHIPPED_SHIPS.hulls[this.model]?.find((mount) => mount.id === id);
  }

  /** After any change: kept as a draft, and the panel shows it. */
  private changed(rebuild = true): void {
    const mount = this.mount();
    if (mount) {
      mount.x = clean(mount.x);
      mount.y = clean(mount.y);
      mount.angle = clean(wrapDegrees(mount.angle));
      mount.scale = clean(Math.max(0.2, Math.min(4, mount.scale)));
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(shipFileNow()));
    } catch {
      /* storage blocked: the change still holds until reload */
    }
    this.status = "Not saved";
    if (rebuild) this.rebuild();
    else this.refreshFields();
  }

  // ---------- side panel ----------

  private fields: Partial<Record<"x" | "y" | "angle" | "scale", HTMLInputElement>> = {};
  private does: HTMLDivElement | null = null;
  private statusLine: HTMLDivElement | null = null;

  private button(text: string, action: () => void, className = ""): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = text;
    if (className) b.className = className;
    b.addEventListener("click", action);
    return b;
  }

  private heading(text: string): HTMLHeadingElement {
    const h = document.createElement("h2");
    h.textContent = text;
    return h;
  }

  /** Ticks for each mount type, `has` saying which are on; `toggle` flips one. */
  private checks(has: (type: string) => boolean, toggle: (type: string, on: boolean) => void): HTMLDivElement {
    const box = document.createElement("div");
    box.className = "checks";
    if (MOUNT_TYPES.length === 0) box.textContent = "No mount types yet: add some on the Mount types page.";
    for (const type of MOUNT_TYPES) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = has(type);
      input.addEventListener("change", () => {
        toggle(type, input.checked);
        this.changed();
      });
      label.append(input, type);
      box.append(label);
    }
    return box;
  }

  private rebuild(): void {
    const title = document.createElement("h1");
    title.textContent = "HULL DESIGNER";
    const pages = document.createElement("div");
    for (const [page, name] of [["hulls", "Hulls"], ["parts", "Parts"], ["types", "Mount types"]] as [Page, string][]) {
      pages.append(this.button(name, () => ((this.page = page), this.rebuild()), page === this.page ? "on" : ""));
    }
    const body = this.page === "hulls" ? this.hullsPage() : this.page === "parts" ? this.partsPage() : this.typesPage();

    const file = document.createElement("div");
    file.append(
      this.button("Save to src/hulls.json", () => void this.save()),
      this.button("Throw away changes", () => {
        useShipFile(SHIPPED_SHIPS);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* nothing kept */
        }
        if (!this.mount()) this.selected = this.mounts()[0]?.id ?? null;
        this.onMountsChanged();
        this.status = "Back to src/hulls.json as loaded";
        this.rebuild();
      }),
      this.button("Close (Esc)", () => this.close()),
    );
    this.statusLine = document.createElement("div");
    this.statusLine.className = "status";
    this.statusLine.textContent = this.status;

    this.side.replaceChildren(title, pages, ...body, this.heading("File"), file, this.statusLine);
  }

  private hullsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Drag a mount to move it, its knob to turn it. What's on it moves with it and works the way it faces.";

    const models = document.createElement("div");
    for (const model of MODELS) {
      models.append(
        this.button(
          MODEL_NAMES[model],
          () => {
            this.model = model;
            this.selected = this.mounts()[0]?.id ?? null;
            this.rebuild();
          },
          model === this.model ? "on" : "",
        ),
      );
    }

    const list = document.createElement("div");
    list.className = "list";
    for (const mount of this.mounts()) {
      const b = this.button(mount.name, () => this.select(mount.id), mount.id === this.selected ? "on" : "");
      const was = this.shippedMount(mount.id);
      const mark = document.createElement("span");
      mark.className = "moved";
      if (!was) mark.textContent = "  • new";
      else if (JSON.stringify(was) !== JSON.stringify(mount)) mark.textContent = "  • changed";
      if (mark.textContent) b.append(mark);
      list.append(b);
    }
    const add = this.button("Add a mount", () => this.addMount());

    const out: HTMLElement[] = [intro, this.heading("Hull"), models, this.heading("Mounts"), list, add];
    const mount = this.mount();
    if (!mount) return out;

    const name = document.createElement("label");
    name.textContent = "Name";
    const nameBox = document.createElement("input");
    nameBox.type = "text";
    nameBox.value = mount.name;
    nameBox.addEventListener("change", () => {
      mount.name = nameBox.value.trim() || mount.name;
      this.changed();
    });
    name.append(nameBox);

    const role = document.createElement("label");
    role.textContent = "Fired by (for a thruster on it)";
    const roleBox = document.createElement("select");
    for (const [value, text] of [["", "nothing: not a thruster mount"], ...THRUSTER_ROLES.map((id) => [id, ROLE_NAMES[id]])]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      roleBox.append(option);
    }
    roleBox.value = mount.role ?? "";
    roleBox.addEventListener("change", () => {
      if (roleBox.value) mount.role = roleBox.value as ThrusterRole;
      else delete mount.role;
      this.changed();
    });
    role.append(roleBox);

    const supports = this.checks(
      (type) => mount.types.includes(type),
      (type, on) => {
        mount.types = on ? [...mount.types, type] : mount.types.filter((each) => each !== type);
      },
    );
    const takes = document.createElement("p");
    const fits = FITTED.filter((part) => partFits(part, this.model) && mountTakes(mount, part.id)).map((part) => part.label);
    takes.textContent = fits.length ? `Takes: ${fits.join(", ")}` : "Takes nothing yet.";

    const grid = document.createElement("div");
    grid.className = "fields";
    const field = (key: "x" | "y" | "angle" | "scale", label: string, step: number) => {
      const wrap = document.createElement("label");
      wrap.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.step = String(step);
      input.value = String(mount[key]);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        mount[key] = value;
        this.changed();
      });
      wrap.append(input);
      this.fields[key] = input;
      return wrap;
    };
    grid.append(field("x", "x (to the nose, radii)", 0.05), field("y", "y (to the right, radii)", 0.05), field("angle", "faces (°, clockwise)", 15), field("scale", "size", 0.1));

    this.does = document.createElement("div");
    this.does.className = "does";
    this.does.textContent = this.describe(mount);

    const tools = document.createElement("div");
    const was = this.shippedMount(mount.id);
    if (was) {
      tools.append(
        this.button("Back as shipped", () => {
          Object.assign(mount, JSON.parse(JSON.stringify(was)));
          if (!was.role) delete mount.role;
          this.changed();
        }),
      );
    }
    tools.append(this.button("Mirrored copy", () => this.mirror(mount)));
    tools.append(this.button("Remove mount", () => this.removeMount(mount), "danger"));

    const keys = document.createElement("div");
    keys.className = "keys";
    keys.textContent = [
      "Drag a mount: move it (Shift snaps to 0.05)",
      "Drag the knob, or wheel: turn it (Shift: 1°, else 15°)",
      "Ctrl + wheel, or + and −: size",
      "Arrows: nudge (Shift: finer)    Q / E: turn",
      "Tab: next mount    Delete: remove it    Esc: back to the game",
      "",
      "Green arrows: which way each thruster pushes the ship.",
    ].join("\n");

    return [...out, this.heading(mount.name), name, role, this.heading("Supports"), supports, takes, grid, this.does, tools, this.heading("Keys"), keys];
  }

  private partsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Which mount types each part fits. It goes on any mount that supports one of them. The blueprint lights up the mounts it would go on.";
    const list = document.createElement("div");
    list.className = "list";
    for (const part of FITTED) {
      const b = this.button(part.label, () => ((this.part = part.id), this.rebuild()), part.id === this.part ? "on" : "");
      const types = document.createElement("span");
      types.className = "dim";
      types.textContent = `  ${(PART_MOUNTS[part.id] ?? []).join(", ") || "fits nothing"}`;
      b.append(types);
      list.append(b);
    }
    const part = partOf(this.part);
    const fits = this.checks(
      (type) => (PART_MOUNTS[part.id] ?? []).includes(type),
      (type, on) => {
        const now = PART_MOUNTS[part.id] ?? [];
        PART_MOUNTS[part.id] = on ? [...now, type] : now.filter((each) => each !== type);
      },
    );
    const where = document.createElement("p");
    const lines = MODELS.map((model) => {
      if (!partFits(part, model)) return `${MODEL_NAMES[model]}: not for this ship`;
      const mounts = HULL_MOUNTS[model].filter((mount) => mountTakes(mount, part.id)).map((mount) => mount.name);
      return `${MODEL_NAMES[model]}: ${mounts.length ? mounts.join(", ") : "nowhere"}`;
    });
    where.textContent = lines.join("\n");
    where.style.whiteSpace = "pre-line";
    const set = document.createElement("p");
    if ((part.set ?? 1) > 1) set.textContent = `Comes as a set of ${part.set}: it needs that many mounts it fits.`;
    const models = document.createElement("div");
    for (const model of MODELS) models.append(this.button(`Show on ${MODEL_NAMES[model]}`, () => ((this.model = model), this.rebuild()), model === this.model ? "on" : ""));
    return [intro, this.heading("Parts"), list, this.heading(`${part.label} fits`), fits, set, this.heading("Goes on"), where, models];
  }

  private typesPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "The mount types mounts support and parts fit. Renaming one renames it everywhere; removing one takes it off every mount and part.";
    const rows: HTMLElement[] = [];
    for (const type of [...MOUNT_TYPES]) {
      const row = document.createElement("div");
      row.className = "row";
      const box = document.createElement("input");
      box.type = "text";
      box.value = type;
      box.addEventListener("change", () => {
        const name = box.value.trim();
        if (!name || name === type || MOUNT_TYPES.includes(name)) return;
        this.renameType(type, name);
        this.changed();
      });
      const used = MODELS.reduce((sum, model) => sum + HULL_MOUNTS[model].filter((mount) => mount.types.includes(type)).length, 0);
      const parts = FITTED.filter((part) => (PART_MOUNTS[part.id] ?? []).includes(type)).length;
      const count = document.createElement("span");
      count.className = "dim";
      count.textContent = `${used} mounts, ${parts} parts`;
      count.style.color = "#6a7486";
      row.append(box, count, this.button("×", () => (this.removeType(type), this.changed()), "danger"));
      rows.push(row);
    }
    const addRow = document.createElement("div");
    addRow.className = "row";
    const addBox = document.createElement("input");
    addBox.type = "text";
    addBox.placeholder = "new mount type";
    const add = () => {
      const name = addBox.value.trim();
      if (!name || MOUNT_TYPES.includes(name)) return;
      MOUNT_TYPES.push(name);
      this.changed();
    };
    addBox.addEventListener("keydown", (event) => {
      if (event.key === "Enter") add();
    });
    addRow.append(addBox, this.button("Add", add));
    return [intro, this.heading("Mount types"), ...rows, addRow];
  }

  private renameType(from: string, to: string): void {
    MOUNT_TYPES[MOUNT_TYPES.indexOf(from)] = to;
    for (const model of MODELS) for (const mount of HULL_MOUNTS[model]) mount.types = mount.types.map((type) => (type === from ? to : type));
    for (const part of FITTED) PART_MOUNTS[part.id] = (PART_MOUNTS[part.id] ?? []).map((type) => (type === from ? to : type));
  }

  private removeType(type: string): void {
    MOUNT_TYPES.splice(MOUNT_TYPES.indexOf(type), 1);
    for (const model of MODELS) for (const mount of HULL_MOUNTS[model]) mount.types = mount.types.filter((each) => each !== type);
    for (const part of FITTED) PART_MOUNTS[part.id] = (PART_MOUNTS[part.id] ?? []).filter((each) => each !== type);
  }

  private newId(): MountId {
    const taken = new Set(MODELS.flatMap((model) => HULL_MOUNTS[model].map((mount) => mount.id)));
    let n = 1;
    while (taken.has(`mount${n}`)) n++;
    return `mount${n}`;
  }

  private addMount(): void {
    const id = this.newId();
    this.mounts().push({ id, name: `New mount ${id.slice(5)}`, types: [], x: 0, y: 0, angle: 0, scale: 1 });
    this.selected = id;
    this.onMountsChanged();
    this.changed();
  }

  /** A copy on the other side of the middle line, its control swapped left for right. */
  private mirror(mount: Mount): void {
    const id = this.newId();
    const copy: Mount = { ...JSON.parse(JSON.stringify(mount)), id, name: `${mount.name} (mirrored)`, y: -mount.y, angle: -mount.angle };
    if (mount.role) copy.role = MIRROR_ROLE[mount.role] ?? mount.role;
    this.mounts().push(copy);
    this.selected = id;
    this.onMountsChanged();
    this.changed();
  }

  private removeMount(mount: Mount): void {
    const mounts = this.mounts();
    const at = mounts.indexOf(mount);
    mounts.splice(at, 1);
    this.selected = mounts[Math.min(at, mounts.length - 1)]?.id ?? null;
    // Whatever was on it goes into the ship's bay.
    this.onMountsChanged();
    this.changed();
  }

  /** Updates the boxes without rebuilding the panel, so a drag doesn't lose focus or flicker. */
  private refreshFields(): void {
    const mount = this.mount();
    if (mount) {
      for (const key of ["x", "y", "angle", "scale"] as const) {
        const input = this.fields[key];
        if (input && document.activeElement !== input) input.value = String(mount[key]);
      }
      if (this.does) this.does.textContent = this.describe(mount);
    }
    if (this.statusLine) this.statusLine.textContent = this.status;
  }

  private select(id: MountId): void {
    this.selected = id;
    this.rebuild();
  }

  /** What a part on this mount does from where it is, in words. */
  private describe(mount: Mount): string {
    const percent = (value: number) => `${Math.round(Math.abs(value) * 100)}%`;
    const side = (degrees: number, what: string) => {
      const a = Math.round(wrapDegrees(degrees));
      if (a === 0) return `${what} straight ahead`;
      if (Math.abs(a) === 180) return `${what} straight back`;
      return `${what} ${Math.abs(a)}° ${a > 0 ? "right" : "left"} of the nose`;
    };
    const lines: string[] = [];
    if (mount.role) {
      const { push, turn } = mountThrust(mount);
      if (mount.role === "thrusterRotateLeft" || mount.role === "thrusterRotateRight") {
        const way = mount.role === "thrusterRotateRight" ? "right" : "left";
        const other = way === "right" ? "left" : "right";
        if (Math.abs(turn) < 0.005) lines.push("A thruster here turns the ship not at all: it pushes through the middle.");
        else lines.push(turn > 0 ? `A thruster here turns the ship ${way} at ${percent(turn)} of standard.` : `A thruster here turns the ship ${other} (backwards!) at ${percent(turn)} of standard.`);
      } else {
        const parts = [];
        if (Math.abs(push.x) > 0.005) parts.push(`${percent(push.x)} ${push.x > 0 ? "ahead" : "back"}`);
        if (Math.abs(push.y) > 0.005) parts.push(`${percent(push.y)} ${push.y > 0 ? "right" : "left"}`);
        lines.push(`A thruster here pushes the ship ${parts.join(", ")} (full strength whichever way it faces; no twist).`);
      }
    }
    const shown = shownPart(this.model, mount);
    const kind = shown ? partOf(shown).kind : null;
    if (kind === "gun" || kind === "turret") lines.push(side(mount.angle, "A gun here fires") + (kind === "turret" ? "; a turret rests that way and aims itself." : "."));
    if (kind === "tractor") lines.push(side(mount.angle, "A tractor here catches ore") + " (the all-round one all round).");
    if (kind === "computer") lines.push("A computer sits inside the hull and shows nothing.");
    if (kind === "section") lines.push("A cargo bay shows as a box; the ore rides in it.");
    if (kind === "thruster" && !mount.role) lines.push("No control fires it: a thruster here does nothing.");
    lines.push("Hits land on whatever is mounted nearest them.");
    return lines.join("\n");
  }

  private async save(): Promise<void> {
    try {
      const file = shipFileNow();
      const response = await fetch("/__hulls", { method: "POST", body: JSON.stringify(file, null, 2) + "\n" });
      this.status = response.ok ? "Saved to src/hulls.json" : `Couldn't save (${response.status})`;
      if (response.ok) {
        Object.assign(SHIPPED_SHIPS, file);
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (error) {
      this.status = `Couldn't save: ${String(error)}`;
    }
    this.rebuild();
  }

  // ---------- canvas ----------

  private toScreen(x: number, y: number): [number, number] {
    return [this.cx + x * R * this.zoom, this.cy + y * R * this.zoom];
  }

  private fromScreen(sx: number, sy: number): [number, number] {
    return [(sx - this.cx) / (R * this.zoom), (sy - this.cy) / (R * this.zoom)];
  }

  /** Where a mount's turning knob is on screen. */
  private knob(mount: Mount): [number, number] {
    const [x, y] = this.toScreen(mount.x, mount.y);
    const a = facing(mount);
    return [x + Math.cos(a) * 46, y + Math.sin(a) * 46];
  }

  private pick(sx: number, sy: number): { id: MountId; kind: "move" | "turn" } | null {
    const selected = this.mount();
    if (selected && this.page === "hulls") {
      const [kx, ky] = this.knob(selected);
      if (Math.hypot(kx - sx, ky - sy) < 10) return { id: selected.id, kind: "turn" };
    }
    let best: { id: MountId; kind: "move" | "turn" } | null = null;
    let bestDistance = 14;
    for (const mount of this.mounts()) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const distance = Math.hypot(x - sx, y - sy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: mount.id, kind: "move" };
      }
    }
    return best;
  }

  private listen(): void {
    const point = (event: MouseEvent): [number, number] => {
      const rect = this.canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    this.canvas.addEventListener("mousedown", (event) => {
      const [sx, sy] = point(event);
      const hit = this.pick(sx, sy);
      if (!hit) return;
      if (this.page !== "hulls") this.page = "hulls";
      if (hit.id !== this.selected) this.select(hit.id);
      else this.rebuild();
      this.drag = { kind: hit.kind, moved: false };
    });
    window.addEventListener("mousemove", (event) => {
      if (!this.isOpen) return;
      const [sx, sy] = point(event);
      if (!this.drag) {
        const hit = this.pick(sx, sy);
        this.hover = hit?.id ?? null;
        this.canvas.style.cursor = hit ? (hit.kind === "turn" ? "crosshair" : "move") : "default";
        return;
      }
      const mount = this.mount();
      if (!mount) return;
      if (this.drag.kind === "move") {
        const [x, y] = this.fromScreen(sx, sy);
        const step = event.shiftKey ? 0.05 : 0.01;
        mount.x = round(x, step);
        mount.y = round(y, step);
      } else {
        const [mx, my] = this.toScreen(mount.x, mount.y);
        mount.angle = round((Math.atan2(sy - my, sx - mx) * 180) / Math.PI, event.shiftKey ? 1 : 15);
      }
      this.drag.moved = true;
      this.changed(false);
    });
    window.addEventListener("mouseup", () => {
      if (this.drag?.moved) this.rebuild();
      this.drag = null;
    });
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const mount = this.mount();
        if (!mount) return;
        const way = event.deltaY > 0 ? 1 : -1;
        if (event.ctrlKey) mount.scale = round(mount.scale - way * 0.1, 0.1);
        else mount.angle += way * (event.shiftKey ? 1 : 15);
        this.changed(false);
      },
      { passive: false },
    );
    window.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Escape") {
        this.close();
        return;
      }
      const mount = this.mount();
      if (!mount || this.page !== "hulls") return;
      const nudge = event.shiftKey ? 0.01 : 0.05;
      const turn = event.shiftKey ? 1 : 15;
      let handled = true;
      switch (event.code) {
        case "ArrowLeft":
          mount.x -= nudge;
          break;
        case "ArrowRight":
          mount.x += nudge;
          break;
        case "ArrowUp":
          mount.y -= nudge;
          break;
        case "ArrowDown":
          mount.y += nudge;
          break;
        case "KeyQ":
          mount.angle -= turn;
          break;
        case "KeyE":
          mount.angle += turn;
          break;
        case "Equal":
        case "NumpadAdd":
          mount.scale += 0.1;
          break;
        case "Minus":
        case "NumpadSubtract":
          mount.scale -= 0.1;
          break;
        case "Delete":
          event.preventDefault();
          this.removeMount(mount);
          return;
        case "Tab": {
          const mounts = this.mounts();
          const next = mounts[(mounts.indexOf(mount) + (event.shiftKey ? mounts.length - 1 : 1)) % mounts.length];
          this.select(next.id);
          event.preventDefault();
          return;
        }
        default:
          handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      this.changed(false);
    });
  }

  private frame(): void {
    if (!this.isOpen) return;
    this.draw();
    requestAnimationFrame(() => this.frame());
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const width = rect.width;
    const height = rect.height;
    this.cx = width / 2;
    this.cy = height / 2;
    // The ship fills most of the view, with room round it for parts that stick out.
    this.zoom = Math.max(4, Math.min(width, height) / (R * 4.2));
    const unit = R * this.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0a1a2e";
    ctx.fillRect(0, 0, width, height);

    // Blueprint grid: a line every quarter radius, stronger every radius.
    for (let i = -8; i <= 8; i++) {
      ctx.strokeStyle = i % 4 === 0 ? "rgba(120,170,230,0.28)" : "rgba(120,170,230,0.1)";
      ctx.lineWidth = 1;
      const [x] = this.toScreen(i / 4, 0);
      const [, y] = this.toScreen(0, i / 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    // The ship's size for hits and bumps.
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // The ship, big, with something on every mount that takes anything.
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.zoom, this.zoom);
    drawHull(ctx, this.model, [120, 150, 190]);
    for (const mount of this.mounts()) {
      const shown = shownPart(this.model, mount);
      if (!shown) continue;
      const part = partOf(shown);
      ctx.save();
      ctx.translate(mount.x * R, mount.y * R);
      ctx.rotate(facing(mount));
      ctx.scale(mount.scale, mount.scale);
      drawPart(ctx, part.kind, 0, part.engine !== undefined);
      ctx.restore();
    }
    ctx.restore();

    // What each does, then the handles on top.
    const onParts = this.page === "parts";
    for (const mount of this.mounts()) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const on = mount.id === this.selected && !onParts;
      const green = on ? "#8fe3a1" : "rgba(143,227,161,0.55)";
      if (mount.role) {
        const { push, turn } = mountThrust(mount);
        const turning = mount.role === "thrusterRotateLeft" || mount.role === "thrusterRotateRight";
        this.arrow(x, y, push.x, push.y, (on ? 60 : 34) * (turning ? Math.min(2, Math.max(0.15, Math.abs(turn))) : 1), green);
      }
      const shown = shownPart(this.model, mount);
      const kind = shown ? partOf(shown).kind : null;
      const a = facing(mount);
      if (kind === "gun" || kind === "turret") {
        ctx.strokeStyle = on ? "rgba(255,120,100,0.9)" : "rgba(255,120,100,0.45)";
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * unit * 2.2, y + Math.sin(a) * unit * 2.2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (kind === "tractor") {
        const half = (15 * Math.PI) / 180;
        ctx.fillStyle = on ? "rgba(150,240,220,0.18)" : "rgba(150,240,220,0.08)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, unit * 1.6, a - half, a + half);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const mount of this.mounts()) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const on = mount.id === this.selected && !onParts;
      const hover = mount.id === this.hover;
      const lit = onParts && mountTakes(mount, this.part) && partFits(partOf(this.part), this.model);
      ctx.strokeStyle = lit ? "#8fe3a1" : on ? "#ffd479" : hover ? "#ffffff" : "rgba(220,230,250,0.6)";
      ctx.lineWidth = on || lit ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, on || lit ? 8 : 6, 0, Math.PI * 2);
      ctx.stroke();
      if (on || hover || lit) {
        ctx.fillStyle = lit ? "#8fe3a1" : on ? "#ffd479" : "#dfe7f3";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(mount.name, x + 10, y - 10);
      }
    }
    // The selected mount's turning knob.
    const selected = this.mount();
    if (selected && !onParts) {
      const [sx, sy] = this.toScreen(selected.x, selected.y);
      const [kx, ky] = this.knob(selected);
      ctx.strokeStyle = "rgba(255,212,121,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      ctx.fillStyle = "#ffd479";
      ctx.beginPath();
      ctx.arc(kx, ky, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#7f8ba0";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`${MODEL_NAMES[this.model]}: nose to the right, one square a quarter of the ship's radius`, 14, height - 14);
  }

  private arrow(x: number, y: number, dx: number, dy: number, length: number, color: string): void {
    const { ctx } = this;
    const ex = x + dx * length;
    const ey = y + dy * length;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 6, ey + Math.sin(a) * 6);
    ctx.lineTo(ex + Math.cos(a + 2.4) * 7, ey + Math.sin(a + 2.4) * 7);
    ctx.lineTo(ex + Math.cos(a - 2.4) * 7, ey + Math.sin(a - 2.4) * 7);
    ctx.closePath();
    ctx.fill();
  }
}
