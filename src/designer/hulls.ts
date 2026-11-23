/**
 * Dev only: the hull designer. Three pages, each a designer of its own, every section of the
 * side panel collapsible and collapsed until opened:
 * - Hulls: pick a hull from the list. It has what it's used for, the programs its computer
 *   comes with, its own stats and its mounts drawn big, as a blueprint, to add, remove, move,
 *   turn and size. A mount has a name, the mount types it supports, the part a bare hull comes
 *   with there and, for a thruster, the control that fires it. Below "Bare hull comes with",
 *   a preview picks a part to overlay on the blueprint as it shows in game: it starts on the
 *   part the bare hull comes with, none or any part that fits can be picked instead. What's on
 *   a mount goes with it and works the way it faces: a thruster pushes away from its flame, a
 *   gun fires and a tractor looks the way they point. Each mount also has a transparency and
 *   a draw order for how it shows in game: 0 is the hull level and below 0 draws underneath
 *   the hull. A decal mount's preview picks the decal it shows (the cockpit glass, say), for
 *   looks only.
 * - Parts: pick a part from the list. Which mount types it fits: it goes on a mount that supports
 *   one of them. Its stats can be edited, kept in the ship file over the code's. Its icon is
 *   picked from the glyph set, with three colours and a mark, kept the same way. A decal part is
 *   looks only, and only for decal mounts. "Show on hull" can be none, to show just the part.
 * - Mount types: the list both pick from.
 * - Items: one generic list of goods: each is an ore, a part made from ore, or a module. A type,
 *   a shape, a volume, a price, a blueprint price, an icon with a glow for when it floats loose,
 *   and the recipe that makes it, kept on the item. A module is an item and a part at once, with
 *   the same id: the item owns what shows and what it costs. Kept in src/items.json.
 * - Programs: what a pilot buys and loads into a computer. Their own records, because they need
 *   different stats: a flat price, a tier and an icon, and nothing a station's stock provides.
 *   Kept in src/programs.json, saved with its own button.
 * Changes are in the game at once; Save writes them all to src/hulls.json, which the game ships with.
 */
import {
  decalChoices,
  DECAL_PARTS,
  facing,
  HULL_INFO,
  HULL_MOUNTS,
  HULL_USE_NAMES,
  HULL_USES,
  hullDefaults,
  isDecal,
  MOUNT_TYPES,
  mountTakes,
  mountThrust,
  onEdge,
  PART_MOUNTS,
  resetPartStats,
  SHIPPED_SHIPS,
  shipFileNow,
  THRUSTER_ROLES,
  useShipFile,
  type HullUse,
  type HullInfo,
  type Loadout,
  type Module,
  type Mount,
  type MountId,
  type ShipFile,
  itemOwned,
} from "../fitting";
import { PART_KINDS, partFits, partOf, PARTS, SHIP_MODELS, type PartIcon, type PartId, type PartKind, type ShipModel, type ThrusterRole } from "../parts";
import { ITEMS, ITEM_TYPES, itemDef, itemsFileNow, SHIPPED_ITEMS, useItemsFile, type ItemDef, type ItemType } from "../items";
import { PROGRAMS, PROGRAM_PARTS, programDef, programsFileNow, SHIPPED_PROGRAMS, useProgramsFile, needsMet, type ProgramDef } from "../programs";
import type { GlyphId } from "../glyphs";
import { EVERY_GLYPH, glyphIcon, iconEl } from "../icons";
import { DEFAULTS } from "../tuning";
import { bayBox, drawBay, drawDecal, drawDecals, drawHull, drawPart, drawTanks, tankBoxes } from "../shipArt";

const R = 12;
const DRAFT_KEY = "jam-ships-draft";
const ITEMS_DRAFT_KEY = "jam-items-draft";
const PROGRAMS_DRAFT_KEY = "jam-programs-draft";
const MODEL_NAMES: Record<ShipModel, string> = { racer: "Racer", floater: "Floater", defender: "Defender", drone: "Drone", pirate: "Pirate" };
const byName = (a: string, b: string) => a.localeCompare(b);
/** Every hull, alphabetically by name: the order of the drop down lists. */
const MODELS: ShipModel[] = [...SHIP_MODELS].sort((a, b) => byName(MODEL_NAMES[a], MODEL_NAMES[b]));
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
/** The parts that go on mounts (or show as decals), alphabetically by label: the parts page's order. */
const FITTED = [...PARTS].sort((a, b) => byName(a.label, b.label));
/** The programs a hull's computer can come with, alphabetically. */
const PROGRAM_LIST = [...PROGRAM_PARTS].sort((a, b) => byName(a.label, b.label));

type Page = "hulls" | "parts" | "types" | "items" | "programs";

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
#hulls details { border: 1px solid #222a3a; border-radius: 4px; margin: 8px 0; padding: 0 8px 4px; background: #0e1420; }
#hulls details > summary { font-size: 12px; margin: 6px 0; color: #8fe3a1; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; user-select: none; }
#hulls details > summary:hover { color: #c0f4cf; }
#hulls label input[type=range] { width: 100%; box-sizing: border-box; margin-top: 2px; }
#hulls .glyphs { display: grid; grid-template-columns: repeat(6, 28px); gap: 3px; margin: 6px 0; }
#hulls button.glyph { padding: 1px; border-color: #33405a; }
#hulls button.glyph.on { border-color: #8fb4ff; background: #26324a; }
#hulls .icon-previews { display: flex; gap: 16px; align-items: flex-end; margin: 6px 0; }
#hulls .icon-colours { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin: 6px 0; }
#hulls .icon-colours input[type=color] { width: 100%; box-sizing: border-box; padding: 1px 2px; }
#hulls .stack { border: 1px solid #222a3a; border-radius: 4px; padding: 4px 6px; margin: 6px 0; }
#hulls .stack .row { margin-bottom: 2px; }
#hulls table.loadouts { border-collapse: collapse; width: 100%; font-size: 11px; }
#hulls table.loadouts th, #hulls table.loadouts td { border: 1px solid #222a3a; padding: 3px 4px; text-align: left; vertical-align: top; }
#hulls table.loadouts th { color: #9aa6ba; font-weight: normal; }
#hulls table.loadouts td.none { color: #4a5568; }
#hulls table.loadouts .ok { color: #8fe3a1; }
#hulls table.loadouts .warn { color: #f0d86a; }
#hulls table.loadouts .bad { color: #e88a8a; }
`;

const round = (value: number, step: number) => Math.round(value / step) * step;
const clean = (value: number) => Math.round(value * 1000) / 1000;
const wrapDegrees = (angle: number) => {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
};

/** What a mount is drawn holding: the hull's own part there, or else the first part that fits it. A decal mount holds none: its decal is drawn on the hull. */
function shownPart(model: ShipModel, mount: Mount): PartId | null {
  if (mount.decal) return null;
  const own = mount.default;
  if (own && mountTakes(mount, own) && partFits(partOf(own), model)) return own;
  return FITTED.find((part) => partFits(part, model) && mountTakes(mount, part.id))?.id ?? null;
}

/** The programs a hull's own computer runs, and the most any computer it can mount runs. */
function computerSlots(model: ShipModel): { own: number; largest: number } {
  const slots = (id: PartId | undefined) => (id && partOf(id).kind === "computer" ? partOf(id).slots ?? 0 : 0);
  const own = Object.values(hullDefaults(model)).reduce((most, id) => Math.max(most, slots(id)), 0);
  const largest = PARTS.filter(
    (part) => part.kind === "computer" && partFits(part, model) && HULL_MOUNTS[model].some((mount) => mountTakes(mount, part.id)),
  ).reduce((most, part) => Math.max(most, part.slots ?? 0), 0);
  return { own, largest };
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
  /** The part each mount's preview overlays on the blueprint, keyed `model:mount`: "none", or a part. Unset, it starts on the part the bare hull comes with. */
  private preview: Partial<Record<string, PartId | "none">> = {};
  /** The parts page's blueprint hull: null shows just the part, no hull. */
  private showOn: ShipModel | null = null;
  /** The sections the user has opened: every section starts collapsed. */
  private opened = new Set<string>();
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
    // Unsaved work from before a reload carries on. A draft no different from the shipped file
    // is dropped, so the file as it is now plays, and a later change to it isn't hidden.
    try {
      const draftOf = (key: string, shipped: unknown): string | null => {
        const text = localStorage.getItem(key);
        if (text === null || text !== JSON.stringify(shipped)) return text;
        localStorage.removeItem(key);
        return null;
      };
      const draft = draftOf(DRAFT_KEY, shipFileNow());
      if (draft) useShipFile(JSON.parse(draft) as ShipFile);
      const items = draftOf(ITEMS_DRAFT_KEY, itemsFileNow());
      if (items) useItemsFile(JSON.parse(items));
      const programs = draftOf(PROGRAMS_DRAFT_KEY, programsFileNow());
      if (programs) useProgramsFile(JSON.parse(programs));
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

  /**
   * A collapsible section of the side panel: collapsed unless opened before, and what the user
   * opened stays open across rebuilds. Every section starts collapsed.
   */
  private section(key: string, title: string, ...children: HTMLElement[]): HTMLDetailsElement {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = title;
    details.append(summary, ...children);
    if (this.opened.has(key)) details.open = true;
    details.addEventListener("toggle", () => {
      if (details.open) this.opened.add(key);
      else this.opened.delete(key);
    });
    return details;
  }

  /** A drop down list: `options` are [value, text] in the order shown. */
  private dropdown(options: [string, string][], value: string, onChange: (value: string) => void): HTMLSelectElement {
    const box = document.createElement("select");
    for (const [optionValue, text] of options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = text;
      box.append(option);
    }
    box.value = value;
    box.addEventListener("change", () => onChange(box.value));
    return box;
  }

  /** A control with a caption above it, for the side panel. */
  private labelled(text: string, box: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = text;
    label.append(box);
    return label;
  }

  /** Ticks for each of `items` ([id, text]), `has` saying which are on; `toggle` flips one. Mount types by default. */
  private checks(
    has: (id: string) => boolean,
    toggle: (id: string, on: boolean) => void,
    items: [string, string][] = MOUNT_TYPES.map((type) => [type, type]),
    none = "No mount types yet: add some on the Mount types page.",
  ): HTMLDivElement {
    const box = document.createElement("div");
    box.className = "checks";
    if (items.length === 0) box.textContent = none;
    for (const [id, text] of items) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = has(id);
      input.addEventListener("change", () => {
        toggle(id, input.checked);
        this.changed();
      });
      label.append(input, text);
      box.append(label);
    }
    return box;
  }

  private rebuild(): void {
    const title = document.createElement("h1");
    title.textContent = "HULL DESIGNER";
    const pages = document.createElement("div");
    for (const [page, name] of [
      ["hulls", "Hulls"],
      ["parts", "Parts"],
      ["types", "Mount types"],
      ["items", "Items"],
      ["programs", "Programs"],
    ] as [Page, string][]) {
      pages.append(this.button(name, () => ((this.page = page), this.rebuild()), page === this.page ? "on" : ""));
    }
    const body =
      this.page === "hulls"
        ? this.hullsPage()
        : this.page === "parts"
          ? this.partsPage()
          : this.page === "items"
            ? this.itemsPage()
            : this.page === "programs"
              ? this.programsPage()
              : this.typesPage();

    const file = this.section(
      "file",
      "File",
      this.button("Save to src/hulls.json", () => void this.save()),
      this.button("Save items to src/items.json", () => void this.saveFile("items")),
      this.button("Save programs to src/programs.json", () => void this.saveFile("programs")),
      this.button("Throw away changes", () => {
        useShipFile(SHIPPED_SHIPS);
        useItemsFile(SHIPPED_ITEMS);
        useProgramsFile(SHIPPED_PROGRAMS);
        try {
          localStorage.removeItem(ITEMS_DRAFT_KEY);
          localStorage.removeItem(PROGRAMS_DRAFT_KEY);
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
    file.append(this.statusLine);

    this.side.replaceChildren(title, pages, ...body, file);
  }

  /** The loops a hull is meant for, each with the programs it needs and the ones that help. */
  private loadoutsEditor(info: HullInfo): HTMLElement[] {
    const note = document.createElement("p");
    note.textContent = "A loadout is a set of programs for one loop, such as mining or a long trip. Core is what the loop needs to work; comfort is what makes it pleasant. A hull lists only the loops it's meant for.";
    const out: HTMLElement[] = [note];
    info.loadouts.forEach((loadout, index) => {
      const block = document.createElement("div");
      block.className = "stack";
      const name = document.createElement("input");
      name.type = "text";
      name.value = loadout.name;
      name.addEventListener("change", () => {
        const wanted = name.value.trim();
        if (!wanted) {
          name.value = loadout.name;
          return;
        }
        // Two loadouts on one hull can't share a name: the table would show only the first.
        if (wanted !== loadout.name && info.loadouts.some((each) => each !== loadout && each.name === wanted)) {
          this.status = "Two loadouts on one hull can't share a name";
          name.value = loadout.name;
          return;
        }
        loadout.name = wanted;
        this.changed();
      });
      block.append(this.labelled("Loop", name));
      const list = (label: string, key: "core" | "comfort", hint: string) => {
        const ticks = this.checks(
          (id) => loadout[key].includes(id as PartId),
          (id, on) => {
            loadout[key] = on ? [...loadout[key], id as PartId] : loadout[key].filter((each) => each !== id);
          },
          PROGRAM_LIST.map((part): [string, string] => [part.id, part.label]),
          "No programs yet.",
        );
        const line = document.createElement("p");
        line.textContent = hint;
        block.append(this.labelled(label, ticks), line);
      };
      list("Core: what the loop needs", "core", "Without these the loop doesn't work.");
      list("Comfort: what makes it pleasant", "comfort", "These make the loop nice rather than possible.");
      block.append(this.button("Remove this loadout", () => (info.loadouts.splice(index, 1), this.changed()), "danger"));
      out.push(block);
    });
    out.push(
      this.button("Add a loadout", () => {
        let n = 1;
        while (info.loadouts.some((each) => each.name === (n === 1 ? "new loop" : `new loop ${n}`))) n++;
        info.loadouts.push({ name: n === 1 ? "new loop" : `new loop ${n}`, core: [], comfort: [] });
        this.changed();
      }),
    );
    return out;
  }

  private hullsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Drag a mount to move it, its knob to turn it. What's on it moves with it and works the way it faces.";

    const models = this.labelled(
      "Hull",
      this.dropdown(
        MODELS.map((model) => [model, MODEL_NAMES[model]]),
        this.model,
        (value) => {
          this.model = value as ShipModel;
          this.selected = this.mounts()[0]?.id ?? null;
          this.rebuild();
        },
      ),
    );
    const info = HULL_INFO[this.model];
    const usedBy = this.checks(
      (use) => info.usedBy.includes(use as HullUse),
      (use, on) => {
        info.usedBy = on ? [...info.usedBy, use as HullUse] : info.usedBy.filter((each) => each !== use);
      },
      HULL_USES.map((use) => [use, HULL_USE_NAMES[use]]),
    );
    const usedNote = document.createElement("p");
    usedNote.textContent = "Kept for later: the game doesn't pick hulls by these yet.";
    const programs = this.checks(
      (id) => info.programs.includes(id as PartId),
      (id, on) => {
        info.programs = on ? [...info.programs, id as PartId] : info.programs.filter((each) => each !== id);
      },
      PROGRAM_LIST.map((part) => [part.id, part.label]),
    );
    const programsNote = document.createElement("p");
    programsNote.textContent = "Loaded into its computer as far as it has slots, and the pilot owns them.";

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

    // The hull's own stats: what a bare hull costs, weighs and can take. Left empty,
    // the game's own values are used, so the shipped hulls change nothing.
    const stat = (key: "price" | "weight" | "hull", label: string, fallback: string) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.min = "0";
      input.value = info[key] === undefined ? "" : String(info[key]);
      input.placeholder = fallback;
      input.addEventListener("change", () => {
        if (input.value.trim() === "") delete info[key];
        else {
          const value = Number(input.value);
          if (Number.isFinite(value) && value >= 0) info[key] = value;
        }
        this.changed();
      });
      return this.labelled(label, input);
    };
    const statsNote = document.createElement("p");
    statsNote.textContent = `Left empty, the game's own: ${DEFAULTS.rebuildCost} credits for a bare hull, weight ${DEFAULTS.weight} and 100 hull points. Cargo room comes only from fitted bays: each hull comes with the small one.`;
    const out: HTMLElement[] = [
      intro,
      this.section("hull", "Hull", models),
      this.section("used", "Used by", usedBy, usedNote),
      this.section("programs", "Default programs", programs, programsNote),
      this.section("loadouts", "Loadouts", ...this.loadoutsEditor(info)),
      this.section(
        `stats:${this.model}`,
        "Hull stats",
        stat("price", "Price of a bare hull", `${DEFAULTS.rebuildCost} credits`),
        stat("weight", "Bare hull weight", String(DEFAULTS.weight)),
        stat("hull", "Hull points", "100"),
        statsNote,
      ),
      this.section("mounts", "Mounts", list, add),
    ];
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

    const decal = document.createElement("label");
    const decalBox = document.createElement("input");
    decalBox.type = "checkbox";
    decalBox.checked = mount.decal === true;
    decalBox.addEventListener("change", () => {
      if (decalBox.checked) {
        mount.decal = true;
        delete mount.role;
        delete mount.default;
      } else delete mount.decal;
      this.onMountsChanged();
      this.changed();
    });
    decal.style.color = "#cfd8e6";
    decal.append(decalBox, " Decal: shows a random decal part, looks only");

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
    const fitting = FITTED.filter((part) => partFits(part, this.model) && mountTakes(mount, part.id));
    const fits = fitting.map((part) => part.label);
    takes.textContent = mount.decal
      ? fits.length
        ? `Shows one of: ${fits.join(", ")}`
        : "Shows nothing yet: flag a part as a decal on the Parts page and give it one of these types."
      : fits.length
        ? `Takes: ${fits.join(", ")}`
        : "Takes nothing yet.";

    const bare = this.labelled(
      "Bare hull comes with",
      this.dropdown(
        [["", "nothing"], ...fitting.map((part): [string, string] => [part.id, part.label])],
        fitting.some((part) => part.id === mount.default) ? mount.default! : "",
        (value) => {
          if (value) mount.default = value as PartId;
          else delete mount.default;
          this.changed();
        },
      ),
    );

    // A part to overlay on the blueprint as it shows in game, chosen per mount: it starts on
    // the part the bare hull comes with (a decal mount, on its first fitting decal), and none
    // or any part that fits can be picked instead.
    const choices: [string, string][] = mount.decal
      ? decalChoices(this.model, mount).map((id): [string, string] => [id, partOf(id).label])
      : fitting.map((part): [string, string] => [part.id, part.label]);
    const chosen = this.preview[`${this.model}:${mount.id}`];
    const shown =
      chosen === "none" || (chosen !== undefined && !choices.some(([id]) => id === chosen))
        ? ""
        : chosen !== undefined
          ? chosen
          : (this.previewOf(this.model, mount) ?? "");
    const preview = this.labelled(
      "Preview (overlaid on the blueprint)",
      this.dropdown(
        [["", "none"], ...choices],
        shown,
        (value) => {
          const key = `${this.model}:${mount.id}`;
          if (value) this.preview[key] = value as PartId;
          else this.preview[key] = "none";
        },
      ),
    );

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

    // How what's on the mount shows in game: how transparent, and which layer it draws on.
    const alpha = document.createElement("label");
    alpha.textContent = "Transparency, as drawn in game";
    const alphaBox = document.createElement("input");
    alphaBox.type = "range";
    alphaBox.min = "0";
    alphaBox.max = "1";
    alphaBox.step = "0.05";
    alphaBox.value = String(mount.alpha ?? 1);
    const alphaRead = document.createElement("span");
    alphaRead.textContent = `  ${Math.round((mount.alpha ?? 1) * 100)}% solid`;
    alphaBox.addEventListener("input", () => {
      const value = Number(alphaBox.value);
      if (value >= 0.999) delete mount.alpha;
      else mount.alpha = clean(value);
      alphaRead.textContent = `  ${Math.round((mount.alpha ?? 1) * 100)}% solid`;
      this.changed(false);
    });
    alpha.append(alphaBox, alphaRead);

    const order = document.createElement("label");
    order.textContent = "Draw order in game";
    const orderBox = document.createElement("input");
    orderBox.type = "number";
    orderBox.step = "1";
    orderBox.value = String(mount.order ?? 0);
    orderBox.addEventListener("change", () => {
      const value = Number(orderBox.value);
      if (!Number.isFinite(value) || value === 0) delete mount.order;
      else mount.order = value;
      this.changed();
    });
    order.append(orderBox);
    const orderNote = document.createElement("p");
    orderNote.textContent = "0, the default, draws at the hull level with the other parts; below 0 draws underneath the hull itself, so only what sticks out past its edge shows.";

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
          if (!was.default) delete mount.default;
          if (!was.decal) delete mount.decal;
          if (!was.alpha) delete mount.alpha;
          if (!was.order) delete mount.order;
          this.onMountsChanged();
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

    return [
      ...out,
      this.section(
        // One key for every mount, so a section opened for one stays open for the next.
        "mount",
        mount.name,
        name,
        decal,
        ...(mount.decal ? [] : [role, bare]),
        preview,
        supports,
        takes,
        grid,
        alpha,
        order,
        orderNote,
        this.does,
        tools,
      ),
      this.section("keys", "Keys", keys),
    ];
  }

  private partsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Which mount types each part fits. It goes on any mount that supports one of them. The blueprint lights up the mounts it would go on.";
    const list = this.labelled(
      "Part",
      this.dropdown(
        FITTED.map((each): [string, string] => [each.id, each.label + (isDecal(each.id) ? " (decal)" : "")]),
        this.part,
        (value) => {
          this.part = value as PartId;
          this.rebuild();
        },
      ),
    );
    const part = partOf(this.part);
    const decal = document.createElement("label");
    const decalBox = document.createElement("input");
    decalBox.type = "checkbox";
    decalBox.checked = isDecal(part.id);
    decalBox.addEventListener("change", () => {
      const at = DECAL_PARTS.indexOf(part.id);
      if (decalBox.checked && at < 0) DECAL_PARTS.push(part.id);
      else if (!decalBox.checked && at >= 0) DECAL_PARTS.splice(at, 1);
      this.onMountsChanged();
      this.changed();
    });
    decal.style.color = "#cfd8e6";
    decal.append(decalBox, " Decal: looks only. It shows, at random, on decal mounts that fit it, and is never fitted or sold");
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
    const models = this.labelled(
      "Show on hull",
      this.dropdown(
        [["", "none: just the part"], ...MODELS.map((model): [string, string] => [model, MODEL_NAMES[model]])],
        this.showOn ?? "",
        (value) => {
          this.showOn = value ? (value as ShipModel) : null;
          this.rebuild();
        },
      ),
    );

    // The part's stats, editable: kept in src/hulls.json over the code's own values in parts.ts.
    const stat = (key: "price" | "weight" | "slots" | "set" | "explosive", label: string, step: number) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = String(step);
      input.min = "0";
      input.value = String(part[key] ?? 0);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) return;
        part[key] = value;
        this.changed();
      });
      return this.labelled(label, input);
    };
    // A whole number of cells. A bay's entry is kept on the grid's edge.
    const cells = (label: string, now: number, min: number, set: (value: number) => void) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.min = String(min);
      input.value = String(now);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < min) return;
        set(value);
        if (part.bay) part.bay.entry = { ...part.bay.entry, ...onEdge(part.bay.w, part.bay.h, part.bay.entry) };
        this.changed(true);
      });
      return this.labelled(label, input);
    };
    const tier = this.labelled(
      "Sold",
      this.dropdown(
        [
          ["0", "from the start"],
          ["1", "after a little ore is sold"],
          ["2", "after much more ore is sold"],
        ],
        String(part.tier),
        (value) => {
          part.tier = value === "2" ? 2 : value === "1" ? 1 : 0;
          this.changed();
        },
      ),
    );
    const statsNote = document.createElement("p");
    statsNote.textContent = itemOwned(part.id)
      ? "Kept in src/hulls.json, and in the game at once. This module's shape, price, blueprint price and icon are its item's: edit them on the Items page."
      : "Kept in src/hulls.json over the parts' own values in parts.ts, and in the game at once.";
    const stats = this.section(
      `stats:${part.id}`,
      "Stats",
      ...(itemOwned(part.id) ? [] : [stat("price", "Price", 10)]),
      stat("weight", "Weight", 0.01),
      ...(!itemOwned(part.id) && part.shape !== undefined
        ? [cells("Cells it takes across", part.shape.w, 1, (value) => (part.shape!.w = value)), cells("Cells it takes down", part.shape.h, 1, (value) => (part.shape!.h = value))]
        : []),
      ...(part.bay !== undefined
        ? [
            cells("Bay grid across", part.bay.w, 1, (value) => (part.bay!.w = value)),
            cells("Bay grid down", part.bay.h, 1, (value) => (part.bay!.h = value)),
            cells("Bay entry cell across (from 0)", part.bay.entry.x, 0, (value) => (part.bay!.entry.x = value)),
            cells("Bay entry cell down (from 0)", part.bay.entry.y, 0, (value) => (part.bay!.entry.y = value)),
            cells("Bay entry width in cells", part.bay.entry.size ?? 1, 1, (value) => (part.bay!.entry.size = value)),
          ]
        : []),
      ...(part.slots !== undefined ? [stat("slots", "Programs it runs at once", 1)] : []),
      ...(part.set !== undefined ? [stat("set", "Comes as a set of", 1)] : []),
      ...(part.explosive !== undefined ? [stat("explosive", "Explosive (hull points)", 5)] : []),
      tier,
      this.button("Back to coded stats", () => {
        resetPartStats(part.id);
        this.changed();
      }),
      statsNote,
    );
    return [
      intro,
      this.section("part", "Part", list, decal),
      stats,
      ...(itemOwned(part.id) ? [] : [this.section(`icon:${part.id}`, "Icon", ...this.iconPicker(part))]),
      this.section(`fits:${part.id}`, `${part.label} fits`, fits, set),
      this.section("goes", "Goes on", where, models),
    ];
  }

  /**
   * The part's icon: a glyph from the whole set, three colours and a mark, with live previews
   * at shop size and at a 2×2 bay tile size. Colour changes redraw in place, so the picker's
   * own popup stays open; everything else goes through `changed()` like the other stats.
   */
  private iconPicker(part: { icon: PartIcon }, onChange: (rebuild?: boolean) => void = (rebuild = true) => this.changed(rebuild), glow = false): HTMLElement[] {
    const redraws: (() => void)[] = [];
    const glyphs = document.createElement("div");
    glyphs.className = "glyphs";
    for (const id of EVERY_GLYPH) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.title = id;
      cell.addEventListener("click", () => {
        part.icon = { ...part.icon, glyph: id as GlyphId };
        onChange();
      });
      const draw = () => {
        cell.className = `glyph${part.icon.glyph === id ? " on" : ""}`;
        cell.replaceChildren(glyphIcon(id, part.icon.primary, part.icon.secondary, 22));
      };
      draw();
      redraws.push(draw);
      glyphs.append(cell);
    }
    const colours = document.createElement("div");
    colours.className = "icon-colours";
    for (const key of ["primary", "secondary", "border"] as const) {
      const input = document.createElement("input");
      input.type = "color";
      input.value = part.icon[key];
      input.addEventListener("input", () => {
        part.icon[key] = input.value;
        for (const redraw of redraws) redraw();
        onChange(false);
      });
      colours.append(this.labelled(key, input));
    }
    if (glow) {
      // Items only: the colour it glows when it floats loose. Without one it glows in its border colour.
      const input = document.createElement("input");
      input.type = "color";
      input.value = part.icon.glow ?? part.icon.border;
      input.addEventListener("input", () => {
        part.icon.glow = input.value;
        onChange(false);
      });
      colours.append(this.labelled("glow", input));
    }
    const mark = document.createElement("input");
    mark.type = "text";
    mark.value = part.icon.mark ?? "";
    mark.placeholder = "such as *, +, !, 2 or 360";
    mark.addEventListener("change", () => {
      const { mark: _old, ...rest } = part.icon;
      part.icon = { ...rest, ...(mark.value.trim() ? { mark: mark.value } : {}) };
      onChange();
    });
    const markNote = document.createElement("p");
    markNote.textContent = "Free text in the corner. The icon shows at most its first 3 characters.";
    const previews = document.createElement("div");
    previews.className = "icon-previews";
    for (const [size, label] of [
      [28, "shop"],
      [48, "2×2 tile"],
    ] as [number, string][]) {
      const wrap = document.createElement("div");
      const draw = () => wrap.replaceChildren(iconEl(part.icon, size));
      draw();
      redraws.push(draw);
      previews.append(this.labelled(label, wrap));
    }
    const note = document.createElement("p");
    note.textContent = glow ? "Kept in src/items.json, and in the game at once." : "Kept in src/hulls.json over the part's own icon in parts.ts, and in the game at once.";
    return [glyphs, colours, this.labelled("Mark", mark), markNote, previews, note];
  }

  // ---------- items ----------

  /** The item the Items page is on. */
  private itemId: string | null = null;

  /** An item edit is in: puts it back through the file reader (which tidies it) so the game plays with it, then keeps the draft. */
  private itemsChanged(rebuild = true): void {
    useItemsFile(itemsFileNow());
    try {
      localStorage.setItem(ITEMS_DRAFT_KEY, JSON.stringify(itemsFileNow()));
    } catch {
      /* storage blocked: the change still holds until reload */
    }
    this.status = "Not saved";
    this.changed(rebuild);
  }

  /** The live record of an item, by id: it changes whenever the file is read back, so nothing keeps hold of one. */
  private liveItem(id: string): ItemDef {
    return ITEMS.find((item) => item.id === id)!;
  }

  /**
   * The Items page: every good in the game. An item has a type (an ore, a part or a module), a
   * name, a shape on the grid, a volume for everywhere else, a price, a blueprint price and an
   * icon with a glow for when it floats loose. What it's made from is its own recipe: a part is
   * made at the hub, a module at the station that sells it. Kept in src/items.json.
   */
  private itemsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent =
      "Every good: ore, the parts made from it, and the modules made from those. A module is an item and a part at once, with the same id: the item owns what shows and what it costs. Where a recipe runs follows the type: a part is made at the hub, a module at the station that sells it.";
    if (this.itemId === null || !itemDef(this.itemId)) this.itemId = ITEMS[0]?.id ?? null;
    const id = this.itemId;
    const list = this.labelled(
      "Item",
      this.dropdown(
        ITEMS.map((each): [string, string] => [each.id, `${each.name} (${each.type})`]),
        id ?? "",
        (value) => {
          this.itemId = value;
          this.rebuild();
        },
      ),
    );
    const newRow = document.createElement("div");
    newRow.className = "row";
    const newBox = document.createElement("input");
    newBox.type = "text";
    newBox.placeholder = "id of a new item";
    let newType: ItemType = "part";
    const typeBox = this.dropdown(
      ITEM_TYPES.filter((type) => type !== "module").map((type): [string, string] => [type, type]),
      newType,
      (value) => (newType = value as ItemType),
    );
    const addItem = () => {
      const name = newBox.value.trim();
      if (!name || ITEMS.some((each) => each.id === name) || PARTS.some((part) => part.id === name)) {
        this.status = "An item's id must be new, and not a part's";
        this.rebuild();
        return;
      }
      ITEMS.push({
        id: name,
        name,
        type: newType,
        description: "",
        shape: { w: 1, h: 1 },
        price: 10,
        blueprintPrice: 0,
        icon: { glyph: "crate", primary: "#566274", secondary: "#c8d4e8", border: "#f0d86a" },
      });
      this.itemId = name;
      this.itemsChanged();
    };
    newBox.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addItem();
    });
    newRow.append(newBox, typeBox, this.button("Add", addItem));
    const moduleNote = document.createElement("p");
    moduleNote.textContent = "A module's item is its module's, so it can't be added or deleted here: pick the module to set what it costs and how it looks.";

    const body: HTMLElement[] = [intro, this.section("itemlist", "Items", list, newRow, moduleNote)];
    if (id !== null) {
      const item = this.liveItem(id);
      const text = (label: string, value: string, set: (def: ItemDef, value: string) => void, area = false) => {
        const input = area ? document.createElement("textarea") : document.createElement("input");
        if (input instanceof HTMLInputElement) input.type = "text";
        input.value = value;
        input.addEventListener("change", () => {
          set(this.liveItem(id), input.value);
          this.itemsChanged();
        });
        return this.labelled(label, input);
      };
      const number = (label: string, value: number | undefined, min: number, step: number, set: (def: ItemDef, value: number | undefined) => void, blank = "") => {
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.step = String(step);
        input.value = value === undefined ? "" : String(value);
        input.placeholder = blank;
        input.addEventListener("change", () => {
          const read = Number(input.value);
          if (input.value === "") set(this.liveItem(id), undefined);
          else if (Number.isFinite(read) && read >= min) set(this.liveItem(id), read);
          else return;
          this.itemsChanged();
        });
        return this.labelled(label, input);
      };
      const area = item.shape.w * item.shape.h;
      body.push(
        this.section(
          `item:${id}`,
          "Item",
          text("Name", item.name, (def, value) => (def.name = value.trim() || def.id)),
          text("Description", item.description, (def, value) => (def.description = value), true),
          this.labelled(
            "Type",
            this.dropdown(
              ITEM_TYPES.map((type): [string, string] => [type, type]),
              item.type,
              (value) => {
                // A module is a module because a module names it: its item's type is the module's.
                if (value === "module" && item.type !== "module") {
                  this.status = "Only a module can be a module item";
                  this.rebuild();
                  return;
                }
                this.liveItem(id).type = value as ItemType;
                this.itemsChanged();
              },
            ),
          ),
          number("Price", item.price, 0, 5, (def, value) => (def.price = value ?? 0)),
          number("Blueprint price", item.blueprintPrice, 0, 5, (def, value) => (def.blueprintPrice = value ?? 0)),
          number("Cells across", item.shape.w, 1, 1, (def, value) => (def.shape = { ...def.shape, w: Math.max(1, Math.round(value ?? 1)) })),
          number("Cells down", item.shape.h, 1, 1, (def, value) => (def.shape = { ...def.shape, h: Math.max(1, Math.round(value ?? 1)) })),
          number(
            `Volume (blank: the shape's area, ${area})`,
            item.volume,
            0.1,
            0.5,
            (def, value) => {
              if (value === undefined || value <= 0) delete def.volume;
              else def.volume = value;
            },
            String(area),
          ),
          this.button(
            "Delete this item",
            () => {
              if (this.liveItem(id).type === "module") {
                this.status = "A module's item goes with the module: it can't be deleted here";
                this.rebuild();
                return;
              }
              ITEMS.splice(ITEMS.findIndex((each) => each.id === id), 1);
              this.itemId = null;
              this.itemsChanged();
            },
            "danger",
          ),
        ),
      );
      const owner = {
        get icon(): PartIcon {
          return ITEMS.find((each) => each.id === id)!.icon;
        },
        set icon(value: PartIcon) {
          ITEMS.find((each) => each.id === id)!.icon = value;
        },
      };
      body.push(this.section(`itemicon:${id}`, "Icon and glow", ...this.iconPicker(owner, (rebuild = true) => this.itemsChanged(rebuild), true)));
      body.push(this.section(`recipe:${id}`, "Recipe", ...this.recipeRows(id)));
    }
    return body;
  }

  /** What an item is made from, on the item itself: the items it takes in, and how many it makes. */
  private recipeRows(id: string): HTMLElement[] {
    const live = () => this.liveItem(id);
    const rows: HTMLElement[] = [];
    const note = document.createElement("p");
    note.textContent =
      live().type === "ore"
        ? "An ore is mined, not made: it has no recipe, and is picked in a field as a drop chance."
        : live().type === "part"
          ? "A part is made at the hub, off-screen, when haulers bring its inputs."
          : "A module is made at the station that sells it, at the moment of sale.";
    rows.push(note);
    if (live().type === "ore") return rows;
    const recipe = live().recipe;
    if (!recipe) {
      rows.push(
        this.button("+ recipe", () => {
          const other = ITEMS.find((each) => each.id !== id);
          if (!other) return;
          live().recipe = { from: [{ item: other.id, n: 1 }] };
          this.itemsChanged();
        }),
      );
      return rows;
    }
    const options = (): [string, string][] => ITEMS.filter((each) => each.id !== id).map((each): [string, string] => [each.id, `${each.name} (${each.type})`]);
    const count = (value: number, set: (value: number) => void) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.value = String(value);
      input.style.width = "56px";
      input.addEventListener("change", () => {
        const read = Number(input.value);
        if (!Number.isInteger(read) || read < 1) return;
        set(read);
        this.itemsChanged();
      });
      return input;
    };
    const head = document.createElement("div");
    head.className = "row";
    head.append(
      document.createTextNode("makes ×"),
      count(recipe.yields ?? 1, (value) => (live().recipe!.yields = value)),
      this.button(
        "×",
        () => {
          delete live().recipe;
          this.itemsChanged();
        },
        "danger",
      ),
    );
    rows.push(head);
    recipe.from.forEach((ingredient, at) => {
      const row = document.createElement("div");
      row.className = "row";
      const choices = options();
      const shown = choices.some(([value]) => value === ingredient.item) ? choices : ([[ingredient.item, ingredient.item], ...choices] as [string, string][]);
      row.append(
        document.createTextNode("from"),
        count(ingredient.n, (value) => (live().recipe!.from[at].n = value)),
        this.dropdown(shown, ingredient.item, (value) => {
          live().recipe!.from[at].item = value;
          this.itemsChanged();
        }),
        this.button(
          "×",
          () => {
            live().recipe!.from.splice(at, 1);
            // A recipe with nothing to take in is no recipe.
            if (live().recipe!.from.length === 0) delete live().recipe;
            this.itemsChanged();
          },
          "danger",
        ),
      );
      rows.push(row);
    });
    const first = options()[0];
    if (first) {
      rows.push(
        this.button("+ input", () => {
          live().recipe!.from.push({ item: first[0], n: 1 });
          this.itemsChanged();
        }),
      );
    }
    return rows;
  }

  /** What the canvas shows for an item: its shape as cells on the grid, in its colours, with the glow it has loose in the world. */
  private drawItem(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const item = this.itemId ? ITEMS.find((each) => each.id === this.itemId) : undefined;
    ctx.fillStyle = "#7f8ba0";
    ctx.font = "12px system-ui, sans-serif";
    if (!item) {
      ctx.fillText("No item yet: add one in the side panel", 14, height - 14);
      return;
    }
    const cell = Math.min(width, height) / 10;
    const left = this.cx - (item.shape.w * cell) / 2;
    const top = this.cy - (item.shape.h * cell) / 2 - cell * 1.2;
    for (let y = 0; y < item.shape.h; y++) {
      for (let x = 0; x < item.shape.w; x++) {
        ctx.fillStyle = item.icon.primary;
        ctx.fillRect(left + x * cell + 1, top + y * cell + 1, cell - 2, cell - 2);
        ctx.strokeStyle = item.icon.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(left + x * cell + 1, top + y * cell + 1, cell - 2, cell - 2);
      }
    }
    // Loose in the world: a small glowing bead, as the game draws it.
    ctx.save();
    ctx.shadowColor = item.icon.glow ?? item.icon.border;
    ctx.shadowBlur = 28;
    ctx.fillStyle = item.icon.primary;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy + cell * 2, cell * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = item.icon.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy + cell * 2, cell * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7f8ba0";
    ctx.fillText(`${item.name} (${item.type}): on the grid (above) and loose in space (below). Volume ${item.volume ?? item.shape.w * item.shape.h}.`, 14, height - 14);
  }

  // ---------- programs ----------

  /** The program the Programs page is on. */
  private programId: string | null = null;

  /** A program edit is in: puts it back through the file reader (which tidies it) so the game plays with it, then keeps the draft. */
  private programsChanged(rebuild = true): void {
    useProgramsFile(programsFileNow());
    try {
      localStorage.setItem(PROGRAMS_DRAFT_KEY, JSON.stringify(programsFileNow()));
    } catch {
      /* storage blocked: the change still holds until reload */
    }
    this.status = "Not saved";
    this.changed(rebuild);
  }

  private liveProgram(id: string): ProgramDef {
    return PROGRAMS.find((program) => program.id === id)!;
  }

  /**
   * The Programs page: what a pilot buys and loads into a computer. Not items and not modules:
   * a program has a flat price, takes nothing from a station's stock, and stays with the pilot
   * through death. Kept in src/programs.json.
   */
  private programsPage(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Programs: bought and owned by the pilot, and loaded into a computer's slots. They cost credits and nothing else, and a pilot keeps them through death. A hull comes with its own list of them.";
    if (this.programId === null || !programDef(this.programId)) this.programId = PROGRAMS[0]?.id ?? null;
    const id = this.programId;
    const list = this.labelled(
      "Program",
      this.dropdown(
        PROGRAMS.map((each): [string, string] => [each.id, each.name]),
        id ?? "",
        (value) => {
          this.programId = value;
          this.rebuild();
        },
      ),
    );
    const newRow = document.createElement("div");
    newRow.className = "row";
    const newBox = document.createElement("input");
    newBox.type = "text";
    newBox.placeholder = "id of a new program";
    const add = () => {
      const name = newBox.value.trim();
      if (!name || PROGRAMS.some((each) => each.id === name) || PARTS.some((part) => part.id === name) || ITEMS.some((each) => each.id === name)) {
        this.status = "A program's id must be new, and not a part's or an item's";
        this.rebuild();
        return;
      }
      PROGRAMS.push({ id: name, name, short: name, description: "", price: 100, tier: 0, icon: { glyph: "chip", primary: "#2f6e74", secondary: "#7fdfe6", border: "#c4a4f0" } });
      this.programId = name;
      this.programsChanged();
    };
    newBox.addEventListener("keydown", (event) => {
      if (event.key === "Enter") add();
    });
    newRow.append(newBox, this.button("Add", add));
    const body: HTMLElement[] = [intro, this.section("programlist", "Programs", list, newRow)];
    if (id !== null) {
      const program = this.liveProgram(id);
      const text = (label: string, value: string, set: (def: ProgramDef, value: string) => void, area = false) => {
        const input = area ? document.createElement("textarea") : document.createElement("input");
        if (input instanceof HTMLInputElement) input.type = "text";
        input.value = value;
        input.addEventListener("change", () => {
          set(this.liveProgram(id), input.value);
          this.programsChanged();
        });
        return this.labelled(label, input);
      };
      const price = document.createElement("input");
      price.type = "number";
      price.min = "0";
      price.step = "10";
      price.value = String(program.price);
      price.addEventListener("change", () => {
        const value = Number(price.value);
        if (!Number.isFinite(value) || value < 0) return;
        this.liveProgram(id).price = value;
        this.programsChanged();
      });
      body.push(
        this.section(
          `program:${id}`,
          "Program",
          text("Name", program.name, (def, value) => (def.name = value.trim() || def.id)),
          text("Short name", program.short, (def, value) => (def.short = value.trim() || def.name.slice(0, 5))),
          text("Description", program.description, (def, value) => (def.description = value), true),
          this.labelled("Price", price),
          this.labelled(
            "Sold",
            this.dropdown(
              [
                ["0", "from the start"],
                ["1", "after a little ore is sold"],
                ["2", "after much more ore is sold"],
              ],
              String(program.tier),
              (value) => {
                this.liveProgram(id).tier = value === "2" ? 2 : value === "1" ? 1 : 0;
                this.programsChanged();
              },
            ),
          ),
          this.button(
            "Delete this program",
            () => {
              PROGRAMS.splice(PROGRAMS.findIndex((each) => each.id === id), 1);
              this.programId = null;
              this.programsChanged();
            },
            "danger",
          ),
        ),
      );
      const owner = {
        get icon(): PartIcon {
          return PROGRAMS.find((each) => each.id === id)!.icon;
        },
        set icon(value: PartIcon) {
          PROGRAMS.find((each) => each.id === id)!.icon = value;
        },
      };
      body.push(this.section(`programicon:${id}`, "Icon", ...this.iconPicker(owner, (rebuild = true) => this.programsChanged(rebuild))));
      body.push(this.section(`tweaks:${id}`, "Tweaks", ...this.tweaksEditor(id)));
      body.push(this.section(`needs:${id}`, "Needs", ...this.needsEditor(id)));
    }
    body.push(this.section("loadouttable", "Loadout table", ...this.loadoutTable()));
    return body;
  }

  /** Which programs a hull's loadouts hold, and whether they fit the computer it comes with and the largest it can mount. */
  private loadoutTable(): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "Do the programs a hull would run fit its computer? A red cell is creep: the loop can't fit even its core. 'Core only' means the loop works but the comfort programs are over the slots. A loadout naming a program without the one it needs doesn't work either.";
    const names: string[] = [];
    for (const model of MODELS) for (const loadout of HULL_INFO[model].loadouts) if (!names.includes(loadout.name)) names.push(loadout.name);
    if (names.length === 0) {
      const none = document.createElement("p");
      none.textContent = "No hull has a loadout yet: add one under Default programs on the Hulls page.";
      return [intro, none];
    }
    const table = document.createElement("table");
    table.className = "loadouts";
    const head = document.createElement("tr");
    const heading = (text: string) => {
      const box = document.createElement("th");
      box.textContent = text;
      return box;
    };
    head.append(heading("Hull"));
    for (const name of names) head.append(heading(name));
    table.append(head);
    for (const model of MODELS) {
      const row = document.createElement("tr");
      row.append(heading(MODEL_NAMES[model]));
      for (const name of names) {
        const loadout = HULL_INFO[model].loadouts.find((each) => each.name === name);
        if (!loadout) {
          const td = document.createElement("td");
          td.className = "none";
          td.textContent = "-";
          row.append(td);
        } else row.append(this.loadoutCell(model, loadout));
      }
      table.append(row);
    }
    return [intro, table];
  }

  /** One cell: how the loadout fits the hull's own computer, and the largest one it can mount. */
  private loadoutCell(model: ShipModel, loadout: Loadout): HTMLTableCellElement {
    const td = document.createElement("td");
    const all = new Set([...loadout.core, ...loadout.comfort]);
    const line = (label: string, slots: number) => {
      const box = document.createElement("div");
      if (loadout.core.length > slots) {
        box.className = "bad";
        box.textContent = `${label} ${slots}: ${loadout.core.length - slots} over`;
      } else if (all.size > slots) {
        box.className = "warn";
        box.textContent = `${label} ${slots}: core only`;
      } else {
        box.className = "ok";
        box.textContent = `${label} ${slots}: fits`;
      }
      td.append(box);
    };
    const { own, largest } = computerSlots(model);
    line("own", own);
    line("max", largest);
    const loaded = [...all];
    for (const id of loaded) {
      if (needsMet(id, loaded)) continue;
      const needs = (programDef(id)?.needs ?? []).map((each) => programDef(each)?.name ?? each);
      const box = document.createElement("div");
      box.className = "bad";
      box.textContent = `${programDef(id)?.name ?? id} needs ${needs.join(", ")}`;
      td.append(box);
    }
    return td;
  }

  /** The programs a program can't do without: a check for each another one. */
  private needsEditor(id: string): HTMLElement[] {
    const ticks = this.checks(
      (each) => (this.liveProgram(id).needs ?? []).includes(each),
      (each, on) => {
        const live = this.liveProgram(id);
        const needs = new Set(live.needs ?? []);
        if (on) needs.add(each);
        else needs.delete(each);
        if (needs.size > 0) live.needs = [...needs];
        else delete live.needs;
        this.programsChanged();
      },
      PROGRAM_LIST.filter((part) => part.id !== id).map((part): [string, string] => [part.id, part.label]),
      "No other programs to need.",
    );
    const note = document.createElement("p");
    note.textContent = "A program that needs another does nothing without it loaded. The loadout table warns about a loadout that leaves one out.";
    return [ticks, note];
  }

  /**
   * The tweaks of a program: each a named choice about how it works. Tweak and option ids are
   * fixed here, since a pilot's pick names them; names, the default and the list can change.
   */
  private tweaksEditor(id: string): HTMLElement[] {
    const intro = document.createElement("p");
    intro.textContent = "A tweak changes how a program does its job, never what the job is. Every option should be worth picking sometimes.";
    const out: HTMLElement[] = [intro];
    const text = (value: string, set: (value: string) => void) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.addEventListener("change", () => {
        set(input.value.trim());
        this.programsChanged();
      });
      return input;
    };
    const liveTweak = (tweakId: string) => this.liveProgram(id).tweaks?.find((each) => each.id === tweakId);
    for (const tweak of this.liveProgram(id).tweaks ?? []) {
      const block = document.createElement("div");
      block.className = "stack";
      const head = document.createElement("div");
      head.className = "row";
      const tag = document.createElement("span");
      tag.textContent = tweak.id;
      tag.style.color = "#6a7486";
      head.append(
        text(tweak.name, (value) => {
          const live = liveTweak(tweak.id);
          if (live && value) live.name = value;
        }),
        tag,
        this.button(
          "×",
          () => {
            const live = this.liveProgram(id);
            live.tweaks = (live.tweaks ?? []).filter((each) => each.id !== tweak.id);
            if (live.tweaks.length === 0) delete live.tweaks;
            this.programsChanged();
          },
          "danger",
        ),
      );
      block.append(this.labelled("Tweak", head));
      block.append(
        this.labelled(
          "Default",
          this.dropdown(
            tweak.options.map((option): [string, string] => [option.id, option.name]),
            tweak.default,
            (value) => {
              const live = liveTweak(tweak.id);
              if (live) live.default = value;
              this.programsChanged();
            },
          ),
        ),
      );
      // A tweak can repeat per mount: one pick for each mount holding a working part of a kind.
      block.append(
        this.labelled(
          "Per mount",
          this.dropdown(
            [["", "No: one pick"] as [string, string], ...PART_KINDS.filter((kind) => kind !== "program" && kind !== "item").map((kind): [string, string] => [kind, `Each ${kind}`])],
            tweak.each ?? "",
            (value) => {
              const live = liveTweak(tweak.id);
              if (!live) return;
              if (value) live.each = value as PartKind;
              else delete live.each;
              this.programsChanged();
            },
          ),
        ),
      );
      for (const option of tweak.options) {
        const row = document.createElement("div");
        row.className = "row";
        row.append(
          text(option.name, (value) => {
            const live = liveTweak(tweak.id)?.options.find((each) => each.id === option.id);
            if (live && value) live.name = value;
          }),
        );
        const tag = document.createElement("span");
        tag.textContent = option.id;
        tag.style.color = "#6a7486";
        row.append(
          tag,
          this.button(
            "×",
            () => {
              const live = liveTweak(tweak.id);
              if (!live) return;
              if (live.options.length <= 2) {
                this.status = "A tweak needs at least two options";
                this.rebuild();
                return;
              }
              live.options = live.options.filter((each) => each.id !== option.id);
              if (live.default === option.id) live.default = live.options[0].id;
              this.programsChanged();
            },
            "danger",
          ),
        );
        block.append(row);
      }
      block.append(
        this.button("Add an option", () => {
          const live = liveTweak(tweak.id);
          if (!live) return;
          const taken = new Set(live.options.map((each) => each.id));
          let n = 1;
          while (taken.has(`option${n}`)) n++;
          live.options.push({ id: `option${n}`, name: `Option ${n}` });
          this.programsChanged();
        }),
      );
      out.push(block);
    }
    out.push(
      this.button("Add a tweak", () => {
        const live = this.liveProgram(id);
        live.tweaks ??= [];
        const taken = new Set(live.tweaks.map((each) => each.id));
        let n = 1;
        while (taken.has(`tweak${n}`)) n++;
        live.tweaks.push({ id: `tweak${n}`, name: `Tweak ${n}`, default: "a", options: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
        this.programsChanged();
      }),
    );
    return out;
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
    return [intro, this.section("types", "Mount types", ...rows, addRow)];
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
    if (mount.decal) {
      lines.push("A decal mount: it shows a random decal part that fits it, for looks only. Nothing real goes here, and hits pass it by.");
      return lines.join("\n");
    }
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
    if (kind === "tank") lines.push("A fuel tank shows as a small box either side of the bay, filled to the ship's level.");
    if (kind === "thruster" && !mount.role) lines.push("No control fires it: a thruster here does nothing.");
    lines.push("Hits land on whatever is mounted nearest them.");
    return lines.join("\n");
  }

  /** Writes one of the designer's own files out: the items, or the programs. */
  private async saveFile(which: "items" | "programs"): Promise<void> {
    const [url, name, file, shipped, draft] =
      which === "items"
        ? ["/__items", "src/items.json", itemsFileNow(), SHIPPED_ITEMS, ITEMS_DRAFT_KEY]
        : ["/__programs", "src/programs.json", programsFileNow(), SHIPPED_PROGRAMS, PROGRAMS_DRAFT_KEY];
    try {
      const response = await fetch(url, { method: "POST", body: JSON.stringify(file, null, 2) + "\n" });
      this.status = response.ok ? `Saved to ${name}` : `Couldn't save (${response.status})`;
      if (response.ok) {
        Object.assign(shipped, file);
        localStorage.removeItem(draft);
      }
    } catch (error) {
      this.status = `Couldn't save: ${String(error)}`;
    }
    this.rebuild();
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

    if (this.page === "items") {
      this.drawItem(ctx, width, height);
      return;
    }

    // The parts page with no hull to show: just the selected part, drawn as in game.
    if (this.page === "parts" && this.showOn === null) {
      const part = partOf(this.part);
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.scale(Math.min(width, height) / 40, Math.min(width, height) / 40);
      if (isDecal(part.id) || part.kind === "cockpit") drawDecal(ctx, part.id);
      else drawPart(ctx, part.kind, 0, part.engine !== undefined);
      ctx.restore();
      ctx.fillStyle = "#7f8ba0";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`${part.label}${isDecal(part.id) ? ", a decal" : ""}: drawn as in game, facing the nose`, 14, height - 14);
      return;
    }

    // The hull, with each mount's preview on it, layered and ordered as in game.
    const model = this.page === "parts" && this.showOn !== null ? this.showOn : this.model;
    const mounts = model === this.model ? this.mounts() : HULL_MOUNTS[model];
    const decal = (mount: Mount): PartId | null => this.previewOf(model, mount);
    const byOrder = (a: Mount, b: Mount) => (a.order ?? 0) - (b.order ?? 0);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.zoom, this.zoom);
    // Below the hull first, so only what sticks out past its edge shows, then the hull and the rest,
    // each layer in draw order, the way the game draws them.
    drawDecals(ctx, model, decal, "below");
    for (const mount of mounts.filter((each) => (each.order ?? 0) < 0).sort(byOrder)) this.drawPreview(ctx, model, mount);
    drawHull(ctx, model, [120, 150, 190]);
    drawDecals(ctx, model, decal, "above");
    // The bay's box, as in game: the bay the preview shows on its mount, or else the empty well.
    const spot = mounts.find((each) => each.types.includes("cargo bay"));
    if (spot) {
      const shown = this.previewOf(model, spot);
      const fit: Partial<Record<MountId, Module>> =
        shown && partOf(shown).kind === "section" ? { [spot.id]: { part: shown, wear: 0 } } : {};
      drawBay(ctx, bayBox({ model, fit }));
    }
    // The fuel tanks, full: what each preview shows on its mount, in its mount's transparency.
    const tanks: Partial<Record<MountId, Module>> = {};
    for (const mount of mounts) {
      if (!mount.types.includes("fuel tank")) continue;
      const shown = this.previewOf(model, mount);
      if (shown && mountTakes(mount, shown)) tanks[mount.id] = { part: shown, wear: 0 };
    }
    drawTanks(ctx, tankBoxes({ model, fit: tanks }, 1));
    for (const mount of mounts.filter((each) => (each.order ?? 0) >= 0).sort(byOrder)) this.drawPreview(ctx, model, mount);
    ctx.restore();

    // What each does, then the handles on top.
    const onParts = this.page === "parts";
    for (const mount of mounts) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const on = mount.id === this.selected && !onParts;
      const green = on ? "#8fe3a1" : "rgba(143,227,161,0.55)";
      if (mount.role) {
        const { push, turn } = mountThrust(mount);
        const turning = mount.role === "thrusterRotateLeft" || mount.role === "thrusterRotateRight";
        this.arrow(x, y, push.x, push.y, (on ? 60 : 34) * (turning ? Math.min(2, Math.max(0.15, Math.abs(turn))) : 1), green);
      }
      const shown = shownPart(model, mount);
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
    for (const mount of mounts) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const on = mount.id === this.selected && !onParts;
      const hover = mount.id === this.hover;
      const lit = onParts && mountTakes(mount, this.part) && partFits(partOf(this.part), model);
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
    ctx.fillText(`${MODEL_NAMES[model]}: nose to the right, one square a quarter of the ship's radius`, 14, height - 14);
  }

  /**
   * The part a mount's preview overlays: the one picked below "Bare hull comes with", or,
   * until one is, the part the bare hull comes with. A decal mount starts on the first decal
   * that fits it. "none" shows nothing.
   */
  private previewOf(model: ShipModel, mount: Mount): PartId | null {
    const chosen = this.preview[`${model}:${mount.id}`];
    if (chosen === "none") return null;
    if (chosen) return partFits(partOf(chosen), model) && mountTakes(mount, chosen) ? chosen : null;
    if (mount.decal) return decalChoices(model, mount)[0] ?? null;
    return mount.default && mountTakes(mount, mount.default) && partFits(partOf(mount.default), model) ? mount.default : null;
  }

  /** One mount's preview part, drawn on the blueprint as it shows in game, transparency and all. */
  private drawPreview(ctx: CanvasRenderingContext2D, model: ShipModel, mount: Mount): void {
    // A decal mount's preview is its decal, drawn with the hull's own decals; a cargo bay's is
    // its box, drawn with the bay. In game neither shows as a part of its own.
    if (mount.decal) return;
    const id = this.previewOf(model, mount);
    if (!id) return;
    const part = partOf(id);
    if (part.kind === "section" || part.kind === "tank") return;
    ctx.save();
    ctx.translate(mount.x * R, mount.y * R);
    ctx.rotate(facing(mount));
    ctx.scale(mount.scale, mount.scale);
    if ((mount.alpha ?? 1) < 1) ctx.globalAlpha = mount.alpha!;
    drawPart(ctx, part.kind, 0, part.engine !== undefined);
    ctx.restore();
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
