/**
 * The glyphs part icons are built from: small vector drawings in the same style as the ship
 * art (`src/shipArt.ts`), each in a 24×24 box, each drawn with a primary and a secondary
 * colour. Many parts can share a glyph and tell themselves apart by colour and mark, so
 * glyphs are added by hand, in code, only when a part needs one: each has to read clearly
 * at about 24 px.
 */

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const shape = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, String(value));
  return shape;
}

/** One glyph's drawing: shapes added into a 24×24 box, in the two colours. */
export type GlyphDraw = (svg: SVGSVGElement, primary: string, secondary: string) => void;

/** A dark tone shared with the ship art, for engine bells and the like. */
const DARK = "rgba(10,14,22,0.8)";

export const GLYPHS: readonly { id: string; draw: GlyphDraw }[] = [
  // Engines and thrusters.
  {
    id: "engineLarge",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "3,9.5 11,9.5 19,6 19,18 11,14.5 3,14.5", fill: p, stroke: s, "stroke-width": 1.4, "stroke-linejoin": "round" }));
      svg.append(el("ellipse", { cx: 17.6, cy: 12, rx: 1.6, ry: 5.2, fill: DARK }));
      svg.append(el("polygon", { points: "21,9.6 23.4,12 21,14.4", fill: s }));
    },
  },
  {
    id: "engineSmall",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "6,10 13,10 18,7.5 18,16.5 13,14 6,14", fill: p, stroke: s, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      svg.append(el("ellipse", { cx: 17, cy: 12, rx: 1.2, ry: 4, fill: DARK }));
      svg.append(el("polygon", { points: "19.8,10.4 22.2,12 19.8,13.6", fill: s }));
    },
  },
  {
    id: "reverse",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "18,10 11,10 6,7.5 6,16.5 11,14 18,14", fill: p, stroke: s, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      svg.append(el("ellipse", { cx: 7, cy: 12, rx: 1.2, ry: 4, fill: DARK }));
      svg.append(el("polygon", { points: "4.2,10.4 1.8,12 4.2,13.6", fill: s }));
    },
  },
  {
    id: "strafe",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "8,4 16,4 14,9 10,9", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 12, y1: 3.4, x2: 12, y2: 1.2, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "8,20 16,20 14,15 10,15", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 12, y1: 20.6, x2: 12, y2: 22.8, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
    },
  },
  {
    id: "turn",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M12 5 a7 7 0 1 0 7 7", fill: "none", stroke: p, "stroke-width": 2.2, "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "16.8,10.8 21.2,10.8 19,14.6", fill: p }));
      svg.append(el("circle", { cx: 12, cy: 12, r: 1.8, fill: s }));
    },
  },
  // Weapons.
  {
    id: "gun",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 3.5, y: 8.5, width: 9, height: 7, rx: 1, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("line", { x1: 12.5, y1: 12, x2: 20, y2: 12, stroke: p, "stroke-width": 2.4, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 19.6, y1: 12, x2: 21.8, y2: 12, stroke: s, "stroke-width": 3, "stroke-linecap": "round" }));
    },
  },
  {
    id: "twinGun",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 3.5, y: 7, width: 9, height: 10, rx: 1, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("line", { x1: 12.5, y1: 9.5, x2: 20, y2: 9.5, stroke: p, "stroke-width": 2.2, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 12.5, y1: 14.5, x2: 20, y2: 14.5, stroke: p, "stroke-width": 2.2, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 19.4, y1: 9.5, x2: 21.6, y2: 9.5, stroke: s, "stroke-width": 2.6, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 19.4, y1: 14.5, x2: 21.6, y2: 14.5, stroke: s, "stroke-width": 2.6, "stroke-linecap": "round" }));
    },
  },
  {
    id: "turret",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M5.5 15 a6.5 6.5 0 0 1 13 0 z", fill: p, stroke: s, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 4, y1: 15.6, x2: 20, y2: 15.6, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 12, y1: 13, x2: 19, y2: 8, stroke: p, "stroke-width": 2.4, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 18.2, y1: 8.6, x2: 20.4, y2: 7, stroke: s, "stroke-width": 2.8, "stroke-linecap": "round" }));
    },
  },
  // Tractors.
  {
    id: "coneBeam",
    draw(svg, p, s) {
      svg.append(el("circle", { cx: 7.5, cy: 12, r: 4.5, fill: p, stroke: s, "stroke-width": 1.3 }));
      svg.append(el("circle", { cx: 7.5, cy: 12, r: 1.4, fill: s }));
      svg.append(el("line", { x1: 11, y1: 8.5, x2: 21.5, y2: 4.5, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 11, y1: 12, x2: 21.5, y2: 12, stroke: s, "stroke-width": 1.4, "stroke-dasharray": "2 2.2", "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 11, y1: 15.5, x2: 21.5, y2: 19.5, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
    },
  },
  {
    id: "ringBeam",
    draw(svg, p, s) {
      svg.append(el("circle", { cx: 12, cy: 12, r: 6, fill: p, stroke: s, "stroke-width": 1.3 }));
      svg.append(el("circle", { cx: 12, cy: 12, r: 2.6, fill: "none", stroke: s, "stroke-width": 1.2 }));
      for (const [x1, y1, x2, y2] of [[12, 4.8, 12, 2.4], [12, 19.2, 12, 21.6], [4.8, 12, 2.4, 12], [19.2, 12, 21.6, 12]]) {
        svg.append(el("line", { x1, y1, x2, y2, stroke: s, "stroke-width": 1.6, "stroke-linecap": "round" }));
      }
    },
  },
  {
    id: "magnet",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M8 5.5 v5 a4 4 0 0 0 8 0 v-5.5", fill: "none", stroke: p, "stroke-width": 3, "stroke-linecap": "round" }));
      svg.append(el("rect", { x: 6.6, y: 2.4, width: 2.8, height: 3, fill: s }));
      svg.append(el("rect", { x: 14.6, y: 2.4, width: 2.8, height: 3, fill: s }));
    },
  },
  // Computers.
  {
    id: "chip",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 6.5, y: 6.5, width: 11, height: 11, rx: 1.5, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("rect", { x: 9.8, y: 9.8, width: 4.4, height: 4.4, fill: "none", stroke: s, "stroke-width": 1.1 }));
      for (const y of [9, 12, 15]) {
        svg.append(el("line", { x1: 4.2, y1: y, x2: 6.5, y2: y, stroke: s, "stroke-width": 1.4 }));
        svg.append(el("line", { x1: 17.5, y1: y, x2: 19.8, y2: y, stroke: s, "stroke-width": 1.4 }));
      }
      for (const x of [9, 12, 15]) {
        svg.append(el("line", { x1: x, y1: 4.2, x2: x, y2: 6.5, stroke: s, "stroke-width": 1.4 }));
        svg.append(el("line", { x1: x, y1: 17.5, x2: x, y2: 19.8, stroke: s, "stroke-width": 1.4 }));
      }
    },
  },
  {
    id: "board",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 4, y: 6.5, width: 16, height: 11, rx: 1, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("path", { d: "M6 9.4 h4 l2.6 2.8 h4.8", fill: "none", stroke: s, "stroke-width": 1.1 }));
      svg.append(el("path", { d: "M6 15.6 h5.4 l2.6 -2.6", fill: "none", stroke: s, "stroke-width": 1.1 }));
      svg.append(el("rect", { x: 15.4, y: 8.2, width: 2.6, height: 2.6, fill: s }));
      svg.append(el("rect", { x: 6.6, y: 13.8, width: 2.6, height: 2.6, fill: s }));
    },
  },
  // Cargo bays.
  {
    id: "crate",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 5.5, y: 6, width: 13, height: 12, fill: p, stroke: s, "stroke-width": 1.4 }));
      svg.append(el("line", { x1: 5.5, y1: 10, x2: 18.5, y2: 10, stroke: s, "stroke-width": 1.1 }));
      svg.append(el("rect", { x: 10.7, y: 13.2, width: 2.6, height: 2.6, fill: s }));
    },
  },
  {
    id: "openCrate",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M6 7.5 v10.5 h12 v-10.5", fill: "none", stroke: p, "stroke-width": 2.4, "stroke-linejoin": "round" }));
      svg.append(el("circle", { cx: 9.5, cy: 15, r: 1.7, fill: s }));
      svg.append(el("circle", { cx: 14.5, cy: 15, r: 1.7, fill: s }));
      svg.append(el("circle", { cx: 12, cy: 12.4, r: 1.7, fill: s }));
      svg.append(el("line", { x1: 6, y1: 7.5, x2: 3.4, y2: 4.9, stroke: s, "stroke-width": 2, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 18, y1: 7.5, x2: 20.6, y2: 4.9, stroke: s, "stroke-width": 2, "stroke-linecap": "round" }));
    },
  },
  // Cockpits.
  {
    id: "kite",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "17.5,12 9.5,7.6 6.5,12 9.5,16.4", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("polygon", { points: "14.8,10.6 11,9.1 9.9,10.7", fill: s }));
    },
  },
  {
    id: "bar",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 10.4, y: 4, width: 3.2, height: 16, fill: p, stroke: s, "stroke-width": 1.1 }));
      svg.append(el("rect", { x: 11.3, y: 5.6, width: 1.3, height: 5, fill: s }));
    },
  },
  {
    id: "dome",
    draw(svg, p, s) {
      svg.append(el("ellipse", { cx: 12, cy: 12, rx: 6.5, ry: 5.2, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("ellipse", { cx: 10, cy: 10.4, rx: 2, ry: 1, fill: s, transform: "rotate(-25 10 10.4)" }));
    },
  },
  {
    id: "visor",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "18.5,10.2 17,8.6 5.5,8.6 5.5,15.4 17,15.4 18.5,13.8", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("rect", { x: 7.5, y: 10.6, width: 6, height: 1.1, fill: s }));
    },
  },
  // Programs.
  {
    id: "gyro",
    draw(svg, p, s) {
      svg.append(el("circle", { cx: 12, cy: 12, r: 7, fill: "none", stroke: p, "stroke-width": 2.2 }));
      svg.append(el("polygon", { points: "16.4,5.9 19.9,7.4 17.3,10.7", fill: p }));
      svg.append(el("line", { x1: 5, y1: 12, x2: 19, y2: 12, stroke: s, "stroke-width": 1.6, "stroke-linecap": "round" }));
    },
  },
  {
    id: "retro",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 9.8, y: 9.8, width: 4.4, height: 4.4, rx: 0.8, fill: p }));
      svg.append(el("line", { x1: 3, y1: 12, x2: 7.2, y2: 12, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 21, y1: 12, x2: 16.8, y2: 12, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "7,10.3 7,13.7 9.6,12", fill: s }));
      svg.append(el("polygon", { points: "17,10.3 17,13.7 14.4,12", fill: s }));
    },
  },
  {
    id: "gauge",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M4.5 17 a7.5 7.5 0 0 1 15 0", fill: "none", stroke: p, "stroke-width": 2.2, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, stroke: s, "stroke-width": 1.4, "stroke-linecap": "round" }));
      for (const [x1, y1, x2, y2] of [[8.1, 13.1, 6.7, 11.7], [12, 11.5, 12, 9.5], [15.9, 13.1, 17.3, 11.7]]) {
        svg.append(el("line", { x1, y1, x2, y2, stroke: s, "stroke-width": 1.4, "stroke-linecap": "round" }));
      }
      svg.append(el("line", { x1: 12, y1: 17, x2: 16.8, y2: 10.8, stroke: s, "stroke-width": 2, "stroke-linecap": "round" }));
      svg.append(el("circle", { cx: 12, cy: 17, r: 1.8, fill: p }));
    },
  },
  {
    id: "cursor",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "6.5,4 6.5,17.5 10.2,14.2 12.4,19 14.6,18 12.4,13.2 17.5,13.2", fill: p, stroke: s, "stroke-width": 1, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 15, y1: 5.5, x2: 19, y2: 5.5, stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "19.3,4.1 19.3,6.9 21.9,5.5", fill: s }));
    },
  },
  {
    id: "turnCursor",
    draw(svg, p, s) {
      const g = el("g", { transform: "translate(3.2,3.6) scale(0.72)" });
      g.append(el("polygon", { points: "6.5,4 6.5,17.5 10.2,14.2 12.4,19 14.6,18 12.4,13.2 17.5,13.2", fill: p, stroke: s, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      svg.append(g);
      svg.append(el("path", { d: "M19.5 12 A7.5 7.5 0 1 1 12 4.5", fill: "none", stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "10.4,2.6 13.6,2.6 12,6.2", fill: s }));
    },
  },
  {
    id: "route",
    draw(svg, p, s) {
      svg.append(el("circle", { cx: 5.5, cy: 17.5, r: 1.9, fill: p }));
      svg.append(el("circle", { cx: 11, cy: 10.5, r: 1.9, fill: p }));
      svg.append(el("circle", { cx: 18.5, cy: 5.5, r: 1.9, fill: p }));
      svg.append(el("line", { x1: 6.6, y1: 16.4, x2: 9.9, y2: 11.6, stroke: s, "stroke-width": 1.3, "stroke-dasharray": "2.4 2.2" }));
      svg.append(el("line", { x1: 12.1, y1: 9.4, x2: 17.4, y2: 6.6, stroke: s, "stroke-width": 1.3, "stroke-dasharray": "2.4 2.2" }));
      svg.append(el("rect", { x: 14.5, y: 14.5, width: 4.6, height: 4.6, rx: 1, fill: p, stroke: s, "stroke-width": 1.1 }));
    },
  },
  {
    id: "chart",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 4, y: 5, width: 16, height: 14, rx: 1, fill: "none", stroke: p, "stroke-width": 1.8 }));
      for (const [cx, cy] of [[8, 9], [15, 12.5], [10, 15.5]]) {
        svg.append(el("line", { x1: cx, y1: cy - 1.3, x2: cx, y2: cy + 1.3, stroke: s, "stroke-width": 1.3, "stroke-linecap": "round" }));
        svg.append(el("line", { x1: cx - 1.3, y1: cy, x2: cx + 1.3, y2: cy, stroke: s, "stroke-width": 1.3, "stroke-linecap": "round" }));
      }
      svg.append(el("polyline", { points: "6.5,16.5 10,15.5 15,12.5 17.5,8.5", fill: "none", stroke: s, "stroke-width": 1.1, "stroke-dasharray": "1.8 2" }));
    },
  },
  {
    id: "autopilot",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M4 19 Q10 19 12 14 T20 5.5", fill: "none", stroke: s, "stroke-width": 1.8, "stroke-dasharray": "3 2.4", "stroke-linecap": "round" }));
      svg.append(el("polygon", { points: "18.2,4.2 21.6,5 19.6,7.9", fill: s }));
      svg.append(el("circle", { cx: 9, cy: 9, r: 3.2, fill: p, stroke: s, "stroke-width": 1.1 }));
    },
  },
  {
    id: "tow",
    draw(svg, p, s) {
      // A ship with its load out in front, and the clamp arm between them.
      svg.append(el("polygon", { points: "3,7.4 9.4,12 3,16.6", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("path", { d: "M10 12 h3.4", fill: "none", stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" }));
      svg.append(el("path", { d: "M13 9.2 l2 2.8 l-2 2.8", fill: "none", stroke: s, "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      svg.append(el("circle", { cx: 18.4, cy: 12, r: 3.4, fill: p, stroke: s, "stroke-width": 1.3 }));
    },
  },
  // Station.
  {
    id: "drone",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "21,12 15.6,5.7 3.9,5.7 3.9,18.3 15.6,18.3", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("rect", { x: 16.8, y: 10.3, width: 2, height: 3.4, fill: s }));
    },
  },
  {
    id: "deposit",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "7,10 17,10 19,19.5 5,19.5", fill: p, stroke: s, "stroke-width": 1.3, "stroke-linejoin": "round" }));
      svg.append(el("circle", { cx: 9.5, cy: 8.4, r: 1.7, fill: s }));
      svg.append(el("circle", { cx: 14.5, cy: 8.4, r: 1.7, fill: s }));
      svg.append(el("circle", { cx: 12, cy: 7.2, r: 1.8, fill: s }));
    },
  },
  {
    id: "stationTurret",
    draw(svg, p, s) {
      svg.append(el("rect", { x: 5, y: 14.5, width: 14, height: 5, rx: 1, fill: p, stroke: s, "stroke-width": 1.2 }));
      svg.append(el("path", { d: "M8 14.5 a4 4 0 0 1 8 0 z", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 12, y1: 12.8, x2: 19, y2: 7, stroke: p, "stroke-width": 2.2, "stroke-linecap": "round" }));
      svg.append(el("line", { x1: 18.3, y1: 7.6, x2: 20.3, y2: 6, stroke: s, "stroke-width": 2.6, "stroke-linecap": "round" }));
    },
  },
  // Spares: marks of their own, for anything that needs telling apart some other way.
  {
    id: "star",
    draw(svg, p, s) {
      svg.append(
        el("polygon", {
          points: "12,3.6 9.77,9.33 3.63,9.68 8.39,15.57 6.83,19.52 12,16.2 17.17,19.52 15.61,15.57 20.37,9.68 14.23,9.33",
          fill: p,
          stroke: s,
          "stroke-width": 1.1,
          "stroke-linejoin": "round",
        }),
      );
    },
  },
  {
    id: "diamond",
    draw(svg, p, s) {
      svg.append(el("polygon", { points: "12,4 20,12 12,20 4,12", fill: p, stroke: s, "stroke-width": 1.2, "stroke-linejoin": "round" }));
      svg.append(el("line", { x1: 7, y1: 12, x2: 17, y2: 12, stroke: s, "stroke-width": 1.1 }));
    },
  },
  {
    id: "crosshair",
    draw(svg, p, s) {
      svg.append(el("circle", { cx: 12, cy: 12, r: 6.2, fill: "none", stroke: s, "stroke-width": 1.5 }));
      svg.append(el("circle", { cx: 12, cy: 12, r: 1.7, fill: p, stroke: s, "stroke-width": 1 }));
      for (const [x1, y1, x2, y2] of [[12, 2.6, 12, 7], [12, 17, 12, 21.4], [2.6, 12, 7, 12], [17, 12, 21.4, 12]]) {
        svg.append(el("line", { x1, y1, x2, y2, stroke: p, "stroke-width": 2, "stroke-linecap": "round" }));
      }
    },
  },
  {
    id: "unknown",
    draw(svg, p, s) {
      svg.append(el("path", { d: "M8.1 8.6 C8.1 6.3 9.9 4.9 12.2 4.9 C14.5 4.9 16.1 6.4 16.1 8.4 C16.1 10.6 14.3 11.3 13.2 12.4 C12.5 13.1 12.3 13.7 12.3 14.8", fill: "none", stroke: p, "stroke-width": 2.6, "stroke-linecap": "round" }));
      svg.append(el("circle", { cx: 12.3, cy: 18.6, r: 1.7, fill: s }));
    },
  },
];

export type GlyphId = (typeof GLYPHS)[number]["id"];

const BY_ID = new Map(GLYPHS.map((glyph) => [glyph.id as string, glyph]));

/** A glyph by its id, or undefined when there is none. */
export function glyphOf(id: string): { id: GlyphId; draw: GlyphDraw } | undefined {
  return BY_ID.get(id);
}

/** Whether a glyph with this id exists. */
export function hasGlyph(id: string): boolean {
  return BY_ID.has(id);
}

/** Every glyph id, in the order they were drawn. */
export const GLYPH_IDS: readonly string[] = GLYPHS.map((glyph) => glyph.id);
