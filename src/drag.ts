import type { PartId } from "./parts";

/**
 * Dragging things between the shop, the ship and the locker: one drag model for all of them.
 * It follows the pointer rather than the browser's own drag and drop, so R can turn what's
 * held while it's held. A press that doesn't move is still a click.
 */

/** What's held: a part from the shop. */
export type DragPayload = { from: "shop"; part: PartId };

/** Called on a drop: what was held, the drop target's name (its `data-drop`), and whether it was turned. */
type DropHandler = (payload: DragPayload, target: string, turned: boolean) => void;

/** How far the pointer moves before a press becomes a drag, in pixels. */
const DRAG_START = 6;

let held: { payload: DragPayload; label: string; turned: boolean; ghost: HTMLDivElement } | null = null;
let onDrop: DropHandler = () => {};

/** Sets what happens when something is dropped on a target. */
export function setDropHandler(handler: DropHandler): void {
  onDrop = handler;
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
}

/** Makes an element draggable: pressing and moving on it picks up the payload. */
export function makeDraggable(element: HTMLElement, payload: () => DragPayload, label: string): void {
  element.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    const move = (event: PointerEvent) => {
      if (!held && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < DRAG_START) return;
      if (!held) pickUp(payload(), label);
      moveGhost(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!held) return;
      const drop = held;
      putDown();
      // The click that follows a drag isn't a click. If none comes, stop waiting for one.
      const swallow = (click: MouseEvent) => click.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-drop]");
      if (target?.dataset.drop) onDrop(drop.payload, target.dataset.drop, drop.turned);
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
  held = { payload, label, turned: false, ghost };
  showGhost();
}

function showGhost(): void {
  if (held) held.ghost.textContent = `${held.label}${held.turned ? " (turned)" : ""} - R turns it`;
}

function moveGhost(x: number, y: number): void {
  if (!held) return;
  held.ghost.style.left = `${x + 12}px`;
  held.ghost.style.top = `${y + 12}px`;
}

function putDown(): void {
  held?.ghost.remove();
  held = null;
  document.body.classList.remove("dragging");
}
