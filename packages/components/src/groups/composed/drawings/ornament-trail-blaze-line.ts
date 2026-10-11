import type { Drawing } from "@sb/spec";

/** A mountain-trail border: a footpath across the width, past a block of rock with the trail blaze painted on its face (a solid ring round an open centre: the ink is the red, the ground the white) and two small stones. Provenance: drawn new after the Knafelc trail blaze (Knafelčeva markacija), the red ring with a white centre that has marked Slovene mountain paths since 1922; the mark itself, no sign or emblem copied. */
export const trailBlazeLine: Drawing = {
  id: "ornament/trail-blaze-line",
  style: "line",
  viewBox: [238, 32],
  paths: [
    { d: "M3 28.3C6.3 28.2 16 27.7 23 27.7C30 27.7 37.3 28.4 45 28.5C52.7 28.6 60.7 28.1 69 28.1C77.3 28.1 86 28.6 95 28.5C104 28.4 113.7 27.5 123 27.5C132.3 27.5 141.3 28.3 151 28.3C160.7 28.3 171.3 27.5 181 27.5C190.7 27.5 200 28.3 209 28.3C218 28.3 230.7 27.8 235 27.7", fill: "none", stroke: "text", width: 1.75 },
    { d: "M33.6 28.3L35.4 19.5L42.6 10.3L57 5.1L79 3.5L95.6 6.7L103.4 15.3L106.2 28.3M79 3.5L82.4 11.1L91.6 14.3M35.4 19.5L43.6 21.1", fill: "none", stroke: "text", width: 1.75 },
    { d: "M123.6 27.7L125 24.5L129.2 22.9L133.6 24.3L135.2 27.5M195.8 27.9L197 25.3L200.6 24.5L203.4 26.1L204 27.7", fill: "none", stroke: "text", width: 1.75 },
    { d: "M59.6 17.5A7.8 7.8 0 1 0 75.2 17.5A7.8 7.8 0 1 0 59.6 17.5ZM63.6 17.5A3.8 3.8 0 1 1 71.2 17.5A3.8 3.8 0 1 1 63.6 17.5Z", fill: "text" },
  ],
};
