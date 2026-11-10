import { DronePilot } from "./pilot";
import { Renderer } from "./render";
import { Sim, TICK } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** A demo starts over after this long, so it keeps showing the ship at work in the field. */
const DEMO_SECONDS = 45;
/** How far a floater's demo orders send it, and how long it shoots once there. */
const HOP_MIN = 250;
const HOP_MAX = 450;
const SHOOT_SECONDS = 1.5;
const AIMED = 0.05;

/**
 * A small live world behind a ship's card in the start menu, showing how it plays.
 * The racer flies itself through the mining loop on the keys, the way a drone does.
 * The floater is given mouse orders: hop somewhere, stop, turn to a rock, shoot.
 */
export class ShipDemo {
  private sim!: Sim;
  private pilot: DronePilot | null = null;
  private readonly renderer: Renderer;
  private accumulator = 0;
  private age = 0;
  private shooting = 0;
  private seed = 1;

  constructor(
    canvas: HTMLCanvasElement,
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
    };
    this.sim = new Sim(this.seed++, tuning);
    this.age = 0;
    this.accumulator = 0;
    this.shooting = 0;
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
    this.accumulator += seconds;
    while (this.accumulator >= TICK) {
      if (this.pilot) this.pilot.update(sim);
      else this.giveOrders();
      sim.step();
      this.renderer.addEvents(sim.events);
      sim.events.length = 0;
      this.accumulator -= TICK;
    }
    this.renderer.draw(sim, this.accumulator / TICK, seconds);
  }

  /** What a player would click: a hop, a stop, a turn to the nearest rock, and a few shots. */
  private giveOrders(): void {
    const { sim } = this;
    const { ship, controls } = sim;
    controls.fire = false;
    if (this.shooting > 0) {
      this.shooting -= TICK;
      controls.fire = true;
      return;
    }
    if (sim.clickPilot.active) return;
    const rock = this.nearestRock();
    if (rock) {
      const facing = Math.atan2(rock.y - ship.y, rock.x - ship.x);
      const off = Math.abs(Math.atan2(Math.sin(facing - ship.angle), Math.cos(facing - ship.angle)));
      const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
      if (distance < sim.tuning.shotSpeed * sim.tuning.shotLife * 0.8) {
        if (off > AIMED) {
          sim.orderFace(facing);
          return;
        }
        this.shooting = SHOOT_SECONDS;
        return;
      }
      // Hop toward it, stopping short.
      const hop = Math.min(distance - 200, HOP_MAX);
      if (hop > 50) {
        sim.orderMove(ship.x + Math.cos(facing) * hop, ship.y + Math.sin(facing) * hop);
        return;
      }
    }
    const angle = sim.roll() * Math.PI * 2;
    const hop = HOP_MIN + sim.roll() * (HOP_MAX - HOP_MIN);
    sim.orderMove(ship.x + Math.cos(angle) * hop, ship.y + Math.sin(angle) * hop);
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
