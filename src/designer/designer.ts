import {
  BODY_KINDS,
  PLACE_KINDS,
  closestApproach,
  copyPositions,
  isBody,
  makeChild,
  orbitSpeed,
  parentOf,
  parseWorld,
  pathTo,
  positions,
  reachOf,
  seedWorld,
  spinAngle,
  stringifyWorld,
  SURFACES,
  walk,
  type NodeKind,
  type Surface,
  type World,
  type WorldNode,
} from "./world";
import { bodiesFor, linkSummary, linkedNodes, phasesFromWorld, readGame, writeGame, type GameLink } from "./link";
import { planRoute, type Flight, type Route } from "../route";
import { DEFAULTS } from "../tuning";

/** The game's zoom limits, for the screen boxes. */
const DEFAULT_ZOOM = 0.8;
const MAX_OUT_ZOOM = 0.35;
const DRAFT_KEY = "jam-world-draft";
/** The settings groups the user has opened. All start closed. */
const GROUPS_KEY = "jam-designer-open";
/** Set once this browser's game has taken the designer's numbers, so the sliders win after that. */
const LINKED_KEY = "jam-world-linked";
const SPEEDS = [1, 10, 60, 600, 3600, 36000];
const CLICK_PIXELS = 5;
/** Ships to time a route with, from the game's own numbers. */
const FLIGHTS: Record<string, { label: string; flight: Flight }> = {
  floater: { label: "Floater, burn and brake", flight: { accel: DEFAULTS.thrust * DEFAULTS.floaterEngine, cruise: Infinity } },
  racer: { label: "Racer, burn and brake", flight: { accel: DEFAULTS.thrust, cruise: Infinity } },
  traffic: { label: "Traffic at cruise speed", flight: { accel: DEFAULTS.thrust, cruise: DEFAULTS.droneCruiseSpeed } },
};

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

function loadOpenGroups(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readableDistance(units: number): string {
  const u = Math.abs(units);
  if (u >= 1e6) return `${(units / 1e6).toFixed(2)} M`;
  if (u >= 1e4) return `${(units / 1e3).toFixed(1)} k`;
  return `${Math.round(units)}`;
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
  /** The place a route is previewed to from the selected object, and how it's flown. */
  private routeTo: WorldNode | null = null;
  private flightKind = "floater";
  private route: { route: Route; around: WorldNode } | null = null;
  private routeTimer = 0;
  private readonly routeBox: HTMLDivElement;
  private readonly routeText: HTMLDivElement;
  private readonly linkText: HTMLDivElement;
  private readonly openGroups = new Set<string>(loadOpenGroups());
  /** The player's ship as of opening: its offset from the field, and the game's clock then. */
  private shipFix: { x: number; y: number; clock: number } | null = null;
  private followShip = false;

  constructor(
    private readonly onClose: () => void,
    private readonly game: GameLink,
  ) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);

    this.world = this.loadDraft() ?? seedWorld();
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
      this.button("Start over from the default layout", () => this.replace(seedWorld()), "danger"),
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
    time.append(this.playButton, speed, this.button("Time 0", () => (this.t = 0)), this.button("Game time", () => (this.t = this.game.clock())), this.clock);

    this.element.append(side, this.canvas, time);
    document.body.append(this.element);
    this.listen();
    this.rebuild();
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    // The sliders may have changed things since last time, and this shows the game as it is.
    readGame(this.world, this.game.tuning, this.game.phases());
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

  /** Hands the game this layout. */
  linkToGame(): void {
    writeGame(this.world, this.game.tuning);
    this.game.apply(phasesFromWorld(this.world), bodiesFor(this.world));
    try {
      localStorage.setItem(LINKED_KEY, "1");
      localStorage.setItem(DRAFT_KEY, stringifyWorld(this.world));
    } catch {
      // Storage off: the link still holds until the page is closed.
    }
  }

  /**
   * At startup: the game gets the bodies every time, as they aren't saved anywhere else. The
   * numbers the sliders share go to the game only the first time; after that the game's win.
   */
  connect(): void {
    let linked = false;
    try {
      linked = localStorage.getItem(LINKED_KEY) !== null;
    } catch {
      // Storage off: treat it as the first time.
    }
    if (linked) {
      readGame(this.world, this.game.tuning, {});
      this.game.apply({}, bodiesFor(this.world));
    } else this.linkToGame();
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

  private async loadFile(): Promise<void> {
    try {
      const response = await fetch("/__world");
      const world = response.ok ? parseWorld(await response.text()) : null;
      if (!world) {
        this.status.textContent = response.status === 404 ? "No world file saved yet" : "Couldn't read the world file";
        return;
      }
      this.replace(world);
      this.status.textContent = "Loaded src/designer/world.json";
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
      ...node.children.map((child) => child.orbitRadius + child.radius),
    );
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width > 0 && extent > 0) this.scale = (Math.min(width, height) * 0.45) / extent;
  }

  // --- Side panel -------------------------------------------------------------------

  private rebuild(): void {
    this.tree.replaceChildren(
      ...walk(this.world).map(({ node, depth }) => {
        const button = this.button("", () => this.select(node));
        button.style.paddingLeft = `${6 + depth * 14}px`;
        button.className = node === this.selected ? "on" : "";
        const kind = document.createElement("span");
        kind.className = "kind";
        kind.textContent = `  ${node.kind}`;
        button.append(node.name, kind);
        return button;
      }),
    );
    this.buildEditor();
    this.buildRouteBox();
    this.linkText.textContent = linkSummary(this.world);
    this.passTimer = 0;
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

  /**
   * What a route is planned around: the nearest object both ends sit under (or one end, if
   * the other orbits it). The trip is worked out in its frame, and kept out of it if it's a body.
   */
  private sharedParent(a: WorldNode, b: WorldNode): WorldNode {
    const pa = pathTo(this.world, a);
    const pb = pathTo(this.world, b);
    let shared = 0;
    while (shared < pa.length && shared < pb.length && pa[shared] === pb[shared]) shared++;
    return pa[shared - 1] ?? this.world.root;
  }

  private updateRoute(): void {
    const target = this.routeTo;
    if (!target || target === this.selected) {
      this.route = null;
      this.routeText.textContent = "";
      return;
    }
    const around = this.sharedParent(this.selected, target);
    // Everything in the body's own frame, where it stands still.
    const relative = (node: WorldNode) => (t: number) => {
      const at = positions(this.world, t);
      const p = at.get(node)!;
      const c = at.get(around)!;
      return { x: p.x - c.x, y: p.y - c.y };
    };
    // A place doesn't block, and a trip to or from the body itself has nothing to go round.
    const blocks = isBody(around.kind) && this.selected !== around && target !== around;
    const radius = blocks ? reachOf(around) : 0;
    const route = planRoute(relative(this.selected), relative(target), this.t, radius, FLIGHTS[this.flightKind].flight);
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
    this.selected = node;
    this.rebuild();
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

    const size: HTMLElement[] = [this.number(node, "radius", body ? "Radius (surface)" : "Radius (size)", (v) => `${this.screens(v * 2)} across`)];
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
        this.number(node, "orbitPeriod", "Orbit period, seconds (negative goes the other way)", (v) => `${readableTime(v)} per orbit, ${orbitSpeed({ ...node, orbitPeriod: v }).toFixed(1)} units/s`),
        this.number(node, "orbitPhase", "Start angle on the orbit, degrees", () => ""),
      );
    }
    orbit.push(this.number(node, "spinPeriod", "Spin period, seconds (negative turns the other way)", (v) => `${readableTime(v)} per turn`));
    parts.push(...this.group(isRoot ? "Spin" : "Orbit and spin", orbit));
    if (!isRoot) {
      parts.push(
        ...this.group("Copies", [
          this.number(node, "count", "How many in this orbit, itself included", (v) => (v > 1 ? `${Math.floor(v) - 1} copies, without children${node.kind === "field" ? ", on the map only" : ""}` : "just this one")),
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
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify([...this.openGroups]));
      } catch {
        // Storage off: it's remembered until the page closes.
      }
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
      | "orbitPeriod"
      | "orbitPhase"
      | "spinPeriod"
      | "count"
      | "angleVariance"
      | "orbitVariance",
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
      const value = Number(input.value);
      if (input.value === "" || !Number.isFinite(value)) return;
      node[key] = value;
      help.textContent = hint(value);
      this.changed();
    });
    const label = this.labelled(text, input);
    label.append(help);
    return label;
  }

  /** Close passes for the selected object against every body it isn't part of. */
  private updatePasses(): void {
    const selected = this.selected;
    const entries = walk(this.world);
    const inside = (node: WorldNode, container: WorldNode) => {
      let at: WorldNode | null = node;
      while (at) {
        if (at === container) return true;
        at = parentOf(this.world, at);
      }
      return false;
    };
    const rows: { name: string; gap: number; at: number }[] = [];
    for (const { node } of entries) {
      if (node === selected || !isBody(node.kind)) continue;
      // Its own children orbit inside it on purpose, and a body's own parents are the frame it moves in.
      if (inside(node, selected)) continue;
      const pass = closestApproach(this.world, node, selected);
      rows.push({ name: node.name, ...pass });
    }
    rows.sort((a, b) => a.gap - b.gap);
    const shown = rows.slice(0, 6);
    if (shown.length === 0) {
      this.passes.replaceChildren(this.text("No bodies to pass."));
      return;
    }
    this.passes.replaceChildren(
      ...shown.map(({ name, gap, at }) => {
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
    this.canvas.addEventListener("mousedown", (event) => {
      this.drag = { x: event.clientX, y: event.clientY, moved: false };
    });
    window.addEventListener("mousemove", (event) => {
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
      if (!this.drag) return;
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
      if (!ring(p.x, p.y, node.orbitRadius)) continue;
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

    this.drawRoute(at);
    this.drawScreenBoxes();
    this.drawScaleBar();
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
