import { renderFaceSvg, swayFor, type Mood, type Voice } from "./faces";
import type { Ship, Target } from "./sim";
import { poseTransform, swayAt, type Nod } from "./sway";

/** How long a line stays on screen, and how many show at once. */
const LINE_SECONDS = 14;
const MAX_LINES = 6;
/** Letters typed per second, so a line arrives like a transmission. */
const TYPE_RATE = 60;
/** How tall a face is in the log: the same size it is drawn at anywhere else. */
const FACE_SIZE = 26;
/** Seconds the faces take to pick the beat up, and to settle when it stops. */
const SWAY_EASE = 0.35;

/** What the faces sway to: the playing track's tempo and where it is in its own seconds. */
export interface Beat {
  bpm: number;
  position: number;
}

interface Shown {
  element: HTMLDivElement;
  text: HTMLSpanElement;
  /** The group holding the face's features: it turns inside the screen, which stays put. */
  features: SVGElement;
  /** The nod this line's voice sways with: the character, not the mood. */
  nod: Nod;
  /** The transform last written, so a still corner writes nothing. */
  pose: string;
  full: string;
  shownAt: number;
}

/** A face is markup once per voice and mood, then cloned: a line is drawn the moment it is heard. */
const faces = new Map<string, SVGElement>();

function faceElement(voice: Voice, mood: Mood): SVGElement {
  const key = `${voice}-${mood}`;
  let face = faces.get(key);
  if (!face) {
    const markup = renderFaceSvg(voice, mood, { size: FACE_SIZE, seed: key });
    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    // SAFETY: `renderFaceSvg` always returns an `<svg>` root, and the parser keeps it one.
    face = document.importNode(parsed, true) as unknown as SVGElement;
    face.classList.add("face");
    faces.set(key, face);
  }
  return face.cloneNode(true) as SVGElement;
}

const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/** The radio log in the corner: who is talking, how they look, and what they said. */
export class Radio {
  private lines: Shown[] = [];
  /** 0 still, 1 full nod: eased, so a track starting or fading doesn't snap the faces. */
  private strength = 0;
  /** The last beat heard, kept while the faces settle, so a fade out still has a pose to ease. */
  private beat: Beat | null = null;
  private lastUpdate: number | null = null;

  /** `follow` is what a line's button does with where the speaker is going. */
  constructor(
    private readonly box: HTMLElement,
    private readonly follow: (target: Target) => void = () => {},
  ) {}

  add(
    line: {
      speaker: Ship | null;
      name: string;
      text: string;
      x: number;
      y: number;
      face: { voice: Voice; mood: Mood };
      mayday: boolean;
      link?: Target;
    },
    player: Ship,
  ): void {
    const element = document.createElement("div");
    if (!line.speaker) element.className = "station";
    if (line.mayday) element.className = "mayday";
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${line.name}: `;
    const text = document.createElement("span");
    const face = faceElement(line.face.voice, line.face.mood);
    const features = face.querySelector<SVGElement>(".features");
    element.append(face, who, text);
    // Only the button takes the mouse: the log never blocks clicks in space.
    const { link } = line;
    if (link) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "follow";
      button.textContent = "Point there";
      button.title = "Set your destination to where it's going";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.follow(link);
        button.blur();
      });
      element.append(button);
    }
    this.box.append(element);

    let full = line.text;
    // A mayday from out of view says where it came from.
    const distance = Math.hypot(line.x - player.x, line.y - player.y);
    if (line.mayday && distance > 1200) {
      const sector = Math.round(Math.atan2(line.y - player.y, line.x - player.x) / (Math.PI / 4));
      full += ` (${Math.round(distance / 100) * 100} ${COMPASS[(sector + 8) % 8]})`;
    }
    this.lines.push({
      element,
      text,
      features: features ?? face,
      nod: swayFor(line.face.voice),
      pose: "",
      full,
      shownAt: performance.now(),
    });
    while (this.lines.length > MAX_LINES) this.lines.shift()!.element.remove();
  }

  /**
   * Ages the lines and poses the faces. `beat` is the playing track's tempo and position, or null
   * when nothing is playing: the faces then settle back to still over a moment, over their own
   * voice's nod.
   */
  update(beat: Beat | null = null): void {
    const now = performance.now();
    const seconds = this.lastUpdate === null ? 0 : Math.min(0.25, Math.max(0, (now - this.lastUpdate) / 1000));
    this.lastUpdate = now;
    if (beat) this.beat = beat;
    const target = beat ? 1 : 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-seconds / SWAY_EASE));
    if (target === 0 && this.strength < 0.01) {
      this.strength = 0;
      this.beat = null;
    }

    this.lines = this.lines.filter((line) => {
      const age = (now - line.shownAt) / 1000;
      if (age > LINE_SECONDS) {
        line.element.remove();
        return false;
      }
      const typed = Math.min(line.full.length, Math.floor(age * TYPE_RATE));
      if (line.text.textContent!.length !== typed) line.text.textContent = line.full.slice(0, typed);
      line.element.style.opacity = age > LINE_SECONDS - 2 ? "0.2" : "1";
      return true;
    });

    // While a track fades the last beat is held still, so the nod eases out instead of stopping dead.
    for (const line of this.lines) pose(line, this.beat, this.strength);
  }
}

/** Puts a line's face where the beat has it, writing only what actually moved. */
function pose(line: Shown, beat: Beat | null, strength: number): void {
  const transform = beat ? poseTransform(swayAt(line.nod, beat.bpm, beat.position), strength) : "";
  if (transform === line.pose) return;
  line.pose = transform;
  if (transform) line.features.setAttribute("transform", transform);
  else line.features.removeAttribute("transform");
}
