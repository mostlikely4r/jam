import { PARTS } from "./parts";
import type { Mood, Voice } from "./faces";
// SAFETY: hand-authored data in the same file the faces live in. A pack only writes the kinds it
// has an opinion about, and anything missing falls back to the shared list.
import packFile from "./voices.json";
import type { Base, Ore, Poi, Report, Ship, Sim } from "./sim";

/** What a line is about. A voice pack writes its own lines for the kinds it cares to. */
export type LineKind =
  | "approach"
  | "heading_back"
  | "outbound"
  | "all_clear"
  | "fleeing"
  | "engaged"
  | "mayday"
  | "thanks"
  | "bought"
  | "field"
  | "slim"
  | "news";

/** The mood each kind of line is said in. It comes from what happened, never at random. */
const MOOD_OF: Record<LineKind, Mood> = {
  approach: "neutral",
  heading_back: "neutral",
  outbound: "neutral",
  all_clear: "happy",
  fleeing: "scared",
  engaged: "scared",
  mayday: "scared",
  thanks: "happy",
  bought: "happy",
  field: "neutral",
  slim: "tired",
  news: "neutral",
};

/** What a face is, on a line: a key, not a picture, which the radio draws. */
export interface FaceKey {
  voice: Voice;
  mood: Mood;
}

/** One line on the radio. A null speaker is the station. */
export interface ChatterLine {
  speaker: Ship | null;
  name: string;
  text: string;
  x: number;
  y: number;
  /** Who is talking and how it looks. */
  face: FaceKey;
  /** Heard at any distance. */
  mayday: boolean;
  /** Station news for everyone: heard at any distance, without the alarm. */
  broadcast: boolean;
}

/** A pack's written lines per kind: what a regular says instead of the shared list. */
interface Pack {
  lines?: Partial<Record<LineKind, string[]>>;
}

// SAFETY: the file is hand-authored pack data; `FaceFile` in voices.json's own type covers the
// faces, and this covers the lines. A kind with no entry falls back to the shared list.
const PACKS = packFile as unknown as Record<string, Pack>;

/** The two regulars, in the order they settle at the player's home base. */
const REGULARS: Voice[] = ["gus", "pip"];
const REGULAR_NAMES: Partial<Record<Voice, string>> = { gus: "Gus", pip: "Pip" };

/**
 * The lines a regular wrote for a kind, if any. Exported so a test can check that a line came from
 * the voice that said it, and that a missing kind really falls back.
 */
export function voiceLines(voice: Voice, kind: LineKind): string[] | undefined {
  return PACKS[voice]?.lines?.[kind];
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
const BLACK_MARKET_NAME = "No Name";
const BLACK_MARKET_HELLO = ["Open for business. What've you got?", "Usual terms. Ore for parts.", "Make it quick."];
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
const TO_DEPOSIT = ["Off to pick up a load at the deposit.", "Making a run to the deposit.", "Going to fetch some ore from the deposit."];
const TO_PIRATES = ["Making a run to the pirate base. Wish me luck.", "Heading out to buy from the pirates.", "Going shopping at the pirate base."];
const PIRATE_WARNING = ["Watch yourself out there, {name}.", "Your funeral, {name}.", "Keep your hold empty till you're there, {name}."];
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
const NEWS = ["Word from {base}: they sell {item}, {price} credits.", "Heard at {base}: {item} for {price} credits.", "{base} has {item} in, {price} credits."];
const NEWS_FOR_PLAYER = ["On the board: {base} sells {item}, {price} credits.", "News on the board for you: {item} at {base}, {price} credits."];
const NEWS_REPLY = ["Thanks, {name}. It's on the board.", "Noted, {name}. Putting it up on the board."];
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
/** Long enough for the wreck to play out on screen first. */
const PLAYER_REBUILT_DELAY = 2.6;
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
  /** Station lines still to come, which station says each, and in what mood. */
  private replies: { at: number; text: string; from: Poi; mood: Mood }[] = [];
  /** Ships that asked for the dock on this trip home. */
  private approached = new WeakSet<Ship>();
  private playerFar = true;
  /** The two regulars at the player's home base, by ship: settled once for the game. */
  private regulars = new WeakMap<Ship, Voice>();
  private settled = false;
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
    this.settle(sim);
    const regular = this.regulars.get(ship);
    const drone = sim.drones.findIndex((pilot) => pilot.ship === ship);
    if (ship.faction === "defender") name = "Defender";
    else if (ship.faction === "pirate") name = "Unknown";
    else if (regular) name = REGULAR_NAMES[regular] ?? "Traffic";
    else if (drone >= 0) name = ship.owner ? `Your drone ${drone + 1}` : `Drone ${drone + 1}`;
    else name = TRAFFIC_NAMES[this.nextName++ % TRAFFIC_NAMES.length];
    this.names.set(ship, name);
    return name;
  }

  /**
   * Settles the two regulars, once: the first traffic ships whose home is the player's home base
   * become Gus and Pip, in that order. Names and faces only; the world's generator is not asked.
   */
  private settle(sim: Sim): void {
    if (this.settled) return;
    this.settled = true;
    const home = sim.homeBaseOf(sim.ship).id;
    const waiting = [...REGULARS];
    for (const pilot of sim.traffic) {
      if (waiting.length === 0) return;
      if (sim.homeBaseOf(pilot.ship).id !== home) continue;
      this.regulars.set(pilot.ship, waiting.shift()!);
    }
  }

  /** The voice a speaker talks in, which is also how its line is drawn. */
  private voiceOf(sim: Sim, ship: Ship | null): Voice {
    if (!ship) return "station";
    if (ship !== sim.ship) this.settle(sim);
    return this.regulars.get(ship) ?? "generic";
  }

  update(sim: Sim, dt: number): void {
    this.time += dt;
    const due = this.replies.filter((reply) => reply.at <= this.time);
    this.replies = this.replies.filter((reply) => reply.at > this.time);
    for (const reply of due) this.stationSays(sim, reply.text, false, reply.from, reply.mood);

    for (const pilot of [...sim.traffic, ...sim.drones]) {
      const { ship, task } = pilot;
      const before = this.tasks.get(ship);
      this.tasks.set(ship, task);
      const name = this.nameOf(sim, ship);
      // Its own base answers it.
      const home = sim.homeBaseOf(ship).poi;
      const dock = sim.dockPoint(false, sim.nearestDock(ship.x, ship.y));
      const nearDock = Math.hypot(ship.x - dock.x, ship.y - dock.y) < APPROACH_DISTANCE;
      if (task !== "to station") this.approached.delete(ship);
      if (task === "to station" && sim.oreIn(ship) > 0 && nearDock && !this.approached.has(ship)) {
        // Close in: it asks for the dock, and the station clears it.
        this.approached.add(ship);
        if (this.ready(ship, "approach", DOCKING_COOLDOWN)) {
          this.sayKind(sim, ship, "approach", APPROACH);
          this.reply(`Roger, ${name}, cleared to dock.`, STATION_REPLY_DELAY, sim.nearestDock(ship.x, ship.y));
        }
      } else if (task !== before && task === "to station" && sim.oreIn(ship) > 0) {
        // Turning for home, out in the field. Nobody needs to answer that.
        if (this.ready(ship, "heading back", DOCKING_COOLDOWN)) this.sayKind(sim, ship, "heading_back", HEADING_BACK);
      } else if (task !== before && task === "to buy" && pilot.trading) {
        // Off to buy a load. The station has an opinion about buying from pirates.
        if (this.ready(ship, "outbound", OUTBOUND_COOLDOWN)) {
          const pirates = pilot.trading === "pirate base";
          this.sayKind(sim, ship, "outbound", pirates ? TO_PIRATES : TO_DEPOSIT);
          this.reply(
            (pirates ? this.pick(PIRATE_WARNING) : this.pick(SEE_OFF)).replace("{name}", name),
            STATION_REPLY_DELAY,
            home,
            pirates ? "annoyed" : "neutral",
          );
        }
      } else if (task !== before && before !== undefined && AT_STATION.has(before) && FIELD_TASKS.has(task)) {
        // Leaving the station for the field. Once there are other places, this says which.
        if (this.ready(ship, "outbound", OUTBOUND_COOLDOWN)) {
          if (before === "sheltering") this.sayKind(sim, ship, "all_clear", ALL_CLEAR);
          else this.sayKind(sim, ship, "outbound", OUTBOUND);
          this.reply(this.pick(SEE_OFF).replace("{name}", name), STATION_REPLY_DELAY, home);
        }
      } else if (task !== before && task === "fleeing") {
        if (this.ready(ship, "fleeing", FLEEING_COOLDOWN)) {
          this.sayKind(sim, ship, "fleeing", FLEEING);
          this.reply(`${name}, the dock is clear. Come on in.`, STATION_REPLY_DELAY, home);
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
        if (this.ready(ship, "responding", MAYDAY_COOLDOWN)) this.sayText(sim, ship, "On my way.", "neutral");
      }
    }

    // Whichever base the player comes in to greets them.
    const near = sim.nearestDock(sim.ship.x, sim.ship.y);
    const dock = sim.dockPoint(false, near);
    const distance = Math.hypot(sim.ship.x - dock.x, sim.ship.y - dock.y);
    if (distance > GREETING_FAR) this.playerFar = true;
    if (distance < GREETING_NEAR && this.playerFar) {
      this.playerFar = false;
      if (this.stationReady("greeting", GREETING_COOLDOWN)) this.stationSays(sim, this.pick(GREETING), false, near);
    }
  }

  /** Someone other than the player picked up ore the player's shot broke loose. */
  pickedUp(sim: Sim, ship: Ship, ore: Ore): void {
    if (ore.from !== sim.ship || ship === sim.ship || ship.owner || ship.faction) return;
    if (Math.hypot(ore.x - sim.ship.x, ore.y - sim.ship.y) < THANKS_DISTANCE) return;
    if (this.ready(ship, "thanks", THANKS_COOLDOWN)) this.sayKind(sim, ship, "thanks", THANKS);
  }

  /** A ship took a hit. A pirate's attack brings a mayday heard everywhere. */
  shot(sim: Sim, ship: Ship, from: Ship): void {
    if (from.faction !== "pirate" || ship.faction === "pirate" || ship === sim.ship) return;
    if (!this.ready(ship, "mayday", MAYDAY_COOLDOWN)) return;
    if (ship.faction === "defender") this.sayKind(sim, ship, "engaged", ENGAGED, true);
    else this.sayKind(sim, ship, "mayday", MAYDAY, true);
  }

  blackMarketArrived(sim: Sim): void {
    const spot = sim.blackMarket;
    if (!spot) return;
    this.lineFrom(sim, BLACK_MARKET_NAME, this.pick(BLACK_MARKET_HELLO), spot.x, spot.y);
  }

  blackMarketLeaving(sim: Sim, cargo: number): void {
    const spot = sim.blackMarket;
    if (!spot) return;
    const text = cargo > 0 ? `${cargo} ore aboard. No questions asked.` : "Nothing for us. Wasted trip.";
    this.lineFrom(sim, BLACK_MARKET_NAME, text, spot.x, spot.y);
  }

  /** The pirates bought a new hull: there will be one more of them. */
  blackMarketHull(sim: Sim): void {
    const spot = sim.blackMarket;
    if (!spot) return;
    this.lineFrom(sim, BLACK_MARKET_NAME, "One hull, as ordered. Fly it well.", spot.x, spot.y);
  }

  haulerBerthed(sim: Sim, base: Base): void {
    const spot = sim.haulerSpot(false, base);
    if (!spot) return;
    this.lineFrom(sim, HAULER_NAME, "At your berth and ready to load.", spot.x, spot.y);
    this.reply(`Roger, ${HAULER_NAME}. Loading now.`, STATION_REPLY_DELAY, base.poi);
  }

  haulerLeaving(sim: Sim, base: Base, cargo: number): void {
    const spot = sim.haulerSpot(false, base);
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
    this.sayText(sim, pirate, text, "angry");
  }

  /** A ship that took one hit too many runs for the station to tell. */
  reporting(sim: Sim, victim: Ship, attacker: Ship): void {
    const text =
      attacker === sim.ship
        ? "Stop shooting at me! I'm reporting you."
        : `${this.nameOf(sim, attacker)} is firing on me! Heading in to report it.`;
    this.sayText(sim, victim, text, "scared");
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
    this.stationSays(sim, text, true, sim.nearestDock(victim.x, victim.y), "annoyed");
  }

  /** A ship docked with word the board didn't have: it tells the station, which posts it. */
  newsBrought(sim: Sim, ship: Ship, base: Base, reports: Report[]): void {
    this.sayKind(sim, ship, "news", NEWS, false, (pattern) => this.newsLine(sim, pattern, reports));
    this.reply(this.pick(NEWS_REPLY).replace("{name}", this.nameOf(sim, ship)), STATION_REPLY_DELAY, base.poi);
  }

  /** The player docked where the board has word they hadn't heard: the station passes it on. */
  newsForPlayer(sim: Sim, base: Base, reports: Report[]): void {
    this.reply(this.newsLine(sim, this.pick(NEWS_FOR_PLAYER), reports), STATION_REPLY_DELAY, base.poi);
  }

  /** One report as a line, with a word on any others. */
  private newsLine(sim: Sim, pattern: string, reports: Report[]): string {
    const [report] = reports;
    const label = PARTS.find((part) => part.id === report.item)?.label ?? report.item;
    const item = /^[aeiou]/i.test(label) ? `an ${label.toLowerCase()}` : `a ${label.toLowerCase()}`;
    const more = reports.length > 1 ? " And more, it's all on the board." : "";
    const text = pattern.replace("{base}", sim.baseName(report.base)).replace("{item}", item).replace("{price}", report.price.toLocaleString("en-US"));
    return `${text[0].toUpperCase()}${text.slice(1)}${more}`;
  }

  /** A ship other than the player bought a part at the station. */
  bought(sim: Sim, ship: Ship, part: string): void {
    const name = this.nameOf(sim, ship);
    this.sayKind(sim, ship, "bought", ship.owner ? BOUGHT_OWNED : BOUGHT, false, (line) => line.replace("{part}", part));
    if (!ship.owner) this.reply(this.pick(BOUGHT_REPLY).replace("{part}", part).replace("{name}", name), STATION_REPLY_DELAY, sim.baseAt(ship)?.poi ?? sim.homeBaseOf(ship).poi);
  }

  /** News that matters out in the field goes out to everyone, not just those near the station. */
  depositBuilt(sim: Sim, from: Poi): void {
    this.stationSays(sim, "The field deposit is up. Drop your ore there or haul it in.", true, from);
  }

  guardsBuilt(sim: Sim, from: Poi, atStation: boolean): void {
    this.stationSays(sim, atStation ? "Station turrets are online." : "Turrets are up at the field deposit.", true, from);
  }

  unlocked(sim: Sim, from: Poi, names: string[]): void {
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    this.stationSays(sim, `New blueprint${names.length > 1 ? "s" : ""} in. The shop now stocks ${list}.`, true, from);
  }

  defenderLaunched(sim: Sim, from: Poi): void {
    this.stationSays(sim, "Defender launching. Stay safe out there.", true, from);
  }

  trafficReplaced(sim: Sim, ship: Ship, from: Poi): void {
    this.stationSays(sim, `${this.nameOf(sim, ship)}, you're cleared for departure. Welcome back.`, false, from);
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
    if (rocksNear < SLIM_ROCKS) this.sayKind(sim, ship, "slim", SLIM);
    else this.sayKind(sim, ship, "field", FIELD);
  }

  private sayKind(
    sim: Sim,
    ship: Ship,
    kind: LineKind,
    shared: string[],
    mayday = false,
    shape: (line: string) => string = (line) => line,
  ): void {
    const pool = voiceLines(this.voiceOf(sim, ship), kind) ?? shared;
    this.sayText(sim, ship, shape(this.pick(pool)), MOOD_OF[kind], mayday);
  }

  private sayText(sim: Sim, ship: Ship, text: string, mood: Mood, mayday = false): void {
    sim.events.push({
      type: "chatter",
      speaker: ship,
      name: this.nameOf(sim, ship),
      text,
      x: ship.x,
      y: ship.y,
      face: { voice: this.voiceOf(sim, ship), mood },
      mayday,
      broadcast: false,
    });
  }

  private lineFrom(sim: Sim, name: string, text: string, x: number, y: number): void {
    sim.events.push({
      type: "chatter",
      speaker: null,
      name,
      text,
      x,
      y,
      face: { voice: "station", mood: "neutral" },
      mayday: false,
      broadcast: false,
    });
  }

  private stationSays(sim: Sim, text: string, broadcast: boolean, from: Poi, mood: Mood = "neutral"): void {
    const dock = sim.dockPoint(false, from);
    sim.events.push({
      type: "chatter",
      speaker: null,
      name: "Station",
      text,
      x: dock.x,
      y: dock.y,
      face: { voice: "station", mood },
      mayday: false,
      broadcast,
    });
  }

  private reply(text: string, delay: number, from: Poi, mood: Mood = "neutral"): void {
    this.replies.push({ at: this.time + delay, text, from, mood });
  }

  /** The player's ship was wrecked and rebuilt in the dock. Said once the wreck has been watched. */
  playerRebuilt(cost: number, cleared: boolean, at: Poi): void {
    const price = cost > 0 ? ` That's ${cost} credits.` : "";
    const record = cleared ? " Fresh hull, clean record." : "";
    this.reply(`We've rebuilt your ship.${price}${record}`, PLAYER_REBUILT_DELAY, at);
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
