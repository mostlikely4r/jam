import { DronePilot } from "./pilot";
import { Renderer } from "./render";
import { Sim, TICK } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** A demo starts over after this long, so it keeps showing the ship at work in the field. */
const DEMO_SECONDS = 45;
/** The floater's demo cursor: how far its drags send the ship, how fast they leave it drifting. */
const HOP_MIN = 80;
const HOP_MAX = 150;
const DRIFT_MIN = 15;
const DRIFT_MAX = 30;
/** Seconds the cursor takes to glide somewhere, and to draw a drag. */
const GLIDE_SECONDS = 0.8;
const DRAW_SECONDS = 0.7;
/** Seconds it rests between gestures, and fires after turning to a rock. */
const REST_MIN = 2.5;
const REST_MAX = 4.5;
const FIRE_SECONDS = 2.5;
/** How long a drag from the ship to set a facing is, in screen pixels, and the margin kept from the edges. */
const FACE_DRAG = 60;
const MARGIN = 24;

interface Gesture {
  kind: "move" | "face";
  stage: "glide" | "draw";
  time: number;
  /** Where the cursor glides from, and the drag's start and end, in the canvas's own pixels. */
  startX: number;
  startY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * A small live world behind a ship's card in the start menu, showing how it plays.
 * The racer flies itself through the mining loop on the keys, the way a drone does.
 * The floater is flown by a pretend mouse you can see: drag moves that leave it drifting, and
 * drags from the ship that turn it to a rock before it fires.
 */
export class ShipDemo {
  private sim!: Sim;
  private pilot: DronePilot | null = null;
  private readonly renderer: Renderer;
  private accumulator = 0;
  private age = 0;
  private seed = 1;
  /** The floater's pretend mouse, in the canvas's own pixels. */
  private cursor = { x: 30, y: 30, down: false };
  private gesture: Gesture | null = null;
  private rest = 1;
  private firing = 0;
  private nextKind: "move" | "face" = "move";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly model: "racer" | "floater",
  ) {
    this.renderer = new Renderer(canvas);
    this.reset();
  }

  private reset(): void {
    const tuning: Tuning = {
      ...DEFAULTS,
      floaterStart: this.model === "floater",
      pirates: 0,
      defenders: 0,
      trafficRacers: 0,
      trafficFloaters: 0,
      testDrones: 0,
      haulers: false,
      chatter: false,
      showPoiZones: false,
      showTraffic: false,
      zoom: 1.2,
      dragAbsolute: true,
    };
    this.sim = new Sim(this.seed++, tuning);
    this.age = 0;
    this.accumulator = 0;
    this.gesture = null;
    this.rest = 1;
    this.firing = 0;
    this.nextKind = "move";
    this.cursor.down = false;
    this.renderer.drag = null;
    this.pilot = null;
    if (this.model === "racer") {
      this.pilot = new DronePilot(this.sim.ship);
      this.pilot.buys = "nothing";
    }
  }

  update(seconds: number): void {
    this.age += seconds;
    if (this.age > DEMO_SECONDS) this.reset();
    const { sim } = this;
    if (!this.pilot) this.moveCursor(seconds);
    this.accumulator += seconds;
    while (this.accumulator >= TICK) {
      if (this.pilot) this.pilot.update(sim);
      else {
        sim.controls.fire = this.firing > 0;
        this.firing = Math.max(0, this.firing - TICK);
      }
      sim.step();
      this.renderer.addEvents(sim.events);
      sim.events.length = 0;
      this.accumulator -= TICK;
    }
    this.renderer.draw(sim, this.accumulator / TICK, seconds);
    if (!this.pilot) this.drawCursor();
  }

  /**
   * One gesture at a time, the way a player makes them: glide to a spot, press, draw the
   * drag with its preview showing, let go. Moves and turns to a rock take turns, with rests
   * between. After turning to a rock it fires for a moment.
   */
  private moveCursor(seconds: number): void {
    const { cursor } = this;
    let gesture = this.gesture;
    if (!gesture) {
      this.rest -= seconds;
      if (this.rest > 0) return;
      gesture = this.planGesture();
      this.gesture = gesture;
    }
    gesture.time += seconds;
    if (gesture.kind === "face") {
      // The ship moves on screen, so the drag starts wherever it is now.
      const at = this.shipOnScreen();
      gesture.toX += at.x - gesture.fromX;
      gesture.toY += at.y - gesture.fromY;
      gesture.fromX = at.x;
      gesture.fromY = at.y;
    }
    if (gesture.stage === "glide") {
      const share = ease(Math.min(1, gesture.time / GLIDE_SECONDS));
      cursor.x = lerp(gesture.startX, gesture.fromX, share);
      cursor.y = lerp(gesture.startY, gesture.fromY, share);
      if (share >= 1) {
        gesture.stage = "draw";
        gesture.time = 0;
        cursor.down = true;
      }
      return;
    }
    const share = ease(Math.min(1, gesture.time / DRAW_SECONDS));
    cursor.x = lerp(gesture.fromX, gesture.toX, share);
    cursor.y = lerp(gesture.fromY, gesture.toY, share);
    this.renderer.drag = {
      fromX: gesture.fromX,
      fromY: gesture.fromY,
      toX: cursor.x,
      toY: cursor.y,
      on: gesture.kind === "face" ? "ship" : "space",
      dragged: true,
    };
    if (share >= 1) this.release(gesture);
  }

  /** Lets go: the order a real drag like this one would give. */
  private release(gesture: Gesture): void {
    const { sim } = this;
    const { tuning } = sim;
    const dx = (gesture.toX - gesture.fromX) / tuning.zoom;
    const dy = (gesture.toY - gesture.fromY) / tuning.zoom;
    if (gesture.kind === "face") {
      sim.orderFace(Math.atan2(dy, dx));
      this.firing = FIRE_SECONDS;
    } else {
      const spot = this.renderer.screenToWorld(gesture.fromX, gesture.fromY);
      sim.orderMove(spot.x, spot.y, dx / tuning.dragSeconds, dy / tuning.dragSeconds);
    }
    this.cursor.down = false;
    this.renderer.drag = null;
    this.gesture = null;
    this.rest = REST_MIN + sim.roll() * (REST_MAX - REST_MIN);
  }

  /** A turn to a rock in range, or else a move: somewhere on screen, back toward the field's middle if it's wandered out. */
  private planGesture(): Gesture {
    const { sim, cursor } = this;
    const { ship, field, tuning } = sim;
    const kind = this.nextKind;
    this.nextKind = kind === "move" ? "face" : "move";
    const start = { stage: "glide" as const, time: 0, startX: cursor.x, startY: cursor.y };
    const rock = this.nearestRock();
    if (kind === "face" && rock && Math.hypot(rock.x - ship.x, rock.y - ship.y) < tuning.shotSpeed * tuning.shotLife * 0.8) {
      const at = this.shipOnScreen();
      const angle = Math.atan2(rock.y - ship.y, rock.x - ship.x);
      return {
        kind: "face",
        ...start,
        fromX: at.x,
        fromY: at.y,
        toX: at.x + Math.cos(angle) * FACE_DRAG,
        toY: at.y + Math.sin(angle) * FACE_DRAG,
      };
    }
    const out = Math.hypot(ship.x - field.x, ship.y - field.y) > tuning.fieldRadius * 0.5;
    const angle = out ? Math.atan2(field.y - ship.y, field.x - ship.x) + (sim.roll() - 0.5) : sim.roll() * Math.PI * 2;
    const hop = HOP_MIN + sim.roll() * (HOP_MAX - HOP_MIN);
    const drift = DRIFT_MIN + sim.roll() * (DRIFT_MAX - DRIFT_MIN);
    const spot = this.renderer.worldToScreen(ship.x + Math.cos(angle) * hop, ship.y + Math.sin(angle) * hop);
    const fromX = this.clampX(spot.x);
    const fromY = this.clampY(spot.y);
    const length = drift * tuning.dragSeconds * tuning.zoom;
    return {
      kind: "move",
      ...start,
      fromX,
      fromY,
      toX: this.clampX(fromX + Math.cos(angle) * length),
      toY: this.clampY(fromY + Math.sin(angle) * length),
    };
  }

  private shipOnScreen(): { x: number; y: number } {
    return this.renderer.worldToScreen(this.sim.ship.x, this.sim.ship.y);
  }

  private clampX(x: number): number {
    return Math.max(MARGIN, Math.min(this.canvas.clientWidth - MARGIN, x));
  }

  private clampY(y: number): number {
    return Math.max(MARGIN, Math.min(this.canvas.clientHeight - MARGIN, y));
  }

  /** An arrow pointer, with a ring around its tip while the button is held. */
  private drawCursor(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { x, y, down } = this.cursor;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (down) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(x, y);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#05070d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4.5, 12);
    ctx.lineTo(8, 19);
    ctx.lineTo(10.5, 18);
    ctx.lineTo(7, 11);
    ctx.lineTo(12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private nearestRock() {
    const { ship, rocks } = this.sim;
    let best = Infinity;
    let found: (typeof rocks)[number] | null = null;
    for (const rock of rocks) {
      if (rock.arriving) continue;
      const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
      if (distance < best) {
        best = distance;
        found = rock;
      }
    }
    return found;
  }
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/** Starts and ends gently, like a hand moving a mouse. */
function ease(share: number): number {
  return share * share * (3 - 2 * share);
}
