import type { Ship } from "./sim";

/** How long a line stays on screen, and how many show at once. */
const LINE_SECONDS = 14;
const MAX_LINES = 6;
/** Letters typed per second, so a line arrives like a transmission. */
const TYPE_RATE = 60;

interface Shown {
  element: HTMLDivElement;
  text: HTMLSpanElement;
  full: string;
  shownAt: number;
}

const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/** The radio log in the corner: who is talking and what they said, typed out and fading away. */
export class Radio {
  private lines: Shown[] = [];

  constructor(private readonly box: HTMLElement) {}

  add(line: { speaker: Ship | null; name: string; text: string; x: number; y: number; mayday: boolean }, player: Ship): void {
    const element = document.createElement("div");
    if (!line.speaker) element.className = "station";
    if (line.mayday) element.className = "mayday";
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `${line.name}: `;
    const text = document.createElement("span");
    element.append(who, text);
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
