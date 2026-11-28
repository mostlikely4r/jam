// SAFETY: dev page only; it reads the same hand-authored file the renderer reads, to say which
// moods a voice actually wrote and which are being borrowed.
import file from "../voices.json";
import {
  FACE_BOX,
  MOODS,
  VOICES,
  faceFor,
  renderFace,
  renderFaceSvg,
  swayFor,
  type Face,
  type FaceFile,
  type Mood,
  type Part,
  type Voice,
} from "../faces";
import { DEFAULT_NOD, accentAt, phaseAt, poseTransform, swayAt, type Nod, type NodKind } from "../sway";
import { ROLL_STYLE, RollShelf } from "./roll";

const DATA = file as unknown as FaceFile;

/**
 * Dev only: every face at every mood, for tuning the shapes in `src/voices.json` by looking.
 *
 * The same face is shown three ways, because that is the decision that can't be made in words:
 * grade 1 outlines everything (`^_^` grade), grade 2 gives it mass, grade 3 adds the crookedness
 * and the mood marks. A face also appears at the size it really lives at, 26px in a radio line,
 * since a shape that only works big is a shape that doesn't work.
 *
 * The hand-written faces don't save: tune `src/voices.json`, look again; the game picks it up on
 * reload. The Roll and the Shelf at the top (`./roll.ts`) roll faces from the pool and save the
 * kept ones to `src/cast.json`.
 */

const NAMES: Record<Voice, string> = { gus: "Gus", pip: "Pip", generic: "Generic", station: "Station" };

/** What each nod does, said in words, since the point of the preview is judging it. */
const NODS: Record<NodKind, string> = {
  still: "still",
  tilt: "tips",
  yaw: "turns left and right",
  pitch: "nods up and down",
};

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
  #faces .beat { display: inline-block; width: 9px; height: 9px; background: #1e2a3d; border: 1px solid #33405a;
                 align-self: center; }
  #faces .beat.on { background: #8fe3a1; border-color: #5fae66; }
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
  #faces .opt { margin-bottom: 14px; }
  #faces .optlabel { color: #8fb4ff; letter-spacing: 1px; margin-bottom: 6px; }
  #faces .optrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
  #faces .option { background: #0b0f18; border: 1px solid #1e2a3d; padding: 8px; }
  #faces .option .faces { display: flex; gap: 8px; }
  #faces .option figure { margin: 0; }
  #faces .option figure svg { display: block; }
  #faces .option figcaption { color: #5a6a80; font-size: 10px; letter-spacing: 1px; margin-top: 3px; }
  #faces .option .name { color: #cfe8ee; margin-top: 6px; letter-spacing: 1px; }
  #faces .option .name em { color: #5a6a80; font-style: normal; }
  #faces .grades { display: flex; gap: 10px; margin-top: 7px; align-items: flex-start; }
  #faces .grades figure { margin: 0; line-height: 0; }
  #faces .grades figcaption { font-size: 10px; color: #5a6a80; margin-top: 3px; letter-spacing: 1px; }
`;

export class FaceGallery {
  private readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private size = 110;
  private compare = true;
  /** The sway preview: faces posed with the nod of their voice, off until asked for. */
  private sway = false;
  private bpm = 100;
  private frame = 0;
  private started = 0;
  /** Each face's features group and the nod of the voice it belongs to. */
  private readonly posed = new Map<SVGElement, Nod>();
  private readonly beatSquare: HTMLSpanElement;
  private readonly shelf = new RollShelf(
    (markup, voice, nod) => svg(markup, voice, nod),
    () => this.size,
    () => this.collect(),
  );

  constructor(private readonly onClose: () => void) {
    const style = document.createElement("style");
    style.textContent = STYLE + ROLL_STYLE;
    document.head.append(style);

    this.element = document.createElement("div");
    this.element.id = "faces";
    this.element.hidden = true;

    const header = document.createElement("header");
    const title = document.createElement("h1");
    title.textContent = "Faces";
    const hint = document.createElement("p");
    hint.textContent = "hand-written shapes live in src/voices.json, the pool in src/face-pool.json";
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
    const swayLabel = document.createElement("label");
    const swayBox = document.createElement("input");
    swayBox.type = "checkbox";
    swayBox.addEventListener("change", () => this.setSway(swayBox.checked));
    swayLabel.append(swayBox, " sway");
    const bpmLabel = document.createElement("label");
    bpmLabel.textContent = "bpm ";
    const bpmInput = document.createElement("input");
    bpmInput.type = "range";
    bpmInput.min = "60";
    bpmInput.max = "160";
    bpmInput.step = "1";
    bpmInput.value = String(this.bpm);
    bpmInput.addEventListener("input", () => {
      this.bpm = Number(bpmInput.value);
    });
    bpmLabel.append(bpmInput);
    this.beatSquare = document.createElement("span");
    this.beatSquare.className = "beat";
    this.beatSquare.title = "the beat";
    const close = document.createElement("button");
    close.textContent = "Close (Esc)";
    close.addEventListener("click", () => this.close());
    header.append(title, hint, sizeLabel, compareLabel, swayLabel, bpmLabel, this.beatSquare, close);

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

  /** The open calls, side by side: the things that are easier to point at than to describe. */
  private options(): HTMLElement {
    const section = document.createElement("div");
    const head = document.createElement("h2");
    head.textContent = "Options";
    const note = document.createElement("span");
    note.textContent = "name a letter per row — nothing here is saved";
    head.append(note);

    const question = (title: string, boxes: HTMLDivElement[]): void => {
      const line = document.createElement("div");
      line.className = "opt";
      const label = document.createElement("div");
      label.className = "optlabel";
      label.textContent = title;
      const row = document.createElement("div");
      row.className = "optrow";
      row.append(...boxes);
      line.append(label, row);
      section.append(line);
    };

    const box = (name: string, note: string, ...faces: [Face, string][]): HTMLDivElement => {
      const element = document.createElement("div");
      element.className = "option";
      const shown = document.createElement("div");
      shown.className = "faces";
      for (const [face, caption] of faces) {
        const figure = document.createElement("figure");
        const cap = document.createElement("figcaption");
        cap.textContent = caption;
        figure.append(svg(renderFace(face, { size: 96, seed: `opt-${name}-${caption}` }), face.voice), cap);
        shown.append(figure);
      }
      const named = document.createElement("div");
      named.className = "name";
      named.textContent = name;
      const why = document.createElement("em");
      why.textContent = note ? ` ${note}` : "";
      named.append(why);
      element.append(shown, named);
      return element;
    };

    const gus = (mood: Mood, change: Partial<Face> = {}): Face => ({ ...faceFor("gus", mood), ...change });
    const plainBrows: Part[] = faceFor("gus", "neutral").brows;
    const refinedBrows: Part[] = [
      { kind: "arc", at: [34, 21], half: 6, bow: 1.5, rot: 5, w: 3.4 },
      { kind: "arc", at: [66, 20], half: 6.5, bow: 1.5, rot: -5, w: 3.4 },
    ];
    question("Gus — brows", [
      box("A fixed", "identity, never moves", [gus("neutral", { over: [...gus("neutral").over, ...plainBrows], brows: [] }), "neutral"], [gus("scared", { over: [...gus("scared").over, ...plainBrows], brows: [] }), "scared"]),
      box("B none", "the reference has none", [gus("neutral", { brows: [] }), "neutral"], [gus("scared", { brows: [] }), "scared"]),
      box("C mood", "thinner, tilted more", [gus("neutral", { brows: refinedBrows }), "neutral"], [gus("scared", { brows: refinedBrows }), "scared"]),
    ]);

    const scar = (parts: Part[]): Partial<Face> => ({ over: parts });
    const pale = "#FFE2B4";
    const slash: Part[] = [{ kind: "line", from: [24, 11], to: [31, 26], w: 2.2, color: pale }];
    const cross: Part[] = [
      { kind: "line", from: [24.5, 14], to: [31.5, 25], w: 2.2, color: pale },
      { kind: "line", from: [24.5, 25], to: [31.5, 14], w: 2.2, color: pale },
    ];
    const stitch: Part[] = [
      { kind: "line", from: [26.5, 10], to: [31, 28], w: 2.2, color: pale },
      { kind: "line", from: [25, 14], to: [30.5, 12.5], w: 1.8, color: pale },
      { kind: "line", from: [26.5, 19], to: [32, 17.5], w: 1.8, color: pale },
      { kind: "line", from: [28, 24], to: [33.5, 22.5], w: 1.8, color: pale },
    ];
    const hash: Part[] = [
      { kind: "line", from: [26, 12], to: [31, 25], w: 2, color: pale },
      { kind: "line", from: [30, 11], to: [35, 24], w: 2, color: pale },
      { kind: "line", from: [24.5, 16], to: [36, 14], w: 2, color: pale },
      { kind: "line", from: [25.5, 22], to: [37, 20], w: 2, color: pale },
    ];
    question("Gus — scar", [
      box("A none", "the brow carries him", [gus("neutral", { over: [] }), "neutral"]),
      box("B slash", "one cut through the brow", [gus("neutral", scar(slash)), "neutral"]),
      box("C cross", "two cuts", [gus("neutral", scar(cross)), "neutral"]),
      box("D stitch", "a line with three ticks", [gus("neutral", scar(stitch)), "neutral"]),
      box("E hash", "the one you asked for", [gus("neutral", scar(hash)), "neutral"]),
    ]);

    question("Pip — lean", [
      box("A 0°", "dead straight", [{ ...faceFor("pip", "scared"), tilt: 0 }, "scared"]),
      box("B 3°", "this one", [{ ...faceFor("pip", "scared"), tilt: 3 }, "scared"]),
      box("C 6°", "the last one, too much", [{ ...faceFor("pip", "scared"), tilt: 6 }, "scared"]),
    ]);

    const generic = faceFor("generic", "neutral");
    question("Plain traffic — how much", [
      box(
        "A bare",
        "no glint, a line mouth",
        [
          {
            ...generic,
            eyes: [
              { kind: "square", at: [35, 26], half: 6, depth: 6, round: 2.5 },
              { kind: "square", at: [65, 26], half: 6, depth: 6, round: 2.5 },
            ],
            mouth: [{ kind: "arc", at: [50, 49], half: 6.5, bow: 2.5, w: 4 }],
          },
          "neutral",
        ],
      ),
      box("B glint", "glint and lip shine, no marks", [generic, "neutral"]),
      box(
        "C glint + smile",
        "the mouth gets mass",
        [{ ...generic, mouth: [{ kind: "disc", at: [50, 46], half: 9, depth: 7 }, { kind: "disc", at: [46.5, 47], half: 1.8, depth: 1.6, cut: true }] }, "neutral"],
      ),
    ]);

    const station = faceFor("station", "neutral");
    question("Station — its own display", [
      box(
        "A recoloured generic",
        "what it was",
        [{ ...station, screen: { ...station.screen, radius: 3 }, under: [], eyes: station.eyes.slice(0, 2), mouth: [{ kind: "arc", at: [50, 49], half: 7.5, bow: 3, w: 4.2 }] }, "neutral"],
      ),
      box("B own display", "bezel, wide flat mouth", [station, "neutral"]),
    ]);

    section.prepend(head);
    return section;
  }

  open(): void {
    this.element.hidden = false;
    this.rebuild();
  }

  close(): void {
    this.element.hidden = true;
    cancelAnimationFrame(this.frame);
    this.rest();
    this.onClose();
  }

  /** Turns the preview on or off: on poses the faces on this page, off leaves them as they were. */
  private setSway(on: boolean): void {
    this.sway = on;
    cancelAnimationFrame(this.frame);
    if (!on) {
      this.rest();
      return;
    }
    this.started = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** One frame of the preview: every face at its own voice's nod, and the beat square between. */
  private readonly tick = (): void => {
    if (!this.sway || !this.isOpen) return;
    const seconds = (performance.now() - this.started) / 1000;
    for (const [features, nod] of this.posed) {
      const transform = poseTransform(swayAt(nod, this.bpm, seconds), 1);
      if (transform === (features.dataset.pose ?? "")) continue;
      features.dataset.pose = transform;
      if (transform) features.setAttribute("transform", transform);
      else features.removeAttribute("transform");
    }
    this.beatSquare.classList.toggle("on", accentAt(phaseAt(DEFAULT_NOD, this.bpm, seconds)) > 0.5);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Puts every face back where it started, so the page reads as it did before the preview. */
  private rest(): void {
    for (const features of this.posed.keys()) {
      features.dataset.pose = "";
      features.removeAttribute("transform");
    }
    this.beatSquare.classList.remove("on");
  }

  /** Every face on the page, with the nod of its voice; the options boxes stay still. */
  private collect(): void {
    this.posed.clear();
    for (const element of this.body.querySelectorAll<SVGSVGElement>("svg[data-voice]")) {
      if (element.closest(".option")) continue;
      const features = element.querySelector<SVGElement>(".features");
      if (!features) continue;
      // SAFETY: data-nod is only ever written by this page, from a nod it holds.
      const nod = element.dataset.nod ? (JSON.parse(element.dataset.nod) as Nod) : swayFor(element.dataset.voice as Voice);
      this.posed.set(features, nod);
    }
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
        line.append(svg(renderFaceSvg(voice, mood, { size: LINE_SIZE }), voice), who, text);
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
    big.append(svg(renderFaceSvg(voice, mood, { grade: 3, size: this.size }), voice));
    cell.append(tag, big);
    if (this.compare) {
      const grades = document.createElement("div");
      grades.className = "grades";
      for (const grade of [1, 2] as const) {
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = grade === 1 ? "1 line" : "2 filled";
        figure.append(svg(renderFaceSvg(voice, mood, { grade, size: 52 }), voice), caption);
        grades.append(figure);
      }
      cell.append(grades);
    }
    return cell;
  }

  private rebuild(): void {
    this.body.replaceChildren(this.shelf.render(), this.options(), this.lines());
    for (const voice of VOICES) {
      const head = document.createElement("h2");
      head.textContent = NAMES[voice];
      const where = document.createElement("span");
      where.textContent = `${NODS[swayFor(voice).kind]} · ${voice}`;
      head.append(where);
      const row = document.createElement("div");
      row.className = "row";
      for (const mood of MOODS) row.append(this.cell(voice, mood));
      this.body.append(head, row);
    }
    this.collect();
    if (this.sway && this.isOpen) this.setSway(true);
  }
}

/**
 * The markup `renderFaceSvg` returns, as an element to put on the page, tagged with the voice it
 * belongs to so the sway preview knows which nod to give it, or with the nod itself for a face no
 * file holds yet.
 */
function svg(markup: string, voice: Voice, nod?: Nod): Element {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  const element = document.importNode(parsed, true);
  element.setAttribute("data-voice", voice);
  if (nod) element.setAttribute("data-nod", JSON.stringify(nod));
  return element;
}
