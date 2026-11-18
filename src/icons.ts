/**
 * Part icons: a glyph in a border-coloured frame, with the mark in the bottom-right corner.
 * Built from `src/glyphs.ts`, one element builder shared by the shop, the blueprint, the bay
 * and the locker tiles and the drag ghost, so every part looks the same everywhere.
 */
import { GLYPH_IDS, glyphOf } from "./glyphs";
import { isProject, partOf, type BlueprintId, type Part, type PartIcon, type ProjectId } from "./parts";

const NS = "http://www.w3.org/2000/svg";

/** The mark an icon shows: at most its first 3 characters, trimmed. */
export function markShown(mark: string | undefined): string {
  return (mark ?? "").trim().slice(0, 3);
}

/**
 * One icon: a border-coloured frame around the glyph, the mark in the bottom-right corner.
 * `size` is the frame's width and height in pixels; the glyph scales inside it.
 */
export function iconEl(icon: PartIcon, size: number): HTMLElement {
  const box = document.createElement("span");
  box.className = "part-icon";
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  box.style.borderColor = icon.border;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  glyphOf(icon.glyph)?.draw(svg, icon.primary, icon.secondary);
  box.append(svg);
  const mark = markShown(icon.mark);
  if (mark) {
    const corner = document.createElement("span");
    corner.className = "part-icon-mark";
    corner.textContent = mark;
    corner.style.fontSize = `${Math.max(8, Math.round(size * 0.38))}px`;
    box.append(corner);
  }
  return box;
}

/** A part's icon at `size` pixels across. */
export function partIcon(part: Part, size: number): HTMLElement {
  return iconEl(part.icon, size);
}

/** One bare glyph at `size` pixels, in the given colours, with no frame or mark: the designer's picker. */
export function glyphIcon(glyphId: string, primary: string, secondary: string, size: number): HTMLElement {
  const box = document.createElement("span");
  box.className = "part-icon bare";
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  glyphOf(glyphId)?.draw(svg, primary, secondary);
  box.append(svg);
  return box;
}

/** The icons of the station's own items, set in code from the same glyph set: no designer for these. */
export const STATION_ICONS: Record<"drone" | ProjectId, PartIcon> = {
  drone: { glyph: "drone", primary: "#8c9bb2", secondary: "#bec8d8", border: "#8fe3a1", mark: "" },
  deposit: { glyph: "deposit", primary: "#6f7a8c", secondary: "#f0d86a", border: "#8fe3a1", mark: "" },
  stationGuards: { glyph: "stationTurret", primary: "#5a6272", secondary: "#e88a8a", border: "#8fe3a1", mark: "" },
  depositGuards: { glyph: "stationTurret", primary: "#7a8494", secondary: "#e88a8a", border: "#8fe3a1", mark: "!" },
};

/** The icon of anything the shop's blueprint queue can hold: a part's own, or a station item's code-set one. */
export function blueprintIcon(id: BlueprintId): PartIcon {
  if (id === "drone" || isProject(id)) return STATION_ICONS[id];
  return partOf(id).icon;
}

/** Every glyph id there is a drawing for, for the designer's picker. */
export const EVERY_GLYPH: readonly string[] = GLYPH_IDS;
