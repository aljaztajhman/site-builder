import type { Drawing } from "@sb/spec";

/** An ear of wheat in one line: the stem, five pairs of grains climbing it and a top grain, short awns. Sample drawing. */
export const wheatEarLine: Drawing = {
  id: "motif/bakery/wheat-ear-line",
  style: "line",
  viewBox: [60, 120],
  paths: [
    { d: "M30 116C30 96 30.5 70 30 30", fill: "none", stroke: "text", width: 1.75 },
    {
      d: "M30 92C22 89 18 82 19 74C26 76 30 83 30 92ZM30 92C38 89 42 82 41 74C34 76 30 83 30 92ZM30 78C22 75 18 68 19 60C26 62 30 69 30 78ZM30 78C38 75 42 68 41 60C34 62 30 69 30 78Z",
      fill: "none",
      stroke: "text",
      width: 1.75,
    },
    {
      d: "M30 64C22 61 18 54 19 46C26 48 30 55 30 64ZM30 64C38 61 42 54 41 46C34 48 30 55 30 64ZM30 50C23 47 20 40 21 33C27 35 30 42 30 50ZM30 50C37 47 40 40 39 33C33 35 30 42 30 50Z",
      fill: "none",
      stroke: "text",
      width: 1.75,
    },
    { d: "M30 36C25 31 25 22 30 15C35 22 35 31 30 36Z", fill: "none", stroke: "text", width: 1.75 },
    { d: "M21 33L15 19M39 33L45 19M19 46L11 34M41 46L49 34M30 15L30 4", fill: "none", stroke: "text", width: 1.5 },
  ],
};
