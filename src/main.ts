import { ShipDemo } from "./demo";
import { Chart } from "./chart";
import type { Bot } from "./bot/bot";
import { HullDesigner } from "./designer/hulls";
import { FaceGallery } from "./designer/faces";
import { Designer } from "./designer/designer";
import { applyTo, shipMarks, useLayout, type GameLink } from "./designer/link";
import { shippedWorld } from "./designer/shipped";
import { layoutKey, loadGame, loadStart, saveGame, saveInfo, type SaveSlot, type StartFile } from "./save";
import { stringifyWorld } from "./designer/world";
import { Audio } from "./audio";
import { Radio } from "./radio";
import { type Base, type Deposit, SHIP_RADIUS, type Ship, Sim, TICK, targetSpot, type Targetable } from "./sim";
import { type DragStart, ORDER_RING, Renderer } from "./render";
import { type BlueprintId, isGear, isProgram, isProject, PARTS, partFits, partOf, type Part, type PartIcon, type PartId } from "./parts";
import { ITEMS, itemDef } from "./items";
import { PROGRAM_PARTS } from "./programs";
import { computerSize, hullMax, mountsHolding, owns } from "./fitting";
import { blueprintIcon, iconEl } from "./icons";
import { partCategory, shopCellState, SHOP_CATEGORIES, type ShopBadge } from "./shop";
import { setTip } from "./tooltip";
import { Inventory } from "./inventory";
import { dragging, makeDraggable, rotateDrag } from "./drag";
import { applyTuning, changedTuning, DEFAULTS, GROUPS, type Tuning } from "./tuning";

const STORAGE_KEY = "jam-tweaks";
/** Where tweaks used to be kept, every value at once. */
const OLD_TUNING_KEY = "flight-test-tuning";
const MAX_FRAME_SECONDS = 0.1;
/** Beyond this, other ships' work can't be heard. */
const HEARING_DISTANCE = 1500;

/** Panel sections the player has opened. Every section starts closed. */
const OPEN_KEY = "space-game-panel-open";
const opened = new Set<string>(loadOpened());

function loadOpened(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveOpened(): void {
  localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
}

/**
 * The tweaks kept in this browser: only what was changed from the defaults. The old store kept
 * every value, so a default changed later never arrived; it's dropped once, unread.
 */
function loadTuning(): Tuning {
  try {
    localStorage.removeItem(OLD_TUNING_KEY);
    return applyTuning({ ...DEFAULTS }, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return { ...DEFAULTS };
  }
}

const tuning = loadTuning();
let seed = 1;
const sim = new Sim(seed, tuning);
const canvas = document.getElementById("view") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const panel = document.getElementById("panel") as HTMLDivElement;
const shop = document.getElementById("shop") as HTMLDivElement;
// Something dragged from the ship or locker onto the shop is sold.
shop.dataset.drop = "shop";
const inventoryBox = document.getElementById("inventory") as HTMLDivElement;
const dockHint = document.getElementById("dockhint") as HTMLDivElement;
/** Whether the dock shop is open: B opens and closes it while docked, and leaving the dock closes it. */
let shopOpen = false;
const renderer = new Renderer(canvas);
const audio = new Audio();
/** `?dev` on the address shows the tuning panel, the status lines and every pointer. */
const dev = new URLSearchParams(location.search).has("dev");
renderer.dev = dev;
hud.hidden = !dev;
const pauseBox = document.querySelector("#pause .box") as HTMLDivElement;
/** The game's side of the layout: the designer writes through this, and so does the shipped world. */
const gameLink: GameLink = {
  clock: () => sim.now,
  where: () => ({ ship: { x: sim.ship.x, y: sim.ship.y }, field: { x: sim.field.x, y: sim.field.y } }),
  ships: () => shipMarks(sim),
  apply: (layout) => applyTo(sim, layout),
};
/** Dev only: the hull designer, for moving, turning and sizing each hull's mounts. */
const hullDesigner = dev
  ? new HullDesigner(
      () => {
        keys.clear();
        if (paused) setPaused(true);
      },
      () => sim.tidyMounts(),
    )
  : null;

function openHulls(): void {
  if (!hullDesigner) return;
  keys.clear();
  pauseOverlay.hidden = true;
  hullDesigner.open();
}
/** Dev only: every face at every mood, for tuning the shapes in `src/voices.json` by looking. */
const faceGallery = dev
  ? new FaceGallery(() => {
      keys.clear();
      // Opened from the pause menu: go back to it.
      if (paused) setPaused(true);
    })
  : null;

function openFaces(): void {
  if (!faceGallery) return;
  keys.clear();
  pauseOverlay.hidden = true;
  faceGallery.open();
}
/** Dev only: the system designer, a separate view for laying out stars, planets and places. */
const designer = dev
  ? new Designer(() => {
      keys.clear();
      // Opened from the pause menu: go back to it.
      if (paused) setPaused(true);
    }, gameLink)
  : null;

/** Puts the layout into the game: the designer's in dev, the shipped one otherwise. */
function layOut(): void {
  if (designer) designer.linkToGame();
  else useLayout(shippedWorld(), gameLink);
}

function openDesigner(): void {
  if (!designer) return;
  keys.clear();
  pauseOverlay.hidden = true;
  designer.open();
}

/**
 * Dev only: the no-player bot at the controls, playing the journey for this ship. The same bot
 * `npm run bot` runs headless, so what it does here is what a run reports. Press again for the ship.
 */
let botPlay: Bot | null = null;

async function toggleBot(): Promise<void> {
  if (botPlay) {
    botPlay = null;
    console.log("bot: hands off, the ship is yours");
    return;
  }
  // Loaded only when it's asked for, so the bot and its log never reach the shipped game.
  const [{ Bot }, { BotLog }, { planFor }] = await Promise.all([
    import("./bot/bot"),
    import("./bot/log"),
    import("./bot/plan"),
  ]);
  const plan = planFor(sim.ship.model);
  if (!plan) {
    console.log(`bot: no journey written for the ${sim.ship.model} yet`);
    return;
  }
  // Every input and every snag goes to the console as it happens: that's the log to read.
  botPlay = new Bot({ plan, log: new BotLog((line) => console.log(line)), fresh: false });
  console.log(`bot: playing the ${sim.ship.model}, ${plan.name}`);
  keys.clear();
}
/** The system chart, for whoever has the starmap part. It lives over the game, which keeps running. */
const chart = new Chart(sim);const startOverlay = document.getElementById("start") as HTMLDivElement;
const startBox = document.querySelector("#start .box") as HTMLDivElement;
/** The live demos behind the start menu's ship cards, while it's open. */
let demos: ShipDemo[] = [];

const SHIPS: { model: "racer" | "floater"; name: string; pitch: string }[] = [
  { model: "racer", name: "Racer", pitch: "Quick and twitchy. Hands on the keys, shoot rocks on the move." },
  { model: "floater", name: "Floater", pitch: "Slow and steady, flown with the mouse. Click where to go and let it drift there." },
];

/** Whether a game is going, rather than waiting on the start menu. Only then is it saved. */
let inGame = false;
/** Seconds until the next automatic save. */
const AUTOSAVE_SECONDS = 30;
let autosaveTimer = AUTOSAVE_SECONDS;

function autosave(): void {
  if (inGame) saveGame(sim, "auto");
}

/** "5 minutes ago", or the date for anything older than a day. */
function ago(savedAt: number): string {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(savedAt).toLocaleDateString();
}

/** Picks up a saved game and goes straight into it. */
function resumeFrom(slot: SaveSlot): boolean {
  if (!loadGame(sim, slot)) return false;
  // A save keeps its own tuning, but the places are laid out as the world is now.
  layOut();
  keys.clear();
  buildPanel();
  demos = [];
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  paused = false;
  inGame = true;
  autosaveTimer = AUTOSAVE_SECONDS;
  return true;
}

/** Continue and Load lines for the start menu, for whatever saves there are. */
function saveButtons(): HTMLElement[] {
  const lines: HTMLElement[] = [];
  const slots: [SaveSlot, string][] = [
    ["auto", "Continue"],
    ["manual", "Load your saved game"],
  ];
  for (const [slot, label] of slots) {
    const info = saveInfo(slot);
    if (!info) continue;
    const button = document.createElement("button");
    button.className = "resume";
    if (info.fits) {
      button.textContent = `${label} (saved ${ago(info.savedAt)})`;
      button.addEventListener("click", () => resumeFrom(slot));
    } else {
      button.textContent = `${label}: saved by an older version of JAM, so it can't be loaded`;
      button.disabled = true;
    }
    lines.push(button);
  }
  return lines;
}

/** The start menu: pick a ship to begin, or carry on a saved game. The game waits behind it. */
function showStart(): void {
  inGame = false;
  paused = true;
  pauseOverlay.hidden = true;
  startOverlay.hidden = false;
  const title = document.createElement("h1");
  title.textContent = "JAM";
  const sub = document.createElement("p");
  sub.className = "sub";
  sub.textContent = "Just another asteroid miner. Pick your ship.";
  const cards = document.createElement("div");
  cards.className = "cards";
  demos = [];
  for (const ship of SHIPS) {
    const card = document.createElement("div");
    card.className = "card";
    const view = document.createElement("canvas");
    const name = document.createElement("h2");
    name.textContent = ship.name;
    const pitch = document.createElement("p");
    pitch.textContent = ship.pitch;
    const fly = document.createElement("button");
    fly.textContent = `Fly the ${ship.name}`;
    card.append(view, name, pitch, fly);
    card.addEventListener("click", () => chooseShip(ship.model));
    cards.append(card);
    demos.push(new ShipDemo(view, ship.model));
  }
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Esc or P pauses, with the controls under Help.";
  // A phone or tablet with no mouse can start a game, then not fly it. Better to say so first.
  const touchOnly = !matchMedia("(any-pointer: fine)").matches;
  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent = "JAM needs a keyboard and mouse. Come back on a computer.";
  startBox.replaceChildren(title, sub, ...(touchOnly ? [notice] : []), ...saveButtons(), cards, hint);
}

function chooseShip(model: "racer" | "floater"): void {
  tuning.floaterStart = model === "floater";
  saveTuning();
  restart();
  demos = [];
  startOverlay.hidden = true;
  paused = false;
  inGame = true;
  autosaveTimer = AUTOSAVE_SECONDS;
}
const pauseOverlay = document.getElementById("pause") as HTMLDivElement;

/** The player's own settings, kept apart from the tuning. */
const SETTINGS_KEY = "jam-settings";
const settings = loadSettings();
audio.volume = settings.volume;
audio.muted = settings.muted;

function loadSettings(): { volume: number; muted: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      volume: typeof saved.volume === "number" ? saved.volume : 0.5,
      muted: saved.muted === true,
    };
  } catch {
    return { volume: 0.5, muted: false };
  }
}

function saveSettings(): void {
  settings.volume = audio.volume;
  settings.muted = audio.muted;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const keys = new Set<string>();
let paused = false;
let timeScale = 1;
/** The menu is up, or the designer covers the game. */
const pausedNow = () => paused || (designer?.isOpen ?? false) || (hullDesigner?.isOpen ?? false) || (faceGallery?.isOpen ?? false);

/**
 * The world new games start in, already running for a while (npm run warm makes it). Only
 * used while the layout is the one it was made in; otherwise a game starts from scratch.
 */
const START: StartFile | null = Object.values(import.meta.glob<StartFile>("./start.json", { eager: true, import: "default" }))[0] ?? null;

function restart(): void {
  seed++;
  sim.reset(seed);
  const layout = layoutKey(designer ? designer.layoutText() : stringifyWorld(shippedWorld()));
  if (loadStart(sim, START, layout)) {
    // The places as they are at the start's clock, then a new ship for the player.
    layOut();
    sim.startPlayer();
  }
  buildPanel();
}

/**
 * The keys and mouse, in groups, for the help page. A line only shows once it's of use:
 * its part is fitted, or its place has been found. JAM is meant to be discovered.
 */
type HelpLine = [key: string, what: string, shown?: () => boolean];
const has = (id: Part["id"]) => () => sim.ship.parts.has(id);
const found = (place: string) => () => sim.discovered.has(place);
const HELP: [string, HelpLine[]][] = [
  [
    "Flying",
    [
      ["W", "Thrust"],
      ["S", "Thrust backward", has("reverse")],
      ["A / D", "Strafe left and right", has("strafe")],
      ["Q / E or arrows", "Rotate"],
      ["Shift + a flight key", "Ramp that thruster up gently, and back down when you let go"],
      ["X", "Retro on or off: holds you still against what you're near", has("retro")],
      ["Space", "Fire"],
      ["Mouse wheel", "Zoom"],
    ],
  ],
  [
    "Mouse orders",
    [
      ["Right click", "Shift there, keeping your motion", has("clickMove")],
      ["Double right click", "Move there and stop", has("clickMove")],
      ["Right drag", "Move there and keep drifting the way you drew", has("clickMove")],
      ["Right drag from your ship", "Hold a facing", has("clickTurn")],
      ["Right drag from the destination", "Nudge its drift", has("clickMove")],
      ["Right click your ship", "Stop, or cancel an order", has("clickMove")],
      ["Flight keys", "Take over for a moment; the order carries on after", has("clickMove")],
    ],
  ],
  [
    "Trading",
    [
      ["In the dock: click a part", "Buy it and fit it, or sell it; click a program you own to load or unload it", found("dock")],
      ["I", "Your ship: what's fitted, what's in the bay, your programs", found("used:inventory")],
      ["L", "Your locker at the base you're docked at", found("used:locker")],
      ["At a deposit: 1 / 2", "Drop your ore / load ore to haul", found("deposit")],
      ["Where someone's selling ore: 1", "Buy a load", found("seller")],
    ],
  ],
  [
    "Chart",
    [
      ["C", "The chart: what you've found so far", has("starmap")],
      ["C: wheel / drag", "Zoom / pan the chart", has("starmap")],
      ["C: right click", "Menu: move there, or point home or the destination at what you picked", has("starmap")],
      ["C: right click space", "Point the destination at that spot", has("starmap")],
      ["C: pick a place, Enter", "Autopilot flies the course", has("autopilot")],
      ["Flight keys", "Take over from the autopilot; it resumes when you let go", has("autopilot")],
    ],
  ],
  [
    "Game",
    [
      ["Esc or P", "Pause, and this menu"],
      ["M", "Mute"],
    ],
  ],
];

let confirmingNewGame = false;

/** Pauses with the menu open, or resumes with it closed. */
function setPaused(on: boolean): void {
  paused = on;
  pauseOverlay.hidden = !on;
  if (on) showPage("main");
}

function menuButton(text: string, onClick: () => void, className = ""): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function heading(text: string, level: "h1" | "h2" = "h2"): HTMLElement {
  const element = document.createElement(level);
  element.textContent = text;
  return element;
}

function showPage(page: "main" | "help" | "settings"): void {
  const title = heading("JAM", "h1");
  const sub = document.createElement("p");
  sub.className = "sub";
  sub.textContent = "Just another asteroid miner";
  const back = menuButton("Back", () => showPage("main"), "back");
  if (page === "main") {
    confirmingNewGame = false;
    const newGame = menuButton("New game", () => {
      if (!confirmingNewGame) {
        confirmingNewGame = true;
        newGame.textContent = "New game - your ship and money are lost. Click again to start over";
        return;
      }
      // Whatever's going now is kept as the one to continue.
      autosave();
      showStart();
    }, "danger");
    const save = menuButton("Save game", () => {
      save.textContent = saveGame(sim, "manual") ? "Saved" : "Couldn't save: the browser's storage is full or switched off";
    });
    const manual = saveInfo("manual");
    let confirmingLoad = false;
    const load = menuButton(manual ? `Load saved game (saved ${ago(manual.savedAt)})` : "Load saved game: nothing saved yet", () => {
      if (!manual?.fits) return;
      if (!confirmingLoad) {
        confirmingLoad = true;
        load.textContent = "Load saved game - what you have now is lost. Click again to load";
        return;
      }
      if (!resumeFrom("manual")) load.textContent = "Couldn't load that save";
    });
    load.disabled = !manual?.fits;
    pauseBox.replaceChildren(
      title,
      sub,
      menuButton("Resume", () => setPaused(false)),
      menuButton("Help", () => showPage("help")),
      menuButton("Settings", () => showPage("settings")),
      save,
      load,
      newGame,
    );
    if (designer?.draftNote) {
      const note = document.createElement("p");
      note.textContent = designer.draftNote;
      pauseBox.append(note);
    }
    if (designer) pauseBox.append(menuButton("System designer (dev, O)", openDesigner));
    if (hullDesigner) pauseBox.append(menuButton("Hull designer (dev, H)", openHulls));
    if (faceGallery) pauseBox.append(menuButton("Face gallery (dev, F)", openFaces));
    return;
  }
  if (page === "help") {
    const intro = document.createElement("p");
    intro.textContent =
      "Shoot rocks to break off ore, fly through it to pick it up, and sell it in the station's dock. Spend what you earn on parts.";
    const parts: HTMLElement[] = [title, sub, intro];
    for (const [group, lines] of HELP) {
      const shown = lines.filter(([, , show]) => !show || show());
      if (shown.length === 0) continue;
      parts.push(heading(group));
      const table = document.createElement("table");
      for (const [key, what] of shown) {
        const row = table.insertRow();
        row.insertCell().textContent = key;
        row.insertCell().textContent = what;
      }
      parts.push(table);
    }
    pauseBox.replaceChildren(...parts, back);
    return;
  }
  const volume = document.createElement("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.value = String(Math.round(audio.volume * 100));
  volume.addEventListener("input", () => {
    audio.setVolume(Number(volume.value) / 100);
    saveSettings();
  });
  const volumeLabel = document.createElement("label");
  volumeLabel.textContent = "Volume";
  const mute = document.createElement("label");
  const muteBox = document.createElement("input");
  muteBox.type = "checkbox";
  muteBox.checked = audio.muted;
  muteBox.addEventListener("change", () => {
    if (muteBox.checked !== audio.muted) audio.toggleMute();
    saveSettings();
  });
  mute.append(muteBox, " Mute (M)");
  pauseBox.replaceChildren(title, sub, heading("Settings"), volumeLabel, volume, mute, back);
}

/** Buys a part, or sells it back if it's fitted. A program the pilot owns is loaded or unloaded instead. */
function tradePart(part: Part): void {
  const { ship } = sim;
  if (isProgram(part.id) && ship.software.has(part.id)) sim.setProgram(ship, part.id, !ship.programs.includes(part.id));
  else if (owns(ship, part.id)) sim.sellPart(ship, part.id);
  else if (sim.unlocked(part.id)) sim.buyPart(ship, part.id);
  else if (partFits(part, sim.ship.model)) sim.fundBlueprint(sim.ship, part.id);
  if (!panel.hidden) buildPanel();
}

function tradeDrone(): void {
  if (sim.unlocked("drone")) sim.buyDrone(sim.ship);
  else sim.fundBlueprint(sim.ship, "drone");
}

/** The ship and locker screens, made for whatever world is loaded now. */
let inventoryScreen: Inventory | null = null;
function inventory(): Inventory {
  if (!inventoryScreen || inventoryScreen.sim !== sim) {
    inventoryScreen = new Inventory(inventoryBox, sim);
    }
  return inventoryScreen;
}

/**
 * One line of the shop. The style names its color, and without one the line is greyed out.
 * In the dock shop a line is a cell: `label` is the tooltip's name line, `text` its detail
 * lines and `icon` what the cell draws. The deposit, pirate and pod panels still show the
 * text on a button, as they always have.
 */
interface ShopLine {
  tag: string;
  style?: "buy" | "sell" | "unlock" | "partial" | "pending" | "poor";
  /** The tooltip's body lines, newlines and all; on the text buttons, the whole line. */
  text: string;
  /** The tooltip's name line, and the drag label: the item's name. */
  label?: string;
  /** What the dock shop's cell draws. */
  icon?: PartIcon;
  enabled: boolean;
}

/** An item the station can't sell yet: paid and on its way, or still to pay for. */
function lockedLine(id: BlueprintId, label: string, icon?: PartIcon, note?: string): ShopLine {
  if (sim.shopBase().blueprintsOrdered.has(id)) {
    const coming = isProject(id) ? "being built from the station's parts" : "coming with the next hauler";
    return { tag: "pending", style: "pending", label, icon, text: `Paid, ${coming}`, enabled: false };
  }
  const left = sim.blueprintLeft(id);
  const price = sim.blueprintPrice(id);
  const owed = left === price ? `${price} credits to unlock` : `${left} of ${price} credits left`;
  const head = note ? `${note}\n${owed}` : owed;
  const { credits } = sim.ship;
  if (credits <= 0) return { tag: "not enough money", style: "poor", label, icon, text: `${head}\nNot enough credits`, enabled: false };
  if (credits < left) return { tag: "unlock partial", style: "partial", label, icon, text: `${head}\nClick to fund what you can`, enabled: true };
  return { tag: "unlock", style: "unlock", label, icon, text: `${head}\nClick to fund it`, enabled: true };
}

/** An item the station can sell, as far as it has the parts and the buyer has the credits. */
function saleLine(price: number, label: string, text: string, part: PartId | null = null, icon?: PartIcon): ShopLine {
  const drawn = icon ?? (part ? partOf(part).icon : undefined);
  const supplied = part && !isProgram(part) ? sim.canSupply(sim.shopBase(), part) : sim.hasPartsFor(price);
  // The recipe for a part takes items in: without them in store it is locked, and the tooltip says which.
  if (part && !isProgram(part) && !sim.hasInputsFor(sim.shopBase(), part)) {
    return { tag: "lacks", label, icon: drawn, text: `${text}
The station needs ${sim.missingFor(sim.shopBase(), part).join(" and ")} to make it`, enabled: false };
  }
  if (!supplied) return { tag: "out of parts", label, icon: drawn, text: `${text}\nThe station is out of parts`, enabled: false };
  if (sim.ship.credits < price) return { tag: "not enough money", style: "poor", label, icon: drawn, text: `${text}\nNot enough credits`, enabled: false };
  return { tag: "buy", style: "buy", label, icon: drawn, text, enabled: true };
}

function shopButton(key: string, line: ShopLine, onClick: () => void, drag?: PartId): HTMLButtonElement {
  const button = document.createElement("button");
  // A part for sale can also be dragged onto a mount, the bay or the locker.
  if (drag && line.enabled) makeDraggable(button, () => ({ from: "shop", part: drag }), partOf(drag).label);
  button.className = line.style ?? "";
  button.disabled = !line.enabled;
  button.textContent = `${key ? `${key} ` : ""}[${line.tag}] ${line.text}`;
  button.addEventListener("click", () => {
    onClick();
    button.blur();
  });
  return button;
}

/** A cell's corner badge, drawn rather than typed: a lock, a clock or a tick. */
function badgeSvg(kind: "lock" | "halfLock" | "clock" | "tick"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("aria-hidden", "true");
  const shape = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
    svg.append(el);
    return el;
  };
  if (kind === "lock" || kind === "halfLock") {
    const gold = "#f0d86a";
    shape("path", { d: "M4 5.4 V4 a2 2 0 0 1 4 0 v1.4", fill: "none", stroke: gold, "stroke-width": 1.3 });
    shape("rect", { x: 2.8, y: 5.4, width: 6.4, height: 4.6, rx: 1, fill: gold });
  } else if (kind === "clock") {
    shape("circle", { cx: 6, cy: 6, r: 4.4, fill: "none", stroke: "#c4a4f0", "stroke-width": 1.2 });
    shape("path", { d: "M6 3.6 V6 L7.9 7.2", fill: "none", stroke: "#c4a4f0", "stroke-width": 1.2, "stroke-linecap": "round" });
  } else {
    shape("polyline", { points: "2.4,6.6 4.9,9 9.6,3.2", fill: "none", stroke: "#8fe3a1", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" });
  }
  if (kind === "halfLock") svg.style.opacity = "0.45";
  return svg;
}

/** A cell's corner badge: a character for the states that read as one, a drawing for the rest. */
function badgeEl(badge: ShopBadge): HTMLElement | null {
  if (badge === "none") return null;
  const span = document.createElement("span");
  span.className = `shop-badge badge-${badge}`;
  if (badge === "sell") span.textContent = "$";
  else if (badge === "load") span.textContent = "\u25b8";
  else if (badge === "run") span.textContent = "\u25a0";
  else span.append(badgeSvg(badge));
  return span;
}

/**
 * One cell of the dock shop's grid: the icon, the state's dimming and badge, and the full
 * tooltip. A cell that can't be bought is `aria-disabled` rather than `disabled`, so its
 * tooltip still shows; its click is ignored.
 */
function shopCell(line: ShopLine, onClick: () => void, drag?: PartId): HTMLButtonElement {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "shop-cell";
  const state = shopCellState(line);
  if (state.dim) cell.classList.add("dim");
  if (line.enabled && drag) makeDraggable(cell, () => ({ from: "shop", part: drag }), line.label ?? partOf(drag).label);
  if (line.icon) cell.append(iconEl(line.icon, 26));
  const badge = badgeEl(state.badge);
  if (badge) cell.append(badge);
  if (!line.enabled) cell.setAttribute("aria-disabled", "true");
  if (line.label) setTip(cell, () => [line.label, line.text].filter(Boolean).join("\n"));
  cell.addEventListener("click", () => {
    if (!line.enabled) return;
    onClick();
    cell.blur();
  });
  return cell;
}

/** The hauler's arrival, in words for the shop's heading. */
function haulerText(base: Base): string {
  const eta = sim.haulerEta(base);
  if (eta === null) return "no hauler coming";
  if (eta === 0) return "hauler docked";
  const seconds = Math.ceil(eta);
  return `hauler in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

let shopState = "";
// Lives apart from the buttons: its numbers change all the time, and rebuilding
// the buttons mid-click would lose the click.
const shopHeading = document.createElement("h2");

function dropLine(deposit: Deposit): ShopLine {
  const { depositPays } = tuning;
  const amount = sim.depositSellable(sim.ship, deposit);
  if (sim.oreIn(sim.ship) <= 0) return { tag: "no ore", text: `Drop ore here for ${depositPays} credits each`, enabled: false };
  if (amount <= 0) return { tag: "full", text: "The deposit has no room", enabled: false };
  return { tag: "sell", style: "sell", text: `Drop ${amount} ore for ${amount * depositPays} credits`, enabled: true };
}

function loadLine(deposit: Deposit): ShopLine {
  const { depositSells } = tuning;
  const orePrice = sim.plainOrePrice();
  const amount = sim.depositBuyable(sim.ship, deposit);
  if (sim.oreCount(deposit.ore) <= 0) return { tag: "empty", text: `Load ore here for ${depositSells} credits each`, enabled: false };
  if (sim.cargoSpace(sim.ship) <= 0) return { tag: "bay full", text: "No room for more ore", enabled: false };
  if (amount <= 0) return { tag: "not enough money", style: "poor", text: `Load ore here for ${depositSells} credits each`, enabled: false };
  const text = `Load ${amount} ore for ${amount * depositSells} credits. The station pays ${amount * orePrice}`;
  return { tag: "buy", style: "buy", text, enabled: true };
}

function updateDepositShop(deposit: Deposit): void {
  const { ship } = sim;
  const title = `Field deposit - holds ${sim.oreCount(deposit.ore)} ore, ${sim.depositRoom(deposit)} of ${tuning.depositCapacity} room free`;
  if (shopHeading.textContent !== title) shopHeading.textContent = title;
  const state = `deposit ${sim.oreIn(ship)} ${sim.cargoSpace(ship)} ${ship.credits} ${sim.oreCount(deposit.ore)} ${tuning.depositPays} ${tuning.depositSells} ${tuning.depositCapacity}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = false;
  shop.replaceChildren(
    shopHeading,
    shopButton("1", dropLine(deposit), () => sim.sellToDeposit(ship, deposit)),
    shopButton("2", loadLine(deposit), () => sim.buyFromDeposit(ship, deposit)),
  );
}

function updatePirateShop(): void {
  const { ship } = sim;
  const held = sim.oreCount(sim.pirateOre);
  const title = `Pirate base - ${held} ore for sale at ${tuning.depositSells} each`;
  if (shopHeading.textContent !== title) shopHeading.textContent = title;
  const amount = sim.pirateBaseBuyable(ship);
  const state = `pirate ${sim.oreIn(ship)} ${sim.cargoSpace(ship)} ${ship.credits} ${held} ${tuning.depositSells}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = false;
  const each = tuning.depositSells;
  const line: ShopLine =
    sim.oreIn(ship) > 0
      ? { tag: "hold not empty", style: "poor", text: "They only sell to an empty hold", enabled: false }
      : held < 1
        ? { tag: "empty", text: `Ore here costs ${each} credits each`, enabled: false }
        : amount <= 0
          ? { tag: "not enough money", style: "poor", text: `Ore here costs ${each} credits each`, enabled: false }
          : { tag: "buy", style: "buy", text: `Load ${amount} ore for ${amount * each} credits. The station pays ${amount * sim.plainOrePrice()}`, enabled: true };
  shop.replaceChildren(shopHeading, shopButton("1", line, () => sim.buyFromPirateBase(ship)));
}

/** After losing the ship: the pod on its way, then the choice of what to fly next, then a rebuild under way. */
function updatePodPanel(): void {
  const down = sim.down!;
  const where = sim.baseName(down.base);
  const offer = down.stage === "choosing" ? sim.rebuildOffer() : null;
  const left = down.stage === "rebuilding" ? Math.ceil(down.readyAt - sim.now) : 0;
  const state = `down ${down.stage} ${sim.ship.credits} ${left} ${offer ? JSON.stringify(offer) : ""}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = false;
  const heading = document.createElement("h2");
  if (down.stage === "pod") {
    heading.textContent = `Escape pod - flying itself to ${where}`;
    const note = document.createElement("p");
    note.className = "news";
    note.textContent = "Your programs are with you. What survived of the ship is drifting where it went up.";
    shop.replaceChildren(heading, note);
    return;
  }
  if (down.stage === "rebuilding") {
    heading.textContent = `${where} shipyard - rebuilding your ship, ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} to go`;
    shop.replaceChildren(heading);
    return;
  }
  heading.textContent = `${where} shipyard - your pod is in. What do you fly next?`;
  const bare: ShopLine = { tag: "bare hull", style: "buy", text: `A new ${sim.ship.model} with its own gear: ${sim.hullPrice(sim.ship.model)} credits, ready now`, enabled: true };
  const extras = sim.rebuildExtras();
  const seconds = Math.ceil(offer!.seconds);
  const list = extras.length > 0 ? `, with ${[...new Set(extras)].map((id) => partOf(id).label.toLowerCase()).join(", ")}` : "";
  const rebuild: ShopLine =
    offer!.missing.length > 0
      ? { tag: "can't", text: `Rebuild as it was: the store can't supply ${offer!.missing.map((id) => partOf(id).label.toLowerCase()).join(", ")}`, enabled: false }
      : sim.ship.credits < offer!.cost - sim.hullPrice(sim.ship.model)
        ? { tag: "not enough money", style: "poor", text: `Rebuild as it was${list}: ${offer!.cost} credits`, enabled: false }
        : { tag: "rebuild", style: "unlock", text: `Rebuild as it was${list}: ${offer!.cost} credits, ${seconds} s`, enabled: true };
  shop.replaceChildren(
    heading,
    shopButton("", bare, () => sim.chooseHull(false)),
    shopButton("", rebuild, () => sim.chooseHull(true)),
  );
}

function updateShop(): void {
  const { ship } = sim;
  if (sim.down) {
    updatePodPanel();
    return;
  }
  // Every base has a shop, selling from its own stock.
  const base = sim.baseAt();
  const docked = base !== null;
  const deposit = sim.isDocked() ? null : sim.depositAt();
  if (deposit) {
    updateDepositShop(deposit);
    return;
  }
  if (!docked && sim.atPirateBase()) {
    updatePirateShop();
    return;
  }
  if (base) {
    const title = `Dock shop - station ${Math.floor(base.account.credits)} credits - ${haulerText(base)}`;
    if (shopHeading.textContent !== title) shopHeading.textContent = title;
  }
  if (!docked) shopOpen = false;
  const locker = base ? sim.lockerAt(base) : null;
  const state = `${shopOpen} ${sim.buyRefused} ${sim.oreIn(ship)} ${ship.hold.length} ${locker?.rows} ${locker?.items.length} ${base?.id} ${ship.home} ${ship.credits} ${[...ship.parts].join()} ${sim.drones.length} ${tuning.partPriceScale} ${tuning.partWeightScale} ${tuning.dronePrice} ${tuning.droneLimit} ${PARTS.map((part) => sim.hasPartsFor(sim.partPrice(part.id))).join()} ${sim.hasPartsFor(tuning.dronePrice)} ${[...sim.shopBase().blueprints].join()} ${[...sim.shopBase().blueprintPaid].join()} ${[...sim.shopBase().blueprintsOrdered].join()} ${sim.unlocked("deposit")} ${tuning.depositPrice} ${tuning.depositParts} ${sim.unlocked("stationGuards")} ${sim.unlocked("depositGuards")} ${tuning.stationGuardPrice} ${tuning.stationGuardParts} ${tuning.depositGuardPrice} ${tuning.depositGuardParts} ${tuning.stationUnlocks} ${newsState()} ${[...sim.shopBase().stock].join()} ${sim.hub.size} ${JSON.stringify(ship.fit)} ${ship.programs.join()} ${[...ship.software].join()} ${PARTS.map((part) => part.icon.glyph + (part.icon.mark ?? "")).join()}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = !docked || !shopOpen;
  dockHint.hidden = !docked || shopOpen;
  if (!docked || !shopOpen) return;

  shop.replaceChildren(shopHeading);
  if (sim.buyRefused) {
    const refused = document.createElement("p");
    refused.className = "refused";
    refused.textContent = sim.buyRefused;
    shop.append(refused);
  }
  const open = document.createElement("button");
  open.className = "small";
  open.textContent = "Ship and locker";
  open.addEventListener("click", () => {
    inventory().openBoth();
    open.blur();
  });
  shop.append(open);
  // The one way to set an indicator from the dock: press again at the base it names to clear it.
  const pinned = ship.home === base.id;
  const pin = document.createElement("button");
  pin.className = "small";
  pin.textContent = pinned ? "Unpin as home" : "Pin as home";
  pin.addEventListener("click", () => {
    sim.toggleHome(base.id);
    pin.blur();
  });
  shop.append(pin);

  // The grid: one cell per item, no text, under category headers in the plan's order.
  const grid = document.createElement("div");
  grid.className = "shop-grid";
  // A module is a part and an item at once; a program has its own records. Both are sold here.
  const forSale = [...PARTS.filter(isGear), ...PROGRAM_PARTS];
  for (const category of SHOP_CATEGORIES) {
    const cells =
      category === "Station"
        ? stationCells()
        : forSale.filter((part) => partCategory(part) === category).flatMap((part) => {
            const line = partLine(part);
            return line ? [shopCell(line, () => tradePart(part), line.tag === "buy" ? part.id : undefined)] : [];
          });
    if (cells.length === 0) continue;
    const head = document.createElement("h2");
    head.textContent = category;
    grid.append(head, ...cells);
  }
  shop.append(grid);
  appendNews();
}

/** The Station category: the things that aren't parts, with icons set in code from the same glyph set. */
function stationCells(): HTMLButtonElement[] {
  const { ship } = sim;
  const full = sim.drones.length >= tuning.droneLimit;
  const droneLine: ShopLine = full
    ? { tag: "at limit", label: "New drone", icon: blueprintIcon("drone"), text: `You're at your drone limit (${tuning.droneLimit})`, enabled: false }
    : !sim.unlocked("drone")
      ? lockedLine("drone", "New drone", blueprintIcon("drone"))
      : saleLine(
          tuning.dronePrice,
          "New drone",
          `${tuning.dronePrice} credits\nEarns for you (${sim.drones.length}/${tuning.droneLimit})`,
          null,
          blueprintIcon("drone"),
        );

  const depositLine: ShopLine = sim.unlocked("deposit")
    ? { tag: "built", label: "Field deposit", icon: blueprintIcon("deposit"), text: "Built: open at the field's edge", enabled: false }
    : lockedLine("deposit", "Field deposit", blueprintIcon("deposit"), `${tuning.depositParts} station parts to build`);

  const stationGuardLine: ShopLine = sim.unlocked("stationGuards")
    ? { tag: "built", label: "Station turrets", icon: blueprintIcon("stationGuards"), text: "Built: on guard", enabled: false }
    : lockedLine("stationGuards", "Station turrets", blueprintIcon("stationGuards"), `${tuning.stationGuardParts} station parts to build`);

  let depositGuardLine: ShopLine;
  if (sim.unlocked("depositGuards")) depositGuardLine = { tag: "built", label: "Deposit turrets", icon: blueprintIcon("depositGuards"), text: "Built: on guard", enabled: false };
  else if (!sim.unlocked("deposit")) depositGuardLine = { tag: "needs a deposit", label: "Deposit turrets", icon: blueprintIcon("depositGuards"), text: "Needs a field deposit first", enabled: false };
  else depositGuardLine = lockedLine("depositGuards", "Deposit turrets", blueprintIcon("depositGuards"), `${tuning.depositGuardParts} station parts to build`);

  return [
    shopCell(droneLine, tradeDrone),
    shopCell(depositLine, () => sim.fundBlueprint(ship, "deposit")),
    shopCell(stationGuardLine, () => sim.fundBlueprint(ship, "stationGuards")),
    shopCell(depositGuardLine, () => sim.fundBlueprint(ship, "depositGuards")),
  ];
}

/** One line of the dock's board: what it says, and the field an ore line names for the click. */
interface NewsLine {
  text: string;
  field?: string;
}

/** The dock's news board, newest first: what's sold where, at what price, and how long ago it was seen. */
function newsLines(): NewsLine[] {
  const base = sim.baseAt();
  if (!base) return [];
  return [...base.board]
    .sort((a, b) => b.seen - a.seen)
    .map((report) => {
      const item = PARTS.find((part) => part.id === report.item)?.label ?? report.item;
      if (report.field) return { text: `${item} mined in ${sim.fieldName(report.field)}`, field: report.field };
      const where = report.base === base.id ? "here" : `at ${sim.baseName(report.base)}`;
      const minutes = Math.floor((sim.now - report.seen) / 60);
      const age = minutes < 1 ? "just now" : minutes < 120 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
      return { text: `${item} ${where}, ${report.price} credits, seen ${age}` };
    });
}

/** Changes when the board does, or a minute passes, so the ages stay right. */
function newsState(): string {
  return newsLines().map((line) => line.text).join("|");
}

function appendNews(): void {
  const lines = newsLines();
  const heading = document.createElement("h2");
  heading.textContent = "News board";
  heading.className = "news";
  shop.append(heading);
  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "news";
    empty.textContent = "Nothing on the board.";
    shop.append(empty);
    return;
  }
  for (const line of lines) {
    if (!line.field) {
      const item = document.createElement("p");
      item.className = "news";
      item.textContent = line.text;
      shop.append(item);
      continue;
    }
    // An ore line is a button: it points the destination at the field it names.
    const ore = document.createElement("button");
    ore.type = "button";
    ore.className = "ore";
    ore.textContent = line.text;
    const field = sim.miningFields().find((each) => each.id === line.field);
    if (field) {
      ore.addEventListener("click", () => {
        sim.toggleDestination({ poi: field.poi });
        ore.blur();
      });
    } else ore.disabled = true;
    shop.append(ore);
  }
}

/**
 * One part's line in the shop, or null when it has no place there: a held part not sold
 * here, or a hull's own gear while its mount is filled. The text is the tooltip's detail.
 */
function partLine(part: Part): ShopLine | null {
  const { ship } = sim;
  const price = sim.partPrice(part.id);
  if (isProgram(part.id)) {
    if (ship.software.has(part.id)) {
      const loaded = ship.programs.includes(part.id);
      if (loaded) return { tag: "loaded", style: "sell", label: part.label, icon: part.icon, text: "Running. Click to unload it and free a slot", enabled: true };
      const room = ship.programs.length < computerSize(ship);
      return room
        ? { tag: "load", style: "buy", label: part.label, icon: part.icon, text: "Yours, not running. Click to load it", enabled: true }
        : { tag: "no free slot", label: part.label, icon: part.icon, text: "Yours, not running\nNo free slot in the computer", enabled: false };
    }
  } else if (owns(ship, part.id)) {
    if (part.builtIn) return null;
    const value = mountsHolding(ship, part.id).reduce((sum, mount) => sum + sim.moduleValue(ship.fit[mount]!), 0);
    return { tag: "sell", style: "sell", label: part.label, icon: part.icon, text: `Sell for ${value} credits, -${(part.weight * tuning.partWeightScale).toFixed(2)} weight`, enabled: true };
  }
  if (part.held && !sim.unlocked(part.id)) return null;
  // A module this station neither sells nor wants isn't in its shop: there's nothing to do with it here.
  if (!sim.shopLists(part.id)) return null;
  if (part.builtIn && !sim.canBuy(ship, part.id)) return null;
  if (!sim.canBuy(ship, part.id)) return { tag: "doesn't fit", label: part.label, icon: part.icon, text: `${part.description}\nNo mount on your ship takes it`, enabled: false };
  if (!sim.unlocked(part.id)) return lockedLine(part.id, part.label, part.icon);
  const detail = [`${price} credits${isProgram(part.id) ? "" : `, +${(part.weight * tuning.partWeightScale).toFixed(2)} weight`}`];
  detail.push(part.description);
  const stocked = isProgram(part.id) ? 0 : sim.stockOf(sim.shopBase(), part.id);
  if (stocked > 0) detail.push(`${stocked} in the store`);
  const goes = replacedBy(part);
  if (goes) detail.push(goes);
  return saleLine(price, part.label, detail.join("\n"), part.id, part.icon);
}

/** Where buying a part would put it, in words, or nothing when it goes on a mount. A buy never takes anything off. */
function replacedBy(part: Part): string {
  if (isProgram(part.id)) return "";
  const goes = sim.whereBuyGoes(sim.ship, part.id);
  if (goes === "mount") return "";
  if (goes === "hold") return "Goes in your bay";
  if (goes === "locker") return "Goes in your locker here";
  return "No room on the ship or in your locker here";
}

function saveTuning(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(changedTuning(tuning)));
}

function setRetro(on: boolean): void {
  tuning.retro = on;
  saveTuning();
  buildPanel();
}

function buildPanel(): void {
  panel.replaceChildren();

  const retro = document.createElement("button");
  retro.className = tuning.retro ? "retro on" : "retro";
  const hasRetro = sim.ship.parts.has("retro");
  retro.textContent = `Retro thrust: ${tuning.retro ? "ON" : "OFF"} (X)${hasRetro ? "" : " - needs the part"}`;
  retro.addEventListener("click", () => setRetro(!tuning.retro));
  panel.append(retro);

  for (const group of GROUPS) {
    const heading = document.createElement("h2");
    const body = document.createElement("div");
    const open = opened.has(group.title);
    heading.className = open ? "group" : "group closed";
    heading.textContent = group.title;
    body.hidden = !open;
    heading.addEventListener("click", () => {
      if (opened.has(group.title)) opened.delete(group.title);
      else opened.add(group.title);
      saveOpened();
      body.hidden = !opened.has(group.title);
      heading.className = body.hidden ? "group closed" : "group";
    });
    panel.append(heading, body);

    for (const slider of group.sliders) {
      const label = document.createElement("label");
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = slider.label;
      const value = document.createElement("span");
      value.className = "value";
      const shown = (n: number) => (n === Infinity ? "∞" : String(n));
      value.textContent = shown(tuning[slider.key]);
      row.append(name, value);

      // With no limit allowed, one step past the maximum stands for infinity.
      const top = slider.infinite ? slider.max + slider.step : slider.max;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(slider.min);
      input.max = String(top);
      input.step = String(slider.step);
      input.value = String(Math.min(tuning[slider.key], top));
      input.addEventListener("input", () => {
        const picked = Number(input.value);
        tuning[slider.key] = slider.infinite && picked >= top ? Infinity : picked;
        value.textContent = shown(tuning[slider.key]);
        saveTuning();
      });
      // Hand the keyboard straight back to the ship.
      input.addEventListener("change", () => input.blur());
      label.append(row, input);
      body.append(label);
    }

    for (const { key, label: text } of group.switches ?? []) {
      const toggle = document.createElement("label");
      toggle.className = "toggle";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = tuning[key];
      box.addEventListener("change", () => {
        tuning[key] = box.checked;
        saveTuning();
        box.blur();
      });
      toggle.append(box, ` ${text}`);
      body.append(toggle);
    }

    if (group.title === "Parts") {
      // Any item, straight into the bay: what the designers make, and what a test ship needs.
      const note = document.createElement("p");
      note.textContent = "Any item in the game, free for testing. It goes in your bay; a module fitted on the ship is another matter.";
      const pick = document.createElement("select");
      for (const item of ITEMS) pick.append(new Option(`${item.name} (${item.type})`, item.id));
      const add = document.createElement("button");
      add.textContent = "Add to bay";
      const said = document.createElement("p");
      add.addEventListener("click", () => {
        const id = pick.value as PartId;
        if (!sim.holdSpotFor(sim.ship, { part: id, wear: 0 })) {
          said.textContent = "There's no room in the bay for that";
          return;
        }
        sim.placeInBay(sim.ship, id);
        said.textContent = `${itemDef(id)!.name} is in the bay`;
      });
      const row = document.createElement("div");
      row.className = "row";
      row.append(pick, add);
      const money = document.createElement("button");
      money.textContent = "Give money";
      money.addEventListener("click", () => {
        sim.ship.credits += 1000;
        money.blur();
      });
      body.append(note, row, said, money);
    }
  }

  const reset = document.createElement("button");
  reset.textContent = "Reset to defaults";
  reset.addEventListener("click", () => {
    Object.assign(tuning, DEFAULTS);
    // The places' own numbers come from the layout, not the defaults.
    layOut();
    saveTuning();
    opened.clear();
    saveOpened();
    buildPanel();
  });
  const copy = document.createElement("button");
  copy.textContent = "Copy values";
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy values"), 1000);
  });
  panel.append(reset, copy);
}

/** What the ship's motion is measured against, for the status line. */
function frameText(): string {
  const { frame, frameShare } = sim.ship;
  if (frameShare <= 0) return "Free of any POI";
  if (frameShare >= 1) return `Moving relative to ${frame.name}`;
  return `Moving partly relative to ${frame.name} (${Math.round(frameShare * 100)}%)`;
}

/** Each thruster key's throttle, 0 to 1, and the keys that drive it. */
const throttle = { forward: 0, back: 0, left: 0, right: 0, turnLeft: 0, turnRight: 0 };
const THROTTLE_KEYS: Record<keyof typeof throttle, string[]> = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA"],
  right: ["KeyD"],
  turnLeft: ["KeyQ", "ArrowLeft"],
  turnRight: ["KeyE", "ArrowRight"],
};

/**
 * A key fires its thruster at full while held. With Shift held it ramps instead: up while
 * the key is down, down once it's let go. Letting go of Shift snaps back to full or off.
 */
function updateThrottle(seconds: number): void {
  const fine = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const step = seconds / Math.max(0.01, tuning.throttleRamp);
  for (const name of Object.keys(throttle) as (keyof typeof throttle)[]) {
    const held = THROTTLE_KEYS[name].some((code) => keys.has(code));
    if (!fine) throttle[name] = held ? 1 : 0;
    else throttle[name] = Math.min(1, Math.max(0, throttle[name] + (held ? step : -step)));
  }
}

function readControls(seconds: number): void {
  updateThrottle(seconds);
  // The bot has the controls: the keys wait until it hands them back.
  if (botPlay) return;
  // Watching the wreck, or riding in the pod: there's nothing to fly.
  if (renderer.watchingWreck || sim.down) {
    Object.assign(sim.controls, { thrust: 0, strafe: 0, turn: 0, fire: false });
    return;
  }
  sim.controls.fire = keys.has("Space");
  const thrust = throttle.forward - throttle.back;
  const strafe = throttle.right - throttle.left;
  const turn = throttle.turnRight - throttle.turnLeft;
  // The keys fly while held. The order waits and takes back over once they're let go.
  if (thrust !== 0 || strafe !== 0 || turn !== 0) sim.clickPilot.handsOn();
  if (sim.clickPilot.flying) return;
  sim.controls.thrust = thrust;
  sim.controls.strafe = strafe;
  sim.controls.turn = turn;
}

window.addEventListener("keydown", (event) => {
  audio.start();
  // Picking a ship comes first.
  if (!startOverlay.hidden) return;
  // The designer has its own keys, and the game holds still behind it.
  if (designer?.isOpen || hullDesigner?.isOpen || faceGallery?.isOpen) return;
  if (event.code === "KeyG" && dev && !event.repeat) {
    void toggleBot();
    return;
  }
  if (hullDesigner && event.code === "KeyH" && !event.repeat) {
    openHulls();
    return;
  }
  if (faceGallery && event.code === "KeyF" && !event.repeat) {
    openFaces();
    return;
  }
  if (designer && event.code === "KeyO" && !event.repeat) {
    openDesigner();
    return;
  }
  // The chart is up: the world runs on behind it, and the keys wait.
  if (chart.isOpen) {
    if (event.repeat) return;
    if (event.code === "KeyC" || event.code === "Escape") {
      chart.close();
      keys.clear();
      return;
    }
    if (event.code === "Enter") {
      const pick = chart.selection;
      if (pick?.place) {
        const flew = pick.poi
          ? sim.orderTravel(pick.poi)
          : sim.orderTravelDeposit(pick.deposit!);
        if (flew) chart.close();
      }
    }
    return;
  }
  if (event.code === "Escape" || event.code === "KeyP") {
    if (!event.repeat) setPaused(!paused);
    return;
  }
  if (event.code === "KeyM" && !event.repeat) {
    audio.toggleMute();
    saveSettings();
    return;
  }
  // The menu is up: the game waits.
  if (paused) return;
  // The chart needs its part. Without it the key does nothing: JAM is meant to be discovered.
  if (event.code === "KeyI" && !event.repeat) inventory().toggleShip();
  if (event.code === "KeyL" && !event.repeat) inventory().toggleLocker();
  if (event.code === "KeyB" && !event.repeat && sim.baseAt()) shopOpen = !shopOpen;
  if (event.code === "KeyC" && !event.repeat && sim.ship.parts.has("starmap")) {
    keys.clear();
    chart.open();
    return;
  }
  if (event.code === "Tab") {
    event.preventDefault();
    if (dev) panel.hidden = !panel.hidden;
    return;
  }
  if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
  if (event.repeat) return;
  // While something is dragged, R turns it and never restarts.
  if (event.code === "KeyR") {
    if (dragging()) rotateDrag();
    else if (dev) restart();
  }
  if (event.code === "KeyX") setRetro(!tuning.retro);
  const deposit = sim.isDocked() ? null : sim.depositAt();
  if (deposit && event.code === "Digit1") sim.sellToDeposit(sim.ship, deposit);
  if (deposit && event.code === "Digit2") sim.buyFromDeposit(sim.ship, deposit);
  if (!deposit && !sim.isDocked() && sim.atPirateBase() && event.code === "Digit1") sim.buyFromPirateBase(sim.ship);
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  // A drag or a box can't be let go of when the window no longer has the pointer.
  drag = null;
  selecting = null;
});
// The same, for a pointer the browser takes away mid-drag.
window.addEventListener("pointercancel", () => {
  drag = null;
  selecting = null;
});
// Closing or leaving the tab saves too, so walking away never loses anything.
window.addEventListener("pagehide", autosave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autosave();
});
/** Shorter drags than this, in screen pixels, count as a click. */
const DRAG_PIXELS = 10;
/** A second right click this soon after the first, in the same place, makes a double click. */
const DOUBLE_CLICK_MS = 350;
/**
 * A right drag in progress, in screen pixels. What it starts on decides what it does:
 * your own ship sets a facing, the current destination nudges its drift, space moves.
 */
let drag: { fromX: number; fromY: number; toX: number; toY: number; on: DragStart } | null = null;
/** The last right click that could be the first half of a double click. */
let lastClick: { x: number; y: number; time: number } | null = null;
/** A left drag in progress, in screen pixels: picking with a box. Ctrl adds to the queue. */
let selecting: { fromX: number; fromY: number; toX: number; toY: number; add: boolean } | null = null;

/** How far a screen point is from a world position, in screen pixels. */
function screenDistance(clientX: number, clientY: number, x: number, y: number): number {
  const at = renderer.worldToScreen(x, y);
  return Math.hypot(clientX - at.x, clientY - at.y);
}

/** How near a click has to be to count as on something this big, in screen pixels. */
function reachScreen(radius: number): number {
  return Math.max(18, radius * tuning.zoom * 1.6);
}

/** Whether a screen point is on a world position, with room for a quick click. */
function near(clientX: number, clientY: number, x: number, y: number, radius: number): boolean {
  return screenDistance(clientX, clientY, x, y) < reachScreen(radius);
}

/** What a right press lands on. The ship comes first, as the smaller and more used target. */
function dragStart(clientX: number, clientY: number): DragStart {
  if (near(clientX, clientY, sim.ship.x, sim.ship.y, SHIP_RADIUS)) return "ship";
  const target = sim.clickPilot.target();
  if (target && near(clientX, clientY, target.x, target.y, ORDER_RING)) return "destination";
  return "space";
}

/**
 * What a left click lands on: the nearest targetable thing the pointer is over, by the same
 * reach the right button uses. Nothing: empty space, which clears the picks.
 */
function pickAt(clientX: number, clientY: number): Targetable | null {
  let best: Targetable | null = null;
  let closest = Infinity;
  for (const target of sim.targetables()) {
    if (target === sim.ship) continue;
    const spot = targetSpot(target);
    const distance = screenDistance(clientX, clientY, spot.x, spot.y);
    if (distance < reachScreen(spot.radius) && distance < closest) {
      best = target;
      closest = distance;
    }
  }
  return best;
}

canvas.addEventListener("mousedown", (event) => {
  audio.start();
  if (event.button === 0 && !renderer.watchingWreck && sim.ship.parts.has("targeting")) {
    selecting = { fromX: event.clientX, fromY: event.clientY, toX: event.clientX, toY: event.clientY, add: event.ctrlKey || event.metaKey };
  }
  if (event.button !== 2 || renderer.watchingWreck) return;
  const { clientX: x, clientY: y } = event;
  drag = { fromX: x, fromY: y, toX: x, toY: y, on: dragStart(x, y) };
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 0 && selecting) {
    const { fromX, fromY, add } = selecting;
    selecting = null;
    if (!sim.ship.parts.has("targeting")) return;
    // Measured on screen, as the right drag is: what reads as a click is one here too.
    if (Math.hypot(event.clientX - fromX, event.clientY - fromY) >= DRAG_PIXELS) {
      const from = renderer.screenToWorld(fromX, fromY);
      const to = renderer.screenToWorld(event.clientX, event.clientY);
      sim.boxTargets(sim.ship, from, to, add);
    } else {
      const target = pickAt(fromX, fromY);
      if (add) sim.toggleTarget(sim.ship, target);
      else sim.selectTarget(sim.ship, target);
    }
    return;
  }
  if (event.button !== 2 || !drag) return;
  const { fromX, fromY, on } = drag;
  drag = null;
  // Measured on screen: the view follows the ship, so this is motion as seen from it.
  const dx = (event.clientX - fromX) / tuning.zoom;
  const dy = (event.clientY - fromY) / tuning.zoom;
  const dragged = Math.hypot(event.clientX - fromX, event.clientY - fromY) >= DRAG_PIXELS;
  // The first click's destination is right here, so this comes before asking what was hit.
  const first = lastClick;
  lastClick = null;
  if (!dragged && on !== "ship") {
    const spot = renderer.screenToWorld(fromX, fromY);
    const isDouble =
      first && event.timeStamp - first.time < DOUBLE_CLICK_MS && Math.hypot(fromX - first.x, fromY - first.y) < DRAG_PIXELS;
    if (isDouble) {
      sim.orderMove(spot.x, spot.y);
      return;
    }
    lastClick = { x: fromX, y: fromY, time: event.timeStamp };
  }
  if (on === "ship") {
    if (dragged) sim.orderFace(Math.atan2(dy, dx));
    else sim.orderStop();
    return;
  }
  if (on === "destination") {
    // A click on the destination leaves it be.
    const scale = tuning.nudgeShare / tuning.dragSeconds;
    if (dragged) sim.orderNudge(dx * scale, dy * scale);
    return;
  }
  const spot = renderer.screenToWorld(fromX, fromY);
  if (dragged) sim.orderMove(spot.x, spot.y, dx / tuning.dragSeconds, dy / tuning.dragSeconds);
  else sim.orderTranslate(spot.x, spot.y);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
/** Where the mouse is on screen, so the turret keeps aiming there as the view moves. */
let mouse: { x: number; y: number } | null = null;
window.addEventListener("mousemove", (event) => {
  if (drag) {
    drag.toX = event.clientX;
    drag.toY = event.clientY;
  }
  if (selecting) {
    selecting.toX = event.clientX;
    selecting.toY = event.clientY;
  }
  if (event.target !== canvas) return;
  mouse = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("mouseleave", () => {
  mouse = null;
});
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const zoom = tuning.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
    tuning.zoom = Math.round(Math.max(0.35, Math.min(2, zoom)) * 100) / 100;
    saveTuning();
    if (!panel.hidden) buildPanel();
  },
  { passive: false },
);

function cargoText(ship: Ship): string {
  const space = sim.cargoSpace(ship);
  return space === Infinity ? "∞" : String(space);
}

function partList(ship: Ship): string {
  const owned = [...PARTS, ...PROGRAM_PARTS].filter((part) => ship.parts.has(part.id) && !part.builtIn);
  return owned.length > 0 ? owned.map((part) => part.short).join(" ") : "none";
}

let lastTime = performance.now();
const radio = new Radio(document.getElementById("chatter")!);
let accumulator = 0;
let fps = 60;
let hudTimer = 0;

function frame(now: number): void {
  const paused = pausedNow();
  const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastTime) / 1000);
  lastTime = now;
  if (seconds > 0) fps += (1 / seconds - fps) * 0.05;

  for (const demo of demos) demo.update(seconds);
  autosaveTimer -= seconds;
  if (autosaveTimer <= 0) {
    autosaveTimer = AUTOSAVE_SECONDS;
    autosave();
  }
  readControls(paused ? 0 : seconds);
  if (!botPlay) sim.ship.aim = mouse ? renderer.screenToWorld(mouse.x, mouse.y) : null;
  if (!paused) {
    accumulator += seconds * timeScale;
    while (accumulator >= TICK) {
      // The bot plays the ship before each step, where the game reads its own input.
      if (botPlay) {
        botPlay.step(sim);
        if (botPlay.end) {
          console.log(`bot: run over, ${botPlay.end}`);
          botPlay = null;
        }
      }
      sim.step();
      accumulator -= TICK;
    }
  }

  for (const event of sim.events) {
    if (event.type !== "chatter" || !sim.hears(event)) continue;
    radio.add(event, sim.ship);
    renderer.addPing(event);
    audio.beep(event.mayday);
  }
  radio.update();
  renderer.addEvents(sim.events);
  audio.play(
    sim.events.filter(
      (event) => Math.hypot(event.x - sim.ship.x, event.y - sim.ship.y) < HEARING_DISTANCE,
    ),
  );
  sim.events.length = 0;
  audio.setThrust(!paused && sim.ship.firing.size > 0);
  updateShop();
  inventory().update();
  renderer.drag = drag && {
    ...drag,
    dragged: Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY) >= DRAG_PIXELS,
  };
  renderer.selectBox =
    selecting && Math.hypot(selecting.toX - selecting.fromX, selecting.toY - selecting.fromY) >= DRAG_PIXELS ? selecting : null;
  sim.screen = { halfWidth: window.innerWidth / 2 / tuning.zoom, halfHeight: window.innerHeight / 2 / tuning.zoom };
  // The mouse is passed along for the arrows' tooltips, which are drawn and so can't be hit
  // any other way: only while the game's own view is what's under the pointer.
  renderer.draw(sim, paused ? 1 : accumulator / TICK, paused ? 0 : seconds, paused || chart.isOpen ? null : mouse);
  chart.draw(sim);

  hudTimer -= seconds;
  if (dev && hudTimer <= 0) {
    hudTimer = 0.1;
    // The base the player is docked at, or the nearest.
    const base = sim.shopBase();
    const speed = Math.hypot(sim.ship.vx, sim.ship.vy);
    const hullBars = Math.max(0, Math.ceil((sim.ship.hull / hullMax(sim.ship.model)) * 10));
    hud.textContent = [
      `Speed ${Math.round(speed)}  (top ${Math.round(sim.stats.topSpeed)})`,
      `Spin  ${Math.round((sim.ship.spin * 180) / Math.PI)} deg/s  Retro ${sim.ship.parts.has("retro") ? (tuning.retro ? "ON" : "off") : "none"}`,
      `Hull  [${"#".repeat(hullBars)}${".".repeat(10 - hullBars)}]`,
      `Ore   ${sim.oreIn(sim.ship)}/${cargoText(sim.ship)}  (best ${sim.stats.bestOre})  Credits ${sim.ship.credits}  Upkeep ${sim.ship.upkeep}`,
      `Parts ${partList(sim.ship)}  Weight ${sim.shipWeight(sim.ship).toFixed(2)}`,
      `${frameText()}${sim.isDocked() ? "  DOCKED" : ""}${botPlay ? `  BOT: ${botPlay.where}` : ""}${sim.ship.marked ? "  MARKED by pirates" : ""}${sim.ship.wanted ? "  WANTED by the station" : ""}${sim.clickPilot.active ? `  ${sim.clickPilot.isCourse ? "Course" : "Click order"}: ${sim.clickPilot.task}` : ""}${sim.isDocked() && sim.ship.hull < hullMax(sim.ship.model) && !sim.hasPartsFor(tuning.repairCost) ? "  No repairs: the station is out of parts" : ""}`,
      `Rocks ${sim.rocks.length}  Wrecks ${sim.ship.wrecks}`,
      ...sim.drones.flatMap((drone, index) => {
        const { ship } = drone;
        const hull = Math.round((ship.hull / hullMax(ship.model)) * 100);
        return [
          `${ship.owner ? "YOURS " : ""}Drone ${index + 1} ${drone.task} ${sim.oreIn(ship)}/${cargoText(ship)}  Hull ${hull}%  ${ship.owner ? `Earned ${ship.earned}` : `Credits ${ship.credits}`}  Trips ${ship.trips}  Wrecks ${ship.wrecks}  Upkeep ${ship.upkeep}`,
          `  Parts ${partList(ship)}  Weight ${sim.shipWeight(ship).toFixed(2)}`,
        ];
      }),
      ...(tuning.showTraffic
        ? sim.traffic.map(
            ({ ship, task }, index) =>
              `Traffic ${index + 1} ${ship.model} ${task} ${sim.oreIn(ship)}/${cargoText(ship)}  Hull ${Math.round((ship.hull / hullMax(ship.model)) * 100)}%  Credits ${ship.credits}  Trips ${ship.trips}  Wrecks ${ship.wrecks}`,
          )
        : []),
      ...(tuning.showTraffic
        ? sim.fighters.map(
            ({ ship, task }) =>
              `${ship.faction === "pirate" ? "Pirate" : "Defender"} ${task}  Hull ${Math.round((ship.hull / hullMax(ship.model)) * 100)}%  Ore ${sim.oreIn(ship)}  Wrecks ${ship.wrecks}`,
          )
        : []),
      ...(tuning.showTraffic
        ? [`${sim.baseName(base.id)} balance ${base.account.credits}  Ore held ${sim.oreCount(base.ore)}  Part A held ${Math.floor(sim.partA(base))}  Next blueprint ${sim.blueprintQueue(base)[0] ?? "none"}${sim.deposits.some((deposit) => deposit.base === base.id && deposit.partsLeft > 0) ? "  Building deposit" : ""}  Lost traffic ${base.lostTraffic.length}  Pirate base ore ${sim.oreCount(sim.pirateOre)} credits ${Math.floor(sim.pirateCredits)} pirates ${sim.fighters.filter((pilot) => pilot.ship.faction === "pirate").length}/${sim.pirateCap}${sim.blackMarket ? `  Black market ${sim.blackMarket.stage}` : ""}`]
        : []),
      `FPS   ${Math.round(fps)}${paused ? "  PAUSED" : ""}`,
    ].join("\n");
  }

  requestAnimationFrame(frame);
}

buildPanel();
layOut();
showStart();
requestAnimationFrame(frame);

// Same commands a player uses, for automated tests and LLMs driving the game.
Object.assign(window, {
  game: {
    sim,
    restart,
    setTimeScale(scale: number) {
      timeScale = scale;
    },
    getFps: () => fps,
  },
});
