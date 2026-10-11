import type { Drawing } from "@sb/spec";

/** Hero style pilot (bold shapes): big cut-paper shapes in the palette, no illustration: a terracotta sun cropped at the right, a dark loaf dome on the bottom edge with three score cuts, a pale quarter round behind. Meant to bleed to the section's edges beside oversized type. */
export const sunLoafShapesCut: Drawing = {
  id: "motif/bakery/sun-loaf-shapes-cut",
  style: "cut",
  viewBox: [300, 400],
  paths: [
    { d: "M-112 404A128 128 0 0 1 144 404A128 128 0 0 1-112 404Z", fill: "border" },
    { d: "M56 150A140 140 0 0 1 336 150A140 140 0 0 1 56 150Z", fill: "primary" },
    { d: "M360 410C360 424.5 357.9 439.5 353.8 453.5C349.7 467.5 343.5 481.4 335.6 494C327.8 506.6 317.8 518.5 306.7 528.8C295.6 539 282.6 548.2 269 555.5C255.4 562.7 240.3 568.5 225.1 572.3C209.9 576 193.7 578 178 578C162.3 578 146.1 576 130.9 572.3C115.7 568.5 100.6 562.7 87 555.5C73.4 548.2 60.4 539 49.3 528.8C38.2 518.5 28.2 506.6 20.4 494C12.5 481.4 6.3 467.5 2.2 453.5C-1.9 439.5-4 424.5-4 410C-4 395.5-1.9 380.5 2.2 366.5C6.3 352.5 12.5 338.6 20.4 326C28.2 313.4 38.2 301.5 49.3 291.2C60.4 281 73.4 271.8 87 264.5C100.6 257.3 115.7 251.5 130.9 247.7C146.1 244 162.3 242 178 242C193.7 242 209.9 244 225.1 247.7C240.3 251.5 255.4 257.3 269 264.5C282.6 271.8 295.6 281 306.7 291.2C317.8 301.5 327.8 313.4 335.6 326C343.5 338.6 349.7 352.5 353.8 366.5C357.9 380.5 360 395.5 360 410Z", fill: "text" },
    { d: "M40 352q53.8-14.6 70-68q-42.7 26.1-70 68zM116 366q61.4-15.5 80-76q-49 28.6-80 76zM196 376q54.8-15.6 72-70q-43.7 27.1-72 70z", fill: "background" },
  ],
};
