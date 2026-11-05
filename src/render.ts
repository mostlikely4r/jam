import type { FighterPilot, DronePilot } from "./pilot";
import {
  DOCK_OFFSET,
  PIRATE_BASE_RADIUS,
  Sim,
  SHIP_RADIUS,
  STATION_HALF,
  type Poi,
  type PoiReading,
  type Ship,
  type SimEvent,
} from "./sim";

const ORE_COLORS = ["#ff9d5c", "#6fe0c8", "#e9d36a"];
/** How long the mark where a pirate was last seen takes to fade away. */
const GHOST_MILLISECONDS = 30000;
const PING_SECONDS = 1.4;
const PILE_ROWS = 12;
const PILE_ORE_PER_LUMP = 5;
const DRONE_COLOR = [180, 200, 120];
const OWNED_DRONE_COLOR = [120, 190, 255];
const TRAFFIC_COLOR = [150, 155, 165];
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private pings: { speaker: Ship | null; x: number; y: number; mayday: boolean; age: number }[] = [];
  /** Where the player last saw each pirate, in the axes of what it was near. */
  private ghosts = new WeakMap<Ship, { poi: Poi; x: number; y: number; seenAt: number }>();
  private stars: Star[] = [];
  private flash = 0;
  private view = { camX: 0, camY: 0, scale: 1, dpr: 1, width: 0, height: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    for (let i = 0; i < 260; i++) {
      this.stars.push({
        x: Math.random() * 4000,
        y: Math.random() * 4000,
        depth: 0.08 + Math.random() * 0.35,
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

  /** A ring that grows from whoever just spoke on the radio. */
  addPing(line: { speaker: Ship | null; x: number; y: number; mayday: boolean }): void {
    this.pings.push({ ...line, age: 0 });
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
          if (event.player) this.flash = 0.7;
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
    const camX = shipX + ship.vx * tuning.lookahead;
    const camY = shipY + ship.vy * tuning.lookahead;
    const scale = tuning.zoom * dpr;
    this.view = { camX, camY, scale, dpr, width, height };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, width, height);
    this.drawStars(camX, camY, width, height, dpr);

    ctx.setTransform(scale, 0, 0, scale, width / 2 - camX * scale, height / 2 - camY * scale);
    const halfW = width / 2 / scale + 80;
    const halfH = height / 2 / scale + 80;
    const visible = (x: number, y: number, r: number) =>
      Math.abs(x - camX) < halfW + r && Math.abs(y - camY) < halfH + r;

    this.drawStation(sim, alpha);
    this.drawPirateBase(sim, alpha);
    this.drawClickTarget(sim, alpha);
    this.drawRocks(sim, alpha, visible);
    this.drawOres(sim, alpha, visible);
    this.drawShots(sim, alpha);
    this.drawPings(sim, alpha, frameSeconds);
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
    this.drawPointers(sim, width, height, scale, dpr);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 70, 50, ${this.flash * 0.35})`;
      ctx.fillRect(0, 0, width, height);
      this.flash = Math.max(0, this.flash - frameSeconds * 1.8);
    }
  }

  private drawStars(camX: number, camY: number, width: number, height: number, dpr: number): void {
    const { ctx } = this;
    for (const star of this.stars) {
      const x = mod(star.x - camX * star.depth, 4000) * (width / 4000);
      const y = mod(star.y - camY * star.depth, 4000) * (height / 4000);
      const brightness = Math.round(70 + star.depth * 300);
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${Math.min(255, brightness + 25)})`;
      const size = (star.depth > 0.3 ? 2 : 1) * dpr;
      ctx.fillRect(x, y, size, size);
    }
  }

  private drawStation(sim: Sim, alpha: number): void {
    const { ctx } = this;
    const { station } = sim;
    const x = lerp(station.px, station.x, alpha);
    const y = lerp(station.py, station.y, alpha);
    const size = STATION_HALF * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lerp(station.prevRotation, station.rotation, alpha));

    const dockX = DOCK_OFFSET - STATION_HALF;
    const dockY = -STATION_HALF;
    ctx.fillStyle = sim.isDocked() ? "rgba(143, 227, 161, 0.2)" : "rgba(143, 227, 161, 0.07)";
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
    this.drawOrePile(sim.stationOre, STATION_HALF);
    ctx.restore();
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
    if (!ship.parts.has("tractor")) return;
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

  private drawClickTarget(sim: Sim, alpha: number): void {
    const { ctx } = this;
    const aim = sim.clickPilot.aim();
    if (aim) {
      ctx.strokeStyle = "rgba(242, 197, 114, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lerp(aim.px, aim.x, alpha), lerp(aim.py, aim.y, alpha), 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    const target = sim.clickPilot.target();
    if (!target) return;
    const x = lerp(target.px, target.x, alpha);
    const y = lerp(target.py, target.y, alpha);
    ctx.strokeStyle = "rgba(143, 180, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y + 18);
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
      ctx.fillRect(x - 4, y - 4, 8, 8);
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

  private drawPings(sim: Sim, alpha: number, frameSeconds: number): void {
    const { ctx } = this;
    this.pings = this.pings.filter((ping) => ping.age < PING_SECONDS);
    for (const ping of this.pings) {
      ping.age += frameSeconds;
      const speaker = ping.speaker;
      const dock = sim.dockPoint();
      const x = speaker ? lerp(speaker.px, speaker.x, alpha) : dock.x;
      const y = speaker ? lerp(speaker.py, speaker.y, alpha) : dock.y;
      const share = Math.min(1, ping.age / PING_SECONDS);
      ctx.globalAlpha = (1 - share) * 0.8;
      ctx.strokeStyle = ping.mayday ? "#ff6b5c" : speaker ? "#a8d8ff" : "#8fe3a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, SHIP_RADIUS + 6 + share * (ping.mayday ? 160 : 70), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    ctx.fillText(`${pilot.task} ${pilot.ship.ore}/${sim.tuning.droneCargo}`, x, y + SHIP_RADIUS + 22);
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
    if (ship.firing.has("thrusterMain")) this.drawFlame(-r * 0.8, 0, Math.PI, 2, 4);
    if (ship.firing.has("thrusterReverse")) this.drawFlame(r * 0.9, 0, 0, 1, 3);
    if (ship.firing.has("thrusterStrafeLeft")) this.drawFlame(0, r * 0.45, down, 1, 3);
    if (ship.firing.has("thrusterStrafeRight")) this.drawFlame(0, -r * 0.45, up, 1, 3);
    if (ship.firing.has("thrusterRotateRight")) {
      this.drawFlame(r * 0.6, -r * 0.2, up, 0.7, 2);
      this.drawFlame(-r * 0.7, r * 0.55, down, 0.7, 2);
    }
    if (ship.firing.has("thrusterRotateLeft")) {
      this.drawFlame(r * 0.6, r * 0.2, down, 0.7, 2);
      this.drawFlame(-r * 0.7, -r * 0.55, up, 0.7, 2);
    }

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
    const field = sim.readPoi(sim.field, viewHalfWidth, viewHalfHeight);
    if (field.distance > 0) {
      this.drawPointer(field, "#8fb4ff", "field", 0.34, meters, width, height, dpr);
    }
    const station = sim.readPoi(sim.station, viewHalfWidth, viewHalfHeight);
    if (station.distance > 0) {
      this.drawPointer(station, "#8fe3a1", "station", 0.22, meters, width, height, dpr);
    }
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
