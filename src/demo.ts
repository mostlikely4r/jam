import { DronePilot } from "./pilot";
import { Renderer } from "./render";
import { type Rock, Sim, TICK } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** A demo starts over after this long, so it keeps showing the ship at work in the field. */
const DEMO_SECONDS = 60;
/** Seconds the cursor takes to glide somewhere, and to draw a drag. */
const GLIDE_SECONDS = 0.8;
const DRAW_SECONDS = 0.7;
/** Seconds it pauses once an order is done, before the next gesture. */
const PAUSE_SECONDS = 1;
/** Seconds it fires once turned to a rock, and rests after. */
const FIRE_SECONDS = 2.5;
const REST_SECONDS = 1.5;
/** How far from a rock it hovers, and how far the ship can see a rock to go for it. */
const HOVER_DISTANCE = 170;
/** A drift toward a rock that's not yet in sight. */
const APPROACH_DRIFT = 20;
/** How long a drag from the ship to set a facing is, and the margin kept from the edges, in screen pixels. */
const FACE_DRAG = 60;
const MARGIN = 24;

/**
 * What the floater's pretend mouse is doing: getting a rock in sight, settling beside it at
 * its speed, or turning to face it.
 */
type GestureKind = "approach" | "hover" | "face";

interface Gesture {
  kind: GestureKind;
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
 * The floater is flown by a pretend mouse you can see, one order at a time, each finished
 * before the next: drag toward a rock until it's in sight, drag to sit beside it at its
 * speed, drag from the ship to turn to it, then shoot.
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
  /** The rock it's working on. */
  private rock: Rock | null = null;
  /** The last gesture let go, while its order is still being flown. */
  private waitingFor: GestureKind | null = null;
  /** Seconds until the next gesture. */
  private pause = 1;
  private firing = 0;
  /** A rock whose pace the destination just given should keep, checked once it's moving. */
  private pacing: Rock | null = null;

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
    this.rock = null;
    this.waitingFor = null;
    this.lastKind = null;
    this.pause = 1;
    this.firing = 0;
    this.pacing = null;
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
      this.keepPace();
      this.renderer.addEvents(sim.events);
      sim.events.length = 0;
      this.accumulator -= TICK;
    }
    this.renderer.draw(sim, this.accumulator / TICK, seconds);
    if (!this.pilot) this.drawCursor();
  }

  /**
   * One thing at a time, the way a player would: make a gesture, wait for the ship to finish
   * the order, pause, then the next. After turning to a rock it shoots, then rests.
   */
  private moveCursor(seconds: number): void {
    const { sim } = this;
    if (this.gesture) {
      this.animate(this.gesture, seconds);
      return;
    }
    if (this.waitingFor) {
      if (sim.clickPilot.active) return;
      const done = this.waitingFor;
      this.waitingFor = null;
      this.pause = PAUSE_SECONDS;
      if (done === "face") this.firing = FIRE_SECONDS;
      return;
    }
    if (this.firing > 0) {
      this.pause = REST_SECONDS;
      return;
    }
    this.pause -= seconds;
    if (this.pause > 0) return;
    this.gesture = this.planGesture();
  }

  /**
   * The next step with the current rock: get it in sight, then sit beside it, then face it.
   * A rock that's gone, or one that's been shot at, makes way for the nearest one.
   */
  private planGesture(): Gesture | null {
    const { sim } = this;
    const last = this.lastKind;
    if (!this.rock || !sim.rocks.includes(this.rock) || last === "face") this.rock = this.nearestRock();
    const rock = this.rock;
    if (!rock) return null;
    const hover = this.hoverSpot(rock);
    if (last === "hover" && this.near(rock)) {
      this.lastKind = "face";
      return this.faceGesture(rock);
    }
    // Only a rock that's out of reach of the screen needs approaching first.
    const far = !this.onScreen(hover.x, hover.y) && !this.near(rock);
    this.lastKind = far ? "approach" : "hover";
    return this.moveGesture(this.lastKind, rock);
  }

  private lastKind: GestureKind | null = null;

  /** Where to sit beside a rock: short of it, on the ship's side. */
  private hoverSpot(rock: Rock): { x: number; y: number } {
    const { ship } = this.sim;
    const away = Math.hypot(ship.x - rock.x, ship.y - rock.y) || 1;
    const distance = HOVER_DISTANCE + rock.radius;
    return { x: rock.x + ((ship.x - rock.x) / away) * distance, y: rock.y + ((ship.y - rock.y) / away) * distance };
  }

  private near(rock: Rock): boolean {
    const { ship } = this.sim;
    return Math.hypot(ship.x - rock.x, ship.y - rock.y) < (HOVER_DISTANCE + rock.radius) * 1.6;
  }

  /**
   * A drag in open space. To hover, it starts on the spot beside the rock and is drawn as
   * the rock's own motion, so the ship ends up keeping pace with it. To approach, it heads
   * the rock's way as far as the screen goes, drifting on toward it.
   */
  private moveGesture(kind: "approach" | "hover", rock: Rock): Gesture {
    const { sim } = this;
    const { tuning } = sim;
    const hover = this.hoverSpot(rock);
    const spot = this.renderer.worldToScreen(hover.x, hover.y);
    const fromX = this.clampX(spot.x);
    const fromY = this.clampY(spot.y);
    // The rock's real motion, less what carries things where the ship is: the drift that keeps pace with it.
    const { ship } = sim;
    let vx = (rock.x - rock.px) / TICK - ((ship.x - ship.px) / TICK - ship.vx);
    let vy = (rock.y - rock.py) / TICK - ((ship.y - ship.py) / TICK - ship.vy);
    if (kind === "approach") {
      const toward = Math.atan2(rock.y - ship.y, rock.x - ship.x);
      vx = Math.cos(toward) * APPROACH_DRIFT;
      vy = Math.sin(toward) * APPROACH_DRIFT;
    }
    const scale = tuning.dragSeconds * tuning.zoom;
    return {
      kind,
      ...this.glideStart(),
      fromX,
      fromY,
      toX: this.clampX(fromX + vx * scale),
      toY: this.clampY(fromY + vy * scale),
    };
  }

  /** A drag from the ship toward the rock, to turn and face it. */
  private faceGesture(rock: Rock): Gesture {
    const { ship } = this.sim;
    const at = this.shipOnScreen();
    const angle = Math.atan2(rock.y - ship.y, rock.x - ship.x);
    return {
      kind: "face",
      ...this.glideStart(),
      fromX: at.x,
      fromY: at.y,
      toX: at.x + Math.cos(angle) * FACE_DRAG,
      toY: at.y + Math.sin(angle) * FACE_DRAG,
    };
  }

  private glideStart() {
    return { stage: "glide" as const, time: 0, startX: this.cursor.x, startY: this.cursor.y };
  }

  /** Glides to the start, presses, draws the drag with its preview showing, and lets go. */
  private animate(gesture: Gesture, seconds: number): void {
    const { cursor } = this;
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

  /** Lets go: the order a real drag like this one would give. Then it waits for the ship. */
  private release(gesture: Gesture): void {
    const { sim } = this;
    const { tuning } = sim;
    const dx = (gesture.toX - gesture.fromX) / tuning.zoom;
    const dy = (gesture.toY - gesture.fromY) / tuning.zoom;
    if (gesture.kind === "face") {
      sim.orderFace(Math.atan2(dy, dx));
    } else {
      const spot = this.renderer.screenToWorld(gesture.fromX, gesture.fromY);
      sim.orderMove(spot.x, spot.y, dx / tuning.dragSeconds, dy / tuning.dragSeconds);
    }
    this.cursor.down = false;
    this.renderer.drag = null;
    this.gesture = null;
    this.waitingFor = gesture.kind;
    if (gesture.kind === "hover") this.pacing = this.rock;
  }

  /**
   * Things are carried differently from place to place, so a drawn drift is only about
   * right. Once the destination is moving, its drift is trued up to the rock's real pace,
   * as a player would with a small drag from the destination.
   */
  private keepPace(): void {
    const rock = this.pacing;
    const spot = this.sim.clickPilot.spot;
    if (!rock || !spot) return;
    // A new destination starts with no last position to measure its pace from.
    if (spot.x === spot.px && spot.y === spot.py) return;
    this.pacing = null;
    if (!this.sim.rocks.includes(rock)) return;
    const dx = (rock.x - rock.px - (spot.x - spot.px)) / TICK;
    const dy = (rock.y - rock.py - (spot.y - spot.py)) / TICK;
    if (Math.hypot(dx, dy) > 0.2) this.sim.orderNudge(dx, dy);
  }

  private nearestRock(): Rock | null {
    const { ship, rocks } = this.sim;
    let best = Infinity;
    let found: Rock | null = null;
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

  private shipOnScreen(): { x: number; y: number } {
    return this.renderer.worldToScreen(this.sim.ship.x, this.sim.ship.y);
  }

  private onScreen(x: number, y: number): boolean {
    const at = this.renderer.worldToScreen(x, y);
    return this.clampX(at.x) === at.x && this.clampY(at.y) === at.y;
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
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/** Starts and ends gently, like a hand moving a mouse. */
function ease(share: number): number {
  return share * share * (3 - 2 * share);
}
