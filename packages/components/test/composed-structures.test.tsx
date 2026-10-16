import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ComposedProps, type Section } from "@sb/spec";
import { Composed } from "../src/groups/composed/index.tsx";
import { imageSizes, overPhoto, phoneRows, readingOrder, thirdsPosition, tileEdges } from "../src/groups/composed/layout.ts";
import { html, testCtx, testSpec } from "./helpers.ts";

/**
 * Design 5 Wave P, unit P1 (docs/plans/phase-layout-variety.md "Wave P"): the renderer's side of the vocabulary the eight
 * first-screen structures need. The browser measurements at 360 and 1280 px are composed-structures-browser.test.ts;
 * the schema and guards are packages/spec/test/composition-structures.test.ts.
 */
const css = readFileSync(new URL("../styles/composed.css", import.meta.url), "utf8");
const cssV2 = readFileSync(new URL("../styles/composed-v2.css", import.meta.url), "utf8");
/** A CSS file without comments and with collapsed whitespace, for matching rules. */
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

type Composed = Section & { type: "composed" };
const section = (props: object): Composed => ({ id: "s_hero", type: "composed", variant: "free", props: ComposedProps.parse({ intent: "hero", width: "full", rows: 2, ...props }) }) as unknown as Composed;
const headline = (more: object = {}) => ({ id: "e_h", kind: "heading", text: "Kruh vsak dan", level: 1, size: 5, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" }, ...more });
const image = (id: string, image: string, desk: object, phone: object, more: object = {}) => ({ id, kind: "image", image, ratio: "1:1", desk, phone, ...more });

describe("1. minHeight tall", () => {
  it("renders cx--mh-tall; 55 % of a phone's screen and 80 % of a desktop's, svh with a vh fallback", () => {
    const out = html(<Composed section={section({ minHeight: "tall", elements: [headline()] })} ctx={testCtx()} index={0} />);
    expect(out).toContain('class="cx cx--mh-tall"');
    expect(flat(css)).toMatch(/\.cx--mh-tall \{ min-height: 55vh; min-height: 55svh; \}/);
    expect(flat(css)).toMatch(/@media \(min-width: 64rem\) \{[^@]*\.cx--mh-tall \{ min-height: 80vh; min-height: 80svh; \}/);
  });

  it("leaves the old heights as they were", () => {
    const out = html(<Composed section={section({ minHeight: "l", elements: [headline()] })} ctx={testCtx()} index={0} />);
    expect(out).toContain('class="cx cx--mh-l"');
  });
});

describe("2. crop on thirds", () => {
  it("puts the focal point on the nearest third line of the frame, on the axis the photo overflows", () => {
    // A 16:9 photo in a square frame overflows sideways: the frame is 9/16 of the photo's width.
    const k = 9 / 16;
    const pos = thirdsPosition({ x: 0.7, y: 0.4 }, { width: 1600, height: 900 }, 1);
    const [px, py] = pos.split(" ").map((v) => Number.parseFloat(v) / 100) as [number, number];
    expect(py).toBeCloseTo(0.4, 2); // no overflow vertically: the focal y as it is
    // Where the focal point lands in the frame, as a share of its width: (f − p·(1 − k)) / k.
    expect((0.7 - px * (1 - k)) / k).toBeCloseTo(2 / 3, 1);
    const left = thirdsPosition({ x: 0.3, y: 0.5 }, { width: 1600, height: 900 }, 1).split(" ").map((v) => Number.parseFloat(v) / 100) as [number, number];
    expect((0.3 - left[0] * (1 - k)) / k).toBeCloseTo(1 / 3, 1);
    // A tall photo in a wide frame overflows vertically.
    const tall = thirdsPosition({ x: 0.5, y: 0.2 }, { width: 1200, height: 1600 }, 16 / 9);
    expect(tall.startsWith("50% ")).toBe(true);
  });

  it("clamps to the photo's edge, keeps a photo that doesn't overflow as it is, and falls back to 33 % 50 % without a focal point", () => {
    expect(thirdsPosition({ x: 0.98, y: 0.5 }, { width: 2000, height: 1000 }, 1.9)).toBe("100% 50%");
    expect(thirdsPosition({ x: 0.6, y: 0.3 }, { width: 1500, height: 1000 }, 1.5)).toBe("60% 30%");
    expect(thirdsPosition(undefined, { width: 1500, height: 1000 }, 1)).toBe("33% 50%");
  });

  it("renders the position on the image (from the asset's focal point and the element's ratio), and nothing new without crop", () => {
    const base = testSpec();
    const spec = testSpec({ assets: { ...base.assets, images: base.assets.images.map((i) => (i.id === "img_salon" ? { ...i, focal: { x: 0.75, y: 0.5 } } : i)) } });
    const el = (more: object) => image("e_i", "img_salon", { col: 7, span: 6, row: 1, rowSpan: 2 }, { order: 1, span: "full" }, { ratio: "1:1", ...more });
    const cropped = html(<Composed section={section({ elements: [headline(), el({ crop: "thirds" })] })} ctx={testCtx(spec)} index={0} />);
    // img_salon is 4:3; the test ctx serves it 720 × 540. In a square frame k = 3/4: p = (0.75 − ⅔·¾) / ¼ = 1.
    expect(cropped).toContain('data-crop="thirds"');
    expect(cropped).toContain("object-position:100% 50%");
    const plain = html(<Composed section={section({ elements: [headline(), el({})] })} ctx={testCtx(spec)} index={0} />);
    expect(plain).not.toContain("data-crop");
    expect(plain).toContain("object-position:75% 50%");
    const noFocal = html(<Composed section={section({ elements: [headline(), el({ crop: "thirds" })] })} ctx={testCtx()} index={0} />);
    expect(noFocal).toContain("object-position:33% 50%");
  });
});

describe("3. phone tiles", () => {
  const mosaic = () =>
    section({
      rows: 3,
      elements: [
        headline({ fill: "primary", color: "onPrimary", phone: { order: 0, span: "tile" } }),
        image("e_a", "img_salon", { col: 7, span: 6, row: 1 }, { order: 1, span: "tile" }),
        image("e_b", "img_detail", { col: 1, span: 6, row: 2 }, { order: 2, span: "tile" }),
        image("e_c", "img_team", { col: 7, span: 6, row: 2 }, { order: 3, span: "tile" }),
        { id: "e_t", kind: "text", paragraphs: ["Pečemo ob štirih."], desk: { col: 1, span: 6, row: 3 }, phone: { order: 4, span: "full" } },
      ],
    });

  it("pairs tiles two to a row and knows the screen edge each runs to", () => {
    const ordered = readingOrder(mosaic().props.elements);
    expect(Object.fromEntries(phoneRows(ordered))).toEqual({ e_h: 1, e_a: 1, e_b: 2, e_c: 2, e_t: 3 });
    expect(Object.fromEntries(tileEdges(ordered))).toEqual({ e_h: { side: "l", joined: false }, e_a: { side: "r", joined: false }, e_b: { side: "l", joined: true }, e_c: { side: "r", joined: true } });
  });

  it("renders the tile classes, a phone sizes of half the screen, and the CSS that takes them edge to edge", () => {
    const out = html(<Composed section={mosaic()} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/class="cx-el cx-el--heading cx-ps-tile cx-pt-l cx-pf cx-fg-onPrimary cx-pb cx-bg-primary cx-h"/);
    expect(out).toMatch(/class="cx-el cx-el--image cx-ps-tile cx-pt-r cx-img/);
    expect(out).toMatch(/class="cx-el cx-el--image cx-ps-tile cx-pt-l cx-pt-j cx-img/);
    expect(out).toMatch(/class="cx-el cx-el--image cx-ps-tile cx-pt-r cx-pt-j cx-img/);
    expect(out).toMatch(/class="cx-el cx-el--text cx-ps-full cx-t"/);
    expect(imageSizes("full", mosaic().props.elements[1]!)).toBe("(min-width: 64rem) calc(94vw * 6 / 12), calc(100vw / 2)");
    const f = flat(css);
    expect(f).toMatch(/\.cx-pt-l \{ margin-left: calc\(-1 \* var\(--cx-tp\)\); margin-right: calc\(-0\.5 \* var\(--cx-gap\)\); \}/);
    expect(f).toMatch(/\.cx-pt-r \{ margin-left: calc\(-0\.5 \* var\(--cx-gap\)\); margin-right: calc\(-1 \* var\(--cx-tp\)\); \}/);
    expect(f).toMatch(/\.cx-pt-j \{ margin-top: calc\(-1 \* var\(--cx-gap\)\); \}/);
  });

  it("renders a lone half element as before (no tile classes)", () => {
    const s = section({ elements: [headline(), image("e_a", "img_salon", { col: 7, span: 6, row: 1 }, { order: 1, span: "half" })] });
    const out = html(<Composed section={s} ctx={testCtx()} index={0} />);
    expect(out).not.toContain("cx-pt-");
    expect(out).toContain("cx-ps-half");
  });
});

describe("4. bleedY on an image", () => {
  it("renders cx-by-top / cx-by-bottom on the image; the extensions sheet grows it into the section's padding", () => {
    const s = section({
      elements: [headline(), image("e_a", "img_salon", { col: 7, span: 6, row: 1, rowSpan: 2, bleedY: "top" }, { order: 1, span: "full" }, { ratio: "fill" }), image("e_b", "img_team", { col: 1, span: 6, row: 2, bleedY: "bottom" }, { order: 2, span: "full" })],
    });
    const out = html(<Composed section={s} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/class="cx-el cx-el--image cx-ps-full cx-by-top cx-img cx-r-fill/);
    expect(out).toMatch(/class="cx-el cx-el--image cx-ps-full cx-by-bottom cx-img cx-r-1-1/);
    const f = flat(cssV2);
    expect(f).toMatch(/\.cx-img\.cx-by-top \{ --cx-by: 0px; margin-top: calc\(-1 \* var\(--cx-ptop\)\); \}/);
    expect(f).toMatch(/\.cx-img\.cx-by-bottom \{ --cx-by: 0px; margin-bottom: calc\(-1 \* var\(--space-section\)\); \}/);
  });
});

describe("5. a split headline shifted over the photo's edge", () => {
  const split = (shiftX: number) => section({ elements: [headline({ desk: { col: 1, span: 6, row: 1, shiftX, layer: 1 } }), image("e_p", "img_salon", { col: 7, span: 6, row: 1, rowSpan: 2, bleedX: "end" }, { order: 1, span: "full" }, { ratio: "fill" })] });

  it("writes the shift (3 steps, 60 px) and backs the headline with a panel over the photo", () => {
    const els = split(3).props.elements;
    expect(overPhoto(els[0]!, els)).toBe(true);
    const out = html(<Composed section={split(3)} ctx={testCtx()} index={0} />);
    expect(out).toMatch(/<h1[^>]*class="cx-el cx-el--heading cx-ps-full cx-over[^"]*"[^>]*style="[^"]*--sx:3/);
  });

  it("keeps a smaller shift as before: beside the photo, no panel", () => {
    const els = split(2).props.elements;
    expect(overPhoto(els[0]!, els)).toBe(false);
    const flipped = section({ elements: [image("e_p", "img_salon", { col: 1, span: 6, row: 1, rowSpan: 2 }, { order: 1, span: "full" }), headline({ desk: { col: 7, span: 6, row: 1, shiftX: -3, layer: 1 } })] }).props.elements;
    expect(overPhoto(flipped[1]!, flipped)).toBe(true);
  });
});

describe("6. the phone photo ribbon", () => {
  it("scrolls inside itself, and the section clips anything wider than the screen", () => {
    expect(flat(cssV2)).toMatch(/\.cx-ph__row \{ display: flex; gap: var\(--cx-gap\); overflow-x: auto;/);
    expect(flat(css)).toMatch(/\.s-composed \{ position: relative; isolation: isolate; overflow-x: clip;/);
  });
});
