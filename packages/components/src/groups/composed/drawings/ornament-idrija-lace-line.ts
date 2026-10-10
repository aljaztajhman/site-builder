import type { Drawing } from "@sb/spec";

/** An Idrija bobbin-lace edge, one scallop per tile: the straight footing, the tape running from point to point with a loop turned over each scallop, the scalloped edge with a small picot where two scallops meet. Repeatable along x. Provenance: drawn new after Idrija bobbin lace (idrijska čipka), whose narrow tape (ris) and scalloped edgings are its signature; no pattern copied. */
export const idrijaLaceLine: Drawing = {
  id: "ornament/idrija-lace-line",
  style: "line",
  viewBox: [36, 18],
  paths: [
    { d: "M0 2L36 2", fill: "none", stroke: "text", width: 2.25 },
    { d: "M0 10C7 10 10 5.6 16 5.6C21 5.6 22.6 10.6 18.6 11.4C15 12 14.2 7.6 20 6.4C25 5.4 29 10 36 10", fill: "none", stroke: "text", width: 2.25 },
    { d: "M0 11.2C4.6 18.8 31.4 18.8 36 11.2M-2.2 13.4C-2.4 16.6 2.4 16.6 2.2 13.4M33.8 13.4C33.6 16.6 38.4 16.6 38.2 13.4", fill: "none", stroke: "text", width: 2.25 },
  ],
  repeat: { axis: "x", gap: 0 },
};
