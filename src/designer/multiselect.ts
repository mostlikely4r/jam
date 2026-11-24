/**
 * A list of ids picked out of a long set: the picked ones as chips with an × to take each off,
 * a field that narrows the rest as you type, and the rest below it to click or Enter. It
 * replaces the checkbox lists that don't scale to a hundred entries. The picking logic is plain
 * functions, tested on their own; `multiSelect` is the box that shows them.
 */

/** One entry a list can pick: its id, and what it's called. */
export interface MultiOption {
  id: string;
  label: string;
}

/** `picked` with `id` on the end, unless it is already there: the order is the order picked. */
export function withPick<T extends string>(picked: readonly T[], id: string): T[] {
  return picked.includes(id as T) ? [...picked] : [...picked, id as T];
}

/** `picked` without `id`, keeping the order of the rest. */
export function withoutPick<T extends string>(picked: readonly T[], id: string): T[] {
  return picked.filter((each) => each !== id);
}

/** The text a filter is read as: lower case, without the spaces round it. */
const heard = (text: string) => text.trim().toLowerCase();

/**
 * The options still to pick, in their own order, that match `query`: its label or its id,
 * ignoring case. An empty query offers them all; picked ones are never offered.
 */
export function offered(options: readonly MultiOption[], picked: readonly string[], query: string): MultiOption[] {
  const want = heard(query);
  return options.filter((option) => !picked.includes(option.id) && (want === "" || heard(option.label).includes(want) || heard(option.id).includes(want)));
}

/** How many of the rest a box lists before it asks for the filter instead. */
const SHOWN = 30;

/** The filter each list was left with, by the list's key, so a page rebuild doesn't lose it. */
const filters = new Map<string, string>();

/** The list whose filter field had the cursor, so a page rebuilt by a pick puts it back. */
let typing: string | null = null;

let styled = false;
const STYLE = `
.multi { margin: 4px 0; }
.multi .chips { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px; }
.multi .chips button { margin: 0; padding: 1px 5px; font-size: 12px; border-radius: 9px; }
.multi .chips .none { color: #6a7486; font-size: 12px; }
.multi input.filter { width: 100%; box-sizing: border-box; font-size: 12px; margin-bottom: 3px; }
.multi .picks { display: flex; flex-wrap: wrap; gap: 3px; max-height: 148px; overflow-y: auto; }
.multi .picks button { margin: 0; padding: 1px 6px; font-size: 12px; }
.multi .more { color: #6a7486; font-size: 12px; margin-top: 3px; }
`;

/** Puts the box's style in the page once, whichever designer opened it. */
function style(): void {
  if (styled) return;
  styled = true;
  const sheet = document.createElement("style");
  sheet.textContent = STYLE;
  document.head.append(sheet);
}

export interface MultiConfig {
  /** Which list this is: its filter is kept by this, apart from every other list's. */
  key: string;
  options: readonly MultiOption[];
  /** The ids picked now, in their own order: read afresh each redraw, since a pick makes a new list. */
  picked: () => readonly string[];
  /** Picks `id`, or takes it off: the page's own rule for what the list is and how it orders. */
  pick: (id: string, on: boolean) => void;
  /** Called after a pick, once the page's own record is changed. */
  changed: () => void;
  /** What an empty list says: nothing to pick at all. */
  none?: string;
}

/**
 * The box: chips for what's picked, a filter field, and the rest below it. Picking redraws the
 * box and tells the page, which may rebuild the panel round it; the filter text and the cursor
 * come back with it.
 */
export function multiSelect(config: MultiConfig): HTMLDivElement {
  style();
  const box = document.createElement("div");
  box.className = "multi";
  box.id = `multi-${config.key}`;

  /** Leaves the cursor in the filter after a pick, so several can be picked in a row. */
  const keepTyping = () => {
    if (!field.isConnected) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const field = document.createElement("input");
  field.type = "text";
  field.className = "filter";
  field.value = filters.get(config.key) ?? "";
  field.spellcheck = false;
  const list = document.createElement("div");
  list.className = "picks";
  const more = document.createElement("div");
  more.className = "more";
  box.append(chipRow, field, list, more);

  const redraw = () => {
    const picked = config.picked();
    const labels = new Map(config.options.map((option) => [option.id, option.label] as const));
    const chips: HTMLElement[] = [];
    for (const id of picked) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = `${labels.get(id) ?? id} ×`;
      chip.title = "Take it off";
      chip.addEventListener("click", () => {
        config.pick(id, false);
        redraw();
        config.changed();
        keepTyping();
      });
      chips.push(chip);
    }
    if (chips.length === 0) {
      const none = document.createElement("span");
      none.className = "none";
      none.textContent = "none picked";
      chips.push(none);
    }
    chipRow.replaceChildren(...chips);

    const rest = offered(config.options, picked, field.value);
    const buttons = rest.slice(0, SHOWN).map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.title = option.id;
      button.addEventListener("click", () => {
        config.pick(option.id, true);
        // The chip takes the field's place in the reading order, so the cursor stays useful.
        typing = config.key;
        redraw();
        config.changed();
        keepTyping();
      });
      return button;
    });
    list.replaceChildren(...buttons);
    if (config.options.length === 0) more.textContent = config.none ?? "Nothing to pick yet.";
    else if (rest.length > SHOWN) more.textContent = `${rest.length - SHOWN} more: type to narrow it down`;
    else more.textContent = rest.length === 0 && config.options.length > picked.length ? "Nothing else matches" : "";
  };

  field.addEventListener("input", () => {
    filters.set(config.key, field.value);
    typing = config.key;
    redraw();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const [first] = offered(config.options, config.picked(), field.value);
    if (!first) return;
    event.preventDefault();
    config.pick(first.id, true);
    typing = config.key;
    redraw();
    config.changed();
    keepTyping();
  });

  redraw();
  if (typing === config.key) {
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }
  return box;
}
