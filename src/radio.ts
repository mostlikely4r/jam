import { renderFaceSvg, type Mood, type Voice } from "./faces";
import type { Ship } from "./sim";

/** How long a line stays on screen, and how many show at once. */
const LINE_SECONDS = 14;
const MAX_LINES = 6;
/** Letters typed per second, so a line arrives like a transmission. */
const TYPE_RATE = 60;
/** How tall a face is in the log: the same size it is drawn at anywhere else. */
const FACE_SIZE = 26;

interface Shown {
  element: HTMLDivElement;
  text: HTMLSpanElement;
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

  constructor(private readonly box: HTMLElement) {}

  add(
    line: {
      speaker: Ship | null;
      name: string;
      text: string;
      x: number;
      y: number;
      face: { voice: Voice; mood: Mood };
      mayday: boolean;
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
    element.append(faceElement(line.face.voice, line.face.mood), who, text);
    this.box.append(element);

    let full = line.text;
    // A mayday from out of view says where it came from.
    const distance = Math.hypot(line.x - player.x, line.y - player.y);
    if (line.mayday && distance > 1200) {
      const sector = Math.round(Math.atan2(line.y - player.y, line.x - player.x) / (Math.PI / 4));
      full += ` (${Math.round(distance / 100) * 100} ${COMPASS[(sector + 8) % 8]})`;
    }
    this.lines.push({ element, text, full, shownAt: performance.now() });
    while (this.lines.length > MAX_LINES) this.lines.shift()!.element.remove();
  }

  update(): void {
    const now = performance.now();
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
  }
}
