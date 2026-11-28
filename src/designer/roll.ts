import { ROLES, ROLLED_MOODS, rollFace, type Roll } from "../face-pool";
import { CAST, renderFace, resolveFace, swayFor, type CastEntry, type Mood, type Role, type VoiceFace } from "../faces";
import type { Nod, NodKind } from "../sway";

/**
 * Dev only: the Roll and the Shelf on the faces page (docs/face-cast-plan.md, step 1).
 *
 * Roll a batch of faces for a role, look at each the way it really lives (26px in a radio line)
 * and big, hover or click to see its four moods, and keep or skip it. Kept faces go on the shelf,
 * where their sway is set by watching it against the page's music preview, and every change saves
 * to `src/cast.json` through the dev server. Nothing rolled reaches a player unless it was kept.
 */

/** Draws a face's markup as an element tagged for the sway preview, with the nod it sways with. */
export type FaceElement = (markup: string, voice: string, nod?: Nod) => Element;

const BATCH = 24;
const LINE_SIZE = 26;

/** Who the radio line says is talking, before the interview gives them a name. */
const SPEAKER: Record<Role, string> = { traffic: "Kestrel", defender: "Defender", pirate: "Unknown", station: "Station" };
const LINE: Record<Role, string> = {
  traffic: "Full hold, heading in.",
  defender: "Moving to intercept.",
  pirate: "Nice hold you've got there.",
  station: "Cleared to dock, berth two.",
};

const KINDS: NodKind[] = ["still", "tilt", "yaw", "pitch"];

/** What a kept face sways with until the user sets it: the station still, everyone else plain. */
function startingSway(role: Role): Nod {
  return role === "station" ? { every: 4, kind: "still", amount: 0 } : { ...swayFor("generic") };
}

export const ROLL_STYLE = `
  #faces .rollbar { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
  #faces .rollbar select, #faces .rollbar button, #faces .kept select, #faces .card button, #faces .kept button {
    background: #1a2233; color: #cfd8e6; border: 1px solid #33405a; padding: 3px 8px; font: inherit; cursor: pointer; }
  #faces .rollbar button:hover, #faces .card button:hover, #faces .kept button:hover { background: #26324a; }
  #faces .rollbar .status { color: #7f8ba0; }
  #faces .cards { display: flex; flex-wrap: wrap; gap: 10px; }
  #faces .card { position: relative; background: #0b0f18; border: 1px solid #1e2a3d; padding: 8px; box-sizing: border-box; }
  #faces .card .radio { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; white-space: nowrap; }
  #faces .card .radio b { color: #a8d8ff; font-weight: normal; }
  #faces .card .big { line-height: 0; margin-bottom: 6px; }
  #faces .card .moods { display: none; gap: 6px; margin-bottom: 6px; }
  #faces .card:hover .moods, #faces .card.open .moods { display: flex; }
  #faces .card .moods figure { margin: 0; line-height: 0; }
  #faces .card .moods figcaption { font-size: 10px; color: #5a6a80; margin-top: 3px; letter-spacing: 1px; line-height: 1.2; }
  #faces .card .buttons { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  #faces .card .seed { color: #5a6a80; font-size: 10px; margin-left: auto; }
  #faces .kept label { color: #9fb0c6; font-size: 11px; }
  #faces .kept input[type="range"] { width: 70px; }
`;

export class RollShelf {
  private role: Role = "traffic";
  private batch: Roll[] = [];
  private cast: CastEntry[] = structuredClone(CAST);
  /**
   * Whether the shelf holds what is on disk. The import is cached by the dev server (saving the
   * file reloads nothing), so the page reads the file itself, and saves nothing until it has:
   * a save from a stale shelf would drop faces kept since the server started.
   */
  private loaded = false;
  private status = "reading src/cast.json…";
  private readonly root = document.createElement("div");

  /**
   * `size` is the slider's size for the big faces; `restyle` re-reads the faces on the page for
   * the sway preview after this section draws.
   */
  constructor(
    private readonly face: FaceElement,
    private readonly size: () => number,
    private readonly restyle: () => void,
  ) {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch("/__cast");
      if (!response.ok) throw new Error(await response.text());
      // SAFETY: the file this page writes, in the shape it writes it.
      this.cast = (await response.json()) as CastEntry[];
      this.loaded = true;
      this.status = "";
    } catch (error) {
      this.status = `can't read src/cast.json, so nothing saves: ${String(error)}`;
    }
    if (this.root.isConnected) this.redraw();
  }

  /** The section, redrawn from what it holds, so the slider can resize it without losing a batch. */
  render(): HTMLElement {
    this.root.replaceChildren(...this.roll(), ...this.shelf());
    return this.root;
  }

  private redraw(): void {
    this.render();
    this.restyle();
  }

  private roll(): HTMLElement[] {
    const head = heading("Roll", "rolled for a role, from src/face-pool.json — hover or click a face for its moods");
    const bar = document.createElement("div");
    bar.className = "rollbar";
    const role = document.createElement("select");
    for (const name of ROLES) role.append(new Option(name, name, false, name === this.role));
    role.addEventListener("change", () => {
      this.role = role.value as Role;
    });
    const go = document.createElement("button");
    go.textContent = `Roll ${BATCH}`;
    go.addEventListener("click", () => {
      // The page picks fresh seeds; a seed and a role always roll the same face.
      this.batch = Array.from({ length: BATCH }, () => rollFace(Math.floor(Math.random() * 2 ** 32), this.role));
      this.redraw();
    });
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = this.status;
    bar.append("role ", role, go, status);
    const cards = document.createElement("div");
    cards.className = "cards";
    for (const roll of this.batch) {
      const id = `${roll.picks.role}-${roll.seed.toString(16).padStart(8, "0")}`;
      const card = this.card(id, roll.picks.role, roll.face, startingSway(roll.picks.role));
      const buttons = document.createElement("div");
      buttons.className = "buttons";
      const keep = button("Keep", () => {
        this.batch = this.batch.filter((r) => r !== roll);
        if (!this.cast.some((e) => e.id === id)) {
          this.cast.push({ id, role: roll.picks.role, status: "kept", face: roll.face, sway: startingSway(roll.picks.role), from: { seed: roll.seed, picks: roll.picks } });
        }
        void this.save();
      });
      const skip = button("Skip", () => {
        this.batch = this.batch.filter((r) => r !== roll);
        this.redraw();
      });
      const seed = document.createElement("span");
      seed.className = "seed";
      seed.textContent = `${roll.picks.eyes} · ${roll.picks.mouth} · ${roll.picks.mark}`;
      buttons.append(keep, skip, seed);
      card.append(buttons);
      cards.append(card);
    }
    return [head, bar, cards];
  }

  private shelf(): HTMLElement[] {
    const head = heading("Shelf", `${this.cast.length} kept — saved to src/cast.json`);
    const cards = document.createElement("div");
    cards.className = "cards";
    for (const entry of this.cast) {
      const card = this.card(entry.id, entry.role, entry.face, entry.sway);
      card.classList.add("kept");
      const controls = document.createElement("div");
      controls.className = "buttons";

      const role = document.createElement("select");
      for (const name of ROLES) role.append(new Option(name, name, false, name === entry.role));
      role.addEventListener("change", () => {
        entry.role = role.value as Role;
        void this.save();
      });
      const kind = document.createElement("select");
      for (const name of KINDS) kind.append(new Option(name, name, false, name === entry.sway.kind));
      const amount = document.createElement("input");
      amount.type = "range";
      amount.min = "0";
      amount.max = entry.sway.kind === "tilt" ? "6" : "8";
      amount.step = "0.1";
      amount.value = String(entry.sway.amount);
      const every = document.createElement("select");
      for (const beats of [1, 2, 4]) every.append(new Option(`every ${beats}`, String(beats), false, beats === entry.sway.every));
      const change = (): void => {
        const nodKind = kind.value as NodKind;
        // Leaving still starts from a nod that shows, so the new kind can be seen at once.
        if (nodKind !== "still" && Number(amount.value) === 0) amount.value = nodKind === "tilt" ? "2" : "3";
        amount.max = nodKind === "tilt" ? "6" : "8";
        const sway: Nod = { every: Number(every.value), kind: nodKind, amount: nodKind === "still" ? 0 : Number(amount.value) };
        if (nodKind === "yaw" || nodKind === "pitch") sway.turn = 0.1;
        entry.sway = sway;
        // The preview picks the new nod up at once; the file follows.
        for (const element of card.querySelectorAll("svg[data-voice]")) element.setAttribute("data-nod", JSON.stringify(sway));
        this.restyle();
        void this.save(false);
      };
      kind.addEventListener("change", change);
      amount.addEventListener("change", change);
      every.addEventListener("change", change);
      const remove = button("Remove", () => {
        this.cast.splice(this.cast.indexOf(entry), 1);
        void this.save();
      });
      const sway = document.createElement("label");
      sway.append("sway ", kind, " size ", amount, " ", every);
      controls.append(role, sway, remove);
      card.append(controls);
      cards.append(card);
    }
    return [head, cards];
  }

  /** One face as a card: in a radio line, at the slider's size, and its four moods under it. */
  private card(id: string, role: Role, face: VoiceFace, nod: Nod): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "card";
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button, select, input")) return;
      card.classList.toggle("open");
    });
    const draw = (mood: Mood, size: number): Element =>
      this.face(renderFace(resolveFace(id, face, mood), { size, seed: `${id}-${mood}-${size}` }), id, nod);

    const radio = document.createElement("div");
    radio.className = "radio";
    const who = document.createElement("b");
    who.textContent = `${SPEAKER[role]}:`;
    radio.append(draw("neutral", LINE_SIZE), who, LINE[role]);
    const big = document.createElement("div");
    big.className = "big";
    big.append(draw("neutral", this.size()));
    const moods = document.createElement("div");
    moods.className = "moods";
    for (const mood of ROLLED_MOODS) {
      const figure = document.createElement("figure");
      const caption = document.createElement("figcaption");
      caption.textContent = mood;
      const small = document.createElement("div");
      small.className = "radio";
      small.append(draw(mood, LINE_SIZE));
      figure.append(draw(mood, Math.max(48, Math.round(this.size() / 2))), small, caption);
      moods.append(figure);
    }
    card.append(radio, big, moods);
    return card;
  }

  /** Writes the shelf to src/cast.json. `redraw` false keeps the page as it is (a sway change). */
  private async save(redraw = true): Promise<void> {
    if (!this.loaded) {
      this.status = "not saved: src/cast.json hasn't been read";
      if (redraw) this.redraw();
      return;
    }
    try {
      const response = await fetch("/__cast", { method: "POST", body: JSON.stringify(this.cast, null, 2) + "\n" });
      this.status = response.ok ? `saved ${this.cast.length} to src/cast.json` : `save failed: ${await response.text()}`;
    } catch (error) {
      this.status = `save failed: ${String(error)}`;
    }
    if (redraw) this.redraw();
    else {
      const status = this.root.querySelector(".rollbar .status");
      if (status) status.textContent = this.status;
    }
  }
}

function heading(title: string, note: string): HTMLElement {
  const head = document.createElement("h2");
  head.textContent = title;
  const span = document.createElement("span");
  span.textContent = note;
  head.append(span);
  return head;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}
