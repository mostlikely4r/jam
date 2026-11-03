import { DOCK_OFFSET, Sim, SHIP_RADIUS, STATION_HALF, type SimEvent } from "./sim";

const ORE_COLORS = ["#ff9d5c", "#6fe0c8", "#e9d36a"];

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
  private stars: Star[] = [];
  private flash = 0;

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
          this.flash = Math.min(0.5, this.flash + event.damage / 50);
          break;
        case "wreck":
          this.burst(event.x, event.y, 50, "#ffb36b", 320, 1, 3);
          this.flash = 0.7;
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
    this.drawRocks(sim, alpha, visible);
    this.drawOres(sim, alpha, visible);
    this.drawShots(sim, alpha);
    this.updateParticles(frameSeconds);
    this.drawShip(sim, shipX, shipY, alpha);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawPointers(sim, alpha, shipX, shipY, width, height, scale, dpr);
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

    const dockX = x + DOCK_OFFSET - STATION_HALF;
    const dockY = y - STATION_HALF;
    ctx.fillStyle = sim.isDocked() ? "rgba(143, 227, 161, 0.2)" : "rgba(143, 227, 161, 0.07)";
    ctx.fillRect(dockX, dockY, size, size);
    ctx.strokeStyle = "#8fe3a1";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(dockX, dockY, size, size);
    ctx.setLineDash([]);

    ctx.fillStyle = "#6b7280";
    ctx.fillRect(x - STATION_HALF, y - STATION_HALF, size, size);
    ctx.strokeStyle = "#aab1bd";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - STATION_HALF, y - STATION_HALF, size, size);
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

  private drawShip(sim: Sim, x: number, y: number, alpha: number): void {
    const { ctx } = this;
    const { ship } = sim;
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
    ctx.fillStyle = `rgb(${200 + damage * 55}, ${215 - damage * 120}, ${235 - damage * 150})`;
    ctx.beginPath();
    ctx.moveTo(SHIP_RADIUS * 1.25, 0);
    ctx.lineTo(-SHIP_RADIUS, -SHIP_RADIUS * 0.8);
    ctx.lineTo(-SHIP_RADIUS * 0.55, 0);
    ctx.lineTo(-SHIP_RADIUS, SHIP_RADIUS * 0.8);
    ctx.closePath();
    ctx.fill();
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

  /** Arrows to the field when outside it, and to the station when it's off screen. */
  private drawPointers(
    sim: Sim,
    alpha: number,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number,
    dpr: number,
  ): void {
    const fieldDist = Math.hypot(x, y);
    if (fieldDist > sim.tuning.fieldRadius) {
      const label = `field ${Math.round(fieldDist - sim.tuning.fieldRadius)}`;
      this.drawPointer(-x, -y, "#8fb4ff", label, 0.38, width, height, dpr);
    }

    const { station } = sim;
    const dx = lerp(station.px, station.x, alpha) - x;
    const dy = lerp(station.py, station.y, alpha) - y;
    const onScreen =
      (Math.abs(dx) - STATION_HALF) * scale < width / 2 &&
      (Math.abs(dy) - STATION_HALF) * scale < height / 2;
    if (!onScreen) {
      const label = `station ${Math.round(Math.hypot(dx, dy))}`;
      this.drawPointer(dx, dy, "#8fe3a1", label, 0.28, width, height, dpr);
    }
  }

  private drawPointer(
    dx: number,
    dy: number,
    color: string,
    label: string,
    ring: number,
    width: number,
    height: number,
    dpr: number,
  ): void {
    const { ctx } = this;
    const dir = Math.atan2(dy, dx);
    const radius = Math.min(width, height) * ring;
    ctx.save();
    ctx.translate(width / 2 + Math.cos(dir) * radius, height / 2 + Math.sin(dir) * radius);
    ctx.rotate(dir);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14 * dpr, 0);
    ctx.lineTo(-8 * dpr, -9 * dpr);
    ctx.lineTo(-8 * dpr, 9 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = `${12 * dpr}px Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(
      label,
      width / 2 + Math.cos(dir) * (radius - 52 * dpr),
      height / 2 + Math.sin(dir) * (radius - 52 * dpr),
    );
  }
}
