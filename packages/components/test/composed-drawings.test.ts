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

  /** Strip height on phones (composed-v2.css --cx-ed: 0.75rem); a tiled drawing's strokes scale with it. */
  const EDGE_PHONE_PX = 12;
  const BUDGET = { motif: 6 * 1024, ornament: 8 * 1024 }; // inventory checks.ts BYTE_BUDGET

  it.each([...DRAWINGS])("%s: one stroke weight ≥ 1.5 px, the text role only, within its byte budget", (id) => {
    const d = drawingData(id)!;
    const strokes = d.paths.filter((p) => p.stroke && p.stroke !== "none");
    expect(strokes.length, id).toBeGreaterThan(0);
    // One weight per drawing (I5 style brief); the F1b wheat-ear sample predates it (awns at 1.5, the rest at 1.75).
    if (id !== "motif/bakery/wheat-ear-line") expect(new Set(strokes.map((p) => p.width)).size, `${id}: stroke weights`).toBe(1);
    for (const p of d.paths) {
      for (const role of [p.fill, p.stroke]) if (role && role !== "none") expect(role, id).toBe("text");
      if (p.stroke && p.stroke !== "none") expect(p.width ?? 0, id).toBeGreaterThanOrEqual(1.5);
      // Tiled, strokes scale with the strip: on a 12 px edge they must still be 1.5 px.
      if (d.repeat && p.stroke && p.stroke !== "none") expect(((p.width ?? 0) * EDGE_PHONE_PX) / d.viewBox[1], `${id} at a ${EDGE_PHONE_PX} px edge`).toBeGreaterThanOrEqual(1.5);
    }
    const bytes = Buffer.byteLength(renderToStaticMarkup(createElement(DrawingSvg, { id })), "utf8");
    expect(bytes, id).toBeLessThanOrEqual(BUDGET[id.startsWith("motif/") ? "motif" : "ornament"]);
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
