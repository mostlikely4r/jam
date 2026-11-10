import type { Ore, Ship, Sim } from "./sim";

/** One line on the radio. A null speaker is the station. */
export interface ChatterLine {
  speaker: Ship | null;
  name: string;
  text: string;
  x: number;
  y: number;
  /** Heard at any distance. */
  mayday: boolean;
  /** Station news for everyone: heard at any distance, without the alarm. */
  broadcast: boolean;
}

const TRAFFIC_NAMES = [
  "Wren",
  "Kestrel",
  "Heron",
  "Magpie",
  "Swift",
  "Plover",
  "Finch",
  "Tern",
  "Lark",
  "Osprey",
  "Petrel",
  "Robin",
];

const HAULER_NAME = "Long Haul";
export const HEADING_BACK = [
  "Hold's full, heading back.",
  "Coming home with a load.",
  "That's a full hold. Turning for the station.",
  "Packing it in for now. Heading back.",
];
export const APPROACH = [
  "On approach, requesting dock.",
  "Station in sight. Requesting a berth.",
  "Coming up on the dock now.",
  "Final approach. Permission to dock?",
];
export const OUTBOUND = [
  "Heading back out to the field.",
  "Unloaded. Back to the rocks.",
  "Off to the field again.",
  "Empty hold. Going back out.",
];
const ALL_CLEAR = ["Looks clear. Heading back out.", "Think it's gone. Back to work.", "Quiet again. I'm going back out."];
const SEE_OFF = ["Good hunting, {name}.", "Fly safe, {name}.", "Clear skies, {name}."];
export const BOUGHT = ["Just fitted a {part}.", "New {part} on board. Let's see what it can do.", "Treated myself to a {part}."];
const BOUGHT_OWNED = ["Fitted a {part}, on your account.", "Bought a {part} with your credits."];
const BOUGHT_REPLY = ["Enjoy the {part}, {name}.", "Pleasure doing business, {name}."];
const FIELD = [
  "Quiet day in the field.",
  "Plenty of rock out here.",
  "Nice and steady today.",
  "Good shooting weather.",
  "Anyone else hear that? Never mind.",
];
const SLIM = ["Slim pickings out here.", "Not much left in this corner.", "Running out of rock over here."];
const FLEEING = ["Pirate! Running for the station!", "Contact, pirate. I'm heading home.", "Pirate on scope, bugging out!"];
const ENGAGED = ["Taking fire, engaging the pirate!", "Pirate engaged, I'm hit!", "Under fire, staying on it!"];
const MAYDAY = ["Mayday, mayday! Pirate on me!", "Mayday! Taking fire!", "Mayday! I can't shake it!"];
export const THANKS = [
  "Thanks for the rocks!",
  "I owe you one.",
  "Nice shooting. I'll take it from here.",
  "Appreciated, friend.",
  "That one's yours, really. Thanks.",
];
const GREETING = ["Welcome back.", "Good to see you again.", "Dock's open when you need it.", "Welcome home."];

const DOCKING_COOLDOWN = 60;
const OUTBOUND_COOLDOWN = 60;
/** Close enough to the dock to ask for it, the same distance the station greets the player at. */
const APPROACH_DISTANCE = 900;
/** Tasks a ship does at the station, and the ones that mean it's back in the field. */
const AT_STATION = new Set(["unloading", "repairing", "sheltering"]);
const FLEEING_COOLDOWN = 30;
const MAYDAY_COOLDOWN = 30;
const THANKS_COOLDOWN = 180;
const GREETING_COOLDOWN = 120;
const STATION_REPLY_DELAY = 1.5;
const FIELD_CHATTER_MIN = 150;
const FIELD_CHATTER_MAX = 360;
/** Ore picked up at least this far from the player counts as taken, not shared. */
const THANKS_DISTANCE = 400;
const GREETING_NEAR = 900;
const GREETING_FAR = 1500;
const SLIM_RADIUS = 800;
const SLIM_ROCKS = 3;
const FIELD_TASKS = new Set(["to rock", "shooting", "gathering", "idle"]);

/**
 * Radio talk: traffic saying what it's doing, the station answering, thanks for ore the
 * player broke loose, and maydays when a pirate attacks. It only says things that happened.
 */
export class Chatter {
  private time = 0;
  private names = new WeakMap<Ship, string>();
  private nextName = 0;
  private tasks = new WeakMap<Ship, string>();
  private cooldowns = new WeakMap<Ship, Map<string, number>>();
  private stationCooldowns = new Map<string, number>();
  private nextFieldTalk = new WeakMap<Ship, number>();
  private replies: { at: number; text: string }[] = [];
  /** Ships that asked for the dock on this trip home. */
  private approached = new WeakSet<Ship>();
  private playerFar = true;
  private random: () => number;

  constructor(seed: number) {
    let state = seed * 7919 + 17;
    this.random = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
  }

  nameOf(sim: Sim, ship: Ship): string {
    let name = this.names.get(ship);
    if (name) return name;
    const drone = sim.drones.findIndex((pilot) => pilot.ship === ship);
    if (ship.faction === "defender") name = "Defender";
    else if (ship.faction === "pirate") name = "Unknown";
    else if (drone >= 0) name = ship.owner ? `Your drone ${drone + 1}` : `Drone ${drone + 1}`;
    else name = TRAFFIC_NAMES[this.nextName++ % TRAFFIC_NAMES.length];
    this.names.set(ship, name);
    return name;
  }

  update(sim: Sim, dt: number): void {
    this.time += dt;
    const due = this.replies.filter((reply) => reply.at <= this.time);
    this.replies = this.replies.filter((reply) => reply.at > this.time);
    for (const reply of due) this.stationSays(sim, reply.text);

    for (const pilot of [...sim.traffic, ...sim.drones]) {
      const { ship, task } = pilot;
      const before = this.tasks.get(ship);
      this.tasks.set(ship, task);
      const name = this.nameOf(sim, ship);
      const dock = sim.dockPoint();
      const nearDock = Math.hypot(ship.x - dock.x, ship.y - dock.y) < APPROACH_DISTANCE;
      if (task !== "to station") this.approached.delete(ship);
      if (task === "to station" && ship.ore > 0 && nearDock && !this.approached.has(ship)) {
        // Close in: it asks for the dock, and the station clears it.
        this.approached.add(ship);
        if (this.ready(ship, "approach", DOCKING_COOLDOWN)) {
          this.say(sim, ship, this.pick(APPROACH));
          this.reply(`Roger, ${name}, cleared to dock.`);
        }
      } else if (task !== before && task === "to station" && ship.ore > 0) {
        // Turning for home, out in the field. Nobody needs to answer that.
        if (this.ready(ship, "heading back", DOCKING_COOLDOWN)) this.say(sim, ship, this.pick(HEADING_BACK));
      } else if (task !== before && before !== undefined && AT_STATION.has(before) && FIELD_TASKS.has(task)) {
        // Leaving the station for the field. Once there are other places, this says which.
        if (this.ready(ship, "outbound", OUTBOUND_COOLDOWN)) {
          this.say(sim, ship, this.pick(before === "sheltering" ? ALL_CLEAR : OUTBOUND));
          this.reply(this.pick(SEE_OFF).replace("{name}", name));
        }
      } else if (task !== before && task === "fleeing") {
        if (this.ready(ship, "fleeing", FLEEING_COOLDOWN)) {
          this.say(sim, ship, this.pick(FLEEING));
          this.reply(`${name}, the dock is clear. Come on in.`);
        }
      } else if (FIELD_TASKS.has(task)) {
        this.fieldTalk(sim, ship);
      }
    }

    for (const pilot of sim.fighters) {
      const { ship, task } = pilot;
      const before = this.tasks.get(ship);
      this.tasks.set(ship, task);
      if (ship.faction === "defender" && task !== before && task === "responding") {
        if (this.ready(ship, "responding", MAYDAY_COOLDOWN)) this.say(sim, ship, "On my way.");
      }
    }

    const dock = sim.dockPoint();
    const distance = Math.hypot(sim.ship.x - dock.x, sim.ship.y - dock.y);
    if (distance > GREETING_FAR) this.playerFar = true;
    if (distance < GREETING_NEAR && this.playerFar) {
      this.playerFar = false;
      if (this.stationReady("greeting", GREETING_COOLDOWN)) this.stationSays(sim, this.pick(GREETING));
    }
  }

  /** Someone other than the player picked up ore the player's shot broke loose. */
  pickedUp(sim: Sim, ship: Ship, ore: Ore): void {
    if (ore.from !== sim.ship || ship === sim.ship || ship.owner || ship.faction) return;
    if (Math.hypot(ore.x - sim.ship.x, ore.y - sim.ship.y) < THANKS_DISTANCE) return;
    if (this.ready(ship, "thanks", THANKS_COOLDOWN)) this.say(sim, ship, this.pick(THANKS));
  }

  /** A ship took a hit. A pirate's attack brings a mayday heard everywhere. */
  shot(sim: Sim, ship: Ship, from: Ship): void {
    if (from.faction !== "pirate" || ship.faction === "pirate" || ship === sim.ship) return;
    if (!this.ready(ship, "mayday", MAYDAY_COOLDOWN)) return;
    this.say(sim, ship, this.pick(ship.faction === "defender" ? ENGAGED : MAYDAY), true);
  }

  haulerBerthed(sim: Sim): void {
    const spot = sim.haulerSpot();
    if (!spot) return;
    this.lineFrom(sim, HAULER_NAME, "At your berth and ready to load.", spot.x, spot.y);
    this.reply(`Roger, ${HAULER_NAME}. Loading now.`);
  }

  haulerLeaving(sim: Sim, cargo: number): void {
    const spot = sim.haulerSpot();
    if (!spot) return;
    const text = cargo > 0 ? `${cargo} ore aboard. See you next run.` : "Nothing for us today. We'll try again later.";
    this.lineFrom(sim, HAULER_NAME, text, spot.x, spot.y);
  }

  /** What a ship is called on the radio, where the player is just "you". */
  private called(sim: Sim, ship: Ship): string {
    return ship === sim.ship ? "you" : this.nameOf(sim, ship);
  }

  /** Someone shot a pirate, and now every pirate knows. */
  marked(sim: Sim, pirate: Ship, attacker: Ship): void {
    const text = attacker === sim.ship ? "You'll regret that." : `Big mistake, ${this.nameOf(sim, attacker)}.`;
    this.say(sim, pirate, text);
  }

  /** A ship that took one hit too many runs for the station to tell. */
  reporting(sim: Sim, victim: Ship, attacker: Ship): void {
    const text =
      attacker === sim.ship
        ? "Stop shooting at me! I'm reporting you."
        : `${this.nameOf(sim, attacker)} is firing on me! Heading in to report it.`;
    this.say(sim, victim, text);
  }

  /** The station puts out word of a wanted ship, to everyone. */
  reported(sim: Sim, attacker: Ship, victim: Ship): void {
    const defender = sim.fighters.some((pilot) => pilot.ship.faction === "defender");
    const who = this.called(sim, attacker);
    const law = defender ? " Defender, go get them." : "";
    const text =
      attacker === sim.ship
        ? `${this.nameOf(sim, victim)} reports you fired on them. You're wanted.${law}`
        : `All ships, ${who} attacked ${this.nameOf(sim, victim)} and is wanted.${law}`;
    this.stationSays(sim, text, true);
  }

  /** A ship other than the player bought a part at the station. */
  bought(sim: Sim, ship: Ship, part: string): void {
    const name = this.nameOf(sim, ship);
    this.say(sim, ship, this.pick(ship.owner ? BOUGHT_OWNED : BOUGHT).replace("{part}", part));
    if (!ship.owner) this.reply(this.pick(BOUGHT_REPLY).replace("{part}", part).replace("{name}", name));
  }

  /** News that matters out in the field goes out to everyone, not just those near the station. */
  depositBuilt(sim: Sim): void {
    this.stationSays(sim, "The field deposit is up. Drop your ore there or haul it in.", true);
  }

  guardsBuilt(sim: Sim, atStation: boolean): void {
    this.stationSays(sim, atStation ? "Station turrets are online." : "Turrets are up at the field deposit.", true);
  }

  unlocked(sim: Sim, names: string[]): void {
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    this.stationSays(sim, `New blueprint${names.length > 1 ? "s" : ""} in. The shop now stocks ${list}.`, true);
  }

  defenderLaunched(sim: Sim): void {
    this.stationSays(sim, "Defender launching. Stay safe out there.", true);
  }

  trafficReplaced(sim: Sim, ship: Ship): void {
    this.stationSays(sim, `${this.nameOf(sim, ship)}, you're cleared for departure. Welcome back.`);
  }

  private fieldTalk(sim: Sim, ship: Ship): void {
    const next = this.nextFieldTalk.get(ship);
    if (next === undefined) {
      this.nextFieldTalk.set(ship, this.time + this.between(FIELD_CHATTER_MIN, FIELD_CHATTER_MAX));
      return;
    }
    if (this.time < next) return;
    this.nextFieldTalk.set(ship, this.time + this.between(FIELD_CHATTER_MIN, FIELD_CHATTER_MAX));
    const rocksNear = sim.rocks.filter(
      (rock) => Math.hypot(rock.x - ship.x, rock.y - ship.y) < SLIM_RADIUS,
    ).length;
    this.say(sim, ship, this.pick(rocksNear < SLIM_ROCKS ? SLIM : FIELD));
  }

  private say(sim: Sim, ship: Ship, text: string, mayday = false): void {
    sim.events.push({
      type: "chatter",
      speaker: ship,
      name: this.nameOf(sim, ship),
      text,
      x: ship.x,
      y: ship.y,
      mayday,
      broadcast: false,
    });
  }

  private lineFrom(sim: Sim, name: string, text: string, x: number, y: number): void {
    sim.events.push({ type: "chatter", speaker: null, name, text, x, y, mayday: false, broadcast: false });
  }

  private stationSays(sim: Sim, text: string, broadcast = false): void {
    const dock = sim.dockPoint();
    sim.events.push({ type: "chatter", speaker: null, name: "Station", text, x: dock.x, y: dock.y, mayday: false, broadcast });
  }

  private reply(text: string): void {
    this.replies.push({ at: this.time + STATION_REPLY_DELAY, text });
  }

  private ready(ship: Ship, kind: string, cooldown: number): boolean {
    let map = this.cooldowns.get(ship);
    if (!map) {
      map = new Map();
      this.cooldowns.set(ship, map);
    }
    const last = map.get(kind);
    if (last !== undefined && this.time - last < cooldown) return false;
    map.set(kind, this.time);
    return true;
  }

  private stationReady(kind: string, cooldown: number): boolean {
    const last = this.stationCooldowns.get(kind);
    if (last !== undefined && this.time - last < cooldown) return false;
    this.stationCooldowns.set(kind, this.time);
    return true;
  }

  private pick(lines: string[]): string {
    return lines[Math.floor(this.random() * lines.length)];
  }

  private between(low: number, high: number): number {
    return low + this.random() * (high - low);
  }
}
