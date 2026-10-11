/**
 * Blended-contrast guards (spec v20): G27 (text on a textured section), G3 with a photo treatment's worst case, G28 (the
 * field treatment and the frames), and the repair order of G4 after G9. The numbers come from composition/blend-meta.ts.
 * Contrasts on Tablica's palette (see composition-guards-v2.test.ts): onInverse over an inverse scrim 2.04 / 3.10 / 5.06 /
 * 8.68 at strength 1–4; with high-key's worst case 1.82 / 2.59 / 3.90 / 6.15, with tint's 1.56 / 2.02 / 2.72 / 3.74, with
 * dim's 6.15 / 7.88 / 10.15 / 12.70.
 */
import { describe, expect, it } from "vitest";
import { contrast, mix, repairComposition, validateComposition, TEXTURES, IMAGE_TREATMENTS, TEXTURE_META, TREATMENT_META, type Colors, type CompositionContext } from "../src/index.ts";
import { base, composed, heading, has, issue, onPage, photo, photos, repairPath, text } from "./helpers/composed.ts";

const PALETTE: Colors = {
  background: "#ffffff",
  surface: "#eef0f3",
  text: "#15181c",
  muted: "#4a525c",
  primary: "#15181c",
  onPrimary: "#ffffff",
  accent: "#b38f00",
  border: "#d9dee4",
  inverse: "#15181c",
  onInverse: "#f5f5f5",
  band: "#ffcc00",
  onBand: "#15181c",
};
const IMAGES = new Set(["img_01", "img_02", "img_03", "img_04", "img_05"]);
const ctxOf = (colors: Colors = PALETTE): CompositionContext => ({ colors, imageIds: IMAGES });
const paths = (r: { repairs: string[] }) => r.repairs.map(repairPath);
const photoLayer = (strength: number, treatment?: string) => ({ kind: "photo", image: "img_02", scrim: { role: "inverse", strength }, ...(treatment ? { treatment } : {}) });
// A section's props read loosely: the tests look at what a repair left in layers, elements and the surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (s: unknown) => (s as { props: Record<string, any> }).props;

describe("the meta tables cover every name", () => {
  it("has an entry per texture and per image treatment", () => {
    expect(Object.keys(TEXTURE_META).sort()).toEqual([...TEXTURES].sort());
    expect(Object.keys(TREATMENT_META).sort()).toEqual([...IMAGE_TREATMENTS].sort());
  });
});

describe("G3 with a photo treatment's worst case", () => {
  it("a plain photo and a neutral treatment are judged as before", () => {
    for (const t of [undefined, "none", "duotone", "toned"]) expect(validateComposition(composed(base(), { background: [photoLayer(3, t)] }, "inverse"), ctxOf())).toEqual([]);
  });

  it("a lightening treatment needs the scrim a step higher: high-key at 3 fails (3.90), 4 holds (6.15); repair raises the scrim and keeps the treatment", () => {
    const s = composed(base(), { background: [photoLayer(3, "high-key")] }, "inverse");
    expect(issue(s, /over the photo fails contrast \(3\.90 < 4\.5\)/, ctxOf())).toMatchObject({ code: "design", path: "/props/background/0/scrim" });
    const r = repairComposition(s, ctxOf());
    expect(paths(r)).toEqual(["/props/background/0/scrim/strength"]);
    expect(props(r.section).background[0]).toMatchObject({ treatment: "high-key", scrim: { strength: 4 } });
    expect(validateComposition(r.section, ctxOf())).toEqual([]);
  });

  it("when even the strongest scrim can't hold the treatment, the treatment is dropped and the scrim the plain photo needs stays", () => {
    const s = composed(base(), { background: [photoLayer(4, "tint")] }, "inverse");
    expect(issue(s, /over the photo fails contrast \(3\.74 < 4\.5\)/, ctxOf())).toBeDefined();
    const r = repairComposition(s, ctxOf());
    expect(paths(r)).toEqual(["/props/background/0/treatment"]);
    const layer = props(r.section).background[0];
    expect(layer.treatment).toBeUndefined();
    expect(layer.scrim.strength).toBe(4);
    expect(validateComposition(r.section, ctxOf())).toEqual([]);
  });

  it("an image element's scrim takes the treatment into account too", () => {
    const s = composed([base()[0]!, base()[1]!, photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2, "img_01", {}, { scrim: { role: "inverse", strength: 4 }, treatment: "tint" })], {}, "inverse");
    // the heading and the text sit in columns 1–6, the image in 8–12: nothing overlaps, so nothing is held to the scrim
    expect(has(s, /over the photo/, ctxOf())).toBe(false);
  });

  it("a darkening treatment (dim) is a relief for light text: it holds at scrim 1", () => {
    expect(validateComposition(composed(base(), { background: [photoLayer(1, "dim")] }, "inverse"), ctxOf())).toEqual([]);
    expect(has(composed(base(), { background: [photoLayer(1)] }, "inverse"), /over the photo/, ctxOf())).toBe(true);
  });
});

describe("G27 text on a texture", () => {
  /** muted on white is 4.54: it holds on the plain ground and misses once a texture mixes the ink in. */
  const WEAK: Colors = { ...PALETTE, muted: "#767676" };
  const section = (texture: string | undefined, rest: Record<string, unknown> = {}) =>
    composed([text("e_t", { col: 1, span: 6, row: 1 }, 0, { color: "muted" })], { ...(texture ? { surface: { texture } } : {}), ...rest });

  it("passes the plain ground and a texture where the ink keeps its contrast", () => {
    expect(contrast(WEAK.muted, WEAK.background)).toBeGreaterThanOrEqual(4.5);
    expect(validateComposition(section(undefined), ctxOf(WEAK))).toEqual([]);
    expect(validateComposition(section("none"), ctxOf(WEAK))).toEqual([]);
    expect(validateComposition(composed([text("e_t", { col: 1, span: 6, row: 1 }, 0)], { surface: { texture: "stone" } }), ctxOf())).toEqual([]);
  });

  it("rejects a texture the muted text can't hold; repair drops it", () => {
    const s = section("stone");
    const under = mix(WEAK.text, WEAK.background, TEXTURE_META.stone.maxAlpha);
    expect(contrast(WEAK.muted, under)).toBeLessThan(4.5);
    expect(issue(s, /muted on the "stone" texture over background fails contrast/, ctxOf(WEAK))).toMatchObject({ code: "design", path: "/props/surface/texture" });
    const r = repairComposition(s, ctxOf(WEAK));
    expect(paths(r)).toEqual(["/props/surface/texture"]);
    expect(props(r.section).surface.texture).toBeUndefined();
    expect(validateComposition(r.section, ctxOf(WEAK))).toEqual([]);
  });

  it("holds large text to 3:1", () => {
    const s = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { color: "muted", size: 4 })], { surface: { texture: "stone" } });
    expect(has(s, /texture/, ctxOf(WEAK))).toBe(false);
  });

  it("checks the ink on every tone's ground", () => {
    // band text on band: a palette whose onBand sits just over 4.5 on the band
    const near: Colors = { ...PALETTE, band: "#ffffff", onBand: "#767676" };
    const s = composed([text("e_t", { col: 1, span: 6, row: 1 }, 0)], { surface: { texture: "press-grain" } }, "band");
    expect(has(s, /onBand on the "press-grain" texture over band fails contrast/, ctxOf(near))).toBe(true);
    expect(has(composed([text("e_t", { col: 1, span: 6, row: 1 }, 0)], { surface: { texture: "press-grain" } }, "inverse"), /texture/, ctxOf())).toBe(false);
  });

  it("does not check a texture a photo layer hides", () => {
    const s = composed([text("e_t", { col: 1, span: 6, row: 1 }, 0, { color: "muted" })], { surface: { texture: "stone" }, background: [photoLayer(4)] }, "inverse");
    expect(has(s, /texture/, ctxOf(WEAK))).toBe(false);
  });
});

describe("G28 the field treatment and the frames", () => {
  const image = (mask: string, treatment = "field") => composed([photo("e_i", { col: 1, span: 5, row: 1 }, 0, "img_01", {}, { mask, treatment })]);

  it("rejects field with postcard, ruled and crop; repair drops the frame", () => {
    for (const mask of ["postcard", "ruled", "crop"]) {
      const s = image(mask);
      expect(issue(s, /the field treatment can't be combined with the .* frame/, ctxOf())).toMatchObject({ code: "structure", path: "/props/elements/0/mask" });
      const r = repairComposition(s, ctxOf());
      expect(paths(r)).toEqual(["/props/elements/0/mask"]);
      expect(props(r.section).elements[0].mask).toBeUndefined();
      expect(props(r.section).elements[0].treatment).toBe("field");
      expect(validateComposition(r.section, ctxOf())).toEqual([]);
    }
  });

  it("allows field with other masks, and the frames with other treatments", () => {
    expect(validateComposition(image("arch"), ctxOf())).toEqual([]);
    expect(validateComposition(image("postcard", "duotone"), ctxOf())).toEqual([]);
  });

  it("covers a photos element too", () => {
    const s = composed([photos("e_p", { col: 1, span: 6, row: 1 }, 0, { mask: "crop", treatment: "field" })]);
    expect(has(s, /field treatment can't be combined with the crop frame/, ctxOf())).toBe(true);
  });
});

describe("repair order: G4 after G9", () => {
  it("dropping the only field of a headerOver opener drops headerOver with it, and the repaired section validates", () => {
    // accent is dark here: the default text on an accent field fails, so G9 drops the field
    const colors: Colors = { ...PALETTE, accent: "#555555" };
    const elements = [heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 1, span: 6, row: 2 }, 1), photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2)];
    const s = composed(elements, { headerOver: true, background: [{ kind: "field", role: "accent", cols: { from: 1, to: 6 } }] });
    const ctx = onPage([s], 0, { colors, imageIds: IMAGES });
    expect(validateComposition(s, ctx).some((i) => i.path === "/props/background/0")).toBe(true);
    const r = repairComposition(s, ctx);
    expect(paths(r)).toEqual(expect.arrayContaining(["/props/background/0", "/props/headerOver"]));
    expect(props(r.section).headerOver).toBeUndefined();
    expect(props(r.section).background).toBeUndefined();
    expect(validateComposition(r.section, ctx)).toEqual([]);
  });

  it("keeps headerOver while a layer remains", () => {
    const s = composed(base(), { headerOver: true, background: [photoLayer(4)] }, "inverse");
    const r = repairComposition(s, onPage([s], 0, ctxOf()));
    expect(props(r.section).headerOver).toBe(true);
  });
});
