import {
  BODY_KINDS,
  PLACE_KINDS,
  closestApproach,
  pathTo,
  copyPositions,
  isBody,
  makeChild,
  orbitDistances,
  orbitShape,
  orbitSpeed,
  parentOf,
  parseWorld,
  positions,
  limitCarrying,
  spinAngle,
  stringifyWorld,
  HELD_PARTS,
  SHIP_CHOICES,
  SURFACES,
  walk,
  type NodeKind,
  type Surface,
  type World,
  type WorldNode,
} from "./world";
import { clampEccentricity, orbitEllipse, phaseToward } from "../kepler";
import { ITEMS } from "../items";
import { linkSummary, linkedNodes, useLayout, type GameLink, type ShipMarkKind } from "./link";
import { shippedWorld } from "./shipped";
import { type Route } from "../route";
import { FLIGHTS, tripBetween } from "./trips";
import { PARTS } from "../parts";

/** The game's zoom limits, for the screen boxes. */
const DEFAULT_ZOOM = 0.8;
const MAX_OUT_ZOOM = 0.35;
const DRAFT_KEY = "jam-world-draft";
/** Set once a draft from before carrying had a range has been given the default ranges. */
const CARRY_LIMITED_KEY = "jam-designer-carry-limited";
/** The settings groups the user has opened. All start closed. */
const GROUPS_KEY = "jam-designer-open";
/** Objects the user opened in the tree by hand. They stay open whatever is selected. */
const TREE_KEY = "jam-designer-tree-open";
/** Whether the other ships are shown on the map. */
const SHIPS_KEY = "jam-designer-ships";
/** Ships faster than this, units/s, get an arrow showing where they're going. */
const ARROW_SPEED = 500;
const SPEEDS = [1, 10, 60, 600, 3600, 36000];
const CLICK_PIXELS = 5;
/** Ships to time a route with, from the game's own numbers. */

const COLORS: Record<NodeKind, string> = {
  star: "#ffd56a",
  planet: "#6f9fd8",
  moon: "#a9b2c0",
  asteroid: "#9a8a74",
  anchor: "#7f8ba0",
  field: "#d8c37a",
  station: "#8fe3a1",
  "pirate base": "#ff7a6b",
};

const SHIP_COLORS: Record<ShipMarkKind, string> = {
  traffic: "#a8adb8",
  pirate: "#ff7a6b",
  defender: "#7ab8ff",
  drone: "#c99bff",
  hauler: "#ffb35c",
  "black market": "#e070c8",
};

const STYLE = `
#designer { position: fixed; inset: 0; z-index: 50; background: #05070d; display: flex; }
#designer[hidden] { display: none; }
#designer canvas { position: static; flex: 1; min-width: 0; height: 100%; cursor: grab; }
#designer canvas.dragging { cursor: grabbing; }
#designer .side { width: 340px; box-sizing: border-box; padding: 12px 14px; overflow-y: auto; background: #0b0f18; border-right: 1px solid #222a3a; }
#designer h1 { font-size: 15px; margin: 0 0 2px; color: #8fb4ff; letter-spacing: 2px; }
#designer h2 { font-size: 12px; margin: 16px 0 6px; color: #8fe3a1; text-transform: uppercase; letter-spacing: 1px; }
#designer h3.group { font-size: 12px; margin: 10px 0 2px; color: #8fb4ff; cursor: pointer; user-select: none; }
#designer h3.group::before { content: "▾  "; }
#designer h3.group.closed::before { content: "▸  "; }
#designer h3.group:hover { color: #b9cfff; }
#designer p { margin: 0 0 6px; color: #7f8ba0; }
#designer button, #designer select, #designer input { background: #1a2233; color: #cfd8e6; border: 1px solid #33405a; font: inherit; padding: 4px 7px; }
#designer button { cursor: pointer; margin: 0 4px 4px 0; }
#designer button:hover { background: #26324a; }
#designer button.danger { color: #e88a8a; border-color: #a84f4f; }
#designer .tree button { display: block; width: 100%; text-align: left; margin: 0 0 2px; border-color: transparent; background: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#designer .tree button.on { background: #26324a; border-color: #4a5b80; }
#designer .tree .kind { color: #6a7486; }
#designer .tree .fold { display: inline-block; width: 14px; color: #8fb4ff; }
#designer .tree .fold:hover { color: #ffffff; }
#designer .time label { display: inline; margin: 0; white-space: nowrap; }
#designer label { display: block; margin: 8px 0 0; }
#designer label input, #designer label select { width: 100%; box-sizing: border-box; margin-top: 2px; }
#designer .hint { display: block; color: #ffd479; font-size: 12px; min-height: 1em; }
#designer .row { display: flex; gap: 4px; margin-top: 8px; }
#designer .row select { flex: 1; }
#designer .pass { font-size: 12px; margin: 2px 0; }
#designer .pass.bad { color: #ff8a7c; }
#designer .pass.close { color: #f0d86a; }
#designer .pass.ok { color: #8fe3a1; }
#designer .status { color: #8fb4ff; min-height: 1.2em; }
#designer .time { position: absolute; left: 354px; bottom: 12px; display: flex; gap: 6px; align-items: center; color: #cfd8e6; }
#designer .time span { min-width: 150px; }
#designer .route { font-size: 12px; color: #9fd8ff; white-space: pre-line; margin-top: 6px; }
`;

function readableTime(seconds: number): string {
  const s = Math.abs(seconds);
  if (s === 0) return "still";
  const sign = seconds < 0 ? "-" : "";
  if (s < 120) return `${sign}${Math.round(s)} s`;
  if (s < 7200) return `${sign}${(s / 60).toFixed(1)} min`;
  if (s < 3 * 86400) return `${sign}${(s / 3600).toFixed(1)} h`;
  return `${sign}${(s / 86400).toFixed(1)} days`;
}

/** Which ships can still climb out where a pull is at full strength, flat out with no parts. */
function climbing(accel: number): string {
  if (accel <= 0) return "no pull";
  const floater = FLIGHTS.floater.flight.accel;
  const racer = FLIGHTS.racer.flight.accel;
  if (accel >= racer) return `nothing climbs out where it's full (Racer ${racer}, Floater ${floater})`;
  if (accel >= floater) return `the Racer climbs out where it's full, the Floater (${floater}) can't`;
  return `both ships climb out (Floater ${floater}, Racer ${racer})`;
}

function loadStrings(key: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage off: it's remembered until the page closes.
  }
}

function readableDistance(units: number): string {
  const u = Math.abs(units);
  if (u >= 1e6) return `${(units / 1e6).toFixed(2)} M`;
  if (u >= 1e4) return `${(units / 1e3).toFixed(1)} k`;
  return `${Math.round(units)}`;
}

/** An orbit's speed for the panel: one number for a circle, the closest and farthest points' for an ellipse. */
function readableSpeeds(node: WorldNode): string {
  const { near, far } = orbitSpeed(node);
  return node.eccentricity > 0 ? `${near.toFixed(1)} units/s at its closest, ${far.toFixed(1)} at its farthest` : `${near.toFixed(1)} units/s`;
}

/** What the panel says of an orbit's shape: how near and far it gets, and a warning if it dips into what it orbits. */
function readableShape(world: World, node: WorldNode, eccentricity: number): string {
  const shaped = { ...node, eccentricity };
  const { near, far } = orbitDistances(shaped);
  const parent = parentOf(world, node);
  const inside = parent !== null && near < parent.radius ? `. Its closest point is inside ${parent.name}` : "";
  return eccentricity > 0 ? `${readableDistance(near)} at its closest, ${readableDistance(far)} at its farthest; ${readableSpeeds(shaped)}${inside}` : `a circle${inside}`;
}

/** A clean number for the scale bar: 1, 2 or 5 times a power of ten. */
function niceLength(target: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const lead = target / power;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * power;
}

/**
 * A dev-only view for laying out the star system: a tree of bodies and places, their
 * sizes, orbits and spins, played forward in time, next to boxes the size of the game's
 * screen. Closing it hands the numbers the game knows about to the game (see link.ts).
 */
export class Designer {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tree: HTMLDivElement;
  private readonly editor: HTMLDivElement;
  private readonly passes: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly clock: HTMLSpanElement;
  private readonly playButton: HTMLButtonElement;
  private world: World;
  private selected: WorldNode;
  private follow: WorldNode | null;
  private t = 0;
  private playing = false;
  private speed = 600;
  private cx = 0;
  private cy = 0;
  /** Screen pixels per world unit. */
  private scale = 0.005;
  private lastFrame = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private passTimer = 0;
  /** Close passes being worked out a body a frame, so a click never waits on them. */
  private passJob: { selected: WorldNode; queue: WorldNode[]; rows: { name: string; gap: number; at: number }[] } | null = null;
  /** A right-button drag on the canvas: resizing the selected object, or turning its start angle with Shift. */
  private tweak: Record<string, never> | null = null;
  /** The place a route is previewed to from the selected object, and how it's flown. */
  private routeTo: WorldNode | null = null;
  private flightKind = "floater";
  private route: { route: Route; around: WorldNode } | null = null;
  private routeTimer = 0;
  private readonly routeBox: HTMLDivElement;
  private readonly routeText: HTMLDivElement;
  private readonly linkText: HTMLDivElement;
  private readonly openGroups = new Set<string>(loadStrings(GROUPS_KEY));
  /** The player's ship as of opening: its offset from the field, and the game's clock then. */
  private shipFix: { x: number; y: number; clock: number } | null = null;
  private followShip = false;
  /** Tree objects opened by hand: they stay open. */
  private readonly pinnedOpen = new Set<string>(loadStrings(TREE_KEY));
  /** Objects on the way to the selection that were closed by hand, until the selection changes. */
  private readonly closedOnPath = new Set<string>();
  private showShips = loadStrings(SHIPS_KEY).length > 0;

  constructor(
    private readonly onClose: () => void,
    private readonly game: GameLink,
  ) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);

    this.world = this.loadDraft() ?? shippedWorld();
    this.selected = walk(this.world).find((entry) => isBody(entry.node.kind) && entry.node !== this.world.root)?.node ?? this.world.root;
    this.follow = this.selected;

    this.element = document.createElement("div");
    this.element.id = "designer";
    this.element.hidden = true;
    const side = document.createElement("div");
    side.className = "side";
    this.tree = document.createElement("div");
    this.tree.className = "tree";
    this.editor = document.createElement("div");
    this.passes = document.createElement("div");
    this.routeBox = document.createElement("div");
    this.routeText = document.createElement("div");
    this.routeText.className = "route";
    this.status = document.createElement("div");
    this.status.className = "status";
    this.status.style.whiteSpace = "pre-line";
    this.linkText = document.createElement("div");
    this.linkText.className = "route";
    side.append(
      this.title("System designer", "h1"),
      this.text("Dev only. O or Esc goes back to the game, which picks up the changes."),
      this.button("Back to the game", () => this.close()),
      this.button("Find my ship", () => this.findShip()),
      this.linkText,
      this.title("Objects"),
      this.tree,
      this.editor,
      this.title("Route"),
      this.text("A trip from the selected object to another, aiming at where it will be on arrival and keeping out of the pull of the body they share. Live as time plays."),
      this.routeBox,
      this.routeText,
      this.title("Close passes"),
      this.text("Closest the selected object comes to each body's pull (or surface), over a full cycle."),
      this.passes,
      this.title("World file"),
      this.button("Save to file", () => void this.saveFile()),
      this.button("Load from file", () => void this.loadFile()),
      this.button("Warm up a start for new games", () => void this.warmStart()),
      this.button("Start over from the default layout", () => this.replace(shippedWorld()), "danger"),
      this.status,
    );

    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;

    const time = document.createElement("div");
    time.className = "time";
    this.playButton = this.button("Play", () => this.setPlaying(!this.playing));
    const speed = document.createElement("select");
    for (const value of SPEEDS) speed.append(new Option(`${value}x`, String(value), false, value === this.speed));
    speed.addEventListener("change", () => (this.speed = Number(speed.value)));
    this.clock = document.createElement("span");
    const ships = document.createElement("label");
    const shipsBox = document.createElement("input");
    shipsBox.type = "checkbox";
    shipsBox.checked = this.showShips;
    shipsBox.addEventListener("change", () => {
      this.showShips = shipsBox.checked;
      store(SHIPS_KEY, JSON.stringify(this.showShips ? ["on"] : []));
    });
    ships.title = `Other ships as the game has them now, cargo ships included. An arrow on any faster than ${ARROW_SPEED} units/s.`;
    ships.append(shipsBox, " Ships");
    time.append(this.playButton, speed, this.button("Time 0", () => (this.t = 0)), this.button("Game time", () => (this.t = this.game.clock())), ships, this.clock);

    this.element.append(side, this.canvas, time);
    document.body.append(this.element);
    this.listen();
    this.rebuild();
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.t = this.game.clock();
    const { ship, field } = this.game.where();
    this.shipFix = { x: ship.x - field.x, y: ship.y - field.y, clock: this.t };
    this.rebuild();
    this.element.hidden = false;
    this.lastFrame = performance.now();
    this.fitView();
    requestAnimationFrame((now) => this.frame(now));
  }

  close(): void {
    this.element.hidden = true;
    this.setPlaying(false);
    this.linkToGame();
    this.onClose();
  }

  /** The layout as text, as the game has it: for telling whether a start file fits it. */
  layoutText(): string {
    return stringifyWorld(this.world);
  }

  /** Hands the game this layout. */
  linkToGame(): void {
    useLayout(this.world, this.game);
    try {
      localStorage.setItem(DRAFT_KEY, stringifyWorld(this.world));
    } catch {
      // Storage off: the link still holds until the page is closed.
    }
  }

  // --- Small DOM helpers -------------------------------------------------------------

  private title(text: string, level: "h1" | "h2" = "h2"): HTMLElement {
    const element = document.createElement(level);
    element.textContent = text;
    return element;
  }

  private text(text: string): HTMLParagraphElement {
    const element = document.createElement("p");
    element.textContent = text;
    return element;
  }

  private button(text: string, onClick: () => void, className = ""): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  // --- State ------------------------------------------------------------------------

  private loadDraft(): World | null {
    try {
      const text = localStorage.getItem(DRAFT_KEY);
      const world = text ? parseWorld(text) : null;
      if (world) this.moveOldField(world);
      if (world && localStorage.getItem(CARRY_LIMITED_KEY) === null) {
        limitCarrying(world);
        localStorage.setItem(CARRY_LIMITED_KEY, "1");
      }
      return world;
    } catch {
      return null;
    }
  }

  /**
   * The first default layout had the field at 20,000, which puts the station through the
   * planet. A draft still holding those numbers gets the field moved out to the new default.
   */
  private moveOldField(world: World): void {
    const { field, planet } = linkedNodes(world);
    if (!field || field.orbitRadius !== 20000 || field.orbitPeriod !== 3600 || planet?.radius !== 12000) return;
    field.orbitRadius = 60000;
    field.orbitPeriod = 10800;
  }

  /** Every edit is kept in the browser at once, so a reload loses nothing. */
  private changed(): void {
    try {
      localStorage.setItem(DRAFT_KEY, stringifyWorld(this.world));
    } catch {
      // Storage off or full: the file buttons still work.
    }
    this.passTimer = 0.25;
    this.passJob = null;
  }

  private replace(world: World): void {
    this.world = world;
    this.selected = world.root.children[0] ?? world.root;
    this.follow = this.selected;
    this.changed();
    this.rebuild();
    this.fitView();
  }

  private async saveFile(): Promise<void> {
    try {
      const response = await fetch("/__world", { method: "POST", body: stringifyWorld(this.world) });
      this.status.textContent = response.ok ? "Saved to src/designer/world.json" : `Couldn't save (${response.status})`;
    } catch {
      this.status.textContent = "Couldn't save: run the game with npm run dev";
    }
  }

  /**
   * Saves the layout, then has the dev server run it for a while with no player and keep the
   * result as the world new games start in (npm run warm -- minutes seed --ship).
   */
  private async warmStart(): Promise<void> {
    const answer = window.prompt("Game minutes to run before a player joins (it takes about half a second each):", "60");
    if (answer === null) return;
    const minutes = Math.max(1, Math.round(Number(answer) || 60));
    try {
      await this.saveFile();
      this.status.textContent = `Warming up ${minutes} game minutes...`;
      const response = await fetch(`/__warm?minutes=${minutes}`, { method: "POST" });
      const report = await response.text();
      this.status.textContent = response.ok ? `${report.trim()}
Reload the page for new games to use it.` : `Couldn't warm up: ${report}`;
    } catch {
      this.status.textContent = "Couldn't warm up: run the game with npm run dev";
    }
  }

  /** Loads the shipped world file, or a layout a recipe saved (npm run layout -- name --save file). */
  private async loadFile(): Promise<void> {
    try {
      const layouts: string[] = await fetch("/__layouts").then((response) => (response.ok ? response.json() : []));
      let layout = "";
      if (layouts.length > 0) {
        const answer = window.prompt(`Load which? Leave empty for the shipped world.
Layouts: ${layouts.join(", ")}`, "");
        if (answer === null) return;
        layout = answer.trim();
      }
      const response = await fetch(layout ? `/__world?layout=${encodeURIComponent(layout)}` : "/__world");
      const world = response.ok ? parseWorld(await response.text()) : null;
      if (!world) {
        this.status.textContent = response.status === 404 ? "No such file" : "Couldn't read the world file";
        return;
      }
      this.replace(world);
      this.status.textContent = layout ? `Loaded src/designer/layouts/${layout}.json` : "Loaded src/designer/world.json";
    } catch {
      this.status.textContent = "Couldn't load: run the game with npm run dev";
    }
  }

  private setPlaying(on: boolean): void {
    this.playing = on;
    this.playButton.textContent = on ? "Pause" : "Play";
  }

  /** Frames the followed object with room for its orbit and children. */
  private fitView(): void {
    const node = this.follow ?? this.selected;
    const extent = Math.max(
      node.radius,
      isBody(node.kind) ? node.pull : 0,
      ...node.children.map((child) => orbitDistances(child).far + child.radius),
    );
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width > 0 && extent > 0) this.scale = (Math.min(width, height) * 0.45) / extent;
  }

  // --- Side panel -------------------------------------------------------------------

  private rebuild(): void {
    this.buildTree();
    this.buildEditor();
    this.buildRouteBox();
    this.linkText.textContent = linkSummary(this.world);
    this.passTimer = 0;
    this.passJob = null;
  }

  /**
   * The objects as a tree that folds: the selection and everything above it are open, and so
   * is whatever was opened by hand. The rest is closed.
   */
  private buildTree(): void {
    const onPath = new Set<string>();
    for (let at: WorldNode | null = this.selected; at; at = parentOf(this.world, at)) onPath.add(at.id);
    const isOpen = (node: WorldNode) => this.pinnedOpen.has(node.id) || (onPath.has(node.id) && !this.closedOnPath.has(node.id));
    const rows: HTMLButtonElement[] = [];
    const add = (node: WorldNode, depth: number) => {
      const button = this.button("", () => this.select(node));
      button.style.paddingLeft = `${6 + depth * 14}px`;
      button.className = node === this.selected ? "on" : "";
      const open = isOpen(node);
      const fold = document.createElement("span");
      fold.className = "fold";
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = `  ${node.kind}`;
      if (node.children.length > 0) {
        fold.textContent = open ? "▾" : "▸";
        fold.title = open ? "Close" : "Open";
        if (!open) kind.textContent += ` (${node.children.length})`;
        fold.addEventListener("click", (event) => {
          event.stopPropagation();
          this.toggleOpen(node, !open, onPath.has(node.id));
        });
      }
      button.append(fold, node.name, kind);
      rows.push(button);
      if (open) for (const child of node.children) add(child, depth + 1);
    };
    add(this.world.root, 0);
    this.tree.replaceChildren(...rows);
  }

  /** Opening by hand sticks. Closing one above the selection holds until the selection changes. */
  private toggleOpen(node: WorldNode, open: boolean, onPath: boolean): void {
    if (open) {
      this.pinnedOpen.add(node.id);
      this.closedOnPath.delete(node.id);
    } else {
      this.pinnedOpen.delete(node.id);
      if (onPath) this.closedOnPath.add(node.id);
    }
    store(TREE_KEY, JSON.stringify([...this.pinnedOpen]));
    this.buildTree();
  }

  private buildRouteBox(): void {
    const places = walk(this.world)
      .map((entry) => entry.node)
      .filter((node) => node !== this.selected && node !== this.world.root);
    if (this.routeTo && !places.includes(this.routeTo)) this.routeTo = null;
    const to = document.createElement("select");
    to.append(new Option("(no route)", ""));
    for (const node of places) to.append(new Option(`to ${node.name}`, node.id, false, node === this.routeTo));
    to.addEventListener("change", () => {
      this.routeTo = places.find((node) => node.id === to.value) ?? null;
      this.routeTimer = 0;
    });
    const ship = document.createElement("select");
    for (const [key, { label }] of Object.entries(FLIGHTS)) ship.append(new Option(label, key, false, key === this.flightKind));
    ship.addEventListener("change", () => {
      this.flightKind = ship.value;
      this.routeTimer = 0;
    });
    const row = document.createElement("div");
    row.className = "row";
    row.append(to, ship);
    this.routeBox.replaceChildren(row);
    this.routeTimer = 0;
  }

  private updateRoute(): void {
    const target = this.routeTo;
    if (!target || target === this.selected) {
      this.route = null;
      this.routeText.textContent = "";
      return;
    }
    const { route, around } = tripBetween(this.world, this.selected, target, this.t, FLIGHTS[this.flightKind].flight);
    const blocks = isBody(around.kind) && this.selected !== around && target !== around;
    this.route = { route, around };
    const what = around.pull > around.radius ? "pull" : "surface";
    const lines = [
      `Trip ${readableTime(route.arrive - route.depart)}, ${readableDistance(route.path.length)} units`,
      route.matching > 1 ? `  of which ${readableTime(route.matching)} is matching the target's speed` : "",
      route.path.bends
        ? `Goes round ${around.name}, keeping out of its ${what}`
        : blocks
          ? `Straight: ${around.name} isn't in the way`
          : `Straight, worked out relative to ${around.name}`,
      route.path.clipped ? `An end is inside ${around.name}'s ${what}, so it only keeps clear of what fits` : "",
      route.settled ? "" : "Doesn't settle: the target keeps running away from this ship",
    ];
    this.routeText.textContent = lines.filter(Boolean).join("\n");
  }

  private select(node: WorldNode): void {
    if (node !== this.selected) this.closedOnPath.clear();
    this.selected = node;
    this.rebuild();
    // Paint the selection first: the close passes take a second to work out, and start a beat later.
    this.passTimer = 0.2;
    // Picked on the map, it may be far down the tree.
    this.tree.querySelector("button.on")?.scrollIntoView({ block: "nearest" });
  }

  /** How big a distance looks in the game, measured in screens. */
  private screens(units: number): string {
    const { innerWidth } = window;
    const near = (units * DEFAULT_ZOOM) / innerWidth;
    const far = (units * MAX_OUT_ZOOM) / innerWidth;
    return `${near.toFixed(1)} screens wide (${far.toFixed(1)} zoomed out)`;
  }

  private buildEditor(): void {
    const node = this.selected;
    const isRoot = node === this.world.root;
    const body = isBody(node.kind);
    const parts: HTMLElement[] = [this.title(node.name)];

    const name = document.createElement("input");
    name.value = node.name;
    name.addEventListener("change", () => {
      node.name = name.value;
      this.changed();
      this.rebuild();
    });
    parts.push(this.labelled("Name", name));

    const kind = document.createElement("select");
    for (const value of [...BODY_KINDS, ...PLACE_KINDS]) kind.append(new Option(value, value, false, value === node.kind));
    kind.addEventListener("change", () => {
      node.kind = kind.value as NodeKind;
      this.changed();
      this.rebuild();
    });
    parts.push(this.labelled("Kind (bodies are solid and filled; the rest are places)", kind));

    const fixedSize = node.kind === "station" || node.kind === "pirate base";
    const size: HTMLElement[] = [
      fixedSize
        ? this.text("Drawn at the game's own size. The circle on the map is only a guide.")
        : this.number(node, "radius", body ? "Radius (surface)" : "Radius (size)", (v) => `${this.screens(v * 2)} across`),
    ];
    if (body) {
      const surface = document.createElement("select");
      const meanings: Record<Surface, string> = { none: "nothing: not solid", damage: "a knock, hurting by speed like a rock", death: "death" };
      for (const value of SURFACES) surface.append(new Option(meanings[value], value, false, value === node.surface));
      surface.addEventListener("change", () => {
        node.surface = surface.value as Surface;
        this.changed();
      });
      size.push(
        this.labelled("Touching the ground means", surface),
        this.number(node, "atmosphere", "Air reaches out to (from the centre, 0 for none)", (v) => (v > node.radius ? `${readableDistance(v - node.radius)} deep` : "no air")),
        this.number(node, "burnSpeed", "Burns in the air above this speed, units/s", (v) => (v > 0 ? `faster than ${v} against the ground glows and hurts` : "any speed burns")),
      );
    }
    parts.push(...this.group(body ? "Size, ground and air" : "Size", size));
    if (body) {
      parts.push(
        ...this.group("Pull", [
          this.number(node, "pull", "Pull starts at (from the centre, 0 for none)", (v) => (v > 0 ? `${readableDistance(v - node.radius)} beyond the surface` : "no pull")),
          this.number(node, "pullFull", "Pull is full from here down (from the centre)", (v) => (v > node.radius ? `${readableDistance(v - node.radius)} above the surface` : "full only at the surface")),
          this.number(node, "pullAccel", "Full pull, units/s²", (v) => climbing(v)),
        ]),
      );
    }
    const orbit: HTMLElement[] = [];
    if (!isRoot) {
      orbit.push(
        this.number(node, "orbitRadius", "Orbit radius (from the parent's centre)", (v) => `${readableDistance(v)}; ${readableDistance(v - (parentOf(this.world, node)?.radius ?? 0))} from its surface`),
        this.number(node, "orbitPeriod", "Orbit period, seconds (negative goes the other way)", (v) => `${readableTime(v)} per orbit, ${readableSpeeds({ ...node, orbitPeriod: v })}`),
        this.number(node, "eccentricity", "Eccentricity (0 is a circle, up to 0.9; the parent is at a focus)", (v) => readableShape(this.world, node, clampEccentricity(v))),
        this.number(node, "periapsisAngle", "Closest point's direction from the parent, degrees", () => ""),
        this.number(node, "orbitPhase", "Start angle on the orbit, degrees", () => ""),
      );
    }
    orbit.push(
      this.number(node, "spinPeriod", "Spin period, seconds (negative turns the other way)", (v) => `${readableTime(v)} per turn`),
      this.number(node, "spinPhase", "Spin start angle, degrees (the turn at time 0)", () => ""),
    );
    parts.push(...this.group(isRoot ? "Spin" : "Orbit and spin", orbit));
    if (node.kind === "field") {
      parts.push(
        ...this.group("Rocks", [
          this.number(node, "rocks", "How many rocks", (v) => `${Math.floor(v)} at the start of a new game`),
          this.number(node, "rockDrift", "Rock drift at the start, units/s", (v) => (v > 0 ? `up to ${v} units/s each` : "they start still")),
          this.number(node, "rockInflow", "Big rocks drifting in, per minute", (v) => (v > 0 ? `about one every ${readableTime(60 / v)}` : "none")),
        ]),
        ...this.group("Drops", this.itemRows(node.drops, "chance", (item) => ({ item, chance: 0.2 }), (next) => (node.drops = next), "Items this field's rocks drop as well as plain ore. Each is rolled once for every ore roll of a broken rock, loose in space for the player to fly through.")),
      );
    }
    if (node.kind === "field" || node.kind === "station" || node.kind === "pirate base") {
      parts.push(
        ...this.group("Carrying", [
          this.text("What moves with this place. Nearest place first; past its full range its share fades and mixes with others."),
          this.number(node, "carryFull", "Fully carried within (from its edge)", (v) => `${readableDistance(v)} from its edge`),
          this.number(node, "carryNone", "Not carried beyond (0: everywhere)", (v) => (v > 0 ? `fades out by ${readableDistance(v)} from its edge` : "carries everything, everywhere")),
        ]),
      );
    }
    if (node.kind === "station") {
      const flag = (key: "shipyard" | "projects" | "radio", text: string) => {
        const toggle = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = node[key];
        box.addEventListener("change", () => {
          node[key] = box.checked;
          this.changed();
        });
        toggle.append(box, ` ${text}`);
        return toggle;
      };
      const storage = this.number(node, "storage", "Storage (cells)", (v) => `${Math.max(0, Math.floor(v))} cells for lockers and spare modules`);
      const storageInput = storage.querySelector("input")!;
      storageInput.min = "0";
      storageInput.step = "10";
      const held = HELD_PARTS.map((id) => {
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = node.blueprints.includes(id);
        check.addEventListener("change", () => {
          node.blueprints = check.checked ? [...node.blueprints, id] : node.blueprints.filter((each) => each !== id);
          this.changed();
        });
        label.append(check, ` Holds the ${PARTS.find((part) => part.id === id)!.label.toLowerCase()} blueprint`);
        return label;
      });
      parts.push(
        ...this.group("Station", [
          this.text("Every station is a base with its own shop. Wrecked ships are rebuilt at the nearest station with a shipyard. Nobody sells a held blueprint: only a station that holds one sells that part."),
          flag("shipyard", "Shipyard"),
          storage,
          ...held,
        ]),
        ...this.group("Projects and radio", [
          this.text("A station that builds projects can fund a deposit by its field and turrets for itself and the deposit, from its own money and parts. One on the radio announces new blueprints and finished projects."),
          flag("projects", "Builds projects"),
          flag("radio", "On the radio"),
          this.number(node, "guardCount", "Turrets, once built", (v) => `${Math.max(0, Math.floor(v))} turrets in front of the station`),
          this.number(node, "guardArc", "Turrets' arc (degrees)", (v) => `spread over ${v}° facing its field`),
          this.number(node, "guardDistance", "Turrets' distance", (v) => `${readableDistance(v)} out from the station`),
        ]),
        ...this.group("Starting items", this.itemRows(node.items, "n", (item) => ({ item, n: 1 }), (next) => (node.items = next), "Items in this station's store when a new game begins. They come from nowhere.")),
      );
    }
    if (!isRoot && !body) {
      const boxes = SHIP_CHOICES.map((ship) => {
        const toggle = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = node.spawns.includes(ship);
        box.addEventListener("change", () => {
          node.spawns = SHIP_CHOICES.filter((each) => (each === ship ? box.checked : node.spawns.includes(each)));
          this.changed();
          this.linkText.textContent = linkSummary(this.world);
        });
        toggle.append(box, ` the ${ship[0].toUpperCase()}${ship.slice(1)}`);
        return toggle;
      });
      parts.push(
        ...this.group("New game start", [this.text("A new game with this ship starts here. With several places for one ship, one is picked at random."), ...boxes]),
      );
    }
    if (!isRoot) {
      parts.push(
        ...this.group("Copies", [
          this.number(node, "count", "How many in this orbit, itself included", (v) => (v > 1 ? `${Math.floor(v) - 1} copies, without children` : "just this one")),
          this.number(node, "angleVariance", "Scatter round the orbit, % of half the gap", (v) => (v > 0 ? "each copy wanders from even spacing" : "evenly spaced")),
          this.number(node, "orbitVariance", "Scatter in and out, % of the orbit", (v) => (v > 0 ? `orbits from ${readableDistance(node.orbitRadius * (1 - v / 100))} to ${readableDistance(node.orbitRadius * (1 + v / 100))}` : "all on this orbit")),
        ]),
      );
    }

    const addKind = document.createElement("select");
    for (const value of [...BODY_KINDS, ...PLACE_KINDS]) addKind.append(new Option(value, value));
    addKind.value = node.kind === "star" ? "planet" : node.kind === "planet" ? "moon" : "anchor";
    const row = document.createElement("div");
    row.className = "row";
    row.append(
      addKind,
      this.button("Add child", () => {
        const child = makeChild(this.world, node, addKind.value as NodeKind);
        node.children.push(child);
        this.selected = child;
        this.changed();
        this.rebuild();
      }),
    );
    parts.push(row);
    const actions = document.createElement("div");
    actions.className = "row";
    actions.append(
      this.button("Follow", () => {
        this.follow = node;
        this.followShip = false;
        this.fitView();
      }),
    );
    if (!isRoot) {
      actions.append(
        this.button(
          "Delete with children",
          () => {
            const parent = parentOf(this.world, node)!;
            parent.children = parent.children.filter((child) => child !== node);
            if (this.follow && !walk(this.world).some((entry) => entry.node === this.follow)) this.follow = parent;
            this.selected = parent;
            this.changed();
            this.rebuild();
          },
          "danger",
        ),
      );
    }
    parts.push(actions);
    this.editor.replaceChildren(...parts);
  }

  /** A heading that opens and closes its settings, like the game's own panel. Remembered. */
  /**
   * A list of an item and a number per row, to add to and take from: a field's drops (the number
   * is a chance on each ore roll, 0 to 1) or a station's starting items (the number is how many).
   * The items are the ones in src/items.json.
   */
  private itemRows<T extends { item: string }>(
    list: T[],
    number: "chance" | "n",
    make: (item: string) => T,
    set: (next: T[]) => void,
    hint: string,
  ): HTMLElement[] {
    const rows: HTMLElement[] = [this.text(hint)];
    if (ITEMS.length === 0) return [...rows, this.text("No items yet: add some on the hull designer's Items page (H).")];
    list.forEach((entry, index) => {
      const row = document.createElement("div");
      const pick = document.createElement("select");
      for (const item of ITEMS) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        pick.append(option);
      }
      pick.value = entry.item;
      pick.addEventListener("change", () => {
        set(list.map((each, at) => (at === index ? { ...each, item: pick.value } : each)));
        this.changed();
      });
      const input = document.createElement("input");
      input.type = "number";
      input.step = number === "chance" ? "0.05" : "1";
      input.min = number === "chance" ? "0" : "1";
      if (number === "chance") input.max = "1";
      input.value = String((entry as unknown as Record<string, number>)[number]);
      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (input.value === "" || !Number.isFinite(value)) return;
        const clamped = number === "chance" ? Math.max(0, Math.min(1, value)) : Math.max(1, Math.floor(value));
        set(list.map((each, at) => (at === index ? { ...each, [number]: clamped } : each)));
        this.changed();
      });
      row.append(pick, input, this.button("×", () => (set(list.filter((_, at) => at !== index)), this.changed(), this.rebuild()), "danger"));
      rows.push(row);
    });
    rows.push(this.button("+ item", () => (set([...list, make(ITEMS[0].id)]), this.changed(), this.rebuild())));
    return rows;
  }

  private group(title: string, fields: HTMLElement[]): HTMLElement[] {
    const heading = document.createElement("h3");
    const body = document.createElement("div");
    body.append(...fields);
    const show = () => {
      const open = this.openGroups.has(title);
      heading.className = open ? "group" : "group closed";
      body.hidden = !open;
    };
    heading.textContent = title;
    heading.addEventListener("click", () => {
      if (this.openGroups.has(title)) this.openGroups.delete(title);
      else this.openGroups.add(title);
      store(GROUPS_KEY, JSON.stringify([...this.openGroups]));
      show();
    });
    show();
    return [heading, body];
  }

  /** Centres the view on the player's ship, close enough to see the game's screen around it. */
  private findShip(): void {
    this.follow = null;
    this.followShip = true;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width > 0) this.scale = Math.min(width / (window.innerWidth / MAX_OUT_ZOOM), height / (window.innerHeight / MAX_OUT_ZOOM)) * 0.5;
  }

  /** Where the ship is at the time shown, carried by the field as it is in the game. */
  private shipSpot(at: Map<WorldNode, { x: number; y: number }>): { x: number; y: number } | null {
    const { field } = linkedNodes(this.world);
    const centre = field && at.get(field);
    if (!this.shipFix || !field || !centre) return null;
    const turn = spinAngle(field, this.t) - spinAngle(field, this.shipFix.clock);
    const { x, y } = this.shipFix;
    return { x: centre.x + x * Math.cos(turn) - y * Math.sin(turn), y: centre.y + x * Math.sin(turn) + y * Math.cos(turn) };
  }

  private labelled(text: string, input: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    label.append(text, input);
    return label;
  }

  private number(
    node: WorldNode,
    key:
      | "radius"
      | "pull"
      | "pullFull"
      | "pullAccel"
      | "atmosphere"
      | "burnSpeed"
      | "orbitRadius"
      | "eccentricity"
      | "periapsisAngle"
      | "orbitPeriod"
      | "orbitPhase"
      | "spinPeriod"
      | "spinPhase"
      | "count"
      | "angleVariance"
      | "orbitVariance"
      | "rocks"
      | "rockDrift"
      | "rockInflow"
      | "carryFull"
      | "carryNone"
      | "storage"
      | "guardCount"
      | "guardArc"
      | "guardDistance",
    text: string,
    hint: (value: number) => string,
  ): HTMLLabelElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(node[key]);
    const help = document.createElement("span");
    help.className = "hint";
    help.textContent = hint(node[key]);
    input.addEventListener("input", () => {
      let value = Number(input.value);
      if (input.value === "" || !Number.isFinite(value)) return;
      // An orbit has to stay an ellipse.
      if (key === "eccentricity") value = clampEccentricity(value);
      node[key] = value;
      help.textContent = hint(value);
      this.changed();
    });
    const label = this.labelled(text, input);
    label.append(help);
    return label;
  }

  /** Starts the close passes for the selected object against every body it isn't part of. */
  private updatePasses(): void {
    const selected = this.selected;
    // Its own children orbit inside it on purpose, and a body's own parents are the frame it moves in.
    const queue = walk(this.world)
      .map((entry) => entry.node)
      .filter((node) => node !== selected && isBody(node.kind) && !pathTo(this.world, node).includes(selected));
    this.passJob = { selected, queue, rows: [] };
    if (queue.length === 0) this.stepPasses();
  }

  /** One body's pass per frame (each can take tens of milliseconds), then the list. */
  private stepPasses(): void {
    const job = this.passJob;
    if (!job) return;
    if (job.selected !== this.selected) {
      this.passJob = null;
      return;
    }
    const node = job.queue.shift();
    if (node) job.rows.push({ name: node.name, ...closestApproach(this.world, node, job.selected) });
    if (job.queue.length > 0) return;
    this.passJob = null;
    const rows = job.rows.sort((a, b) => a.gap - b.gap).slice(0, 6);
    if (rows.length === 0) {
      this.passes.replaceChildren(this.text("No bodies to pass."));
      return;
    }
    this.passes.replaceChildren(
      ...rows.map(({ name, gap, at }) => {
        const line = document.createElement("div");
        const screen = window.innerWidth / MAX_OUT_ZOOM;
        line.className = `pass ${gap < 0 ? "bad" : gap < screen ? "close" : "ok"}`;
        line.textContent =
          gap < 0
            ? `${name}: inside by ${readableDistance(-gap)} (at ${readableTime(at)})`
            : `${name}: clear by ${readableDistance(gap)} (closest at ${readableTime(at)})`;
        return line;
      }),
    );
  }

  // --- Input ------------------------------------------------------------------------

  private listen(): void {
    window.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if (event.code === "Escape" || (event.code === "KeyO" && !typing)) {
        event.preventDefault();
        this.close();
      } else if (event.code === "Space" && !typing) {
        event.preventDefault();
        this.setPlaying(!this.playing);
      }
    });
    // Right button: no browser menu, the drag changes the selected object instead.
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button === 2) {
        event.preventDefault();
        this.startTweak();
      } else if (event.button === 0) {
        this.drag = { x: event.clientX, y: event.clientY, moved: false };
      }
    });
    window.addEventListener("mousemove", (event) => {
      if (this.tweak && this.isOpen) this.moveTweak(event);
      if (!this.drag || !this.isOpen) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < CLICK_PIXELS) return;
      if (!this.drag.moved) {
        // Grabbing the view lets go of whatever it followed, from where it is now.
        this.drag.moved = true;
        this.canvas.classList.add("dragging");
        this.followShip = false;
        if (this.follow) {
          const at = positions(this.world, this.t).get(this.follow)!;
          this.cx = at.x;
          this.cy = at.y;
          this.follow = null;
        }
      }
      this.cx -= dx / this.scale;
      this.cy -= dy / this.scale;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    window.addEventListener("mouseup", (event) => {
      if (event.button === 2) this.tweak = null;
      if (!this.drag || event.button !== 0) return;
      const clicked = !this.drag.moved;
      this.drag = null;
      this.canvas.classList.remove("dragging");
      if (clicked && event.target === this.canvas) {
        const hit = this.hit(event.offsetX, event.offsetY);
        if (hit) this.select(hit);
      }
    });
    this.canvas.addEventListener("dblclick", (event) => {
      const hit = this.hit(event.offsetX, event.offsetY);
      if (hit) {
        this.follow = hit;
        this.followShip = false;
        this.select(hit);
      }
    });
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
        const next = Math.min(20, Math.max(1e-7, this.scale * factor));
        if (!this.follow && !this.followShip) {
          // Keep the point under the mouse where it is.
          const { width, height } = this.canvas.getBoundingClientRect();
          const wx = this.cx + (event.offsetX - width / 2) / this.scale;
          const wy = this.cy + (event.offsetY - height / 2) / this.scale;
          this.cx = wx - (event.offsetX - width / 2) / next;
          this.cy = wy - (event.offsetY - height / 2) / next;
        }
        this.scale = next;
      },
      { passive: false },
    );
  }

  /** Where the mouse is on the canvas, in its pixels. */
  private canvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private startTweak(): void {
    if (!positions(this.world, this.t).get(this.selected)) return;
    this.tweak = {};
  }

  /**
   * Right-drag: the selected object's orbit radius becomes the distance from its parent (as
   * drawn now) to the mouse. With Shift, its start angle is set so it sits towards the mouse
   * as seen from its parent at the time shown (on an ellipse, that's by its mean longitude). An object with no parent does nothing.
   */
  private moveTweak(event: MouseEvent): void {
    const node = this.selected;
    if (!this.tweak) return;
    const at = positions(this.world, this.t);
    const parent = parentOf(this.world, node);
    const from = parent && at.get(parent);
    if (!parent || !from) return;
    const mouse = this.canvasPoint(event);
    if (event.shiftKey) {
      const origin = this.toScreen(from.x, from.y);
      const pointing = Math.atan2(mouse.y - origin.y, mouse.x - origin.x);
      // The orbit has turned on since time 0, and the start angle is where it began.
      const degrees = (phaseToward(pointing, this.t, orbitShape(node)) * 180) / Math.PI;
      node.orbitPhase = Math.round((((degrees % 360) + 360) % 360) * 10) / 10;
    } else {
      const origin = this.toScreen(from.x, from.y);
      node.orbitRadius = Math.max(1, Math.round(Math.hypot(mouse.x - origin.x, mouse.y - origin.y) / this.scale));
    }
    this.changed();
    // The panel's fields show the new numbers.
    this.buildEditor();
  }

  /** The object under a screen point: the smallest one whose circle (or a 10 px dot) contains it. */
  private hit(sx: number, sy: number): WorldNode | null {
    const at = positions(this.world, this.t);
    let best: WorldNode | null = null;
    let bestSize = Infinity;
    for (const [node, pos] of at) {
      const p = this.toScreen(pos.x, pos.y);
      const r = Math.max(10, node.radius * this.scale);
      if (Math.hypot(sx - p.x, sy - p.y) <= r && node.radius < bestSize) {
        best = node;
        bestSize = node.radius;
      }
    }
    return best;
  }

  // --- Drawing ----------------------------------------------------------------------

  private width = 0;
  private height = 0;

  private toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.width / 2 + (x - this.cx) * this.scale, y: this.height / 2 + (y - this.cy) * this.scale };
  }

  private frame(now: number): void {
    if (!this.isOpen) return;
    const seconds = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.playing) this.t += seconds * this.speed;
    if (this.passTimer > 0) {
      this.passTimer -= seconds;
      if (this.passTimer <= 0) {
        this.passTimer = -1;
        this.updatePasses();
      }
    } else if (this.passTimer === 0) {
      this.passTimer = -1;
      this.updatePasses();
    }
    this.stepPasses();
    this.routeTimer -= seconds;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.1;
      this.updateRoute();
    }
    this.clock.textContent = `t = ${readableTime(this.t)}`;
    this.draw();
    requestAnimationFrame((next) => this.frame(next));
  }

  private draw(): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, this.width, this.height);

    const at = positions(this.world, this.t);
    if (this.follow) {
      const pos = at.get(this.follow);
      if (pos) {
        this.cx = pos.x;
        this.cy = pos.y;
      } else {
        this.follow = null;
      }
    }
    const ship = this.shipSpot(at);
    if (this.followShip && ship) {
      this.cx = ship.x;
      this.cy = ship.y;
    }
    const entries = walk(this.world);
    const diagonal = Math.hypot(this.width, this.height);
    const ring = (x: number, y: number, r: number) => {
      const p = this.toScreen(x, y);
      const pr = r * this.scale;
      const centre = Math.hypot(p.x - this.width / 2, p.y - this.height / 2);
      // Skip rings too small to see or wholly off screen, either outside it or around it.
      if (pr < 1 || centre - pr > diagonal || pr - centre > diagonal) return false;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
      return true;
    };

    // Orbits.
    ctx.lineWidth = 1;
    for (const { node, parent } of entries) {
      if (!parent) continue;
      const p = at.get(parent)!;
      // An ellipse has its parent at a focus, so it's centred off to one side.
      const shape = orbitEllipse(orbitShape(node));
      const centre = this.toScreen(p.x + shape.cx, p.y + shape.cy);
      const far = shape.a * this.scale;
      const away = Math.hypot(centre.x - this.width / 2, centre.y - this.height / 2);
      if (far < 1 || away - far > diagonal || far - away > diagonal) continue;
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, far, shape.b * this.scale, shape.rotation, 0, Math.PI * 2);
      ctx.strokeStyle = node === this.selected ? "rgba(143, 180, 255, 0.6)" : "rgba(143, 180, 255, 0.16)";
      ctx.stroke();
    }

    // Air.
    for (const { node } of entries) {
      if (!isBody(node.kind) || node.atmosphere <= node.radius) continue;
      const p = at.get(node)!;
      if (!ring(p.x, p.y, node.atmosphere)) continue;
      ctx.fillStyle = "rgba(120, 170, 235, 0.08)";
      ctx.fill();
    }

    // Pull zones: where it starts, and where it's full.
    ctx.setLineDash([8, 6]);
    for (const { node } of entries) {
      if (!isBody(node.kind) || node.pullAccel <= 0) continue;
      const p = at.get(node)!;
      if (node.pull > node.radius && ring(p.x, p.y, node.pull)) {
        ctx.fillStyle = "rgba(255, 110, 80, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 110, 80, 0.45)";
        ctx.stroke();
      }
      if (node.pullFull > node.radius && node.pullFull < node.pull && ring(p.x, p.y, node.pullFull)) {
        ctx.fillStyle = "rgba(255, 110, 80, 0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 110, 80, 0.7)";
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Bodies and places.
    for (const { node } of entries) {
      const pos = at.get(node)!;
      const p = this.toScreen(pos.x, pos.y);
      const pr = node.radius * this.scale;
      const color = COLORS[node.kind];
      if (p.x < -pr - 50 || p.y < -pr - 50 || p.x > this.width + pr + 50 || p.y > this.height + pr + 50) continue;
      if (pr < 3) {
        ctx.fillStyle = color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      } else if (isBody(node.kind)) {
        if (ring(pos.x, pos.y, node.radius)) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (Math.hypot(p.x - this.width / 2, p.y - this.height / 2) < pr) {
          // Zoomed in so far that the surface is off screen all round: all of it is body.
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(0, 0, this.width, this.height);
          ctx.globalAlpha = 1;
        }
      } else if (ring(pos.x, pos.y, node.radius)) {
        ctx.setLineDash(node.kind === "anchor" ? [3, 5] : node.kind === "field" ? [10, 6] : []);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
      // A line from the centre shows the spin.
      if (pr > 8 && node.spinPeriod !== 0) {
        const angle = spinAngle(node, this.t);
        const length = Math.min(pr, diagonal);
        ctx.strokeStyle = isBody(node.kind) ? "rgba(5, 7, 13, 0.6)" : color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(angle) * length, p.y + Math.sin(angle) * length);
        ctx.stroke();
      }
      if (node === this.selected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(pr, 3) + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    this.drawCarrying(at, ring);

    // Labels, once they have room to be told apart.
    ctx.font = "12px ui-monospace, Consolas, monospace";
    for (const { node, parent } of entries) {
      const spread = parent ? node.orbitRadius * this.scale : Infinity;
      if (node !== this.selected && spread < 40) continue;
      const pos = at.get(node)!;
      const p = this.toScreen(pos.x, pos.y);
      if (p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
      const pr = Math.max(4, Math.min(node.radius * this.scale, 40));
      ctx.fillStyle = node === this.selected ? "#ffffff" : COLORS[node.kind];
      ctx.fillText(node.name, p.x + pr * 0.7 + 4, p.y - pr * 0.7 - 4);
    }

    // Copies: the same thing again round the same parent, fainter.
    for (const [node, spots] of copyPositions(this.world, this.t, at)) {
      ctx.fillStyle = COLORS[node.kind];
      ctx.strokeStyle = COLORS[node.kind];
      ctx.globalAlpha = 0.6;
      for (const spot of spots) {
        const p = this.toScreen(spot.x, spot.y);
        const pr = node.radius * this.scale;
        if (p.x < -pr - 50 || p.y < -pr - 50 || p.x > this.width + pr + 50 || p.y > this.height + pr + 50) continue;
        if (pr < 3) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        else if (!ring(spot.x, spot.y, node.radius)) continue;
        else if (isBody(node.kind)) ctx.fill();
        else ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (ship) {
      const p = this.toScreen(ship.x, ship.y);
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.fillText("You", p.x + 12, p.y - 10);
    }

    if (this.showShips) this.drawShips(at);
    this.drawRoute(at);
    this.drawScreenBoxes();
    this.drawScaleBar();
  }

  /** While the Carrying group is open: how far the selected place carries, as rings from its edge. */
  private drawCarrying(at: Map<WorldNode, { x: number; y: number }>, ring: (x: number, y: number, r: number) => boolean): void {
    const node = this.selected;
    if (!this.openGroups.has("Carrying")) return;
    if (node.kind !== "field" && node.kind !== "station" && node.kind !== "pirate base") return;
    const pos = at.get(node);
    if (!pos) return;
    const { ctx } = this;
    const rings: [number, string, string][] = [[node.carryFull, "fully carried", "rgba(120, 230, 160, 0.9)"]];
    if (node.carryNone > 0) rings.push([node.carryNone, "carried to nothing", "rgba(255, 200, 90, 0.9)"]);
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1.5;
    for (const [reach, label, color] of rings) {
      const r = node.radius + reach;
      if (!(r > 0) || !ring(pos.x, pos.y, r)) continue;
      ctx.strokeStyle = color;
      ctx.stroke();
      const top = this.toScreen(pos.x, pos.y - r);
      if (top.x > 0 && top.y > 12 && top.x < this.width && top.y < this.height) {
        ctx.fillStyle = color;
        ctx.fillText(`${label}: ${readableDistance(reach)} from the edge`, top.x + 6, top.y - 4);
      }
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  /**
   * The game's other ships, as they are in the game now. The game's frame is centred on what
   * the field orbits, so they hang from that. A dot each, and an arrow on the fast ones.
   */
  private drawShips(at: Map<WorldNode, { x: number; y: number }>): void {
    const { ctx } = this;
    const { field } = linkedNodes(this.world);
    const centre = at.get((field && parentOf(this.world, field)) ?? this.world.root);
    if (!centre) return;
    ctx.lineWidth = 1;
    for (const ship of this.game.ships()) {
      const p = this.toScreen(centre.x + ship.x, centre.y + ship.y);
      if (p.x < -60 || p.y < -60 || p.x > this.width + 60 || p.y > this.height + 60) continue;
      const color = SHIP_COLORS[ship.kind];
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed <= ARROW_SPEED) continue;
      // Longer the faster, but slowly: each doubling of speed adds 8 px.
      const length = 12 + 8 * Math.log2(speed / ARROW_SPEED);
      const ux = ship.vx / speed;
      const uy = ship.vy / speed;
      const tx = p.x + ux * length;
      const ty = p.y + uy * length;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.moveTo(tx - ux * 4 - uy * 3, ty - uy * 4 + ux * 3);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx - ux * 4 + uy * 3, ty - uy * 4 - ux * 3);
      ctx.stroke();
    }
  }

  /** The previewed route, from where the selected object is now to where the target will be. */
  private drawRoute(at: Map<WorldNode, { x: number; y: number }>): void {
    if (!this.route || !this.routeTo) return;
    const { ctx } = this;
    const { route, around } = this.route;
    const centre = at.get(around)!;
    const screen = route.path.points.map((point) => this.toScreen(centre.x + point.x, centre.y + point.y));
    ctx.strokeStyle = "#5fd8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    screen.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
    ctx.lineWidth = 1;
    // Where the target is now, joined to where the route meets it.
    const now = at.get(this.routeTo)!;
    const nowScreen = this.toScreen(now.x, now.y);
    const aim = screen[screen.length - 1];
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(95, 216, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(nowScreen.x, nowScreen.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#5fd8ff";
    ctx.beginPath();
    ctx.moveTo(aim.x - 6, aim.y - 6);
    ctx.lineTo(aim.x + 6, aim.y + 6);
    ctx.moveTo(aim.x + 6, aim.y - 6);
    ctx.lineTo(aim.x - 6, aim.y + 6);
    ctx.stroke();
  }

  /** The game's view at its default zoom and fully zoomed out, centred where this view is. */
  private drawScreenBoxes(): void {
    const { ctx } = this;
    const boxes: [number, string][] = [
      [DEFAULT_ZOOM, "game screen"],
      [MAX_OUT_ZOOM, "zoomed out fully"],
    ];
    for (const [zoom, label] of boxes) {
      const w = (window.innerWidth / zoom) * this.scale;
      const h = (window.innerHeight / zoom) * this.scale;
      if (w < 6) continue;
      const x = this.width / 2 - w / 2;
      const y = this.height / 2 - h / 2;
      ctx.strokeStyle = zoom === DEFAULT_ZOOM ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.28)";
      ctx.setLineDash(zoom === DEFAULT_ZOOM ? [] : [4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (w > 90) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(label, x + 4, y - 5);
      }
    }
  }

  private drawScaleBar(): void {
    const { ctx } = this;
    const length = niceLength(160 / this.scale);
    const px = length * this.scale;
    const x = 20;
    const y = this.height - 50;
    ctx.strokeStyle = "#cfd8e6";
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.fillStyle = "#cfd8e6";
    ctx.fillText(`${readableDistance(length)} units`, x, y - 8);
  }
}
