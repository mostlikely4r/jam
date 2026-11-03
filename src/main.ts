import { Audio } from "./audio";
import { Renderer } from "./render";
import { MAX_HULL, Sim, TICK } from "./sim";
import { DEFAULTS, GROUPS, THRUSTERS, type Tuning } from "./tuning";

const STORAGE_KEY = "flight-test-tuning";
const MAX_FRAME_SECONDS = 0.1;
/** Beyond this, other ships' work can't be heard. */
const HEARING_DISTANCE = 1500;

function loadTuning(): Tuning {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const tuning: Tuning = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Tuning)[]) {
      if (key in saved) Object.assign(tuning, { [key]: saved[key] });
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
const renderer = new Renderer(canvas);
const audio = new Audio();

const keys = new Set<string>();
let mouseFire = false;
let paused = false;
let timeScale = 1;

function restart(): void {
  seed++;
  sim.reset(seed);
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
  retro.textContent = `Retro thrust: ${tuning.retro ? "ON" : "OFF"} (X)`;
  retro.addEventListener("click", () => setRetro(!tuning.retro));
  panel.append(retro);

  for (const group of GROUPS) {
    const heading = document.createElement("h2");
    heading.textContent = group.title;
    panel.append(heading);
    for (const slider of group.sliders) {
      const label = document.createElement("label");
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = slider.label;
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = String(tuning[slider.key]);
      row.append(name, value);

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(slider.min);
      input.max = String(slider.max);
      input.step = String(slider.step);
      input.value = String(tuning[slider.key]);
      input.addEventListener("input", () => {
        tuning[slider.key] = Number(input.value);
        value.textContent = input.value;
        saveTuning();
      });
      // Hand the keyboard straight back to the ship.
      input.addEventListener("change", () => input.blur());
      label.append(row, input);
      panel.append(label);
    }

    if (group.title === "Thrusters") {
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
        panel.append(toggle);
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

function readControls(): void {
  const forward = keys.has("KeyW") || keys.has("ArrowUp");
  const back = keys.has("KeyS") || keys.has("ArrowDown");
  const turnLeft = keys.has("KeyQ") || keys.has("ArrowLeft");
  const turnRight = keys.has("KeyE") || keys.has("ArrowRight");
  sim.controls.thrust = (forward ? 1 : 0) - (back ? 1 : 0);
  sim.controls.strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  sim.controls.turn = (turnRight ? 1 : 0) - (turnLeft ? 1 : 0);
  sim.controls.fire = keys.has("Space") || mouseFire;
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
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  keys.clear();
  mouseFire = false;
});
canvas.addEventListener("mousedown", (event) => {
  audio.start();
  if (event.button === 0) mouseFire = true;
});
window.addEventListener("mouseup", () => (mouseFire = false));
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
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

let lastTime = performance.now();
let accumulator = 0;
let fps = 60;
let hudTimer = 0;

function frame(now: number): void {
  const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastTime) / 1000);
  lastTime = now;
  if (seconds > 0) fps += (1 / seconds - fps) * 0.05;

  readControls();
  if (!paused) {
    accumulator += seconds * timeScale;
    while (accumulator >= TICK) {
      sim.step();
      accumulator -= TICK;
    }
  }

  renderer.addEvents(sim.events);
  audio.play(
    sim.events.filter(
      (event) => Math.hypot(event.x - sim.ship.x, event.y - sim.ship.y) < HEARING_DISTANCE,
    ),
  );
  sim.events.length = 0;
  audio.setThrust(!paused && sim.ship.firing.size > 0);
  renderer.draw(sim, paused ? 1 : accumulator / TICK, paused ? 0 : seconds);

  hudTimer -= seconds;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    const speed = Math.hypot(sim.ship.vx, sim.ship.vy);
    const hullBars = Math.max(0, Math.ceil((sim.ship.hull / MAX_HULL) * 10));
    hud.textContent = [
      `Speed ${Math.round(speed)}  (top ${Math.round(sim.stats.topSpeed)})`,
      `Spin  ${Math.round((sim.ship.spin * 180) / Math.PI)} deg/s  Retro ${tuning.retro ? "ON" : "off"}`,
      `Hull  [${"#".repeat(hullBars)}${".".repeat(10 - hullBars)}]`,
      `Ore   ${sim.ship.ore}  (best ${sim.stats.bestOre})  Credits ${sim.stats.credits}`,
      `Moving relative to ${sim.ship.frame.name}${sim.isDocked() ? "  DOCKED" : ""}`,
      `Rocks ${sim.rocks.length}  Wrecks ${sim.stats.wrecks}`,
      ...sim.drones.map((drone) => {
        const hull = Math.round((drone.ship.hull / MAX_HULL) * 100);
        return `Drone ${drone.task} ${drone.ship.ore}/${tuning.droneCargo}  Hull ${hull}%`;
      }),
      ...(sim.drones.length > 0
        ? [`Drone trips ${sim.stats.droneTrips}  Wrecks ${sim.stats.droneWrecks}`]
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
