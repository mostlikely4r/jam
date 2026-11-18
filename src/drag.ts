import type { Module } from "./fitting";
import type { PartId } from "./parts";
import type { ItemPlace } from "./sim";

/**
 * Dragging things between the shop, the blueprint, the bay and the locker: one drag model for
 * all of them. It follows the pointer rather than the browser's own drag and drop, which sends
 * no keys while it runs, so R can turn what's held. A press that doesn't move is still a click.
 */

/** What's held: a part from the shop, an item of the ship's or locker's, or one of the pilot's programs. */
export type DragPayload =
  | { from: "shop"; part: PartId }
  | { from: "item"; place: ItemPlace; module: Module; turned: boolean; grab: { x: number; y: number } }
  | { from: "program"; part: PartId; loaded: boolean };

/** Where the pointer is during a drag, and over which drop target (an element with `data-drop`), if any. */
export interface DragAt {
  target: HTMLElement | null;
  x: number;
  y: number;
  turned: boolean;
}

export interface DragHandlers {
  start(payload: DragPayload): void;
  hover(payload: DragPayload, at: DragAt): void;
  drop(payload: DragPayload, at: DragAt): void;
  end(): void;
}

/** How far the pointer moves before a press becomes a drag, in pixels. */
const DRAG_START = 6;

let held: { payload: DragPayload; label: string; turned: boolean; ghost: HTMLDivElement; x: number; y: number } | null = null;
let handlers: DragHandlers = { start() {}, hover() {}, drop() {}, end() {} };

/** Sets what happens as a drag starts, moves over targets, drops and ends. */
export function setDragHandlers(next: DragHandlers): void {
  handlers = next;
}

/** Whether something is being dragged now. */
export function dragging(): boolean {
  return held !== null;
}

/** Turns what's held by 90°. */
export function rotateDrag(): void {
  if (!held) return;
  held.turned = !held.turned;
  showGhost();
  handlers.hover(held.payload, at(held.x, held.y));
}

function at(x: number, y: number): DragAt {
  const under = document.elementFromPoint(x, y) as HTMLElement | null;
  return { target: under?.closest<HTMLElement>("[data-drop]") ?? null, x, y, turned: held?.turned ?? false };
}

/** Makes an element draggable: pressing and moving on it picks up the payload. */
export function makeDraggable(element: HTMLElement, payload: () => DragPayload, label: string): void {
  element.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    const move = (event: PointerEvent) => {
      if (!held && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < DRAG_START) return;
      if (!held) pickUp(payload(), label);
      held!.x = event.clientX;
      held!.y = event.clientY;
      moveGhost(event.clientX, event.clientY);
      handlers.hover(held!.payload, at(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!held) return;
      const drop = held;
      const where = at(event.clientX, event.clientY);
      putDown();
      // The click that follows a drag isn't a click. If none comes, stop waiting for one.
      const swallow = (click: MouseEvent) => click.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      if (where.target) handlers.drop(drop.payload, { ...where, turned: drop.turned });
      handlers.end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

function pickUp(payload: DragPayload, label: string): void {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  document.body.append(ghost);
  document.body.classList.add("dragging");
  held = { payload, label, turned: payload.from === "item" ? payload.turned : false, ghost, x: 0, y: 0 };
  showGhost();
  handlers.start(payload);
}

function showGhost(): void {
  if (!held) return;
  const turns = held.payload.from !== "program";
  held.ghost.textContent = turns ? `${held.label}${held.turned ? " (turned)" : ""} - R turns it` : held.label;
}

function moveGhost(x: number, y: number): void {
  if (!held) return;
  held.ghost.style.left = `${x + 14}px`;
  held.ghost.style.top = `${y + 14}px`;
}

function putDown(): void {
  held?.ghost.remove();
  held = null;
  document.body.classList.remove("dragging");
}
