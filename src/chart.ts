import { orbitEllipse } from "./kepler";
import { progressOf } from "./factories";
import { partOf, type PartId } from "./parts";
import { bodyAt, DEPOSIT_REACH, orbitsAt, type Base, type OrbitRing, type Sim, type Target } from "./sim";

/**
 * The system chart, the starmap part's view of the whole world at once. A top-down map of
 * bodies on their orbits and every place, live: it redraws each frame while it's open, and
 * the world keeps running behind it. Wheel zooms, drag pans, a click picks, and a right click
 * opens a short menu: a course, or one of the player's two indicators.
 */

export interface ChartPick extends Target {
  /** What it is, in the words the game uses. */
  kind: string;
  /** What it's called on the chart. */
  label: string;
  /** Whether a course can end here: a place, not a body. */
  place: boolean;
  /** Rough world size, for the pick ring. */
  radius: number;
}

/** A line of the right-click menu, and what it sets going. */
interface MenuRow {
  text: string;
  run: () => void;
}

export class Chart {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** World point at the centre of the view, and how many pixels a world unit is. */
  private view = { cx: 0, cy: 0, scale: 0.001 };
  /** The scale that fit the whole system when it opened, for the zoom limits. */
  private fitScale = 0.001;
  isOpen = false;
  private pick: ChartPick | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** The right-click menu, when one is open. */
  private menu: HTMLDivElement | null = null;

  /** With `dev` (`?dev`): a card by each station with factories, saying what they make and what it holds. */
  constructor(
    private readonly sim: Sim,
    private readonly dev = false,
  ) {}

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (!this.canvas) this.build();
    this.isOpen = true;
    this.canvas!.style.display = "block";
    this.fit();
  }

  close(): void {
    this.isOpen = false;
    this.closeMenu();
    if (this.canvas) this.canvas.style.display = "none";
  }

  get selection(): ChartPick | null {
    return this.pick;
  }

  /** Fits the view to what the chart knows of the world: found bodies, visited places, the ship. */
  private fit(): void {
    const { sim } = this;
    const far = (x: number, y: number, pad = 0): number => Math.hypot(x, y) + pad;
    let extent = far(sim.ship.x, sim.ship.y);
    for (const body of sim.bodies) {
      if (!sim.chartSeenBody(body)) continue;
      const at = bodyAt(body, sim.now);
      extent = Math.max(extent, far(at.x, at.y, body.radius));
    }
    for (const poi of sim.allPois()) {
      if (!sim.chartSeenPoi(poi)) continue;
      extent = Math.max(extent, far(poi.x, poi.y, poi.reach));
    }
    for (const anchor of sim.anchors) {
      if (!sim.chartSeenAnchor(anchor)) continue;
      const at = orbitsAt(anchor.orbits, sim.now);
      extent = Math.max(extent, far(at.x, at.y, anchor.radius));
    }
    const { width, height } = this.canvas!.getBoundingClientRect();
    this.fitScale = (Math.min(width, height) / 2 / extent) * 0.92;
    this.view = { cx: 0, cy: 0, scale: this.fitScale };
  }

  private build(): void {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:40;display:none;background:#07080c";
    document.body.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoom = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      this.zoomAt(event.clientX, event.clientY, zoom);
    });
    canvas.addEventListener("pointerdown", (event) => {
      // A click anywhere on the chart shuts a menu that's open.
      this.closeMenu();
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, moved: false };
    });
    canvas.addEventListener("pointermove", (event) => {
      const { drag } = this;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      this.view.cx -= dx / this.view.scale;
      this.view.cy -= dy / this.view.scale;
      drag.x = event.clientX;
      drag.y = event.clientY;
    });
    canvas.addEventListener("pointerup", (event) => {
      if (this.drag && !this.drag.moved) this.pickAt(event.clientX, event.clientY);
      this.drag = null;
    });
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openMenu(event.clientX, event.clientY);
    });
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
  }

  /** Zooms about a point on the screen, so what's under the cursor stays under it. */
  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const { innerWidth: width, innerHeight: height } = window;
    const fromX = this.view.cx + (clientX - width / 2) / this.view.scale;
    const fromY = this.view.cy + (clientY - height / 2) / this.view.scale;
    const scale = Math.min(Math.max(this.view.scale * factor, this.fitScale / 8), 2);
    this.view = {
      cx: fromX - (clientX - width / 2) / scale,
      cy: fromY - (clientY - height / 2) / scale,
      scale,
    };
  }

  /** Every pickable thing: the places, the deposits, and the bodies themselves.
   * The chart shows what the player has been to, so an unvisited place is not here at all. */
  private targets(sim: Sim): ChartPick[] {
    const picks: ChartPick[] = [];
    for (const poi of sim.allPois()) {
      if (!sim.chartSeenPoi(poi)) continue;
      picks.push({ poi, kind: sim.kindOf({ poi }), label: sim.placeName(poi), place: true, radius: poi.reach });
    }
    if (sim.discovered.has("deposit")) {
      for (const deposit of sim.deposits) {
        picks.push({ deposit, kind: sim.kindOf({ deposit }), label: "Deposit", place: true, radius: DEPOSIT_REACH });
      }
    }
    for (const body of sim.bodies) {
      if (!sim.chartSeenBody(body)) continue;
      picks.push({ body, kind: sim.kindOf({ body }), label: body.name, place: false, radius: body.radius });
    }
    return picks;
  }

  /** Whether what a ring's centre belongs to has been found: a body, an anchor or a place there. */
  private ringFound(sim: Sim, center: { x: number; y: number }): boolean {
    for (const body of sim.bodies) {
      const at = bodyAt(body, sim.now);
      if (Math.hypot(at.x - center.x, at.y - center.y) < 1) return sim.chartSeenBody(body);
    }
    for (const poi of sim.allPois()) {
      if (Math.hypot(poi.x - center.x, poi.y - center.y) < 1) return sim.chartSeenPoi(poi);
    }
    for (const anchor of sim.anchors) {
      const at = orbitsAt(anchor.orbits, sim.now);
      if (Math.hypot(at.x - center.x, at.y - center.y) < 1) return sim.chartSeenAnchor(anchor);
    }
    // Empty space: nothing there to have found, so no full ring.
    return false;
  }

  private positionOf(pick: ChartPick): { x: number; y: number } {
    if (pick.poi) return { x: pick.poi.x, y: pick.poi.y };
    if (pick.deposit) return { x: pick.deposit.x, y: pick.deposit.y };
    return bodyAt(pick.body!, this.sim.now);
  }

  /** What's nearest the click, in screen pixels, or nothing at all. */
  private pickNear(clientX: number, clientY: number): ChartPick | null {
    const { cx, cy, scale } = this.view;
    const { innerWidth: width, innerHeight: height } = window;
    const at = (x: number, y: number): { x: number; y: number } => ({
      x: (x - cx) * scale + width / 2,
      y: (y - cy) * scale + height / 2,
    });
    let best: ChartPick | null = null;
    let bestPixels = 24;
    for (const pick of this.targets(this.sim)) {
      const { x, y } = this.positionOf(pick);
      const spot = at(x, y);
      const pixels = Math.hypot(clientX - spot.x, clientY - spot.y);
      if (pixels < bestPixels) {
        best = pick;
        bestPixels = pixels;
      }
    }
    return best;
  }

  /** Picks whatever's nearest the click. Nothing: let go of the pick. */
  private pickAt(clientX: number, clientY: number): void {
    this.pick = this.pickNear(clientX, clientY);
  }

  /** The world point under the cursor. */
  private worldAt(clientX: number, clientY: number): { x: number; y: number } {
    const { cx, cy, scale } = this.view;
    return { x: cx + (clientX - window.innerWidth / 2) / scale, y: cy + (clientY - window.innerHeight / 2) / scale };
  }

  /**
   * The right click: a short menu for what it landed on, or, with nothing there to pick, the
   * destination set to that spot in space. Left click keeps picking, so looking around the
   * system costs nothing.
   */
  private openMenu(clientX: number, clientY: number): void {
    this.closeMenu();
    const pick = this.pickNear(clientX, clientY);
    const at = this.worldAt(clientX, clientY);
    if (!pick) {
      this.sim.toggleDestination({ point: at });
      return;
    }
    const menu = document.createElement("div");
    menu.id = "chartmenu";
    for (const row of this.menuRows(pick, at)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.text;
      button.addEventListener("click", () => {
        this.closeMenu();
        row.run();
      });
      menu.append(button);
    }
    document.body.append(menu);
    // Keeps the whole menu on the screen, wherever the click was.
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - box.height - 8))}px`;
    this.menu = menu;
  }

  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  /** What a right click can do here: fly the spot, or point one of the player's indicators at what was picked. */
  private menuRows(pick: ChartPick, at: { x: number; y: number }): MenuRow[] {
    const { sim } = this;
    const target = this.targetOf(pick);
    const base = pick.poi ? sim.baseOf(pick.poi) : null;
    const rows: MenuRow[] = [];
    // Click to move: a straight line to the spot, with no avoiding anything on the way.
    if (sim.ship.parts.has("clickMove")) rows.push({ text: "Move here", run: () => sim.orderMoveStraight(at.x, at.y) });
    rows.push({
      text: sim.holdsDestination(target) ? "Clear destination" : "Set destination",
      run: () => sim.toggleDestination(target),
    });
    if (base) {
      rows.push({
        text: sim.ship.home === base.id ? "Clear home" : "Set home",
        run: () => sim.toggleHome(base.id),
      });
    }
    return rows;
  }

  /** The pick as the thing an indicator holds: one handle, and nothing else. */
  private targetOf(pick: ChartPick): Target {
    if (pick.poi) return { poi: pick.poi };
    if (pick.deposit) return { deposit: pick.deposit };
    return { body: pick.body };
  }

  draw(sim: Sim): void {
    if (!this.isOpen || !this.canvas || !this.ctx) return;
    const { ctx, view } = this;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(window.innerWidth * dpr)) this.resize();
    const { width, height } = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, width, height);
    const to = (x: number, y: number): { x: number; y: number } => ({
      x: (x - view.cx) * view.scale * dpr + width / 2,
      y: (y - view.cy) * view.scale * dpr + height / 2,
    });
    const labels: { x: number; y: number; text: string }[] = [];
    const label = (x: number, y: number, text: string): void => {
      // Keeps labels off each other by skipping one that lands on one just placed.
      const spot = to(x, y);
      if (labels.some((other) => Math.hypot(other.x - spot.x, other.y - spot.y) < 18)) return;
      labels.push({ x: spot.x, y: spot.y, text });
    };

    // The orbits of what has been found: a full ring round the body it orbits once that
    // body is found too, otherwise only a short arc round the orbiting thing, which way it moves.
    ctx.lineWidth = 1;
    // A partial orbit is 20 degrees of the full one, centred on the orbiting thing.
    const ARC = (10 * Math.PI) / 180;
    // `radius` is the semi-major axis. With an eccentricity the ring is an ellipse with the
    // parent at a focus. A partial ring is the same 20 degrees of the ellipse's own circle,
    // centred on the thing at `angle` from the parent.
    const ring = (worldCenter: { x: number; y: number }, radius: number, angle: number, found: boolean, eccentricity = 0, periapsis = 0): void => {
      // Nothing to see on a ring that's under a couple of screen pixels, or no ring at all.
      if (radius <= 0 || radius * view.scale < 2) return;
      const shape = orbitEllipse({ radius, eccentricity, periapsis });
      const { x, y } = to(worldCenter.x + shape.cx, worldCenter.y + shape.cy);
      const scale = view.scale * dpr;
      ctx.beginPath();
      if (found) ctx.ellipse(x, y, shape.a * scale, shape.b * scale, shape.rotation, 0, Math.PI * 2);
      else {
        // Where the thing is on the ellipse's own circle (its eccentric anomaly), from its direction from the parent.
        const along = angle - periapsis;
        const middle = Math.atan2(Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(along), Math.cos(along) + eccentricity);
        ctx.ellipse(x, y, shape.a * scale, shape.b * scale, shape.rotation, middle - ARC, middle + ARC);
      }
      ctx.stroke();
    };
    // True rings: round where each thing goes round, whatever the frame's centre is.
    const drawRings = (rings: OrbitRing[] | undefined, at: { x: number; y: number }): void => {
      for (const { center: chain, radius, eccentricity, periapsis } of rings ?? []) {
        const center = orbitsAt(chain, sim.now);
        ring(center, radius, Math.atan2(at.y - center.y, at.x - center.x), this.ringFound(sim, center), eccentricity, periapsis);
      }
    };
    for (const body of sim.bodies) {
      // Only found bodies show an orbit at all.
      if (!sim.chartSeenBody(body)) continue;
      ctx.strokeStyle = "rgba(120, 140, 180, 0.16)";
      if (body.rings) {
        drawRings(body.rings, bodyAt(body, sim.now));
        continue;
      }
      for (let i = 0; i < body.orbits.length; i++) {
        const center = bodyAt({ ...body, orbits: body.orbits.slice(0, i) }, sim.now);
        const at = bodyAt(body, sim.now);
        const angle = Math.atan2(at.y - center.y, at.x - center.x);
        ring(center, body.orbits[i].radius, angle, this.ringFound(sim, center), body.orbits[i].eccentricity, body.orbits[i].periapsis);
      }
    }
    // Anchors orbit like bodies do.
    for (const anchor of sim.anchors) {
      if (!sim.chartSeenAnchor(anchor)) continue;
      const at = orbitsAt(anchor.orbits, sim.now);
      ctx.strokeStyle = "rgba(127, 139, 160, 0.16)";
      // Round what it orbits, wherever the frame's centre is.
      drawRings(anchor.rings, at);
    }
    // Places' own orbits round whatever carries them.
    for (const poi of sim.allPois()) {
      if (!sim.chartSeenPoi(poi)) continue;
      ctx.strokeStyle = "rgba(160, 140, 120, 0.14)";
      // Every place's one true orbit, as the designer draws it.
      if (poi.orbits) drawRings(poi.rings, poi);
    }

    // The bodies. Unfound ones stay dark: only their orbit arcs hint at them.
    for (const body of sim.bodies) {
      if (!sim.chartSeenBody(body)) continue;
      const at = bodyAt(body, sim.now);
      const { x, y } = to(at.x, at.y);
      const pixels = Math.max(2.5, body.radius * view.scale * dpr);
      ctx.fillStyle =
        body.kind === "star" ? "#e8c860" : body.kind === "planet" ? "#6a90c8" : "#8a8f98";
      ctx.beginPath();
      ctx.arc(x, y, pixels, 0, Math.PI * 2);
      ctx.fill();
      if (body.kind === "star") {
        ctx.strokeStyle = "rgba(232, 200, 96, 0.4)";
        ctx.beginPath();
        ctx.arc(x, y, pixels * 1.8, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (pixels > 6 || view.scale > this.fitScale) label(at.x, at.y, body.name);
    }

    // The anchors: a small diamond and the name, with their size as a faint ring.
    for (const anchor of sim.anchors) {
      if (!sim.chartSeenAnchor(anchor)) continue;
      const at = orbitsAt(anchor.orbits, sim.now);
      const { x, y } = to(at.x, at.y);
      ctx.strokeStyle = "rgba(127, 139, 160, 0.7)";
      ctx.beginPath();
      if (anchor.radius * view.scale * dpr > 4) ctx.arc(x, y, anchor.radius * view.scale * dpr, 0, Math.PI * 2);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.stroke();
      label(at.x, at.y, anchor.name);
    }

    // The places. Fields show their reach, so a look tells you where the rocks are.
    for (const poi of sim.allPois()) {
      if (!sim.chartSeenPoi(poi)) continue;
      const { x, y } = to(poi.x, poi.y);
      if (poi.name === "field") {
        ctx.strokeStyle = "rgba(150, 200, 150, 0.3)";
        ctx.beginPath();
        ctx.arc(x, y, poi.reach * view.scale * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#9ec89e";
      } else if (poi.name === "station") {
        ctx.fillStyle = "#c8d0e0";
      } else {
        ctx.fillStyle = "#d06a5a";
      }
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, Math.min(8, poi.reach * view.scale * dpr)), 0, Math.PI * 2);
      ctx.fill();
      label(poi.x, poi.y, sim.placeName(poi));
    }
    if (sim.discovered.has("deposit")) for (const deposit of sim.deposits) {
      const { x, y } = to(deposit.x, deposit.y);
      ctx.fillStyle = "#d8a860";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      label(deposit.x, deposit.y, "Deposit");
    }

    // Traffic, for whoever asked to see it.
    if (sim.tuning.showTraffic) {
      ctx.fillStyle = "rgba(168, 173, 184, 0.7)";
      for (const pilot of [...sim.traffic, ...sim.fighters]) {
        const { x, y } = to(pilot.ship.x, pilot.ship.y);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The course already being flown, if there is one.
    const course = sim.clickPilot.target();
    if (course) {
      const from = to(sim.ship.x, sim.ship.y);
      const at = to(course.x, course.y);
      ctx.strokeStyle = "rgba(120, 200, 255, 0.5)";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(at.x, at.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(at.x, at.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The pick: a ring round it, and a course line from the ship.
    if (this.pick) {
      const at = this.positionOf(this.pick);
      const { x, y } = to(at.x, at.y);
      ctx.strokeStyle = "#7ad0ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(12, this.pick.radius * view.scale * dpr), 0, Math.PI * 2);
      ctx.stroke();
      const ship = to(sim.ship.x, sim.ship.y);
      ctx.strokeStyle = "rgba(122, 208, 255, 0.4)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The player's ship: a little arrow, so it's never lost.
    {
      const { x, y } = to(sim.ship.x, sim.ship.y);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sim.ship.angle);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 5);
      ctx.lineTo(-6, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // The labels, over everything.
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(220, 224, 232, 0.85)";
    ctx.textAlign = "center";
    for (const { x, y, text } of labels) ctx.fillText(text, x, y - 10);

    if (this.dev) for (const base of sim.bases) this.drawDevCard(base, to(base.body.x, base.body.y), dpr);
    this.drawPanel(sim, dpr);
  }

  /** A dev card beside a station on screen: its factories, each with a ring for its job, and its storage as bars. */
  private drawDevCard(base: Base, at: { x: number; y: number }, dpr: number): void {
    const { ctx } = this;
    const card = devCard(this.sim, base);
    if (!ctx || !card) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    const row = 14;
    const width = 230;
    const height = 20 + card.factories.length * row + card.storage.length * row + 6;
    const x = at.x / dpr + 14;
    const y = at.y / dpr - height / 2;
    ctx.fillStyle = "rgba(14, 18, 28, 0.88)";
    ctx.strokeStyle = "rgba(120, 140, 180, 0.5)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    let line = y + 14;
    ctx.fillStyle = "#7ad0ff";
    ctx.fillText(card.title, x + 6, line);
    for (const factory of card.factories) {
      line += row;
      ctx.fillStyle = factory.state === "working" ? "#9ee8a0" : factory.state === "waiting" ? "#f0c060" : "rgba(220, 224, 232, 0.7)";
      ctx.fillText(factory.text, x + 20, line);
      // The job's ring: how far along it is.
      const cx = x + 11;
      const cy = line - 4;
      ctx.strokeStyle = "rgba(220, 224, 232, 0.25)";
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      if (factory.progress !== null) {
        ctx.strokeStyle = "#9ee8a0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, -Math.PI / 2, -Math.PI / 2 + factory.progress * Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    for (const item of card.storage) {
      line += row;
      ctx.fillStyle = "rgba(220, 224, 232, 0.75)";
      ctx.fillText(`${item.label} ${item.held}/${item.target}`, x + 6, line);
      const bx = x + 130;
      const bw = width - 138;
      ctx.fillStyle = "rgba(120, 140, 180, 0.25)";
      ctx.fillRect(bx, line - 8, bw, 6);
      ctx.fillStyle = item.held >= item.target ? "#9ee8a0" : "#f0c060";
      ctx.fillRect(bx, line - 8, bw * Math.min(1, item.target > 0 ? item.held / item.target : 1), 6);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The picked thing, in words: what it is, how far, and whether a course can end there. */
  private drawPanel(sim: Sim, dpr: number): void {
    const { ctx } = this;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "left";
    const line = (text: string, x: number, y: number, color = "rgba(220, 224, 232, 0.85)"): void => {
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    const { innerHeight: height } = window;
    const left = 14;
    line("System chart - wheel: zoom, drag: pan, click: pick, right click: menu, C or Esc: close", left, height - 14, "rgba(150, 158, 170, 0.9)");
    const pick = this.pick;
    if (!pick) return;
    const at = this.positionOf(pick);
    const distance = Math.hypot(at.x - sim.ship.x, at.y - sim.ship.y);
    const rows: [string, string][] = [
      [pick.label, "#7ad0ff"],
      [`${pick.kind} - ${fmt(distance)} away`, "rgba(220, 224, 232, 0.85)"],
    ];
    if (pick.place) {
      rows.push(
        sim.ship.parts.has("autopilot")
          ? ["Enter: fly there", "#9ee8a0"]
          : ["No autopilot fitted", "rgba(220, 224, 232, 0.5)"],
      );
    } else {
      rows.push(["Nothing docks with a body", "rgba(220, 224, 232, 0.5)"]);
    }
    let y = height - 44;
    for (const [text, color] of rows.reverse()) {
      line(text, left, y, color);
      y -= 18;
    }
  }
}

/** A distance in the world's own units, shortened the way the map reads. */
function fmt(units: number): string {
  if (units >= 1e6) return `${(units / 1e6).toFixed(2)}M`;
  if (units >= 1e3) return `${(units / 1e3).toFixed(1)}k`;
  return `${Math.round(units)}`;
}

/** What a station's dev card says: its factories and its storage. */
export interface DevCard {
  title: string;
  factories: { text: string; state: "idle" | "working" | "waiting"; progress: number | null }[];
  storage: { label: string; held: number; target: number }[];
}

/**
 * A station's dev card (`?dev`, on the chart), or null for one with no factory: each factory
 * with its kind, speed and mode and what it's doing (making what, waiting on what, or idle), and
 * the station's storage, one bar per item against its target.
 */
export function devCard(sim: Sim, base: Base): DevCard | null {
  if (base.factories.length === 0) return null;
  const factories: DevCard["factories"] = [];
  const targets = new Map<PartId, number>();
  const label = (id: string) => partOf(id as PartId)?.label ?? id;
  for (const factory of base.factories) {
    const data = sim.factoryData(base, factory);
    if (!data) continue;
    for (const [id, n] of Object.entries(data.targets ?? {})) targets.set(id as PartId, n);
    const name = `${data.kind === "ore" ? "Ore factory" : "Workshop"} ×${data.speed}${data.mode === "stock" ? ", to stock" : ""}`;
    const { state } = factory;
    const more = factory.queue.length > 0 ? `, ${factory.queue.length} more` : "";
    const doing = state.is === "working" ? `making ${label(state.makes)}${more}` : state.is === "waiting" ? `waiting on ${state.on.join(" and ")}` : "idle";
    const ready = factory.ready.length > 0 ? `, ${factory.ready.length} hull ready` : "";
    factories.push({ text: `${name}: ${doing}${ready}`, state: state.is, progress: factory.job ? progressOf(factory.job) : null });
  }
  const storage: DevCard["storage"] = [];
  for (const id of new Set<PartId>([...base.stock.keys(), ...targets.keys()])) {
    const target = targets.get(id) ?? (id === "partA" ? sim.tuning.stationPartsTarget : sim.tuning.itemTarget);
    storage.push({ label: label(id), held: sim.stockOf(base, id), target });
  }
  return { title: sim.baseName(base.id), factories, storage };
}
