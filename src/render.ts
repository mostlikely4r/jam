import type { FighterPilot, DronePilot } from "./pilot";
import type { ThrusterId } from "./tuning";
import {
  BLACK_MARKET_LENGTH,
  BLACK_MARKET_WIDTH,
  bodyAt,
  DEPOSIT_HALF,
  DOCK_OFFSET,
  HAULER_LENGTH,
  HAULER_WIDTH,
  PIRATE_BASE_RADIUS,
  Sim,
  SHIP_RADIUS,
  STATION_HALF,
  TICK,
  type Base,
  type Poi,
  type PoiReading,
  type Ship,
  type SimEvent,
} from "./sim";

const ORE_COLORS = ["#ff9d5c", "#6fe0c8", "#e9d36a"];
/** How long the mark where a pirate was last seen takes to fade away. */
const GHOST_MILLISECONDS = 30000;
const PING_SECONDS = 1.4;
/** After a wreck the view stays on it, fades to black, and fades back in on the rebuilt ship. */
const WRECK_WATCH_SECONDS = 2;
const WRECK_FADE_SECONDS = 0.4;
/** Cargo lumps drawn on a ship when its hold is full. */
const CARGO_LUMPS = 9;
/** A pointer to a place only shows within this many screen widths of it. */
const POINTER_SCREENS = 2;
/** A ping from off screen: how long it shows, how deep it reaches in and how much of the edge it covers, as shares of the screen, and how far off its direction may be. */
const EDGE_PING_SECONDS = 2;
const EDGE_PING_DEPTH = 0.1;
const EDGE_PING_SPAN = 0.45;
const EDGE_PING_SPREAD = Math.PI / 3;
const GUARD_RADIUS = 16;
const GUARD_BARREL = 30;
const HAULER_COLUMNS = 10;
const HAULER_ROWS = 4;
const PILE_ROWS = 12;
const PILE_ORE_PER_LUMP = 5;
/** Rows of the station's deck that crates of parts can fill. */
const CRATE_ROWS = 4;
const CRATE_COLOR = "#7f93b5";
const CRATE_EDGE = "#c4d2ea";
const DRONE_COLOR = [180, 200, 120];
const OWNED_DRONE_COLOR = [120, 190, 255];
const TRAFFIC_COLOR = [150, 155, 165];
const ORDER_COLOR = "rgba(143, 180, 255, 0.8)";
/** The order's circle at its destination, in world units. */
export const ORDER_RING = 12;
/** What a right drag started on. */
export type DragStart = "ship" | "destination" | "space";
/** The circle around the ship for a facing, in world units. */
const ORDER_SHIP_RING = 30;
const PIRATE_COLOR = [235, 90, 80];
const DEFENDER_COLOR = [110, 235, 170];
/** The hollow marker shows the distance this many seconds ahead at the current closing speed. */
const MARKER_LOOK_SECONDS = 3;
const MARKER_SCALE = 14;
const MARKER_MAX_OFFSET = 90;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  depth: number;
}

/** A speck of dust: still in whatever carries the ship, so it shows the ship's own motion. */
interface Mote {
  x: number;
  y: number;
  /** Below 1 it moves slower than the world, which reads as further off. */
  depth: number;
  bright: number;
}

const MOTES = 140;
/** How much of a second's motion each speck smears into a streak. */
const DUST_STREAK = 1 / 30;

const PLANET_MARKS = 1500;

/** How each kind of body looks, until they get looks of their own. */
const BODY_LOOKS: Record<string, { ground: string; dark: string; light: string; haze: string; glow: number }> = {
  star: { ground: "#f4c55a", dark: "rgba(200, 120, 30, 0.35)", light: "rgba(255, 240, 180, 0.35)", haze: "rgba(255, 200, 90, 0.5)", glow: 1.3 },
  planet: { ground: "#20344f", dark: "rgba(12, 24, 42, 0.45)", light: "rgba(70, 105, 150, 0.22)", haze: "rgba(120, 170, 235, 0.4)", glow: 1.04 },
  moon: { ground: "#3a3f48", dark: "rgba(20, 22, 28, 0.45)", light: "rgba(120, 128, 140, 0.25)", haze: "rgba(170, 178, 192, 0.2)", glow: 1.02 },
  asteroid: { ground: "#4a4036", dark: "rgba(25, 20, 15, 0.45)", light: "rgba(130, 115, 95, 0.25)", haze: "rgba(0, 0, 0, 0)", glow: 1.01 },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  /** `bend` turns an off-screen ping's direction a little, so it says roughly where, not exactly. */
  private pings: { speaker: Ship | null; x: number; y: number; mayday: boolean; age: number; bend: number }[] = [];
  /** Where the player last saw each pirate, in the axes of what it was near. */
  private ghosts = new WeakMap<Ship, { poi: Poi; x: number; y: number; seenAt: number }>();
  private stars: Star[] = [];
  private motes: Mote[] = [];
  /** Where the marks on a body's ground are, as shares of its radius. */
  private planetMarks: { angle: number; distance: number; size: number; light: boolean }[] = [];
  private flash = 0;
  /** Shows what strangers shouldn't need: pointers to every ship. */
  dev = false;
  /** The player's wreck, watched for a moment before the view returns to the rebuilt ship. */
  private wreck: { x: number; y: number; age: number } | null = null;
  /** The world being drawn, for details drawn deep inside. */
  private sim: Sim | null = null;
  /** Each ship's own scatter of cargo lumps. */
  private cargoSeeds = new WeakMap<Ship, number>();

  /** Whether the player is watching their wreck, and shouldn't be flying. */
  get watchingWreck(): boolean {
    return this.wreck !== null && this.wreck.age < WRECK_WATCH_SECONDS + WRECK_FADE_SECONDS;
  }
  private view = { camX: 0, camY: 0, scale: 1, dpr: 1, width: 0, height: 0 };
  /** A right drag in progress, in screen pixels, for its preview. */
  drag: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    on: DragStart;
    dragged: boolean;
  } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 260; i++) {
      this.stars.push({
        x: Math.random() * 4000,
        y: Math.random() * 4000,
        depth: 0.08 + Math.random() * 0.35,
      });
    }
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({ x: Math.random(), y: Math.random(), depth: 0.45 + Math.random() * 0.55, bright: 0.25 + Math.random() * 0.5 });
    }
    for (let i = 0; i < PLANET_MARKS; i++) {
      const size = 0.004 + Math.random() * Math.random() * 0.05;
      this.planetMarks.push({
        angle: Math.random() * Math.PI * 2,
        distance: Math.sqrt(Math.random()) * (1 - size),
        size,
        light: Math.random() < 0.4,
      });
    }
  }

  /** The world position under a point on the screen, as of the last drawn frame. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const { camX, camY, scale, dpr, width, height } = this.view;
    return {
      x: camX + (clientX * dpr - width / 2) / scale,
      y: camY + (clientY * dpr - height / 2) / scale,
    };
  }

  /** Where a world position is on the screen, as of the last drawn frame. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const { camX, camY, scale, dpr, width, height } = this.view;
    return {
      x: ((x - camX) * scale + width / 2) / dpr,
      y: ((y - camY) * scale + height / 2) / dpr,
    };
  }

  /**
   * A ring that grows from whoever just spoke on the radio. From off screen, the edge of a
   * big ring reaches in from roughly that side instead.
   */
  addPing(line: { speaker: Ship | null; x: number; y: number; mayday: boolean }): void {
    const { speaker, x, y, mayday } = line;
    this.pings.push({ speaker, x, y, mayday, age: 0, bend: (Math.random() - 0.5) * EDGE_PING_SPREAD });
  }

  addEvents(events: SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "hit":
          this.burst(event.x, event.y, 4, "#ffd9a0", 110, 0.22, 2);
          break;
        case "break":
          this.burst(event.x, event.y, Math.round(event.radius / 2) + 6, "#9aa3b2", 150, 0.6, 3);
          break;
        case "pickup":
          this.burst(event.x, event.y, 6, ORE_COLORS[event.kind], 90, 0.3, 2);
          break;
        case "sale":
          this.burst(event.x, event.y, 5, "#8fe3a1", 110, 0.35, 2);
          break;
        case "impact":
          this.burst(event.x, event.y, 10, "#ff7a5c", 200, 0.4, 2);
          if (event.player) this.flash = Math.min(0.5, this.flash + event.damage / 50);
          break;
        case "wreck":
          this.burst(event.x, event.y, 50, "#ffb36b", 320, 1, 3);
          if (event.player) {
            this.flash = 0.7;
            this.wreck = { x: event.x, y: event.y, age: 0 };
          }
          break;
        case "shot":
          break;
      }
    }
  }

  private burst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
    life: number,
    size: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const dir = Math.random() * Math.PI * 2;
      const velocity = speed * (0.3 + Math.random() * 0.7);
      const particleLife = life * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x,
        y,
        vx: Math.cos(dir) * velocity,
        vy: Math.sin(dir) * velocity,
        life: particleLife,
        maxLife: particleLife,
        color,
        size,
      });
    }
  }

  /** `alpha` is how far the display sits between the last two simulation ticks. */
  draw(sim: Sim, alpha: number, frameSeconds: number): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const { ship, tuning } = sim;
    const shipX = lerp(ship.px, ship.x, alpha);
    const shipY = lerp(ship.py, ship.y, alpha);
    this.sim = sim;
    if (this.wreck) this.wreck.age += frameSeconds;
    if (this.wreck && this.wreck.age > WRECK_WATCH_SECONDS + WRECK_FADE_SECONDS * 2) this.wreck = null;
    const onWreck = this.wreck !== null && this.wreck.age < WRECK_WATCH_SECONDS + WRECK_FADE_SECONDS;
    const camX = onWreck ? this.wreck!.x : shipX + ship.vx * tuning.lookahead;
    const camY = onWreck ? this.wreck!.y : shipY + ship.vy * tuning.lookahead;
    const scale = tuning.zoom * dpr;
    this.view = { camX, camY, scale, dpr, width, height };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, width, height);
    this.drawStars(width, height, dpr);
    this.drawDust(ship, camX, camY, scale, width, height, dpr, alpha, onWreck);

    ctx.setTransform(scale, 0, 0, scale, width / 2 - camX * scale, height / 2 - camY * scale);
    const halfW = width / 2 / scale + 80;
    const halfH = height / 2 / scale + 80;
    const visible = (x: number, y: number, r: number) =>
      Math.abs(x - camX) < halfW + r && Math.abs(y - camY) < halfH + r;

    this.drawBodies(sim, alpha, visible);
    for (const base of sim.bases) this.drawStation(sim, base, alpha);
    this.drawDeposits(sim, alpha);
    this.drawGuards(sim, alpha);
    for (const base of sim.bases) this.drawHauler(sim, base, alpha);
    this.drawBlackMarket(sim, alpha);
    this.drawPirateBase(sim, alpha);
    if (tuning.showPoiZones) this.drawPoiZones(sim, alpha);
    this.drawClickTarget(sim, alpha);
    this.drawRocks(sim, alpha, visible);
    this.drawOres(sim, alpha, visible);
    this.drawShots(sim, alpha);
    this.drawPings(alpha, frameSeconds);
    this.updateParticles(frameSeconds);
    this.drawTractor(sim, ship, shipX, shipY, alpha, true);
    for (const pilot of sim.traffic) {
      const other = pilot.ship;
      const x = lerp(other.px, other.x, alpha);
      const y = lerp(other.py, other.y, alpha);
      this.drawShip(other, x, y, alpha, TRAFFIC_COLOR);
      if (tuning.showTraffic) this.drawTask(sim, pilot, x, y, "#a8adb8");
    }
    for (const pilot of sim.fighters) this.drawFighter(sim, pilot, alpha);
    for (const drone of sim.drones) {
      const other = drone.ship;
      this.drawTractor(sim, other, lerp(other.px, other.x, alpha), lerp(other.py, other.y, alpha), alpha, false);
      this.drawDrone(sim, drone, alpha);
    }
    this.drawShip(ship, shipX, shipY, alpha, [200, 215, 235]);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawEdgePings(alpha);
    this.drawPointers(sim, width, height, scale, dpr);
    this.drawDrag(sim, scale, dpr, shipX, shipY, alpha);
    if (this.wreck) {
      // Black at the switch from the wreck to the rebuilt ship, fading either side of it.
      const fromSwitch = Math.abs(this.wreck.age - (WRECK_WATCH_SECONDS + WRECK_FADE_SECONDS));
      const dark = Math.max(0, 1 - fromSwitch / WRECK_FADE_SECONDS);
      if (dark > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${dark})`;
        ctx.fillRect(0, 0, width, height);
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 70, 50, ${this.flash * 0.35})`;
      ctx.fillRect(0, 0, width, height);
      this.flash = Math.max(0, this.flash - frameSeconds * 1.8);
    }
  }

  /** The far stars: so far off that nothing in the system moves them. */
  private drawStars(width: number, height: number, dpr: number): void {
    const { ctx } = this;
    for (const star of this.stars) {
      const x = star.x * (width / 4000);
      const y = star.y * (height / 4000);
      const brightness = Math.round(70 + star.depth * 300);
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${Math.min(255, brightness + 25)})`;
      const size = (star.depth > 0.3 ? 2 : 1) * dpr;
      ctx.fillRect(x, y, size, size);
    }
  }

  /**
   * The near dust: still in whatever carries the ship, so parked in a field it hangs still,
   * and on the move it streams past at the ship's own speed. Wraps round the screen, so
   * there's always the same amount whatever the zoom.
   */
  private drawDust(ship: Ship, camX: number, camY: number, scale: number, width: number, height: number, dpr: number, alpha: number, onWreck: boolean): void {
    const { ctx } = this;
    // Where the camera is in the carried frame: the world position less all the carrying.
    const offX = camX - lerp(ship.prevCarriedX, ship.carriedX, alpha);
    const offY = camY - lerp(ship.prevCarriedY, ship.carriedY, alpha);
    // Watching the wreck the camera holds still, and so does the dust.
    const vx = onWreck ? 0 : ship.vx;
    const vy = onWreck ? 0 : ship.vy;
    ctx.lineCap = "round";
    for (const mote of this.motes) {
      const x = mod(mote.x * width - offX * scale * mote.depth, width);
      const y = mod(mote.y * height - offY * scale * mote.depth, height);
      const dx = vx * scale * mote.depth * DUST_STREAK;
      const dy = vy * scale * mote.depth * DUST_STREAK;
      const shade = Math.round(90 + mote.bright * 110 * mote.depth);
      ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade + 15}, ${mote.bright})`;
      ctx.lineWidth = (mote.depth > 0.8 ? 1.5 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(x, y);
      // A streak trails back the way it's going past, and is a dot at rest.
      ctx.lineTo(x + dx + (Math.abs(dx) + Math.abs(dy) < 0.5 ? 0.5 : 0), y + dy);
      ctx.stroke();
    }
  }

  /**
   * Stars, planets, moons and asteroids: placeholders for now, a disc of ground under a thin
   * glow, with marks on it so that flying over it can be seen and felt.
   */
  private drawBodies(sim: Sim, alpha: number, visible: (x: number, y: number, r: number) => boolean): void {
    const { ctx } = this;
    const { camX, camY, scale, width, height } = this.view;
    const halfDiagonal = Math.hypot(width, height) / 2 / scale;
    const time = sim.now - (1 - alpha) * TICK;
    sim.bodies.forEach((body, index) => {
      const look = BODY_LOOKS[body.kind] ?? BODY_LOOKS.planet;
      const { radius } = body;
      const { x: cx, y: cy } = bodyAt(body, time);
      // The air thins from the ground out to its edge. Without any, a thin glow.
      const glowRadius = body.atmosphere > radius ? body.atmosphere : radius * look.glow;
      if (radius <= 0 || Math.hypot(cx - camX, cy - camY) - halfDiagonal > glowRadius) return;
      const glow = ctx.createRadialGradient(cx, cy, radius, cx, cy, glowRadius);
      glow.addColorStop(0, look.haze);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.ground;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      // Each body turns its marks a different way round, so no two look the same.
      const turn = index * 2.4 + (body.spinPeriod !== 0 ? (Math.PI * 2 * time) / body.spinPeriod : 0);
      for (const light of [false, true]) {
        ctx.fillStyle = light ? look.light : look.dark;
        ctx.beginPath();
        for (const mark of this.planetMarks) {
          if (mark.light !== light) continue;
          const x = cx + Math.cos(mark.angle + turn) * mark.distance * radius;
          const y = cy + Math.sin(mark.angle + turn) * mark.distance * radius;
          const size = mark.size * radius;
          if (!visible(x, y, size)) continue;
          ctx.moveTo(x + size, y);
          ctx.arc(x, y, size, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    });
  }

  /** A station and its dock, with the ore and parts its base holds. */
  private drawStation(sim: Sim, base: Base, alpha: number): void {
    const { ctx } = this;
    const station = base.poi;
    const x = lerp(station.px, station.x, alpha);
    const y = lerp(station.py, station.y, alpha);
    const size = STATION_HALF * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lerp(station.prevRotation, station.rotation, alpha));

    const dockX = DOCK_OFFSET - STATION_HALF;
    const dockY = -STATION_HALF;
    ctx.fillStyle = sim.dockedAt() === station ? "rgba(143, 227, 161, 0.2)" : "rgba(143, 227, 161, 0.07)";
    ctx.fillRect(dockX, dockY, size, size);
    ctx.strokeStyle = "#8fe3a1";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(dockX, dockY, size, size);
    ctx.setLineDash([]);

    ctx.fillStyle = "#6b7280";
    ctx.fillRect(-STATION_HALF, -STATION_HALF, size, size);
    ctx.strokeStyle = "#aab1bd";
    ctx.lineWidth = 3;
    ctx.strokeRect(-STATION_HALF, -STATION_HALF, size, size);
    this.drawOrePile(base.ore, STATION_HALF);
    this.drawCrates(base.parts, STATION_HALF);
    ctx.restore();
  }

  /** A small deck with its ore on it, inside the ring where ships can trade with it. */
  private drawDeposits(sim: Sim, alpha: number): void {
    const { ctx } = this;
    const here = sim.depositAt();
    for (const deposit of sim.deposits) {
      const x = lerp(deposit.px, deposit.x, alpha);
      const y = lerp(deposit.py, deposit.y, alpha);
      if (deposit.partsLeft > 0) {
        this.drawDepositFrame(x, y, deposit.partsUsed / (deposit.partsUsed + deposit.partsLeft));
        continue;
      }
      ctx.fillStyle = deposit === here ? "rgba(143, 227, 161, 0.14)" : "rgba(143, 227, 161, 0.05)";
      ctx.strokeStyle = "#8fe3a1";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(x, y, sim.tuning.depositReach, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(-DEPOSIT_HALF, -DEPOSIT_HALF, DEPOSIT_HALF * 2, DEPOSIT_HALF * 2);
      ctx.strokeStyle = "#aab1bd";
      ctx.lineWidth = 3;
      ctx.strokeRect(-DEPOSIT_HALF, -DEPOSIT_HALF, DEPOSIT_HALF * 2, DEPOSIT_HALF * 2);
      this.drawOrePile(deposit.ore, DEPOSIT_HALF);
      ctx.restore();
    }
  }

  /** Turrets: faint while being built, with a barrel once finished. POI zones also show their reach. */
  private drawGuards(sim: Sim, alpha: number): void {
    const { ctx } = this;
    for (const battery of sim.batteries) {
      const built = battery.partsLeft <= 0;
      ctx.globalAlpha = built ? 1 : 0.25 + (0.5 * battery.partsUsed) / (battery.partsUsed + battery.partsLeft);
      for (const guard of battery.guns) {
        const x = lerp(guard.px, guard.x, alpha);
        const y = lerp(guard.py, guard.y, alpha);
        ctx.fillStyle = "#6b7280";
        ctx.strokeStyle = "#aab1bd";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, GUARD_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (!built) continue;
        const angle = lerp(guard.prevAngle, guard.angle, alpha);
        ctx.strokeStyle = "#6eeba9";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * GUARD_BARREL, y + Math.sin(angle) * GUARD_BARREL);
        ctx.stroke();
        if (!sim.tuning.showPoiZones) continue;
        ctx.strokeStyle = "rgba(110, 235, 170, 0.35)";
        ctx.lineWidth = 2;
        ctx.setLineDash([24, 18]);
        ctx.beginPath();
        ctx.arc(x, y, sim.tuning.guardRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** A deposit under construction: its outline, with the deck filling in as parts go into it. */
  private drawDepositFrame(x: number, y: number, built: number): void {
    const { ctx } = this;
    const size = DEPOSIT_HALF * 2;
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(x - DEPOSIT_HALF, y + DEPOSIT_HALF - size * built, size, size * built);
    ctx.strokeStyle = "#aab1bd";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(x - DEPOSIT_HALF, y - DEPOSIT_HALF, size, size);
    ctx.setLineDash([]);
  }

  /** Parts as crates along the far edge of the deck, in front of any ore that reaches them. */
  private drawCrates(parts: number, half: number): void {
    const { ctx } = this;
    const crates = Math.min(PILE_ROWS * CRATE_ROWS, Math.ceil(parts / PILE_ORE_PER_LUMP));
    const pitch = (half * 2) / (PILE_ROWS + 1);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CRATE_EDGE;
    for (let i = 0; i < crates; i++) {
      ctx.fillStyle = CRATE_COLOR;
      const x = -half + pitch * ((i % PILE_ROWS) + 1);
      const y = -half + pitch * (Math.floor(i / PILE_ROWS) + 1);
      ctx.fillRect(x - pitch * 0.36, y - pitch * 0.36, pitch * 0.72, pitch * 0.72);
      ctx.strokeRect(x - pitch * 0.36, y - pitch * 0.36, pitch * 0.72, pitch * 0.72);
    }
  }

  /** Ore as lumps on a deck around the origin, filling up row by row, with no number to read. */
  private drawOrePile(ore: number, half: number): void {
    const { ctx } = this;
    const lumps = Math.min(PILE_ROWS * PILE_ROWS, Math.ceil(ore / PILE_ORE_PER_LUMP));
    const pitch = (half * 2) / (PILE_ROWS + 1);
    for (let i = 0; i < lumps; i++) {
      ctx.fillStyle = ORE_COLORS[(i * 7) % ORE_COLORS.length];
      const x = -half + pitch * ((i % PILE_ROWS) + 1);
      const y = half - pitch * (Math.floor(i / PILE_ROWS) + 1);
      ctx.fillRect(x - pitch * 0.3, y - pitch * 0.3, pitch * 0.6, pitch * 0.6);
    }
  }

  /** A line to each piece of ore being pulled, and for the player a faint ring at full range. */
  private drawTractor(
    sim: Sim,
    ship: Ship,
    x: number,
    y: number,
    alpha: number,
    showRange: boolean,
  ): void {
    if (!ship.parts.has("tractor") || ship.ore >= sim.cargoSpace(ship)) return;
    const { ctx } = this;
    const range = sim.tuning.tractorRange;
    ctx.lineWidth = 1;
    if (showRange) {
      ctx.strokeStyle = "rgba(111, 224, 200, 0.12)";
      ctx.beginPath();
      ctx.arc(x, y, range, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(111, 224, 200, 0.45)";
    ctx.beginPath();
    for (const ore of sim.ores) {
      if (Math.hypot(ore.x - ship.x, ore.y - ship.y) > range) continue;
      ctx.moveTo(x, y);
      ctx.lineTo(lerp(ore.px, ore.x, alpha), lerp(ore.py, ore.y, alpha));
    }
    ctx.stroke();
  }

  private drawPirateBase(sim: Sim, alpha: number): void {
    const base = sim.pirateBase;
    if (!base) return;
    const { ctx } = this;
    ctx.fillStyle = "rgba(235, 90, 80, 0.08)";
    ctx.strokeStyle = "#eb5a50";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    const x = lerp(base.px, base.x, alpha);
    const y = lerp(base.py, base.y, alpha);
    ctx.arc(x, y, PIRATE_BASE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(x, y);
    this.drawOrePile(sim.pirateOre, PIRATE_BASE_RADIUS * 0.65);
    ctx.restore();
  }

  /**
   * The order being flown: a circle at the destination, with a line for how it drifts
   * against the ship, and a line from the ship for a facing it holds.
   */
  /**
   * Each POI's carrying zones: a solid ring where it stops carrying fully, a dashed one
   * where it stops carrying at all. Infinite ranges have no ring.
   */
  private drawPoiZones(sim: Sim, alpha: number): void {
    const { ctx } = this;
    const pois = [sim.field, ...sim.docks, ...(sim.pirateBase ? [sim.pirateBase] : []), ...sim.extraFields.map((extra) => extra.poi)];
    ctx.lineWidth = 2;
    for (const poi of pois) {
      const { full, none } = sim.carryRange(poi);
      const x = lerp(poi.px, poi.x, alpha);
      const y = lerp(poi.py, poi.y, alpha);
      ctx.strokeStyle = "rgba(200, 160, 255, 0.45)";
      if (full !== Infinity) {
        ctx.beginPath();
        ctx.arc(x, y, poi.reach + full, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (none !== Infinity && none > full) {
        ctx.setLineDash([24, 18]);
        ctx.strokeStyle = "rgba(200, 160, 255, 0.3)";
        ctx.beginPath();
        ctx.arc(x, y, poi.reach + none, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawClickTarget(sim: Sim, alpha: number): void {
    const { ctx } = this;
    const { ship, clickPilot, tuning } = sim;
    ctx.strokeStyle = ORDER_COLOR;
    ctx.lineWidth = 1.5;
    const face = clickPilot.facing();
    if (face !== null) {
      const x = lerp(ship.px, ship.x, alpha);
      const y = lerp(ship.py, ship.y, alpha);
      ctx.beginPath();
      ctx.arc(x, y, ORDER_SHIP_RING, 0, Math.PI * 2);
      ctx.moveTo(x + Math.cos(face) * ORDER_SHIP_RING, y + Math.sin(face) * ORDER_SHIP_RING);
      ctx.lineTo(x + Math.cos(face) * ORDER_SHIP_RING * 2, y + Math.sin(face) * ORDER_SHIP_RING * 2);
      ctx.stroke();
    }
    const target = clickPilot.target();
    if (!target) return;
    const x = lerp(target.px, target.x, alpha);
    const y = lerp(target.py, target.y, alpha);
    ctx.beginPath();
    ctx.arc(x, y, ORDER_RING, 0, Math.PI * 2);
    const spot = clickPilot.spot;
    if (clickPilot.drifting && spot) {
      // Measured the way new drags are: against what carries things there, or as seen from the ship.
      const vx = tuning.dragAbsolute ? spot.vx : (target.x - target.px - (ship.x - ship.px)) / TICK;
      const vy = tuning.dragAbsolute ? spot.vy : (target.y - target.py - (ship.y - ship.py)) / TICK;
      ctx.moveTo(x, y);
      ctx.lineTo(x + vx * tuning.dragSeconds, y + vy * tuning.dragSeconds);
    }
    ctx.stroke();
  }

  /** The preview of a right drag: what the order will be when it's let go. */
  private drawDrag(sim: Sim, scale: number, dpr: number, shipX: number, shipY: number, alpha: number): void {
    const { drag, ctx } = this;
    if (!drag) return;
    ctx.strokeStyle = ORDER_COLOR;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    const target = sim.clickPilot.target();
    if (drag.on === "destination" && target) {
      // The nudge as it will land: from the drifting destination, scaled down.
      const at = this.worldToScreen(lerp(target.px, target.x, alpha), lerp(target.py, target.y, alpha));
      const cx = at.x * dpr;
      const cy = at.y * dpr;
      const share = sim.tuning.nudgeShare;
      ctx.arc(cx, cy, ORDER_RING * scale * 1.6, 0, Math.PI * 2);
      if (drag.dragged) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (drag.toX - drag.fromX) * share * dpr, cy + (drag.toY - drag.fromY) * share * dpr);
      }
    } else if (drag.on === "ship") {
      const at = this.worldToScreen(shipX, shipY);
      const cx = at.x * dpr;
      const cy = at.y * dpr;
      const ring = ORDER_SHIP_RING * scale;
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      if (drag.dragged) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (drag.toX - drag.fromX) * dpr, cy + (drag.toY - drag.fromY) * dpr);
      }
    } else {
      const cx = drag.fromX * dpr;
      const cy = drag.fromY * dpr;
      ctx.arc(cx, cy, ORDER_RING * scale, 0, Math.PI * 2);
      if (drag.dragged) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(drag.toX * dpr, drag.toY * dpr);
      }
    }
    ctx.stroke();
  }

  private drawRocks(
    sim: Sim,
    alpha: number,
    visible: (x: number, y: number, r: number) => boolean,
  ): void {
    const { ctx } = this;
    for (const rock of sim.rocks) {
      const x = lerp(rock.px, rock.x, alpha);
      const y = lerp(rock.py, rock.y, alpha);
      if (!visible(x, y, rock.radius * 1.2)) continue;
      const angle = lerp(rock.prevAngle, rock.angle, alpha);
      ctx.beginPath();
      for (let i = 0; i < rock.shape.length; i++) {
        const a = angle + (i / rock.shape.length) * Math.PI * 2;
        const r = rock.radius * rock.shape[i];
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rock.tier === 2 ? "#3c424e" : rock.tier === 1 ? "#4a505d" : "#5a606d";
      ctx.fill();
      ctx.strokeStyle = "#7c8494";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawOres(
    sim: Sim,
    alpha: number,
    visible: (x: number, y: number, r: number) => boolean,
  ): void {
    const { ctx } = this;
    for (const ore of sim.ores) {
      const x = lerp(ore.px, ore.x, alpha);
      const y = lerp(ore.py, ore.y, alpha);
      if (!visible(x, y, 8)) continue;
      ctx.fillStyle = ORE_COLORS[ore.kind];
      if (ore.amount > 1) {
        // Worth more: bigger, with a bright edge.
        ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.strokeStyle = "#fff6d8";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 6, y - 6, 12, 12);
      } else {
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
    }
  }

  private drawShots(sim: Sim, alpha: number): void {
    const { ctx } = this;
    ctx.strokeStyle = "#fff2b0";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const shot of sim.shots) {
      const x = lerp(shot.px, shot.x, alpha);
      const y = lerp(shot.py, shot.y, alpha);
      ctx.moveTo(x, y);
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      ctx.lineTo(x - (shot.vx / speed) * 14, y - (shot.vy / speed) * 14);
    }
    ctx.stroke();
  }

  private updateParticles(seconds: number): void {
    const { ctx } = this;
    this.particles = this.particles.filter((p) => {
      p.life -= seconds;
      if (p.life <= 0) return false;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      return true;
    });
    ctx.globalAlpha = 1;
  }

  private drawDrone(sim: Sim, drone: DronePilot, alpha: number): void {
    const { ship } = drone;
    const x = lerp(ship.px, ship.x, alpha);
    const y = lerp(ship.py, ship.y, alpha);
    this.drawShip(ship, x, y, alpha, ship.owner ? OWNED_DRONE_COLOR : DRONE_COLOR);
    this.drawTask(sim, drone, x, y, ship.owner ? "#8fc8ff" : "#f2c572");
  }

  /**
   * A pirate only shows when the player has a line of sight to it, and then its cone shows
   * too. Otherwise there's a fading mark where it was last seen. The traffic readouts show
   * everything, along with what each ship is doing.
   */
  private drawFighter(sim: Sim, pilot: FighterPilot, alpha: number): void {
    const { ctx } = this;
    const { ship } = pilot;
    const { tuning } = sim;
    const x = lerp(ship.px, ship.x, alpha);
    const y = lerp(ship.py, ship.y, alpha);
    const pirate = ship.faction === "pirate";
    if (pirate && !tuning.showTraffic && !sim.playerSees(ship)) {
      this.drawGhost(ship);
      return;
    }
    if (pirate) {
      const poi = sim.nearestPoi(ship.x, ship.y);
      const dx = ship.x - poi.x;
      const dy = ship.y - poi.y;
      const cos = Math.cos(poi.rotation);
      const sin = Math.sin(poi.rotation);
      this.ghosts.set(ship, {
        poi,
        x: dx * cos + dy * sin,
        y: -dx * sin + dy * cos,
        seenAt: performance.now(),
      });
    }
    if (tuning.showTraffic || pirate) {
      const half = ((tuning.visionAngle / 2) * Math.PI) / 180;
      const angle = lerp(ship.prevAngle, ship.angle, alpha);
      ctx.fillStyle = pirate ? "rgba(235, 90, 80, 0.07)" : "rgba(110, 235, 170, 0.07)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, tuning.visionRange, angle - half, angle + half);
      ctx.closePath();
      ctx.fill();
    }
    if (tuning.showTraffic) this.drawTask(sim, pilot, x, y, pirate ? "#eb5a50" : "#6eebaa");
    this.drawShip(ship, x, y, alpha, pirate ? PIRATE_COLOR : DEFENDER_COLOR);

    // A ring that closes as it spots the player, and is whole once it has.
    const spotted = pirate ? pilot.spotted(sim, sim.ship) : 0;
    if (spotted > 0) {
      ctx.strokeStyle = "#ff7a6e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, SHIP_RADIUS + 14, -Math.PI / 2, -Math.PI / 2 + spotted * Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Where a ping comes from right now, and where that is on the canvas. */
  private pingSpot(ping: Renderer["pings"][number], alpha: number) {
    const { speaker } = ping;
    const x = speaker ? lerp(speaker.px, speaker.x, alpha) : ping.x;
    const y = speaker ? lerp(speaker.py, speaker.y, alpha) : ping.y;
    const { camX, camY, scale, width, height } = this.view;
    const screenX = (x - camX) * scale + width / 2;
    const screenY = (y - camY) * scale + height / 2;
    const onScreen = screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
    return { x, y, screenX, screenY, onScreen };
  }

  private pingColor(ping: Renderer["pings"][number]): string {
    return ping.mayday ? "#ff6b5c" : ping.speaker ? "#a8d8ff" : "#8fe3a1";
  }

  private drawPings(alpha: number, frameSeconds: number): void {
    const { ctx } = this;
    this.pings = this.pings.filter((ping) => ping.age < Math.max(PING_SECONDS, EDGE_PING_SECONDS));
    for (const ping of this.pings) {
      ping.age += frameSeconds;
      const { x, y, onScreen } = this.pingSpot(ping, alpha);
      if (!onScreen || ping.age >= PING_SECONDS) continue;
      const share = Math.min(1, ping.age / PING_SECONDS);
      ctx.globalAlpha = (1 - share) * 0.8;
      ctx.strokeStyle = this.pingColor(ping);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, SHIP_RADIUS + 6 + share * (ping.mayday ? 160 : 70), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * For lines from off screen: the edge of a big ring pushes in a little way from roughly
   * the side it came from, covering part of that edge, then fades. In canvas pixels.
   */
  private drawEdgePings(alpha: number): void {
    const { ctx } = this;
    const { width, height, dpr } = this.view;
    const centerX = width / 2;
    const centerY = height / 2;
    for (const ping of this.pings) {
      if (ping.age >= EDGE_PING_SECONDS) continue;
      const { screenX, screenY, onScreen } = this.pingSpot(ping, alpha);
      if (onScreen) continue;
      const angle = Math.atan2(screenY - centerY, screenX - centerX) + ping.bend;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // How far from the middle of the screen to its edge, this way.
      const toEdge = Math.min(
        Math.abs(dx) > 1e-6 ? centerX / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-6 ? centerY / Math.abs(dy) : Infinity,
      );
      const share = Math.min(1, ping.age / EDGE_PING_SECONDS);
      const reach = Math.min(width, height) * EDGE_PING_DEPTH * Math.sqrt(share);
      // A ring this big pokes in `reach` deep across about EDGE_PING_SPAN of the screen.
      const span = Math.min(width, height) * EDGE_PING_SPAN;
      const depth = Math.min(width, height) * EDGE_PING_DEPTH;
      const radius = (span * span) / 4 / (2 * depth) + depth / 2;
      const ringX = centerX + dx * (toEdge - reach + radius);
      const ringY = centerY + dy * (toEdge - reach + radius);
      ctx.globalAlpha = (1 - share) * 0.85;
      ctx.strokeStyle = this.pingColor(ping);
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(ringX, ringY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The black market's freighter: dark, with a red stripe, and flames when it burns. */
  private drawBlackMarket(sim: Sim, alpha: number): void {
    const market = sim.blackMarket;
    if (!market) return;
    const { ctx } = this;
    const half = BLACK_MARKET_LENGTH / 2;
    ctx.save();
    ctx.translate(lerp(market.px, market.x, alpha), lerp(market.py, market.y, alpha));
    ctx.rotate(market.angle);
    // Burning forward speeds it up; braking fires from the nose.
    if (market.burn > 0) this.drawFlame(-half - 4, 0, Math.PI, 3, 12);
    if (market.burn < 0) this.drawFlame(half + 4, 0, 0, 3, 12);
    ctx.fillStyle = "#2a2226";
    ctx.strokeStyle = "#7a3a3a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(-half, -BLACK_MARKET_WIDTH / 2, BLACK_MARKET_LENGTH, BLACK_MARKET_WIDTH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#b8483c";
    ctx.fillRect(-half, -4, BLACK_MARKET_LENGTH, 8);
    ctx.restore();
  }

  /** A long freighter, its cargo shown as lumps that fill it as it loads. */
  private drawHauler(sim: Sim, base: Base, alpha: number): void {
    const now = sim.haulerSpot(false, base);
    const before = sim.haulerSpot(true, base);
    const { hauler } = base;
    if (!now || !before || !hauler) return;
    const { ctx } = this;
    const x = lerp(before.x, now.x, alpha);
    const y = lerp(before.y, now.y, alpha);
    const half = HAULER_LENGTH / 2;
    const side = HAULER_WIDTH / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(before.angle + Math.atan2(Math.sin(now.angle - before.angle), Math.cos(now.angle - before.angle)) * alpha);

    // Main engines at the back, braking jets at the front, and side and turning jets along it.
    const { forward, side: push, turn } = hauler.thrust;
    if (forward > 0) this.drawFlame(-half - 4, 0, Math.PI, 3, 14);
    if (forward < 0) this.drawFlame(half + 4, 0, 0, 3, 14);
    if (push !== 0) {
      const outward = push > 0 ? -Math.PI / 2 : Math.PI / 2;
      const y = push > 0 ? -side - 2 : side + 2;
      this.drawFlame(-half * 0.6, y, outward, 1.5, 6);
      this.drawFlame(half * 0.6, y, outward, 1.5, 6);
    }
    if (turn !== 0) {
      this.drawFlame(half - 10, turn > 0 ? -side - 2 : side + 2, turn > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2, 5);
      this.drawFlame(-half + 10, turn > 0 ? side + 2 : -side - 2, turn > 0 ? Math.PI / 2 : -Math.PI / 2, 1.2, 5);
    }

    ctx.fillStyle = "#59647a";
    ctx.fillRect(-half, -side, HAULER_LENGTH, HAULER_WIDTH);
    ctx.strokeStyle = "#aab1bd";
    ctx.lineWidth = 3;
    ctx.strokeRect(-half, -side, HAULER_LENGTH, HAULER_WIDTH);
    ctx.fillStyle = "#3d4556";
    ctx.fillRect(half - 50, -side + 8, 42, HAULER_WIDTH - 16);

    const lumps = Math.min(HAULER_ROWS * HAULER_COLUMNS, Math.ceil(hauler.cargo / PILE_ORE_PER_LUMP));
    const pitch = (HAULER_LENGTH - 70) / HAULER_COLUMNS;
    const rowPitch = (HAULER_WIDTH - 20) / HAULER_ROWS;
    for (let i = 0; i < lumps; i++) {
      ctx.fillStyle = ORE_COLORS[(i * 7) % ORE_COLORS.length];
      const lx = -half + 10 + pitch * (i % HAULER_COLUMNS) + pitch * 0.2;
      const ly = -side + 10 + rowPitch * Math.floor(i / HAULER_COLUMNS) + rowPitch * 0.2;
      ctx.fillRect(lx, ly, pitch * 0.6, rowPitch * 0.6);
    }
    // Crates fill from the other end, so ore and parts visibly trade places.
    const cells = HAULER_ROWS * HAULER_COLUMNS;
    const crates = Math.min(cells - lumps, Math.ceil(hauler.parts / PILE_ORE_PER_LUMP));
    ctx.lineWidth = 1;
    ctx.strokeStyle = CRATE_EDGE;
    for (let i = 0; i < crates; i++) {
      const cell = cells - 1 - i;
      const lx = -half + 10 + pitch * (cell % HAULER_COLUMNS) + pitch * 0.15;
      const ly = -side + 10 + rowPitch * Math.floor(cell / HAULER_COLUMNS) + rowPitch * 0.15;
      ctx.fillStyle = CRATE_COLOR;
      ctx.fillRect(lx, ly, pitch * 0.7, rowPitch * 0.7);
      ctx.strokeRect(lx, ly, pitch * 0.7, rowPitch * 0.7);
    }
    ctx.restore();
  }

  /** A fading mark where a pirate was last seen, carried along with what it was near. */
  private drawGhost(ship: Ship): void {
    const ghost = this.ghosts.get(ship);
    if (!ghost) return;
    const fade = 1 - (performance.now() - ghost.seenAt) / GHOST_MILLISECONDS;
    if (fade <= 0) return;
    const { ctx } = this;
    const cos = Math.cos(ghost.poi.rotation);
    const sin = Math.sin(ghost.poi.rotation);
    const x = ghost.poi.x + ghost.x * cos - ghost.y * sin;
    const y = ghost.poi.y + ghost.x * sin + ghost.y * cos;
    ctx.globalAlpha = 0.7 * fade;
    ctx.strokeStyle = "#eb5a50";
    ctx.fillStyle = "#eb5a50";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, SHIP_RADIUS + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "16px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x, y);
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  }

  private drawTask(
    sim: Sim,
    pilot: { task: string; ship: Ship },
    x: number,
    y: number,
    color: string,
  ): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = "14px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${pilot.task} ${pilot.ship.ore}/${sim.cargoSpace(pilot.ship)}`, x, y + SHIP_RADIUS + 22);
  }

  private drawShip(
    ship: Ship,
    x: number,
    y: number,
    alpha: number,
    [red, green, blue]: number[],
  ): void {
    const { ctx } = this;
    const angle = lerp(ship.prevAngle, ship.angle, alpha);

    if (ship.burning > 0) {
      const reach = 26 + ship.burning * 34;
      const heat = ctx.createRadialGradient(x, y, 4, x, y, reach);
      heat.addColorStop(0, `rgba(255, 170, 70, ${0.85 * ship.burning})`);
      heat.addColorStop(1, "rgba(255, 90, 30, 0)");
      ctx.fillStyle = heat;
      ctx.beginPath();
      ctx.arc(x, y, reach, 0, Math.PI * 2);
      ctx.fill();
    }

    // Direction of travel, since with inertia it often differs from the nose.
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 5) {
      const length = Math.min(90, 20 + speed * 0.08);
      ctx.strokeStyle = "rgba(143, 180, 255, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (ship.vx / speed) * length, y + (ship.vy / speed) * length);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const r = SHIP_RADIUS;
    const up = -Math.PI / 2;
    const down = Math.PI / 2;
    // A flame's size shows its throttle. Even the faintest trim stays visible.
    const flame = (thruster: ThrusterId, x: number, y: number, direction: number, length: number, width: number) => {
      const level = ship.firing.get(thruster);
      if (level === undefined) return;
      this.drawFlame(x, y, direction, length * (0.2 + 0.8 * level), width * (0.5 + 0.5 * level));
    };
    flame("thrusterMain", -r * 0.8, 0, Math.PI, 2, 4);
    flame("thrusterReverse", r * 0.9, 0, 0, 1, 3);
    flame("thrusterStrafeLeft", 0, r * 0.45, down, 1, 3);
    flame("thrusterStrafeRight", 0, -r * 0.45, up, 1, 3);
    flame("thrusterRotateRight", r * 0.6, -r * 0.2, up, 0.7, 2);
    flame("thrusterRotateRight", -r * 0.7, r * 0.55, down, 0.7, 2);
    flame("thrusterRotateLeft", r * 0.6, r * 0.2, down, 0.7, 2);
    flame("thrusterRotateLeft", -r * 0.7, -r * 0.55, up, 0.7, 2);

    const damage = 1 - ship.hull / 100;
    ctx.fillStyle = `rgb(${red + damage * 55}, ${green - damage * 120}, ${blue - damage * 150})`;
    ctx.beginPath();
    if (ship.model === "floater") {
      // Square, a little slimmer at the front. A pale front edge shows which way it faces.
      ctx.moveTo(r, -r * 0.7);
      ctx.lineTo(-r, -r);
      ctx.lineTo(-r, r);
      ctx.lineTo(r, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#f4f8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r, -r * 0.7);
      ctx.lineTo(r, r * 0.7);
      ctx.stroke();
    } else {
      ctx.moveTo(SHIP_RADIUS * 1.25, 0);
      ctx.lineTo(-SHIP_RADIUS, -SHIP_RADIUS * 0.8);
      ctx.lineTo(-SHIP_RADIUS * 0.55, 0);
      ctx.lineTo(-SHIP_RADIUS, SHIP_RADIUS * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    this.drawCargo(ship);
    if (ship.parts.has("turret")) {
      const turn = Math.atan2(
        Math.sin(ship.turretAngle - ship.prevTurretAngle),
        Math.cos(ship.turretAngle - ship.prevTurretAngle),
      );
      ctx.rotate(ship.prevTurretAngle + turn * alpha);
      ctx.fillStyle = "#c9d4e6";
      ctx.strokeStyle = "#c9d4e6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 1.15, 0);
      ctx.stroke();
    }
    ctx.restore();
    this.drawStanding(ship, x, y);
  }

  /** Lumps of ore on the hull, more the fuller the hold, scattered the same way each time for this ship. */
  private drawCargo(ship: Ship): void {
    const sim = this.sim;
    if (!sim || ship.ore <= 0) return;
    const { ctx } = this;
    const share = Math.min(1, ship.ore / Math.max(1, sim.cargoSpace(ship)));
    const lumps = Math.max(1, Math.round(share * CARGO_LUMPS));
    let seed = this.cargoSeeds.get(ship);
    if (seed === undefined) {
      seed = Math.floor(Math.random() * 1e6);
      this.cargoSeeds.set(ship, seed);
    }
    const r = SHIP_RADIUS;
    for (let i = 0; i < lumps; i++) {
      const a = hash(seed + i * 3);
      const b = hash(seed + i * 3 + 1);
      const size = 1.6 + hash(seed + i * 3 + 2) * 1.4;
      ctx.fillStyle = ORE_COLORS[(seed + i) % ORE_COLORS.length];
      ctx.fillRect(-r * 0.7 + a * r * 1.1 - size / 2, (b - 0.5) * r * 0.9 - size / 2, size, size);
    }
  }

  /** A faint red ring while pirates have marked the ship, and a blinking light while it's wanted. */
  private drawStanding(ship: Ship, x: number, y: number): void {
    const { ctx } = this;
    if (ship.marked) {
      ctx.strokeStyle = "rgba(235, 90, 80, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, SHIP_RADIUS + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (ship.wanted && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.fillStyle = "#ff4a3d";
      ctx.beginPath();
      ctx.arc(x, y - SHIP_RADIUS - 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Exhaust in the ship's local space: `direction` is where the flame points. */
  private drawFlame(x: number, y: number, direction: number, length: number, width: number): void {
    const { ctx } = this;
    const reach = SHIP_RADIUS * length * (0.75 + Math.random() * 0.5);
    const cos = Math.cos(direction);
    const sin = Math.sin(direction);
    ctx.fillStyle = "#ffae57";
    ctx.beginPath();
    ctx.moveTo(x - sin * width, y + cos * width);
    ctx.lineTo(x + cos * reach, y + sin * reach);
    ctx.lineTo(x + sin * width, y - cos * width);
    ctx.closePath();
    ctx.fill();
  }

  /** A marker for each POI, until it comes into view. */
  private drawPointers(sim: Sim, width: number, height: number, scale: number, dpr: number): void {
    const viewHalfWidth = width / 2 / scale;
    const viewHalfHeight = height / 2 / scale;
    const meters = sim.ship.parts.has("meters");
    // Only the big places anyone knows about, and only once they're close.
    const near = viewHalfWidth * 2 * POINTER_SCREENS;
    // The nearest field and station, so there's always somewhere to mine and to sell.
    const field = sim.readPoi(sim.miningFieldAt(sim.ship.x, sim.ship.y).poi, viewHalfWidth, viewHalfHeight);
    if (field.distance > 0 && (field.distance < near || this.dev)) {
      this.drawPointer(field, "#8fb4ff", "field", 0.34, meters, width, height, dpr);
    }
    const station = sim.readPoi(sim.nearestDock(sim.ship.x, sim.ship.y), viewHalfWidth, viewHalfHeight);
    if (station.distance > 0 && (station.distance < near || this.dev)) {
      // It flashes once the hold is full: time to go and sell.
      const full = sim.ship.ore >= sim.cargoSpace(sim.ship);
      const lit = full && Math.floor(performance.now() / 350) % 2 === 0;
      this.drawPointer(station, lit ? "#f4fff6" : "#8fe3a1", "station", 0.22, meters, width, height, dpr);
    }
    if (!this.dev) return;
    for (let i = 0; i < sim.drones.length; i++) {
      const drone = sim.drones[i];
      const reading = sim.readShip(drone.ship, viewHalfWidth, viewHalfHeight);
      if (reading.distance > 0) {
        const owned = drone.ship.owner !== null;
        this.drawPointer(
          reading,
          owned ? "#8fc8ff" : "#f2c572",
          owned ? `your drone ${i + 1}` : `drone ${i + 1}`,
          0.28,
          meters,
          width,
          height,
          dpr,
        );
      }
    }
    if (!sim.tuning.showTraffic) return;
    sim.traffic.forEach((pilot, i) => {
      const reading = sim.readShip(pilot.ship, viewHalfWidth, viewHalfHeight);
      if (reading.distance > 0) {
        this.drawPointer(reading, "#a8adb8", `traffic ${i + 1}`, 0.28, meters, width, height, dpr);
      }
    });
    for (const pilot of sim.fighters) {
      const reading = sim.readShip(pilot.ship, viewHalfWidth, viewHalfHeight);
      const pirate = pilot.ship.faction === "pirate";
      if (reading.distance > 0) {
        this.drawPointer(
          reading,
          pirate ? "#eb5a50" : "#6eebaa",
          pirate ? "pirate" : "defender",
          0.28,
          meters,
          width,
          height,
          dpr,
        );
      }
    }
  }

  /**
   * Past the arrow's tip, the solid marker sits further out the greater the
   * distance, and reaches the tip as the POI comes into view. The hollow marker is the distance
   * a few seconds ahead: inside the solid one when closing, outside when not.
   * Those marks and the numbers need the meters part. The arrow and name don't.
   */
  private drawPointer(
    reading: PoiReading,
    color: string,
    name: string,
    ring: number,
    meters: boolean,
    width: number,
    height: number,
    dpr: number,
  ): void {
    const { ctx } = this;
    const dir = Math.atan2(reading.dy, reading.dx);
    const radius = Math.min(width, height) * ring;
    const tip = 14 * dpr;
    const offset = (distance: number) =>
      Math.min(MARKER_MAX_OFFSET, MARKER_SCALE * Math.log1p(distance / 100)) * dpr;
    const ahead = Math.max(0, reading.distance - reading.closing * MARKER_LOOK_SECONDS);

    ctx.save();
    ctx.translate(width / 2 + Math.cos(dir) * radius, height / 2 + Math.sin(dir) * radius);
    ctx.rotate(dir);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(tip, 0);
    ctx.lineTo(-8 * dpr, -9 * dpr);
    ctx.lineTo(-8 * dpr, 9 * dpr);
    ctx.closePath();
    ctx.fill();

    if (meters) {
      this.tracePointerMark(tip + offset(reading.distance), dpr);
      ctx.fill();
      this.tracePointerMark(tip + offset(ahead), dpr);
      ctx.stroke();
    }
    ctx.restore();

    const speed = Math.round(Math.abs(reading.closing));
    const trend = speed === 0 ? "" : ` ${reading.closing > 0 ? "\u2193" : "\u2191"}${speed}`;
    ctx.fillStyle = color;
    ctx.font = `${12 * dpr}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(
      meters ? `${name} ${Math.round(reading.distance)}${trend}` : name,
      width / 2 + Math.cos(dir) * (radius - 52 * dpr),
      height / 2 + Math.sin(dir) * (radius - 52 * dpr),
    );
  }

  private tracePointerMark(x: number, dpr: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + 6 * dpr, 0);
    ctx.lineTo(x - 3 * dpr, -5 * dpr);
    ctx.lineTo(x - 3 * dpr, 5 * dpr);
    ctx.closePath();
  }
}

/** A repeatable number from 0 to 1 for a whole number. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
