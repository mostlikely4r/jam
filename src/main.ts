import { Audio } from "./audio";
import { Radio } from "./radio";
import { type Deposit, MAX_HULL, SHIP_RADIUS, type Ship, Sim, TICK } from "./sim";
import { type DragStart, ORDER_RING, Renderer } from "./render";
import { type BlueprintId, isProject, PARTS, partFits, type Part } from "./parts";
import { DEFAULTS, GROUPS, THRUSTERS, type Tuning } from "./tuning";

const STORAGE_KEY = "flight-test-tuning";
const MAX_FRAME_SECONDS = 0.1;
/** Beyond this, other ships' work can't be heard. */
const HEARING_DISTANCE = 1500;

/** Panel sections the player has folded away. */
const COLLAPSED_KEY = "space-game-panel-collapsed";
const collapsed = new Set<string>(loadCollapsed());

function loadCollapsed(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function loadTuning(): Tuning {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const tuning: Tuning = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Tuning)[]) {
      // JSON has no infinity: it saves as null.
      const value = saved[key] === null && DEFAULTS[key] === Infinity ? Infinity : saved[key];
      if (key in saved && value !== null) Object.assign(tuning, { [key]: value });
    }
    return tuning;
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
const renderer = new Renderer(canvas);
const audio = new Audio();

const keys = new Set<string>();
let paused = false;
let timeScale = 1;

function restart(): void {
  seed++;
  sim.reset(seed);
  buildPanel();
}

/** Buys a part, or sells it back if the ship already has it. */
function tradePart(part: Part): void {
  if (sim.ship.parts.has(part.id)) sim.sellPart(sim.ship, part.id);
  else if (sim.unlocked(part.id)) sim.buyPart(sim.ship, part.id);
  else if (partFits(part, sim.ship.model)) sim.fundBlueprint(sim.ship, part.id);
  if (!panel.hidden) buildPanel();
}

function tradeDrone(): void {
  if (sim.unlocked("drone")) sim.buyDrone(sim.ship);
  else sim.fundBlueprint(sim.ship, "drone");
}

/** One line of the shop. The style names its color, and without one the line is greyed out. */
interface ShopLine {
  tag: string;
  style?: "buy" | "sell" | "unlock" | "partial" | "pending" | "poor";
  text: string;
  enabled: boolean;
}

/** An item the station can't sell yet: paid and on its way, or still to pay for. */
function lockedLine(id: BlueprintId, label: string): ShopLine {
  if (sim.blueprintsOrdered.has(id)) {
    const coming = isProject(id) ? "being built from the station's parts" : "coming with the next hauler";
    return { tag: "pending", style: "pending", text: `${label}: paid, ${coming}`, enabled: false };
  }
  const left = sim.blueprintLeft(id);
  const price = sim.blueprintPrice(id);
  const text = `${label}: ${left === price ? `${price} credits` : `${left} of ${price} credits left`}`;
  const { credits } = sim.ship;
  if (credits <= 0) return { tag: "not enough money", style: "poor", text, enabled: false };
  if (credits < left) return { tag: "unlock partial", style: "partial", text, enabled: true };
  return { tag: "unlock", style: "unlock", text, enabled: true };
}

/** An item the station can sell, as far as it has the parts and the buyer has the credits. */
function saleLine(price: number, label: string, text: string): ShopLine {
  if (!sim.hasPartsFor(price)) return { tag: "out of parts", text: label, enabled: false };
  if (sim.ship.credits < price) return { tag: "not enough money", style: "poor", text, enabled: false };
  return { tag: "buy", style: "buy", text, enabled: true };
}

function shopButton(key: string, line: ShopLine, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = line.style ?? "";
  button.disabled = !line.enabled;
  button.textContent = `${key} [${line.tag}] ${line.text}`;
  button.addEventListener("click", () => {
    onClick();
    button.blur();
  });
  return button;
}

/** The hauler's arrival, in words for the shop's heading. */
function haulerText(): string {
  const eta = sim.haulerEta();
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
  if (sim.ship.ore <= 0) return { tag: "no ore", text: `Drop ore here for ${depositPays} credits each`, enabled: false };
  if (amount <= 0) return { tag: "full", text: "The deposit has no room", enabled: false };
  return { tag: "sell", style: "sell", text: `Drop ${amount} ore for ${amount * depositPays} credits`, enabled: true };
}

function loadLine(deposit: Deposit): ShopLine {
  const { depositSells, creditsPerOre } = tuning;
  const amount = sim.depositBuyable(sim.ship, deposit);
  if (deposit.ore <= 0) return { tag: "empty", text: `Load ore here for ${depositSells} credits each`, enabled: false };
  if (sim.ship.ore >= sim.cargoSpace(sim.ship)) return { tag: "bay full", text: "No room for more ore", enabled: false };
  if (amount <= 0) return { tag: "not enough money", style: "poor", text: `Load ore here for ${depositSells} credits each`, enabled: false };
  const text = `Load ${amount} ore for ${amount * depositSells} credits. The station pays ${amount * creditsPerOre}`;
  return { tag: "buy", style: "buy", text, enabled: true };
}

function updateDepositShop(deposit: Deposit): void {
  const { ship } = sim;
  const title = `Field deposit - holds ${Math.floor(deposit.ore)} of ${tuning.depositCapacity} ore`;
  if (shopHeading.textContent !== title) shopHeading.textContent = title;
  const state = `deposit ${ship.ore} ${sim.cargoSpace(ship)} ${ship.credits} ${deposit.ore} ${tuning.depositPays} ${tuning.depositSells} ${tuning.depositCapacity}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = false;
  shop.replaceChildren(
    shopHeading,
    shopButton("1", dropLine(deposit), () => sim.sellToDeposit(ship, deposit)),
    shopButton("2", loadLine(deposit), () => sim.buyFromDeposit(ship, deposit)),
  );
}

function updateShop(): void {
  const { ship } = sim;
  const docked = sim.isDocked();
  const deposit = docked ? null : sim.depositAt();
  if (deposit) {
    updateDepositShop(deposit);
    return;
  }
  if (docked) {
    const title = `Dock shop - station ${Math.floor(sim.stationAccount.credits)} credits - ${haulerText()}`;
    if (shopHeading.textContent !== title) shopHeading.textContent = title;
  }
  const state = `${docked} ${ship.credits} ${[...ship.parts].join()} ${sim.drones.length} ${tuning.partPriceScale} ${tuning.partWeightScale} ${tuning.dronePrice} ${tuning.droneLimit} ${PARTS.map((part) => sim.hasPartsFor(sim.partPrice(part.id))).join()} ${sim.hasPartsFor(tuning.dronePrice)} ${[...sim.blueprints].join()} ${[...sim.blueprintPaid].join()} ${[...sim.blueprintsOrdered].join()} ${sim.unlocked("deposit")} ${tuning.depositPrice} ${tuning.depositParts} ${sim.unlocked("stationGuards")} ${sim.unlocked("depositGuards")} ${tuning.stationGuardPrice} ${tuning.stationGuardParts} ${tuning.depositGuardPrice} ${tuning.depositGuardParts} ${tuning.blueprintScale} ${tuning.stationUnlocks}`;
  if (state === shopState) return;
  shopState = state;
  shop.hidden = !docked;
  if (!docked) return;

  shop.replaceChildren(shopHeading);
  PARTS.forEach((part, index) => {
    const owned = ship.parts.has(part.id);
    const fits = partFits(part, ship.model);
    const price = sim.partPrice(part.id);
    const weight = (part.weight * tuning.partWeightScale).toFixed(2);
    const line: ShopLine = owned
      ? { tag: "sell", style: "sell", text: `${part.label} for ${price}, -${weight} weight`, enabled: true }
      : !fits
        ? { tag: "doesn't fit", text: part.label, enabled: false }
        : !sim.unlocked(part.id)
          ? lockedLine(part.id, part.label)
          : saleLine(price, part.label, `${part.label}: ${price} credits, +${weight} weight. ${part.description}`);
    shop.append(shopButton(partKey(index), line, () => tradePart(part)));
  });

  const full = sim.drones.length >= tuning.droneLimit;
  const droneLine: ShopLine = full
    ? { tag: "at limit", text: `New drone: ${tuning.droneLimit} of ${tuning.droneLimit}`, enabled: false }
    : !sim.unlocked("drone")
      ? lockedLine("drone", "New drone")
      : saleLine(
          tuning.dronePrice,
          "New drone",
          `New drone: ${tuning.dronePrice} credits. Earns for you (${sim.drones.length}/${tuning.droneLimit})`,
        );
  shop.append(shopButton("-", droneLine, tradeDrone));

  const depositLine: ShopLine = sim.unlocked("deposit")
    ? { tag: "built", text: "Field deposit: open at the field's edge", enabled: false }
    : lockedLine("deposit", `Field deposit (${tuning.depositParts} parts)`);
  shop.append(shopButton("·", depositLine, () => sim.fundBlueprint(ship, "deposit")));

  const stationGuardLine: ShopLine = sim.unlocked("stationGuards")
    ? { tag: "built", text: "Station turrets: on guard", enabled: false }
    : lockedLine("stationGuards", `Station turrets (${tuning.stationGuardParts} parts)`);
  shop.append(shopButton("·", stationGuardLine, () => sim.fundBlueprint(ship, "stationGuards")));

  let depositGuardLine: ShopLine;
  if (sim.unlocked("depositGuards")) depositGuardLine = { tag: "built", text: "Deposit turrets: on guard", enabled: false };
  else if (!sim.unlocked("deposit")) depositGuardLine = { tag: "needs a deposit", text: "Deposit turrets", enabled: false };
  else depositGuardLine = lockedLine("depositGuards", `Deposit turrets (${tuning.depositGuardParts} parts)`);
  shop.append(shopButton("·", depositGuardLine, () => sim.fundBlueprint(ship, "depositGuards")));
}

/** Keys 1 to 9 and then 0 pick a part. The minus key buys a drone. */
function partKey(index: number): string {
  if (index > 10) return "·";
  if (index === 10) return "=";
  return index === 9 ? "0" : String(index + 1);
}

function saveTuning(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
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
    const open = !collapsed.has(group.title);
    heading.className = open ? "group" : "group closed";
    heading.textContent = group.title;
    body.hidden = !open;
    heading.addEventListener("click", () => {
      if (collapsed.has(group.title)) collapsed.delete(group.title);
      else collapsed.add(group.title);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
      body.hidden = collapsed.has(group.title);
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
      const note = document.createElement("p");
      note.textContent = "Your ship's parts, free for testing:";
      body.append(note);
      for (const part of PARTS) {
        if (!partFits(part, sim.ship.model)) continue;
        const toggle = document.createElement("label");
        toggle.className = "toggle";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = sim.ship.parts.has(part.id);
        box.addEventListener("change", () => {
          if (box.checked) sim.ship.parts.add(part.id);
          else sim.ship.parts.delete(part.id);
          box.blur();
        });
        toggle.append(box, ` ${part.label}`);
        body.append(toggle);
      }
    }

    if (group.title === "Thrusters") {
      const note = document.createElement("p");
      note.textContent = "Switches for your ship. Reverse and strafe also need their parts.";
      body.append(note);
      for (const thruster of THRUSTERS) {
        const toggle = document.createElement("label");
        toggle.className = "toggle";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = tuning[thruster.id];
        box.addEventListener("change", () => {
          tuning[thruster.id] = box.checked;
          saveTuning();
          box.blur();
        });
        toggle.append(box, ` ${thruster.label}`);
        body.append(toggle);
      }
    }
  }

  const reset = document.createElement("button");
  reset.textContent = "Reset to defaults";
  reset.addEventListener("click", () => {
    Object.assign(tuning, DEFAULTS);
    saveTuning();
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

function readControls(): void {
  const forward = keys.has("KeyW") || keys.has("ArrowUp");
  const back = keys.has("KeyS") || keys.has("ArrowDown");
  const turnLeft = keys.has("KeyQ") || keys.has("ArrowLeft");
  const turnRight = keys.has("KeyE") || keys.has("ArrowRight");
  sim.controls.fire = keys.has("Space");
  const thrust = (forward ? 1 : 0) - (back ? 1 : 0);
  const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const turn = (turnRight ? 1 : 0) - (turnLeft ? 1 : 0);
  // The keys fly while held. The order waits and takes back over once they're let go.
  if (thrust !== 0 || strafe !== 0 || turn !== 0) sim.clickPilot.handsOn();
  if (sim.clickPilot.flying) return;
  sim.controls.thrust = thrust;
  sim.controls.strafe = strafe;
  sim.controls.turn = turn;
}

window.addEventListener("keydown", (event) => {
  audio.start();
  if (event.code === "Tab") {
    event.preventDefault();
    panel.hidden = !panel.hidden;
    return;
  }
  if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
  if (event.repeat) return;
  if (event.code === "KeyR") restart();
  if (event.code === "KeyP") paused = !paused;
  if (event.code === "KeyM") audio.toggleMute();
  if (event.code === "KeyX") setRetro(!tuning.retro);
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (digit && sim.isDocked()) {
    const part = PARTS[digit[1] === "0" ? 9 : Number(digit[1]) - 1];
    if (part) tradePart(part);
  }
  const deposit = sim.isDocked() ? null : sim.depositAt();
  if (deposit && event.code === "Digit1") sim.sellToDeposit(sim.ship, deposit);
  if (deposit && event.code === "Digit2") sim.buyFromDeposit(sim.ship, deposit);
  if (event.code === "Equal" && sim.isDocked() && PARTS[10]) tradePart(PARTS[10]);
  if (event.code === "Minus" && sim.isDocked()) tradeDrone();
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
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

/** Whether a screen point is on a world position, with room for a quick click. */
function near(clientX: number, clientY: number, x: number, y: number, radius: number): boolean {
  const at = renderer.worldToScreen(x, y);
  const reach = Math.max(18, radius * tuning.zoom * 1.6);
  return Math.hypot(clientX - at.x, clientY - at.y) < reach;
}

/** What a right press lands on. The ship comes first, as the smaller and more used target. */
function dragStart(clientX: number, clientY: number): DragStart {
  if (near(clientX, clientY, sim.ship.x, sim.ship.y, SHIP_RADIUS)) return "ship";
  const target = sim.clickPilot.target();
  if (target && near(clientX, clientY, target.x, target.y, ORDER_RING)) return "destination";
  return "space";
}

canvas.addEventListener("mousedown", (event) => {
  audio.start();
  if (event.button !== 2) return;
  const { clientX: x, clientY: y } = event;
  drag = { fromX: x, fromY: y, toX: x, toY: y, on: dragStart(x, y) };
});
window.addEventListener("mouseup", (event) => {
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
  const owned = PARTS.filter((part) => ship.parts.has(part.id));
  return owned.length > 0 ? owned.map((part) => part.short).join(" ") : "none";
}

let lastTime = performance.now();
const radio = new Radio(document.getElementById("chatter")!);
let accumulator = 0;
let fps = 60;
let hudTimer = 0;

function frame(now: number): void {
  const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastTime) / 1000);
  lastTime = now;
  if (seconds > 0) fps += (1 / seconds - fps) * 0.05;

  readControls();
  sim.ship.aim = mouse ? renderer.screenToWorld(mouse.x, mouse.y) : null;
  if (!paused) {
    accumulator += seconds * timeScale;
    while (accumulator >= TICK) {
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
  renderer.drag = drag && {
    ...drag,
    dragged: Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY) >= DRAG_PIXELS,
  };
  renderer.draw(sim, paused ? 1 : accumulator / TICK, paused ? 0 : seconds);

  hudTimer -= seconds;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    const speed = Math.hypot(sim.ship.vx, sim.ship.vy);
    const hullBars = Math.max(0, Math.ceil((sim.ship.hull / MAX_HULL) * 10));
    hud.textContent = [
      `Speed ${Math.round(speed)}  (top ${Math.round(sim.stats.topSpeed)})`,
      `Spin  ${Math.round((sim.ship.spin * 180) / Math.PI)} deg/s  Retro ${sim.ship.parts.has("retro") ? (tuning.retro ? "ON" : "off") : "none"}`,
      `Hull  [${"#".repeat(hullBars)}${".".repeat(10 - hullBars)}]`,
      `Ore   ${sim.ship.ore}/${cargoText(sim.ship)}  (best ${sim.stats.bestOre})  Credits ${sim.ship.credits}  Upkeep ${sim.ship.upkeep}`,
      `Parts ${partList(sim.ship)}  Weight ${sim.shipWeight(sim.ship).toFixed(2)}`,
      `${frameText()}${sim.isDocked() ? "  DOCKED" : ""}${sim.clickPilot.active ? `  Click order: ${sim.clickPilot.task}` : ""}${sim.isDocked() && sim.ship.hull < MAX_HULL && !sim.hasPartsFor(tuning.repairCost) ? "  No repairs: the station is out of parts" : ""}`,
      `Rocks ${sim.rocks.length}  Wrecks ${sim.ship.wrecks}`,
      ...sim.drones.flatMap((drone, index) => {
        const { ship } = drone;
        const hull = Math.round((ship.hull / MAX_HULL) * 100);
        return [
          `${ship.owner ? "YOURS " : ""}Drone ${index + 1} ${drone.task} ${ship.ore}/${cargoText(ship)}  Hull ${hull}%  ${ship.owner ? `Earned ${ship.earned}` : `Credits ${ship.credits}`}  Trips ${ship.trips}  Wrecks ${ship.wrecks}  Upkeep ${ship.upkeep}`,
          `  Parts ${partList(ship)}  Weight ${sim.shipWeight(ship).toFixed(2)}`,
        ];
      }),
      ...(tuning.showTraffic
        ? sim.traffic.map(
            ({ ship, task }, index) =>
              `Traffic ${index + 1} ${ship.model} ${task} ${ship.ore}/${cargoText(ship)}  Hull ${Math.round((ship.hull / MAX_HULL) * 100)}%  Credits ${ship.credits}  Trips ${ship.trips}  Wrecks ${ship.wrecks}`,
          )
        : []),
      ...(tuning.showTraffic
        ? sim.fighters.map(
            ({ ship, task }) =>
              `${ship.faction === "pirate" ? "Pirate" : "Defender"} ${task}  Hull ${Math.round((ship.hull / MAX_HULL) * 100)}%  Ore ${ship.ore}  Wrecks ${ship.wrecks}`,
          )
        : []),
      ...(tuning.showTraffic
        ? [`Station balance ${sim.stationAccount.credits}  Ore held ${Math.floor(sim.stationOre)}  Parts held ${Math.floor(sim.stationParts)}  Next blueprint ${sim.blueprintQueue()[0] ?? "none"}${sim.deposits.some((deposit) => deposit.partsLeft > 0) ? "  Building deposit" : ""}  Lost traffic ${sim.lostTraffic.length}  Pirate base ore ${Math.floor(sim.pirateOre)}`]
        : []),
      `FPS   ${Math.round(fps)}${paused ? "  PAUSED" : ""}`,
    ].join("\n");
  }

  requestAnimationFrame(frame);
}

buildPanel();
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
