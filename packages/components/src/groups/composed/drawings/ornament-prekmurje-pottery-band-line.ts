import type { Drawing } from "@sb/spec";

/** A pottery band: a turned line above and below, between them a long wave combed in two lines. Repeatable along x. Provenance: drawn new after the combed and incised wave bands on Prekmurje pottery (Filovci and the Pannonian potters' villages); no vessel copied. */
export const prekmurjePotteryBandLine: Drawing = {
  id: "ornament/prekmurje-pottery-band-line",
  style: "line",
  viewBox: [48, 16],
  paths: [
    { d: "M0 1.6L48 1.6M0 14.4L48 14.4", fill: "none", stroke: "text", width: 2 },
    { d: "M0 6.1C6 4.6 9 3.8499999999999996 12 3.8499999999999996C15 3.8499999999999996 18 4.6 24 6.1C30 7.6 33 8.35 36 8.35C39 8.35 42 7.6 48 6.1M0 9.9C6 8 9 7.050000000000001 12 7.050000000000001C15 7.050000000000001 18 8 24 9.9C30 11.8 33 12.75 36 12.75C39 12.75 42 11.8 48 9.9", fill: "none", stroke: "text", width: 2 },
  ],
  repeat: { axis: "x", gap: 0 },
};
