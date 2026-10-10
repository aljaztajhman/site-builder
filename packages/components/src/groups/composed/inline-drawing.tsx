/**
 * A minimal inline renderer for spec v20 `Drawing` data (packages/spec/src/composition/drawing.ts), for the places the
 * extensions of existing kinds need one: `decor.drawing` (a cell drawing, a fixed size, an x-repeating strip) and the
 * `list.marker: "drawing"` bullet. F1b-R3's own helper: the shared Drawing renderer (drawings/Drawing.tsx) and the
 * asset data (drawings/data/<kind>/<name>.ts) are F1b-R2's and I5's, and the director unifies the two after both merge.
 * Until then the two sample drawings of the vocabulary are drawn here; an id with no data draws nothing (a stray id
 * never fails the page), and a list marker with no drawing falls back to the dash.
 *
 * Every drawing is decoration: hidden from assistive technology, never focusable. Colours are roles only; an `ink` role
 * paints the whole drawing in one colour (the element's own `color`). A line drawing's strokes keep their width on screen
 * (vector-effect), at least 1.5 px.
 */
import { useId, type CSSProperties, type ReactElement } from "react";
import type { ColorRole, Drawing } from "@sb/spec";
import { ROLE_VAR } from "./layout.ts";

/** The sample drawings of the vocabulary (DRAWINGS in @sb/spec), as path data. */
const SAMPLES: Readonly<Record<string, Drawing>> = {
  // A wheat ear: the stem and three pairs of grains with one on top.
  "motif/bakery/wheat-ear-line": {
    id: "motif/bakery/wheat-ear-line",
    style: "line",
    viewBox: [40, 100],
    paths: [
      { d: "M20 98V28", fill: "none", stroke: "text", width: 2 },
      { d: "M20 28C14 22 14 12 20 4C26 12 26 22 20 28Z", fill: "none", stroke: "text", width: 2 },
      { d: "M20 46C12 46 6 40 5 30C14 31 20 37 20 46Z", fill: "none", stroke: "text", width: 2 },
      { d: "M20 46C28 46 34 40 35 30C26 31 20 37 20 46Z", fill: "none", stroke: "text", width: 2 },
      { d: "M20 66C12 66 6 60 5 50C14 51 20 57 20 66Z", fill: "none", stroke: "text", width: 2 },
      { d: "M20 66C28 66 34 60 35 50C26 51 20 57 20 66Z", fill: "none", stroke: "text", width: 2 },
    ],
  },
  // A rope: two strands crossing, one tile of a strip that repeats along x.
  "ornament/rope-line": {
    id: "ornament/rope-line",
    style: "line",
    viewBox: [40, 16],
    paths: [
      { d: "M0 4C10 4 10 12 20 12S30 4 40 4", fill: "none", stroke: "text", width: 2 },
      { d: "M0 12C10 12 10 4 20 4S30 12 40 12", fill: "none", stroke: "text", width: 2 },
    ],
    repeat: { axis: "x", gap: 0 },
  },
};

/** The drawing's data, or undefined for an id this helper has none for. */
export const resolveDrawing = (id: string): Drawing | undefined => SAMPLES[id];

const paint = (role: ColorRole | "none", ink: ColorRole | undefined) => (role === "none" ? "none" : ink ? ROLE_VAR[ink] : ROLE_VAR[role]);

function Paths({ drawing, ink }: { drawing: Drawing; ink: ColorRole | undefined }) {
  const line = drawing.style === "line";
  return (
    <>
      {drawing.paths.map((p, i) => {
        const style: CSSProperties = {
          fill: paint(p.fill, ink),
          stroke: p.stroke && p.stroke !== "none" ? paint(p.stroke, ink) : "none",
          strokeWidth: line ? Math.max(p.width ?? 1.5, 1.5) : (p.width ?? 1),
          strokeLinecap: "round",
          strokeLinejoin: "round",
        };
        return <path key={i} d={p.d} style={style} vectorEffect={line ? "non-scaling-stroke" : undefined} />;
      })}
    </>
  );
}

/** One drawing in its own viewBox, as big as its box. Null for an id without data. */
export function InlineDrawing({ id, ink, className }: { id: string; ink?: ColorRole | undefined; className?: string }): ReactElement | null {
  const d = resolveDrawing(id);
  if (!d) return null;
  return (
    <svg className={className} viewBox={`0 0 ${d.viewBox[0]} ${d.viewBox[1]}`} aria-hidden="true" focusable="false">
      <Paths drawing={d} ink={ink} />
    </svg>
  );
}

/**
 * A strip: the drawing tiled along x by an SVG pattern inside one inline svg, as high as its CSS height and as wide as its
 * box. The viewBox is far wider than any screen and sliced, so the tile keeps its size whatever the width. Only a drawing
 * with `repeat` tiles (REPEATABLE, G19); any other draws nothing.
 */
const STRIP_WIDTH = 8000;
export function DrawingStrip({ id, ink, className }: { id: string; ink?: ColorRole | undefined; className?: string }): ReactElement | null {
  const uid = `cxp${useId().replace(/\W/g, "")}`;
  const d = resolveDrawing(id);
  if (!d?.repeat) return null;
  const [w, h] = d.viewBox;
  return (
    <svg className={className} viewBox={`0 0 ${STRIP_WIDTH} ${h}`} preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={uid} width={w + d.repeat.gap} height={h} patternUnits="userSpaceOnUse">
          <Paths drawing={d} ink={ink} />
        </pattern>
      </defs>
      <rect width={STRIP_WIDTH} height={h} fill={`url(#${uid})`} />
    </svg>
  );
}
