/* global process, console */
// Style 4: bold cut-paper shapes, no illustration: a big terracotta sun, a dark loaf dome with three score cuts, a pale
// quarter round; cropped by the drawing's edges (which meet the section's top, right and bottom edges). Portrait.
import { Art, smooth, lens, circle, ellipsePts, PREVIEW_DIR, DRAW_DIR } from "./lib.mjs";

const art = new Art(300, 400);
art.add("border", circle(16, 404, 128));
art.add("primary", circle(196, 150, 140));
art.add("text", smooth(ellipsePts(178, 410, 182, 168, 0, 24), true, 1));
art.add("background", [
  lens([40, 352], [110, 284], 9.5, 4),
  lens([116, 366], [196, 290], 11, 4.5),
  lens([196, 376], [268, 306], 9.5, 4),
]);
const stats = art.check();
console.log(stats);
await art.preview(`${PREVIEW_DIR}/shapes.png`);
if (process.argv[2] === "write")
  art.writeTs(`${DRAW_DIR}/motif-bakery-sun-loaf-shapes-cut.ts`, {
    exportName: "sunLoafShapesCut",
    id: "motif/bakery/sun-loaf-shapes-cut",
    style: "cut",
    doc: "Hero style pilot (bold shapes): big cut-paper shapes in the palette, no illustration: a terracotta sun cropped at the right, a dark loaf dome on the bottom edge with three score cuts, a pale quarter round behind. Meant to bleed to the section's edges beside oversized type.",
  });
