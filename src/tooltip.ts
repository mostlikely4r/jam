/**
 * The one tooltip the game shows, shared by every screen: the part's name on top, then
 * whatever applies where you're pointing, worked out on hover so it's never stale. It takes
 * the place of the browser's own `title` popup, which is slow, unstyled and plain text. It
 * follows the mouse, stays inside the window, and hides while something is dragged.
 *
 * The content is plain text lines: the first line is the name, the rest the detail. Newlines
 * inside the detail make more lines.
 */

let tip: HTMLDivElement | null = null;
let at: HTMLElement | null = null;
let read: (() => string) | null = null;

function ensure(): HTMLDivElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "tooltip";
  tip.hidden = true;
  document.body.append(tip);
  return tip;
}

/** Puts the tooltip near the pointer, keeping it whole inside the window. */
function place(x: number, y: number): void {
  const t = ensure();
  const wide = t.offsetWidth;
  const high = t.offsetHeight;
  const left = Math.max(4, Math.min(window.innerWidth - wide - 4, x + 14));
  const top = Math.max(4, Math.min(window.innerHeight - high - 4, y + 18));
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

/** Shows the tooltip under the pointer: the name line, then the rest. Hidden while dragging. */
function show(element: HTMLElement, content: () => string, x: number, y: number): void {
  hide();
  if (document.body.classList.contains("dragging")) return;
  const text = content();
  if (!text) return;
  at = element;
  read = content;
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
  t.hidden = false;
  place(x, y);
}

function hide(): void {
  at = null;
  read = null;
  if (tip) tip.hidden = true;
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

// Picking something up starts a drag: the tooltip gets out of the way, and pointer moves while
// it's held never bring it back. The next hover shows it again.
window.addEventListener("pointerdown", hide, { capture: true });
