import { useId, type CSSProperties } from "react";
import type { Drawing } from "@sb/spec";
import { cx } from "../../primitives/index.tsx";
import { drawingData } from "./drawings/index.ts";
import { ROLE_VAR } from "./layout.ts";

type DrawingPath = Drawing["paths"][number];

/** Strokes of line drawings never get thinner than this, in CSS pixels (§3.1). */
const MIN_LINE = 1.5;
/** A strip is this many times as wide as it is tall (in viewBox units): wide enough to cover a 2560 px edge 12 px tall. */
const STRIP_RATIO = 240;

/**
 * How a path paints. In its roles by default; as `ink` every role becomes currentColor, so the drawing takes the colour
 * of where it sits (a background layer's ink, the section's text on an edge, a ribbon's text). Line drawings keep their
 * stroke width on screen (non-scaling, at least 1.5 px) unless they tile (a pattern scales with its strip).
 */
function pathStyle(p: DrawingPath, style: Drawing["style"], ink: boolean, tiled: boolean): CSSProperties {
  const paint = (role: DrawingPath["fill"] | undefined) => (!role || role === "none" ? "none" : ink ? "currentColor" : ROLE_VAR[role]);
  const line = style === "line" && !tiled;
  return {
    fill: paint(p.fill),
    stroke: paint(p.stroke),
    strokeWidth: line ? Math.max(MIN_LINE, p.width ?? MIN_LINE) : (p.width ?? 1),
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...(line ? { vectorEffect: "non-scaling-stroke" } : {}),
  };
}

/**
 * An inventory drawing (spec Drawing, by its asset id) as inline SVG: decorative, hidden from assistive technology and
 * never focusable. `strip` tiles it along x as a strip that fills its box's height and is cropped at its end (a drawn
 * top edge; REPEATABLE drawings tile seamlessly, others with half a drawing between copies). Unknown ids draw nothing.
 */
export function DrawingSvg({ id, ink = false, strip = false, className }: { id: string; ink?: boolean; strip?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const d = drawingData(id);
  if (!d) return null;
  const [w, h] = d.viewBox;
  const paths = (tiled: boolean) => d.paths.map((p, i) => <path key={i} d={p.d} style={pathStyle(p, d.style, ink, tiled)} />);
  const cls = cx("cx-dw", `cx-dw--${d.style}`, className);
  if (!strip) {
    return (
      <svg className={cls} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
        {paths(false)}
      </svg>
    );
  }
  const period = w + (d.repeat ? d.repeat.gap : w / 2);
  const width = h * STRIP_RATIO;
  const pid = `cxd${uid}`;
  return (
    <svg className={cls} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={pid} width={period} height={h} patternUnits="userSpaceOnUse">
          {paths(true)}
        </pattern>
      </defs>
      <rect width={width} height={h} fill={`url(#${pid})`} />
    </svg>
  );
}
