import type { Drawing } from "@sb/spec";

/** A rope: strands rising across the tile between its two edges, a strand every half tile (those past its edge finish in the next tile). Repeatable sample. */
export const ropeLine: Drawing = {
  id: "ornament/rope-line",
  style: "line",
  viewBox: [8, 12],
  paths: [
    { d: "M-4 11C-1 11 1 1 4 1M0 11C3 11 5 1 8 1M4 11C7 11 9 1 12 1", fill: "none", stroke: "text", width: 1.5 },
    { d: "M0 0.75H8M0 11.25H8", fill: "none", stroke: "text", width: 1.5 },
  ],
  repeat: { axis: "x", gap: 0 },
};
