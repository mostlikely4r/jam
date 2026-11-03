import { DEFAULTS, type ThrusterId, type Tuning } from "./tuning";

export const TICK = 1 / 120;
export const SHIP_RADIUS = 12;
export const MAX_HULL = 100;
const ORE_RADIUS = 5;
const PICKUP_MARGIN = 10;
const TIER_RADIUS = [18, 34, 60];
const ORE_KINDS = 3;
export const STATION_HALF = 150;
/** The dock box sits directly beside the solid box. */
export const DOCK_OFFSET = STATION_HALF * 2;
const UNLOAD_SECONDS = 0.1;

export interface Controls {
  /** -1 (reverse) to 1 (forward). */
  thrust: number;
  /** -1 (left) to 1 (right), without turning. */
  strafe: number;
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
  /** Thrusters that fired on the last tick. */
  firing: Set<ThrusterId>;
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

export interface Station extends Body {
  orbitAngle: number;
  orbitRadius: number;
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
  | { type: "sale"; x: number; y: number }
  | { type: "impact"; x: number; y: number; damage: number }
  | { type: "wreck"; x: number; y: number };

export interface Stats {
  ore: number;
  bestOre: number;
  credits: number;
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

/**
 * Where a moving point first enters a box centered on the origin, and the face
 * it entered through, or null. A point already inside exits by the nearest face.
 */
export function sweepBox(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  halfWidth: number,
  halfHeight: number,
): { t: number; nx: number; ny: number } | null {
  if (Math.abs(ax) < halfWidth && Math.abs(ay) < halfHeight) {
    return halfWidth - Math.abs(ax) < halfHeight - Math.abs(ay)
      ? { t: 0, nx: Math.sign(ax) || 1, ny: 0 }
      : { t: 0, nx: 0, ny: Math.sign(ay) || 1 };
  }

  let enter = 0;
  let exit = 1;
  let nx = 0;
  let ny = 0;

  if (dx === 0) {
    if (Math.abs(ax) >= halfWidth) return null;
  } else {
    const near = ((dx > 0 ? -halfWidth : halfWidth) - ax) / dx;
    const far = ((dx > 0 ? halfWidth : -halfWidth) - ax) / dx;
    if (near >= enter) {
      enter = near;
      nx = -Math.sign(dx);
    }
    exit = Math.min(exit, far);
  }

  if (dy === 0) {
    if (Math.abs(ay) >= halfHeight) return null;
  } else {
    const near = ((dy > 0 ? -halfHeight : halfHeight) - ay) / dy;
    const far = ((dy > 0 ? halfHeight : -halfHeight) - ay) / dy;
    if (near >= enter) {
      enter = near;
      nx = 0;
      ny = -Math.sign(dy);
    }
    exit = Math.min(exit, far);
  }

  if (enter > exit || (nx === 0 && ny === 0)) return null;
  return { t: enter, nx, ny };
}

export class Sim {
  tuning: Tuning;
  controls: Controls = { thrust: 0, strafe: 0, turn: 0, fire: false };
  ship!: Ship;
  rocks: Rock[] = [];
  shots: Shot[] = [];
  ores: Ore[] = [];
  station!: Station;
  events: SimEvent[] = [];
  stats: Stats = { ore: 0, bestOre: 0, credits: 0, wrecks: 0, topSpeed: 0 };
  private random: () => number = Math.random;
  private unloadTimer = 0;

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
    this.stats = { ore: 0, bestOre: this.stats.bestOre, credits: 0, wrecks: 0, topSpeed: 0 };
    this.unloadTimer = 0;
    this.placeStation();
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

  private placeStation(): void {
    const orbitRadius = this.tuning.fieldRadius + this.tuning.stationDistance;
    // Starts behind the ship's starting point, on the far side from the rocks.
    const orbitAngle = Math.PI;
    const x = Math.cos(orbitAngle) * orbitRadius;
    const y = Math.sin(orbitAngle) * orbitRadius;
    this.station = { x, y, px: x, py: y, vx: 0, vy: 0, orbitAngle, orbitRadius };
    this.moveStation(0);
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
      firing: new Set(),
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
    this.moveStation(dt);
    this.moveRocks(dt);
    this.moveOres(dt);
    this.moveShip(dt);
    this.moveShots(dt);
    this.fireShots(dt);
    this.collectOre();
    this.unloadOre(dt);
  }

  /** The station follows a fixed circular path around the field's center. */
  private moveStation(dt: number): void {
    const { station, tuning } = this;
    const angularSpeed = (Math.PI * 2) / tuning.orbitPeriod;
    station.orbitAngle += angularSpeed * dt;
    station.px = station.x;
    station.py = station.y;
    station.x = Math.cos(station.orbitAngle) * station.orbitRadius;
    station.y = Math.sin(station.orbitAngle) * station.orbitRadius;
    station.vx = -Math.sin(station.orbitAngle) * station.orbitRadius * angularSpeed;
    station.vy = Math.cos(station.orbitAngle) * station.orbitRadius * angularSpeed;
  }

  isDocked(): boolean {
    const { ship, station } = this;
    return (
      Math.abs(ship.x - (station.x + DOCK_OFFSET)) < STATION_HALF &&
      Math.abs(ship.y - station.y) < STATION_HALF
    );
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

    const perTick = dt / tuning.weight;
    ship.firing.clear();

    const spinChange = ((tuning.rotationThrust * Math.PI) / 180) * perTick;
    ship.spin += this.fireAxis(
      controls.turn,
      ship.spin,
      "thrusterRotateRight",
      "thrusterRotateLeft",
      spinChange,
      spinChange,
    );
    ship.prevAngle = ship.angle;
    ship.angle += ship.spin * dt;

    // Inside the dock, retro brakes relative to the station rather than the field.
    const docked = this.isDocked();
    const frameVx = docked ? this.station.vx : 0;
    const frameVy = docked ? this.station.vy : 0;
    const relVx = ship.vx - frameVx;
    const relVy = ship.vy - frameVy;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    const forwardChange = this.fireAxis(
      controls.thrust,
      relVx * cos + relVy * sin,
      "thrusterMain",
      "thrusterReverse",
      tuning.thrust * perTick,
      tuning.reverseThrust * perTick,
    );
    const sideChange = this.fireAxis(
      controls.strafe,
      -relVx * sin + relVy * cos,
      "thrusterStrafeRight",
      "thrusterStrafeLeft",
      tuning.sideThrust * perTick,
      tuning.sideThrust * perTick,
    );
    ship.vx += cos * forwardChange - sin * sideChange;
    ship.vy += sin * forwardChange + cos * sideChange;

    if (docked) {
      const keep = Math.exp(-tuning.dockDrag * dt);
      ship.vx = frameVx + (ship.vx - frameVx) * keep;
      ship.vy = frameVy + (ship.vy - frameVy) * keep;
    }

    ship.px = ship.x;
    ship.py = ship.y;
    this.moveShipWithCollision(dt);

    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > this.stats.topSpeed) this.stats.topSpeed = speed;
    ship.cooldown = Math.max(0, ship.cooldown - dt);
  }

  /**
   * The velocity change one pair of opposed thrusters makes this tick. With no
   * pilot input on this axis, retro fires whichever thruster opposes the motion.
   * Retro uses the real thrusters, so a disabled one leaves that motion uncorrected.
   */
  private fireAxis(
    command: number,
    velocity: number,
    positive: ThrusterId,
    negative: ThrusterId,
    positiveChange: number,
    negativeChange: number,
  ): number {
    let direction = Math.sign(command);
    let limit = Infinity;
    if (direction === 0) {
      if (!this.tuning.retro || Math.abs(velocity) < 1e-6) return 0;
      direction = velocity < 0 ? 1 : -1;
      limit = Math.abs(velocity);
    }
    const thruster = direction > 0 ? positive : negative;
    if (!this.tuning[thruster]) return 0;
    this.ship.firing.add(thruster);
    return direction * Math.min(direction > 0 ? positiveChange : negativeChange, limit);
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

    const { station } = this;
    const stationReach = STATION_HALF + SHIP_RADIUS;
    const stationHit = sweepBox(
      ship.x - station.x,
      ship.y - station.y,
      (ship.vx - station.vx) * dt,
      (ship.vy - station.vy) * dt,
      stationReach,
      stationReach,
    );
    if (stationHit && stationHit.t < hitT) {
      ship.x += ship.vx * dt * stationHit.t;
      ship.y += ship.vy * dt * stationHit.t;
      // Rest on the surface, so a ship never stays stuck inside the station.
      if (stationHit.nx !== 0) ship.x = station.x + stationHit.nx * (stationReach + 0.01);
      if (stationHit.ny !== 0) ship.y = station.y + stationHit.ny * (stationReach + 0.01);
      this.bounceOff(stationHit.nx, stationHit.ny, station, 0);
      return;
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
    const { ship } = this;
    let nx = ship.x - rock.x;
    let ny = ship.y - rock.y;
    const dist = Math.hypot(nx, ny) || 1;
    nx /= dist;
    ny /= dist;

    // Push out of any overlap, so a ship never stays stuck inside a rock.
    const reach = rock.radius + SHIP_RADIUS + 0.01;
    ship.x = rock.x + nx * reach;
    ship.y = rock.y + ny * reach;

    const rockMass = (rock.radius * rock.radius) / 400;
    this.bounceOff(nx, ny, rock, 1 / rockMass);
  }

  /** `otherInverseMass` of 0 means the other body can't be pushed. The ship's mass is 1. */
  private bounceOff(nx: number, ny: number, other: Body, otherInverseMass: number): void {
    const { ship, tuning } = this;
    const closing = (ship.vx - other.vx) * nx + (ship.vy - other.vy) * ny;
    if (closing >= 0) return;

    const impulse = (-(1 + tuning.bounce) * closing) / (1 + otherInverseMass);
    ship.vx += impulse * nx;
    ship.vy += impulse * ny;
    other.vx -= impulse * otherInverseMass * nx;
    other.vy -= impulse * otherInverseMass * ny;

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

      const stationHit = sweepBox(
        shot.x - this.station.x,
        shot.y - this.station.y,
        (shot.vx - this.station.vx) * dt,
        (shot.vy - this.station.vy) * dt,
        STATION_HALF,
        STATION_HALF,
      );

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

      if (stationHit && stationHit.t < hitT) {
        const x = shot.x + shot.vx * dt * stationHit.t;
        const y = shot.y + shot.vy * dt * stationHit.t;
        this.events.push({ type: "hit", x, y });
        continue;
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

  /** Ore turns into credits one piece at a time while in the dock. */
  private unloadOre(dt: number): void {
    const { stats, ship } = this;
    if (stats.ore <= 0 || !this.isDocked()) {
      this.unloadTimer = 0;
      return;
    }
    this.unloadTimer += dt;
    while (this.unloadTimer >= UNLOAD_SECONDS && stats.ore > 0) {
      this.unloadTimer -= UNLOAD_SECONDS;
      stats.ore--;
      stats.credits += this.tuning.creditsPerOre;
      this.events.push({ type: "sale", x: ship.x, y: ship.y });
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
