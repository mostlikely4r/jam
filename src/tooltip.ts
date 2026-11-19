/**
 * The one tooltip the game shows, shared by every screen: the part's name on top, then
 * whatever applies where you're pointing, worked out on hover so it's never stale. It takes
 * the place of the browser's own `title` popup, which is slow, unstyled and plain text. It
 * follows the mouse, stays inside the window, and hides while something is dragged.
 *
 * Two things hang tooltips off it: an element (`setTip`), and the canvas, whose arrows have no
 * element of their own (`canvasTip`, called every frame with what's under the pointer).
 *
 * The content is plain text lines: the first line is the name, the rest the detail. Newlines
 * inside the detail make more lines.
 */

let tip: HTMLDivElement | null = null;
let at: HTMLElement | null = null;
let read: (() => string) | null = null;
/** Whether the tooltip up now is the canvas's, which only the canvas takes down. */
let onCanvas = false;
/** What the canvas last asked for, so a frame that changes nothing doesn't touch the page. */
let canvasSaid = "";
let canvasAt: { x: number; y: number } | null = null;

function ensure(): HTMLDivElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "tooltip";
  tip.hidden = true;
  document.body.append(tip);
  return tip;
}

/** Puts the tooltip near a point on the screen, keeping it whole inside the window. */
function place(x: number, y: number): void {
  const t = ensure();
  const wide = t.offsetWidth;
  const high = t.offsetHeight;
  const left = Math.max(4, Math.min(window.innerWidth - wide - 4, x + 14));
  const top = Math.max(4, Math.min(window.innerHeight - high - 4, y + 18));
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

/** Fills the tooltip in: the name line, then the rest. */
function fill(text: string): void {
  const [name, ...rest] = text.split("\n");
  const t = ensure();
  t.replaceChildren();
  const head = document.createElement("b");
  head.textContent = name;
  t.append(head);
  if (rest.length > 0 && rest.join("").trim() !== "") {
    const body = document.createElement("span");
    body.textContent = rest.join("\n");
    t.append(body);
  }
}

function hide(): void {
  at = null;
  read = null;
  onCanvas = false;
  canvasSaid = "";
  canvasAt = null;
  if (tip) tip.hidden = true;
}

/** Shows the tooltip under the pointer: the name line, then the rest. Hidden while dragging. */
function show(element: HTMLElement, content: () => string, x: number, y: number): void {
  hide();
  if (document.body.classList.contains("dragging")) return;
  const text = content();
  if (!text) return;
  at = element;
  read = content;
  fill(text);
  ensure().hidden = false;
  place(x, y);
}

/**
 * Gives an element the shared tooltip. `content` is read on every hover, so what it works out
 * from the game is never stale. An element that already has one keeps the last call's.
 */
export function setTip(element: HTMLElement, content: () => string): void {
  element.addEventListener("pointerenter", (event) => show(element, content, event.clientX, event.clientY));
  element.addEventListener("pointermove", (event) => {
    // What's pointed at may have changed under the pointer: only keep showing while hovered.
    if (at === element && read !== null) show(element, read, event.clientX, event.clientY);
  });
  element.addEventListener("pointerleave", hide);
}

/**
 * The tooltip for something drawn on a canvas, which has no element to hang it off: the renderer
 * calls this every frame with the screen point it belongs to and what to say, or null when the
 * pointer is over nothing of its. It comes and goes with the frame, not with an event.
 */
export function canvasTip(anchor: { x: number; y: number } | null, content: () => string): void {
  if (document.body.classList.contains("dragging")) anchor = null;
  if (!anchor) {
    if (onCanvas) hide();
    return;
  }
  const text = content();
  if (!text) {
    if (onCanvas) hide();
    return;
  }
  onCanvas = true;
  // The canvas asks on every frame: only touch the page when what it says or where changes.
  if (canvasSaid !== text || canvasAt === null || tip?.hidden !== false) {
    canvasSaid = text;
    canvasAt = anchor;
    fill(text);
    ensure().hidden = false;
    place(anchor.x, anchor.y);
    return;
  }
  if (canvasAt.x !== anchor.x || canvasAt.y !== anchor.y) {
    canvasAt = anchor;
    place(anchor.x, anchor.y);
  }
}

// Picking something up starts a drag: the tooltip gets out of the way, and pointer moves while
// it's held never bring it back. The next hover shows it again.
window.addEventListener("pointerdown", hide, { capture: true });
