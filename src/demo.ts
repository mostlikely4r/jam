import { DronePilot } from "./pilot";
import { Renderer } from "./render";
import { Sim, TICK } from "./sim";
import { DEFAULTS, type Tuning } from "./tuning";

/** A demo starts over after this long, so it keeps showing the ship at work in the field. */
const DEMO_SECONDS = 45;
/** A floater's demo drags: how far, how fast it's left drifting, and how often a new one comes. */
const HOP_MIN = 250;
const HOP_MAX = 450;
const DRIFT_MIN = 25;
const DRIFT_MAX = 45;
const DRAG_MIN = 6;
const DRAG_MAX = 10;
const AIMED = 0.05;

/**
 * A small live world behind a ship's card in the start menu, showing how it plays.
 * The racer flies itself through the mining loop on the keys, the way a drone does.
 * The floater is given mouse orders: drags that leave it drifting, and turns to shoot rocks.
 */
export class ShipDemo {
  private sim!: Sim;
  private pilot: DronePilot | null = null;
  private readonly renderer: Renderer;
  private accumulator = 0;
  private age = 0;
  private nextDrag = 0;
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
      dragAbsolute: true,
    };
    this.sim = new Sim(this.seed++, tuning);
    this.age = 0;
    this.accumulator = 0;
    this.nextDrag = 0;
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

  /**
   * What a player would draw: a drag that sends it drifting off somewhere, now and then,
   * and the nose kept on the nearest rock in range, firing once it's lined up.
   */
  private giveOrders(): void {
    const { sim } = this;
    const { ship, controls, field, tuning } = sim;
    controls.fire = false;
    this.nextDrag -= TICK;
    if (this.nextDrag <= 0 && !sim.clickPilot.active) {
      this.nextDrag = DRAG_MIN + sim.roll() * (DRAG_MAX - DRAG_MIN);
      // Back toward the middle when it's wandered out, anywhere otherwise.
      const out = Math.hypot(ship.x - field.x, ship.y - field.y) > tuning.fieldRadius * 0.5;
      const angle = out ? Math.atan2(field.y - ship.y, field.x - ship.x) + (sim.roll() - 0.5) : sim.roll() * Math.PI * 2;
      const hop = HOP_MIN + sim.roll() * (HOP_MAX - HOP_MIN);
      const drift = DRIFT_MIN + sim.roll() * (DRIFT_MAX - DRIFT_MIN);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      sim.orderMove(ship.x + cos * hop, ship.y + sin * hop, cos * drift, sin * drift);
      return;
    }
    const rock = this.nearestRock();
    if (!rock) return;
    const distance = Math.hypot(rock.x - ship.x, rock.y - ship.y);
    if (distance > tuning.shotSpeed * tuning.shotLife * 0.8) return;
    const facing = Math.atan2(rock.y - ship.y, rock.x - ship.x);
    const off = Math.abs(Math.atan2(Math.sin(facing - ship.angle), Math.cos(facing - ship.angle)));
    if (off > AIMED) sim.orderFace(facing);
    controls.fire = off < AIMED * 2;
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
