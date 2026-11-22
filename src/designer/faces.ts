// SAFETY: dev page only; it reads the same hand-authored file the renderer reads, to say which
// moods a voice actually wrote and which are being borrowed.
import file from "../voices.json";
import { FACE_BOX, MOODS, VOICES, renderFaceSvg, type FaceFile, type Mood, type Voice } from "../faces";

const DATA = file as unknown as FaceFile;

/**
 * Dev only: every face at every mood, for tuning the shapes in `src/voices.json` by looking.
 *
 * The same face is shown three ways, because that is the decision that can't be made in words:
 * grade 1 outlines everything (`^_^` grade), grade 2 gives it mass, grade 3 adds the crookedness
 * and the mood marks. A face also appears at the size it really lives at, 26px in a radio line,
 * since a shape that only works big is a shape that doesn't work.
 *
 * Nothing here saves. Tune `src/voices.json`, look again; the game picks it up on reload.
 */

const NAMES: Record<Voice, string> = { gus: "Gus", pip: "Pip", generic: "Generic", station: "Station" };

/** What each voice says, for the line test: the length and the name are what the face sits beside. */
const LINES: Record<Voice, string> = {
  gus: "You again, kid.",
  pip: "Full hold!! Heading in!",
  generic: "On approach, requesting dock.",
  station: "Welcome back.",
};

/** The size the face is drawn at in the radio log, which is the size that matters. */
const LINE_SIZE = 26;

const STYLE = `
  #faces { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
           background: #05070d; color: #cfd8e6; font: 12px/1.45 ui-monospace, Consolas, monospace; }
  #faces[hidden] { display: none; }
  #faces header { flex: none; display: flex; gap: 18px; align-items: baseline; padding: 12px 16px;
                  border-bottom: 1px solid #1e2a3d; background: #0b0f18; }
  #faces h1 { margin: 0; font-size: 13px; letter-spacing: 3px; color: #8fb4ff; text-transform: uppercase; font-weight: normal; }
  #faces header p { margin: 0; color: #7f8ba0; flex: 1; }
  #faces header label { color: #aab6c8; white-space: nowrap; }
  #faces input[type="range"] { width: 110px; vertical-align: middle; accent-color: #8fb4ff; }
  #faces header button { background: #1a2233; color: #cfd8e6; border: 1px solid #33405a; padding: 4px 9px;
                         font: inherit; cursor: pointer; }
  #faces header button:hover { background: #26324a; }
  #faces .body { flex: 1; overflow-y: auto; padding: 12px 16px 32px; }
  #faces .lines { padding: 10px 12px; margin-bottom: 16px; background: #0b0f18; border: 1px solid #1e2a3d; }
  #faces .linerow { display: flex; flex-wrap: wrap; gap: 6px 22px; }
  #faces .linerow + .linerow { margin-top: 6px; }
  #faces .linerow div { display: flex; align-items: center; gap: 6px; }
  #faces .lines b { color: #a8d8ff; font-weight: normal; }
  #faces h2 { margin: 20px 0 8px; font-size: 12px; letter-spacing: 2px; color: #8fe3a1;
              text-transform: uppercase; font-weight: normal; }
  #faces h2 span { color: #7f8ba0; letter-spacing: 0; text-transform: none; margin-left: 8px; }
  #faces .row { display: flex; flex-wrap: wrap; gap: 10px; }
  #faces .cell { background: #0b0f18; border: 1px solid #1e2a3d; padding: 8px; box-sizing: border-box; }
  #faces .cell .tag { color: #9fb0c6; font-size: 11px; letter-spacing: 1px; margin-bottom: 5px; white-space: nowrap; }
  #faces .cell .tag em { color: #5a6a80; font-style: normal; }
  #faces .cell svg { display: block; }
  #faces .big { line-height: 0; }
  #faces .grades { display: flex; gap: 10px; margin-top: 7px; align-items: flex-start; }
  #faces .grades figure { margin: 0; line-height: 0; }
  #faces .grades figcaption { font-size: 10px; color: #5a6a80; margin-top: 3px; letter-spacing: 1px; }
`;

export class FaceGallery {
  private readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private size = 110;
  private compare = true;

  constructor(private readonly onClose: () => void) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);

    this.element = document.createElement("div");
    this.element.id = "faces";
    this.element.hidden = true;

    const header = document.createElement("header");
    const title = document.createElement("h1");
    title.textContent = "Faces";
    const hint = document.createElement("p");
    hint.textContent = "shapes live in src/voices.json — this page is for looking";
    const sizeLabel = document.createElement("label");
    sizeLabel.textContent = "size ";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "60";
    slider.max = "220";
    slider.step = "10";
    slider.value = String(this.size);
    slider.addEventListener("input", () => {
      this.size = Number(slider.value);
      this.rebuild();
    });
    sizeLabel.append(slider);
    const compareLabel = document.createElement("label");
    const compare = document.createElement("input");
    compare.type = "checkbox";
    compare.checked = this.compare;
    compare.addEventListener("change", () => {
      this.compare = compare.checked;
      this.rebuild();
    });
    compareLabel.append(compare, " grades 1 and 2");
    const close = document.createElement("button");
    close.textContent = "Close (Esc)";
    close.addEventListener("click", () => this.close());
    header.append(title, hint, sizeLabel, compareLabel, close);

    this.body = document.createElement("div");
    this.body.className = "body";
    this.element.append(header, this.body);
    document.body.append(this.element);

    window.addEventListener("keydown", (event) => {
      if (!this.isOpen || event.repeat) return;
      if (event.code === "Escape" || event.code === "KeyF") this.close();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    this.rebuild();
  }

  close(): void {
    this.element.hidden = true;
    this.onClose();
  }

  /** The line test: what each face looks like in the radio log, beside the name and the words. */
  private lines(): HTMLDivElement {
    const box = document.createElement("div");
    box.className = "lines";
    for (const voice of VOICES) {
      const row = document.createElement("div");
      row.className = "linerow";
      for (const mood of MOODS) {
        const line = document.createElement("div");
        const who = document.createElement("b");
        who.textContent = `${NAMES[voice]}: `;
        const text = document.createElement("span");
        text.textContent = LINES[voice];
        line.append(svg(renderFaceSvg(voice, mood, { size: LINE_SIZE })), who, text);
        row.append(line);
      }
      box.append(row);
    }
    return box;
  }

  private cell(voice: Voice, mood: Mood): HTMLDivElement {
    const cell = document.createElement("div");
    cell.className = "cell";
    // The cells line up whatever the slider says, so comparing two faces doesn't mean hunting.
    cell.style.width = `${Math.round((this.size * FACE_BOX.w) / FACE_BOX.h) + 20}px`;
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `${NAMES[voice]} — ${mood}`;
    if (!DATA[voice]?.face.moods[mood]) {
      const note = document.createElement("em");
      note.textContent = " (borrowed)";
      tag.append(note);
    }
    const big = document.createElement("div");
    big.className = "big";
    big.append(svg(renderFaceSvg(voice, mood, { grade: 3, size: this.size })));
    cell.append(tag, big);
    if (this.compare) {
      const grades = document.createElement("div");
      grades.className = "grades";
      for (const grade of [1, 2] as const) {
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = grade === 1 ? "1 line" : "2 filled";
        figure.append(svg(renderFaceSvg(voice, mood, { grade, size: 52 })), caption);
        grades.append(figure);
      }
      cell.append(grades);
    }
    return cell;
  }

  private rebuild(): void {
    this.body.replaceChildren(this.lines());
    for (const voice of VOICES) {
      const head = document.createElement("h2");
      head.textContent = NAMES[voice];
      if (voice !== "gus" && voice !== "pip") {
        const where = document.createElement("span");
        where.textContent = voice;
        head.append(where);
      }
      const row = document.createElement("div");
      row.className = "row";
      for (const mood of MOODS) row.append(this.cell(voice, mood));
      this.body.append(head, row);
    }
  }
}

/** The markup `renderFaceSvg` returns, as an element to put on the page. */
function svg(markup: string): Element {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  return document.importNode(parsed, true);
}
