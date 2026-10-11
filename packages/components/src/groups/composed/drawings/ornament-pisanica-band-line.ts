import type { Drawing } from "@sb/spec";

/** A pisanica belt: two border lines with a running wave between them and a wax-stylus comma under each crest, its tail curling up towards it. Repeatable along x. Provenance: drawn new after the wax-resist Easter eggs of Bela krajina (belokranjske pisanice), whose belts of waves and stylus drops divide the egg; no egg copied. */
export const pisanicaBandLine: Drawing = {
  id: "ornament/pisanica-band-line",
  style: "line",
  viewBox: [32, 16],
  paths: [
    { d: "M0 1.4L32 1.4M0 14.6L32 14.6", fill: "none", stroke: "text", width: 2 },
    { d: "M0 8C1.4 6 2.6 4.6 4 4.6C5.4 4.6 6.6 6 8 8C9.4 10 10.6 11.4 12 11.4C13.4 11.4 14.6 10 16 8C17.4 6 18.6 4.6 20 4.6C21.4 4.6 22.6 6 24 8C25.4 10 26.6 11.4 28 11.4C29.4 11.4 30.6 10 32 8", fill: "none", stroke: "text", width: 2 },
    { d: "M3 10.8A1.4 1.4 0 0 0 5.8 10.8C5.8 9.3 5.2 7.8 3.7 6.9C4.2 8 3.9 9.3 3 10.8ZM19 10.8A1.4 1.4 0 0 0 21.8 10.8C21.8 9.3 21.2 7.8 19.7 6.9C20.2 8 19.9 9.3 19 10.8Z", fill: "text" },
  ],
  repeat: { axis: "x", gap: 0 },
};
