import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DRAWINGS, Drawing, PRACTICAL_FACTS, REPEATABLE } from "@sb/spec";
import { DrawingSvg } from "../src/groups/composed/drawing.tsx";
import { DRAWING_DATA, drawingData } from "../src/groups/composed/drawings/index.ts";
import { PHOTO_FRAME, imageSizes } from "../src/groups/composed/layout.ts";

/** The Drawing renderer and its data (spec v20 Drawing format, docs/plans/studio-phase1-design.md §3.1; F1b-R2). */
describe("drawing data", () => {
  it("every drawing in DRAWINGS has data under its id that parses as a Drawing; repeatable ones tile", () => {
    for (const id of DRAWINGS) {
      const d = drawingData(id);
      expect(d, id).toBeDefined();
      expect(Drawing.parse(d)).toEqual(d);
      expect(d!.id).toBe(id);
    }
    for (const id of REPEATABLE) expect(drawingData(id)!.repeat, id).toBeDefined();
    expect(Object.keys(DRAWING_DATA).every((id) => (DRAWINGS as readonly string[]).includes(id))).toBe(true);
    expect(drawingData("toString")).toBeUndefined();
  });

  it("line drawings stay at least 1.5 px on screen (non-scaling strokes); roles or, as ink, currentColor", () => {
    const html = renderToStaticMarkup(createElement(DrawingSvg, { id: "motif/bakery/wheat-ear-line" }));
    expect(html).toMatch(/^<svg class="cx-dw cx-dw--line" viewBox="0 0 60 120" aria-hidden="true" focusable="false">/);
    for (const w of html.matchAll(/stroke-width:([\d.]+)/g)) expect(Number(w[1])).toBeGreaterThanOrEqual(1.5);
    expect(html).toContain("vector-effect:non-scaling-stroke");
    expect(html).toContain("stroke:var(--c-text)");
    const ink = renderToStaticMarkup(createElement(DrawingSvg, { id: "motif/bakery/wheat-ear-line", ink: true }));
    expect(ink).not.toContain("var(--c-");
    expect(ink).toContain("stroke:currentColor");
    expect(renderToStaticMarkup(createElement(DrawingSvg, { id: "ornament/none-line" }))).toBe("");
  });

  it("a strip tiles the drawing in a pattern (half a drawing apart when it doesn't repeat), cropped at its end", () => {
    const html = renderToStaticMarkup(createElement(DrawingSvg, { id: "motif/bakery/wheat-ear-line", strip: true }));
    expect(html).toMatch(/viewBox="0 0 28800 120" preserveAspectRatio="xMinYMid slice"/);
    expect(html).toMatch(/<pattern id="cxd[\w-]+" width="90" height="120" patternUnits="userSpaceOnUse">/);
    expect(html).not.toContain("vector-effect");
  });
});

describe("imageSizes", () => {
  it("is unchanged for an image; a photos frame takes its share on desktop and phones", () => {
    const el = { desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } } as Parameters<typeof imageSizes>[1];
    expect(imageSizes("contained", el)).toBe("(min-width: 76rem) 36rem, (min-width: 64rem) calc((100vw - 4rem) * 6 / 12), calc(100vw - 2rem)");
    expect(imageSizes("full", el, PHOTO_FRAME.fan)).toBe("(min-width: 64rem) calc(94vw * 3.72 / 12), calc((100vw - 2rem) * 0.62)");
  });

  it("PRACTICAL_FACTS is the fixed list of 40 the labels cover", () => {
    expect(PRACTICAL_FACTS).toHaveLength(40);
  });
});
