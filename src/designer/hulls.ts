/**
 * Dev only: the hull designer. Each hull's mounts drawn big, as a blueprint, to move, turn and
 * size by hand. What's on a mount goes with it, and does what it does the way it now faces: a
 * thruster pushes away from its flame, a gun fires and a tractor looks the way they point.
 * Changes are in the game at once; Save writes them to src/hulls.json, which the game ships with.
 */
import {
  facing,
  HULL_MOUNTS,
  hullPlaces,
  mountsMoved,
  placeMounts,
  SHIPPED_HULLS,
  STANDARD_ANGLE,
  thrustOf,
  type HullFile,
  type Mount,
  type MountId,
} from "../fitting";
import { type PartKind, type ShipModel } from "../parts";
import { drawHull, drawPart } from "../shipArt";
import { MOUNT_NAMES } from "../inventory";

const R = 12;
const DRAFT_KEY = "jam-hulls-draft";
const MODELS: ShipModel[] = ["racer", "floater"];
const MODEL_NAMES: Record<ShipModel, string> = { racer: "Racer", floater: "Floater" };
/** Mounts that mirror each other across the ship's middle line. */
const PARTNER: Partial<Record<MountId, MountId>> = {
  thrusterRotateLeft: "thrusterRotateRight",
  thrusterRotateRight: "thrusterRotateLeft",
  thrusterStrafeLeft: "thrusterStrafeRight",
  thrusterStrafeRight: "thrusterStrafeLeft",
};

const STYLE = `
#hulls { position: fixed; inset: 0; z-index: 50; background: #05070d; display: flex; font: 13px system-ui, sans-serif; color: #cfd8e6; }
#hulls[hidden] { display: none; }
#hulls canvas { flex: 1; min-width: 0; height: 100%; cursor: default; }
#hulls .side { width: 320px; box-sizing: border-box; padding: 12px 14px; overflow-y: auto; background: #0b0f18; border-right: 1px solid #222a3a; }
#hulls h1 { font-size: 15px; margin: 0 0 2px; color: #8fb4ff; letter-spacing: 2px; }
#hulls h2 { font-size: 12px; margin: 16px 0 6px; color: #8fe3a1; text-transform: uppercase; letter-spacing: 1px; }
#hulls p { margin: 0 0 6px; color: #7f8ba0; }
#hulls button, #hulls input { background: #1a2233; color: #cfd8e6; border: 1px solid #33405a; font: inherit; padding: 4px 7px; }
#hulls button { cursor: pointer; margin: 0 4px 4px 0; }
#hulls button:hover { background: #26324a; }
#hulls button.on { background: #26324a; border-color: #8fb4ff; }
#hulls .list button { display: block; width: 100%; text-align: left; margin: 0 0 2px; border-color: transparent; background: none; }
#hulls .list button.on { background: #26324a; border-color: #4a5b80; }
#hulls .list .moved { color: #ffd479; }
#hulls .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }
#hulls label { display: block; color: #9aa6ba; }
#hulls label input { width: 100%; box-sizing: border-box; margin-top: 2px; }
#hulls .does { color: #9fd8ff; white-space: pre-line; margin: 8px 0; }
#hulls .status { color: #8fb4ff; min-height: 1.2em; margin-top: 6px; }
#hulls .keys { color: #6a7486; font-size: 12px; white-space: pre-line; }
`;

/** What a mount is drawn holding, so every mount shows something. */
function shownKind(mount: Mount): PartKind {
  return mount.accepts.includes("gun") ? "gun" : mount.accepts[0];
}

const round = (value: number, step: number) => Math.round(value / step) * step;
const clean = (value: number) => Math.round(value * 1000) / 1000;
const wrapDegrees = (angle: number) => {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
};

export class HullDesigner {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly side: HTMLDivElement;
  private model: ShipModel = "racer";
  private selected: MountId = "thrusterMain";
  private hover: MountId | null = null;
  private drag: { kind: "move" | "turn"; moved: boolean } | null = null;
  private status = "";
  /** Screen pixels per world unit, and where the ship's middle is on screen. */
  private zoom = 10;
  private cx = 0;
  private cy = 0;

  constructor(private readonly onClose: () => void) {
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
      if (draft) placeMounts(JSON.parse(draft) as HullFile);
    } catch {
      /* no draft */
    }
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
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

  private mount(id: MountId = this.selected): Mount {
    return this.mounts().find((mount) => mount.id === id)!;
  }

  private shipped(id: MountId): Required<Pick<Mount, "x" | "y" | "angle" | "scale">> {
    const place = SHIPPED_HULLS[this.model]?.[id];
    return { x: place?.x ?? 0, y: place?.y ?? 0, angle: place?.angle ?? STANDARD_ANGLE[id], scale: place?.scale ?? 1 };
  }

  private moved(mount: Mount): boolean {
    const was = this.shipped(mount.id);
    return was.x !== mount.x || was.y !== mount.y || was.angle !== mount.angle || was.scale !== mount.scale;
  }

  /** After any change: the game works out what the thrusters do again, and the draft is kept. */
  private changed(rebuild = true): void {
    const mount = this.mount();
    mount.x = clean(mount.x);
    mount.y = clean(mount.y);
    mount.angle = clean(wrapDegrees(mount.angle));
    mount.scale = clean(Math.max(0.2, Math.min(4, mount.scale)));
    mountsMoved();
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(hullPlaces()));
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

  private rebuild(): void {
    const button = (text: string, action: () => void, on = false) => {
      const b = document.createElement("button");
      b.textContent = text;
      if (on) b.className = "on";
      b.addEventListener("click", action);
      return b;
    };
    const heading = (text: string) => {
      const h = document.createElement("h2");
      h.textContent = text;
      return h;
    };
    const title = document.createElement("h1");
    title.textContent = "HULL DESIGNER";
    const intro = document.createElement("p");
    intro.textContent = "Drag a mount to move it, its knob to turn it. What's on it moves with it and works the way it faces.";

    const models = document.createElement("div");
    for (const model of MODELS) models.append(button(MODEL_NAMES[model], () => ((this.model = model), this.rebuild()), model === this.model));

    const list = document.createElement("div");
    list.className = "list";
    for (const mount of this.mounts()) {
      const b = button(MOUNT_NAMES[mount.id] ?? mount.id, () => this.select(mount.id), mount.id === this.selected);
      if (this.moved(mount)) {
        const mark = document.createElement("span");
        mark.className = "moved";
        mark.textContent = "  • changed";
        b.append(mark);
      }
      list.append(b);
    }

    const mount = this.mount();
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
        this.mount()[key] = value;
        this.changed();
      });
      wrap.append(input);
      this.fields[key] = input;
      return wrap;
    };
    grid.append(field("x", "x (to the nose, radii)", 0.05), field("y", "y (to the right, radii)", 0.05), field("angle", "faces (°, from nose, clockwise)", 15), field("scale", "size", 0.1));

    this.does = document.createElement("div");
    this.does.className = "does";
    this.does.textContent = this.describe(mount);

    const tools = document.createElement("div");
    tools.append(
      button("Back as shipped", () => {
        Object.assign(this.mount(), this.shipped(this.selected));
        this.changed();
      }),
    );
    const partner = PARTNER[mount.id];
    if (partner) {
      tools.append(
        button(`Mirror onto ${MOUNT_NAMES[partner] ?? partner}`, () => {
          const from = this.mount();
          Object.assign(this.mount(partner), { x: from.x, y: -from.y, angle: -from.angle, scale: from.scale });
          this.changed();
        }),
      );
    }

    const file = document.createElement("div");
    file.append(
      button("Save to src/hulls.json", () => void this.save()),
      button("Throw away changes", () => {
        placeMounts(SHIPPED_HULLS);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* nothing kept */
        }
        this.status = "Back to src/hulls.json as loaded";
        this.rebuild();
      }),
      button("Close (H)", () => this.close()),
    );
    this.statusLine = document.createElement("div");
    this.statusLine.className = "status";
    this.statusLine.textContent = this.status;

    const keys = document.createElement("div");
    keys.className = "keys";
    keys.textContent = [
      "Drag a mount: move it (Shift snaps to 0.05)",
      "Drag the knob, or wheel: turn it (Shift: 1°, else 15°)",
      "Ctrl + wheel, or + and −: size",
      "Arrows: nudge (Shift: finer)    Q / E: turn",
      "Tab: next mount    H or Esc: back to the game",
      "",
      "Green arrows show which way each thruster pushes the ship.",
    ].join("\n");

    this.side.replaceChildren(
      title,
      intro,
      heading("Hull"),
      models,
      heading("Mounts"),
      list,
      heading(MOUNT_NAMES[mount.id] ?? mount.id),
      grid,
      this.does,
      tools,
      heading("File"),
      file,
      this.statusLine,
      heading("Keys"),
      keys,
    );
  }

  /** Updates the boxes without rebuilding the panel, so a drag doesn't lose focus or flicker. */
  private refreshFields(): void {
    const mount = this.mount();
    for (const key of ["x", "y", "angle", "scale"] as const) {
      const input = this.fields[key];
      if (input && document.activeElement !== input) input.value = String(mount[key]);
    }
    if (this.does) this.does.textContent = this.describe(mount);
    if (this.statusLine) this.statusLine.textContent = this.status;
  }

  private select(id: MountId): void {
    this.selected = id;
    this.rebuild();
  }

  /** What the part on this mount does from where it is, in words. */
  private describe(mount: Mount): string {
    const thrust = thrustOf(this.model);
    const percent = (value: number) => `${Math.round(Math.abs(value) * 100)}%`;
    const side = (degrees: number, what: string) => {
      const a = Math.round(wrapDegrees(degrees));
      if (a === 0) return `${what} straight ahead`;
      if (Math.abs(a) === 180) return `${what} straight back`;
      return `${what} ${Math.abs(a)}° ${a > 0 ? "right" : "left"} of the nose`;
    };
    if (mount.id === "thrusterRotateLeft" || mount.id === "thrusterRotateRight") {
      const turn = thrust.turn[mount.id];
      const way = mount.id === "thrusterRotateRight" ? "right" : "left";
      const other = way === "right" ? "left" : "right";
      if (Math.abs(turn) < 0.005) return "Turns the ship: not at all (it pushes through the middle)";
      return turn > 0 ? `Turns the ship ${way} at ${percent(turn)} of standard` : `Turns the ship ${other} (backwards!) at ${percent(turn)} of standard`;
    }
    const push = thrust.push[mount.id as keyof typeof thrust.push];
    if (push) {
      const parts = [];
      if (Math.abs(push.x) > 0.005) parts.push(`${percent(push.x)} ${push.x > 0 ? "ahead" : "back"}`);
      if (Math.abs(push.y) > 0.005) parts.push(`${percent(push.y)} ${push.y > 0 ? "right" : "left"}`);
      return `Pushes the ship ${parts.join(", ")}\n(full strength, whichever way it faces; no twist)`;
    }
    if (mount.id === "gun") return side(mount.angle, "Fires") + (this.model === "floater" ? "\nA turret here rests that way and aims itself." : "");
    if (mount.id === "tractor") return side(mount.angle, "Catches ore") + "\n(the all-round tractor catches all round)";
    return "Inside the hull: shows nothing.\nWhere it sits is where hits land on it.";
  }

  private async save(): Promise<void> {
    try {
      const response = await fetch("/__hulls", { method: "POST", body: JSON.stringify(hullPlaces(), null, 2) + "\n" });
      this.status = response.ok ? "Saved to src/hulls.json" : `Couldn't save (${response.status})`;
      if (response.ok) {
        Object.assign(SHIPPED_HULLS, hullPlaces());
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
    const reach = 46;
    return [x + Math.cos(a) * reach, y + Math.sin(a) * reach];
  }

  private pick(sx: number, sy: number): { id: MountId; kind: "move" | "turn" } | null {
    const selected = this.mount();
    const [kx, ky] = this.knob(selected);
    if (Math.hypot(kx - sx, ky - sy) < 10) return { id: selected.id, kind: "turn" };
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
      if (hit.id !== this.selected) this.select(hit.id);
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
      if (this.drag.kind === "move") {
        const [x, y] = this.fromScreen(sx, sy);
        const step = event.shiftKey ? 0.05 : 0.01;
        mount.x = round(x, step);
        mount.y = round(y, step);
      } else {
        const [mx, my] = this.toScreen(mount.x, mount.y);
        const degrees = (Math.atan2(sy - my, sx - mx) * 180) / Math.PI;
        mount.angle = round(degrees, event.shiftKey ? 1 : 15);
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
        const way = event.deltaY > 0 ? 1 : -1;
        if (event.ctrlKey) mount.scale = round(mount.scale - way * 0.1, 0.1);
        else mount.angle += way * (event.shiftKey ? 1 : 15);
        this.changed(false);
      },
      { passive: false },
    );
    window.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;
      if (event.target instanceof HTMLInputElement) return;
      const mount = this.mount();
      const nudge = event.shiftKey ? 0.01 : 0.05;
      const turn = event.shiftKey ? 1 : 15;
      let handled = true;
      switch (event.code) {
        case "Escape":
        case "KeyH":
          this.close();
          break;
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
      if (this.isOpen) this.changed(false);
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
      const strong = i % 4 === 0;
      ctx.strokeStyle = strong ? "rgba(120,170,230,0.28)" : "rgba(120,170,230,0.1)";
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

    // The ship, big.
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.zoom, this.zoom);
    drawHull(ctx, this.model, [120, 150, 190]);
    for (const mount of this.mounts()) {
      ctx.save();
      ctx.translate(mount.x * R, mount.y * R);
      ctx.rotate(facing(mount));
      ctx.scale(mount.scale, mount.scale);
      drawPart(ctx, shownKind(mount), 0, mount.id === "thrusterMain");
      ctx.restore();
    }
    ctx.restore();

    // What each does, then the handles on top.
    const thrust = thrustOf(this.model);
    for (const mount of this.mounts()) {
      const [x, y] = this.toScreen(mount.x, mount.y);
      const on = mount.id === this.selected;
      const push = thrust.push[mount.id as keyof typeof thrust.push];
      if (push) this.arrow(x, y, push.x, push.y, on ? 60 : 34, on ? "#8fe3a1" : "rgba(143,227,161,0.55)");
      if (mount.id === "thrusterRotateLeft" || mount.id === "thrusterRotateRight") {
        const away = facing(mount) + Math.PI;
        const strength = Math.abs(thrust.turn[mount.id]);
        this.arrow(x, y, Math.cos(away), Math.sin(away), (on ? 60 : 34) * Math.min(2, Math.max(0.15, strength)), on ? "#8fe3a1" : "rgba(143,227,161,0.55)");
      }
      if (mount.id === "gun") {
        const a = facing(mount);
        ctx.strokeStyle = on ? "rgba(255,120,100,0.9)" : "rgba(255,120,100,0.45)";
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * unit * 2.2, y + Math.sin(a) * unit * 2.2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (mount.id === "tractor") {
        const a = facing(mount);
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
      const on = mount.id === this.selected;
      const hover = mount.id === this.hover;
      ctx.strokeStyle = on ? "#ffd479" : hover ? "#ffffff" : "rgba(220,230,250,0.6)";
      ctx.lineWidth = on ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, on ? 8 : 6, 0, Math.PI * 2);
      ctx.stroke();
      if (on || hover) {
        ctx.fillStyle = on ? "#ffd479" : "#dfe7f3";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(MOUNT_NAMES[mount.id] ?? mount.id, x + 10, y - 10);
      }
    }
    // The selected mount's turning knob.
    const selected = this.mount();
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
