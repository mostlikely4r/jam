import { DEFAULTS, type Tuning } from "./tuning";

export const TICK = 1 / 120;
export const SHIP_RADIUS = 12;
export const MAX_HULL = 100;
const ORE_RADIUS = 5;
const PICKUP_MARGIN = 10;
const TIER_RADIUS = [18, 34, 60];
const ORE_KINDS = 3;

export interface Controls {
  /** -1 (reverse) to 1 (forward). */
  thrust: number;
  /** -1 (left) to 1 (right). */
  turn: number;
  fire: boolean;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
}

export interface Ship extends Body {
  angle: number;
  prevAngle: number;
  spin: number;
  hull: number;
  cooldown: number;
}

export interface Rock extends Body {
  tier: number;
  radius: number;
  hp: number;
  angle: number;
  prevAngle: number;
  spin: number;
  /** Radius multipliers around the outline. */
  shape: number[];
}

export interface Shot extends Body {
  life: number;
}

export interface Ore extends Body {
  kind: number;
}

export type SimEvent =
  | { type: "shot"; x: number; y: number }
  | { type: "hit"; x: number; y: number }
  | { type: "break"; x: number; y: number; radius: number }
  | { type: "pickup"; x: number; y: number; kind: number }
  | { type: "impact"; x: number; y: number; damage: number }
  | { type: "wreck"; x: number; y: number };

export interface Stats {
  ore: number;
  bestOre: number;
  wrecks: number;
  topSpeed: number;
}

/** Small seeded generator, so a given seed always builds the same field. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Earliest fraction of the segment (0..1) that enters a circle centered on the
 * origin, or null. Sweeping keeps fast objects from passing through rocks.
 */
export function sweepCircle(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  radius: number,
): number | null {
  const c = ax * ax + ay * ay - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = ax * dx + ay * dy;
  if (b >= 0) return null;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= 1 ? t : null;
}

export class Sim {
  tuning: Tuning;
  controls: Controls = { thrust: 0, turn: 0, fire: false };
  ship!: Ship;
  rocks: Rock[] = [];
  shots: Shot[] = [];
  ores: Ore[] = [];
  events: SimEvent[] = [];
  stats: Stats = { ore: 0, bestOre: 0, wrecks: 0, topSpeed: 0 };
  private random: () => number = Math.random;

  constructor(seed = 1, tuning: Tuning = { ...DEFAULTS }) {
    this.tuning = tuning;
    this.reset(seed);
  }

  reset(seed: number): void {
    this.random = makeRandom(seed);
    this.rocks = [];
    this.shots = [];
    this.ores = [];
    this.events = [];
    this.stats = { ore: 0, bestOre: this.stats.bestOre, wrecks: 0, topSpeed: 0 };
    this.placeShip();
    const clear = 260;
    for (let i = 0; i < this.tuning.rockCount; i++) {
      const dist = this.tuning.fieldRadius * Math.sqrt(this.random());
      const dir = this.random() * Math.PI * 2;
      const x = Math.cos(dir) * dist;
      const y = Math.sin(dir) * dist;
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < clear) continue;
      const roll = this.random();
      const tier = roll < 0.3 ? 2 : roll < 0.7 ? 1 : 0;
      const drift = this.tuning.rockDrift * this.random();
      const driftDir = this.random() * Math.PI * 2;
      this.rocks.push(
        this.makeRock(tier, x, y, Math.cos(driftDir) * drift, Math.sin(driftDir) * drift),
      );
    }
  }

  private placeShip(): void {
    const x = -this.tuning.fieldRadius - 200;
    this.ship = {
      x,
      y: 0,
      px: x,
      py: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      prevAngle: 0,
      spin: 0,
      hull: MAX_HULL,
      cooldown: 0,
    };
  }

  makeRock(tier: number, x: number, y: number, vx: number, vy: number): Rock {
    const points = 8 + Math.floor(this.random() * 4);
    const shape: number[] = [];
    for (let i = 0; i < points; i++) shape.push(0.84 + this.random() * 0.26);
    const radius = TIER_RADIUS[tier];
    const angle = this.random() * Math.PI * 2;
    return {
      x,
      y,
      px: x,
      py: y,
      vx,
      vy,
      tier,
      radius,
      hp: Math.ceil((this.tuning.rockToughness * radius) / 60),
      angle,
      prevAngle: angle,
      spin: (this.random() - 0.5) * (60 / radius),
      shape,
    };
  }

  /** Advance one fixed tick. Display rate and time speedup never change its size. */
  step(): void {
    const dt = TICK;
    this.moveRocks(dt);
    this.moveOres(dt);
    this.moveShip(dt);
    this.moveShots(dt);
    this.fireShots(dt);
    this.collectOre();
  }

  private moveRocks(dt: number): void {
    const edge = this.tuning.fieldRadius;
    for (const rock of this.rocks) {
      this.containInField(rock, edge, dt);
      rock.px = rock.x;
      rock.py = rock.y;
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.prevAngle = rock.angle;
      rock.angle += rock.spin * dt;
    }
  }

  private moveOres(dt: number): void {
    const edge = this.tuning.fieldRadius;
    for (const ore of this.ores) {
      this.containInField(ore, edge, dt);
      ore.px = ore.x;
      ore.py = ore.y;
      ore.x += ore.vx * dt;
      ore.y += ore.vy * dt;
    }
  }

  /** Gentle pull so drifting pieces stay in the field during long sessions. */
  private containInField(body: Body, edge: number, dt: number): void {
    const dist = Math.hypot(body.x, body.y);
    if (dist <= edge) return;
    const pull = 6 * dt;
    body.vx -= (body.x / dist) * pull;
    body.vy -= (body.y / dist) * pull;
  }

  private moveShip(dt: number): void {
    const { ship, controls, tuning } = this;

    const targetSpin = (controls.turn * tuning.turnRate * Math.PI) / 180;
    const maxChange = ((tuning.turnAccel * Math.PI) / 180) * dt;
    const change = Math.max(-maxChange, Math.min(maxChange, targetSpin - ship.spin));
    ship.spin += change;
    ship.prevAngle = ship.angle;
    ship.angle += ship.spin * dt;

    const force = controls.thrust >= 0 ? tuning.thrust : tuning.reverseThrust;
    ship.vx += Math.cos(ship.angle) * controls.thrust * force * dt;
    ship.vy += Math.sin(ship.angle) * controls.thrust * force * dt;

    ship.px = ship.x;
    ship.py = ship.y;
    this.moveShipWithCollision(dt);

    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > this.stats.topSpeed) this.stats.topSpeed = speed;
    ship.cooldown = Math.max(0, ship.cooldown - dt);
  }

  private moveShipWithCollision(dt: number): void {
    const { ship } = this;
    let hit: Rock | null = null;
    let hitT = Infinity;

    for (const rock of this.rocks) {
      const relX = ship.x - rock.x;
      const relY = ship.y - rock.y;
      const dx = (ship.vx - rock.vx) * dt;
      const dy = (ship.vy - rock.vy) * dt;
      const reach = rock.radius + SHIP_RADIUS;
      const t = sweepCircle(relX, relY, dx, dy, reach);
      if (t !== null && t < hitT) {
        hitT = t;
        hit = rock;
      }
    }

    if (!hit) {
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      return;
    }

    ship.x += ship.vx * dt * hitT;
    ship.y += ship.vy * dt * hitT;
    this.resolveImpact(hit);
  }

  private resolveImpact(rock: Rock): void {
    const { ship, tuning } = this;
    let nx = ship.x - rock.x;
    let ny = ship.y - rock.y;
    const dist = Math.hypot(nx, ny) || 1;
    nx /= dist;
    ny /= dist;

    // Push out of any overlap, so a ship never stays stuck inside a rock.
    const reach = rock.radius + SHIP_RADIUS + 0.01;
    ship.x = rock.x + nx * reach;
    ship.y = rock.y + ny * reach;

    const closing = (ship.vx - rock.vx) * nx + (ship.vy - rock.vy) * ny;
    if (closing >= 0) return;

    const shipMass = 1;
    const rockMass = (rock.radius * rock.radius) / 400;
    const impulse = (-(1 + tuning.bounce) * closing) / (1 / shipMass + 1 / rockMass);
    ship.vx += (impulse / shipMass) * nx;
    ship.vy += (impulse / shipMass) * ny;
    rock.vx -= (impulse / rockMass) * nx;
    rock.vy -= (impulse / rockMass) * ny;

    const damage = Math.max(0, -closing - tuning.safeImpactSpeed) * tuning.damagePerSpeed;
    if (damage > 0) {
      ship.hull -= damage;
      this.events.push({ type: "impact", x: ship.x, y: ship.y, damage });
      if (ship.hull <= 0) this.wreckShip();
    }
  }

  private wreckShip(): void {
    this.events.push({ type: "wreck", x: this.ship.x, y: this.ship.y });
    this.stats.wrecks++;
    this.stats.ore = 0;
    this.placeShip();
  }

  private moveShots(dt: number): void {
    const remaining: Shot[] = [];
    for (const shot of this.shots) {
      shot.life -= dt;
      if (shot.life <= 0) continue;
      shot.px = shot.x;
      shot.py = shot.y;

      let hit: Rock | null = null;
      let hitT = Infinity;
      for (const rock of this.rocks) {
        const t = sweepCircle(
          shot.x - rock.x,
          shot.y - rock.y,
          (shot.vx - rock.vx) * dt,
          (shot.vy - rock.vy) * dt,
          rock.radius,
        );
        if (t !== null && t < hitT) {
          hitT = t;
          hit = rock;
        }
      }

      if (hit) {
        const x = shot.x + shot.vx * dt * hitT;
        const y = shot.y + shot.vy * dt * hitT;
        this.events.push({ type: "hit", x, y });
        hit.hp -= 1;
        if (hit.hp <= 0) this.breakRock(hit);
        continue;
      }

      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      remaining.push(shot);
    }
    this.shots = remaining;
  }

  private fireShots(_dt: number): void {
    const { ship, controls, tuning } = this;
    if (!controls.fire || ship.cooldown > 0) return;
    ship.cooldown = 1 / tuning.shotsPerSecond;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const x = ship.x + cos * (SHIP_RADIUS + 4);
    const y = ship.y + sin * (SHIP_RADIUS + 4);
    this.shots.push({
      x,
      y,
      px: x,
      py: y,
      vx: ship.vx + cos * tuning.shotSpeed,
      vy: ship.vy + sin * tuning.shotSpeed,
      life: tuning.shotLife,
    });
    this.events.push({ type: "shot", x, y });
  }

  breakRock(rock: Rock): void {
    this.rocks.splice(this.rocks.indexOf(rock), 1);
    this.events.push({ type: "break", x: rock.x, y: rock.y, radius: rock.radius });

    if (rock.tier > 0) {
      const pieces = 2 + Math.floor(this.random() * 2);
      for (let i = 0; i < pieces; i++) {
        const dir = (i / pieces) * Math.PI * 2 + this.random();
        const kick = 20 + this.random() * 40;
        const offset = TIER_RADIUS[rock.tier - 1] * 0.8;
        this.rocks.push(
          this.makeRock(
            rock.tier - 1,
            rock.x + Math.cos(dir) * offset,
            rock.y + Math.sin(dir) * offset,
            rock.vx + Math.cos(dir) * kick,
            rock.vy + Math.sin(dir) * kick,
          ),
        );
      }
    }

    const rolls = rock.tier + 1;
    for (let i = 0; i < rolls; i++) {
      if (this.random() >= this.tuning.oreChance) continue;
      const dir = this.random() * Math.PI * 2;
      const kick = 15 + this.random() * 45;
      const x = rock.x + Math.cos(dir) * rock.radius * 0.4;
      const y = rock.y + Math.sin(dir) * rock.radius * 0.4;
      this.ores.push({
        x,
        y,
        px: x,
        py: y,
        vx: rock.vx + Math.cos(dir) * kick,
        vy: rock.vy + Math.sin(dir) * kick,
        kind: Math.floor(this.random() * ORE_KINDS),
      });
    }
  }

  private collectOre(): void {
    const { ship } = this;
    const reach = SHIP_RADIUS + ORE_RADIUS + PICKUP_MARGIN;
    this.ores = this.ores.filter((ore) => {
      const segment = sweepCircle(
        ore.px - ship.px,
        ore.py - ship.py,
        ore.x - ore.px - (ship.x - ship.px),
        ore.y - ore.py - (ship.y - ship.py),
        reach,
      );
      if (segment === null) return true;
      this.stats.ore++;
      this.stats.bestOre = Math.max(this.stats.bestOre, this.stats.ore);
      this.events.push({ type: "pickup", x: ore.x, y: ore.y, kind: ore.kind });
      return false;
    });
  }
}
