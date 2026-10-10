/**
 * Guards G1–G25 of composition language v2 (spec v20, docs/plans/studio-phase1-design.md §2 and §2.1): the failing tests
 * F1b-2b makes pass without changing them. Builders: ./helpers/composed.ts.
 *
 * THE MESSAGE CONTRACT (this block is the contract; tests pin each issue's `code`, `path` and a regex on its message).
 * Paths are JSON Pointers below ctx.at; `<i>` an element index, `<k>` a layer or item index. Repairs are pinned by the
 * path before ": " of each log line (the wording after it is free); suggested wording in brackets.
 *
 * G1  structure /props/background/<k>          composed: at most 2 background layers (has 3)
 *     structure /props/background/<k>          composed: at most one photo layer (has 2)  |  … one drawing layer (has 2)
 *     reference /props/background/<k>/image    unknown image img_x
 *     structure  …/image of the third use      composed: img_01 is used more than 2 times on the page   (layers count before elements)
 *     repair    /props/background/<k>          [extra photo layer dropped]
 * G2  structure /props/elements/<i>/desk       composed: e_x straddles field layer <k>; text sits wholly inside or outside a field
 *     structure /props/background/<k>          composed: field layer <k>: the elements inside it are not contiguous in reading order
 * G3  design    /props/background/<k>/scrim    composed: e_x over the photo fails contrast (2.04 < 4.5) …
 *     design    /props/elements/<i>/scrim      (an image element's scrim, same message)
 *     repair    …/scrim/strength               [scrim raised to 3]   — the lowest strength at which every text over it passes
 *     repair    /props/elements/<i>/scrim      [scrim dropped; the solid panel applies]   — an image's scrim failing at 4
 * G4  structure /props/headerOver              composed: headerOver only on the page's first section
 *     structure /props/headerOver              composed: headerOver needs a field or photo layer
 *     repair    /props/headerOver              [headerOver dropped]
 * G5  structure /props/top                     composed: a top edge can't be on the page's first section     repair: drop top
 *     structure /props/top/rise                composed: rise needs a different ground from the previous section     repair: rise → 0
 *     structure /props/top                     composed: the previous section already has a divider     repair: drop top
 *     structure /props/top/drawing             composed: top edge "drawing" needs a drawing  |  composed: top.drawing only with edge "drawing"
 * G6  structure /props/pin  (all)              composed: e_x crosses the pinned columns | at most 4 pinned elements (has 5) |
 *                                               pinned elements are not contiguous in reading order | e_x in the pin is taller than 4:5 |
 *                                               a pinned section needs at least 3 rows | nothing outside the pin spans more rows than it
 *     repair    /props/pin                     [pin dropped]
 * G7  structure /props/motion                  composed: motion "reveal" isn't allowed at motion level still
 *     structure /props/motion                  composed: at most 3 sections with motion per page at motion level calm (3 earlier on the page)
 *     structure /props/motion                  composed: the page's first section takes only motion that is safe at load ("reveal" isn't)
 *     structure /props/elements/<i>/move       composed: at most one moving ribbon per page  |  composed: e_r moves but the motion level is still
 *     repair    /props/motion, …/move          [motion dropped] [move dropped]
 * G8  reference …/<field>                      composed: unknown mask "blob" (not in MASKS)   — field = the key (mask, treatment, texture, edge, motion, drawing, fact)
 *     reference …/<field>                      composed: mask/arch is not an approved asset   — only with ctx.approved; "none" never needs approval
 *     repair    mask, treatment, texture, type treatment → "none"; fact treatment → "numeral"; edge → drop /props/top;
 *               motion → drop /props/motion; decor drawing → drop /props/elements/<i>; drawing layer → drop /props/background/<k>
 *               (an emptied background is deleted)
 * G9  design    /props/elements/<i>/color      composed: e_x: border on background fails contrast (1.35 < 4.5)   — "<fg role> on <ground role>"
 *     design    /props/background/<k>/color    composed: drawing layer <k> is not quiet (17.81 > 1.6 against background)
 *     repair    …/color                        [color dropped]; then …/fill if the default text still fails; a drawing's ink → "border" if quiet, else drop the layer
 * G10 structure /props/elements/<i>/desk/tilt  composed: e_x (heading) can't tilt   (fact numeral: "e_x (fact numeral) can't tilt")     repair: drop
 * G11 structure …/desk/bleedX                  composed: e_x (text) can't bleed  |  composed: e_x bleeds to the start but doesn't touch column 1 (… end … column 12)
 *     structure …/desk/bleedY                  composed: e_x (heading) can't bleed past the section     repair: drop
 * G12 structure …/phone/span                   composed: e_x (text) can't bleed on phones  |  composed: e_x (text) can't be half width on phones     repair: → "full"
 * G13 structure …/desk/span                    composed: running text spans 4–8 columns on desktop (e_x spans 3)   (unchanged)     repair: clamp (unchanged)
 * G14 reference …/link                         composed: e_x links to call but the business has no phone   (directions → address, booking → bookingUrl, email → email)
 *     banned    …/link of the 2nd call         composed: at most one call action per section   (unchanged message; a fact's call link counts)
 *     repair    …/link                         [link dropped]   — with a call action, the fact's call link is the one dropped
 * G15 structure …/plateCode                    composed: e_x: plateCode only on a plate     repair: drop
 * G16 structure …/items/<k>                    composed: e_x: a timeline (marker line) needs a lead on every item
 *     structure …/marker                       composed: e_x: marker "drawing" needs a drawing     repair: drop marker
 *     structure …/drawing                      composed: e_x: a drawing only with marker "drawing"     repair: drop drawing
 *     banned    …/items/<k>/lead               numbered label: "01"
 * G17 structure …/phoneColumns                 composed: e_x can't set 2 columns on phones (…)     repair: → 1
 * G18 structure /props/elements/<i>            composed: e_x needs exactly one of motif and svg (or drawing)   (keeps the v19 wording)
 *     structure …/size                         composed: e_x: size only with fit "fixed"  |  composed: e_x: fit "fixed" needs a size
 * G19 banned    …/repeat                       composed: e_x: repeat only with a repeatable drawing     repair: drop
 * G20 structure …/treatment                    composed: e_x: stacked takes at most 4 lines (has 5)  |  composed: e_x: knockout only over a photo or a field     repair: drop
 * G21 structure …/images                       composed: e_x: fan takes 2–4 photos (has 5)  |  strip takes 3–12 …  |  before-after takes exactly 2 photos (has 3)
 *     structure …/images                       composed: e_x: before-after only with the client's own photos   (ctx.images origin)
 *     reference …/images/<k>                   unknown image img_x;   structure …/image(s/<k>) of the third use: composed: img_01 is used more than 2 times on the page
 * G22 structure /props/elements/<i>            composed: at most one sticker per section | at most 2 stickers per page | at most one wordmark per page | at most one quote per section
 *     repair    /props/elements/<i>            [sticker dropped] [wordmark dropped]; quotes are not repaired
 * G23 (unchanged messages and repair)          composed: e_x (ribbon) carries words and can't be hidden on phones;  e_x overlaps e_y on desktop; text never overlaps text
 * G24 (unchanged message)                      composed: one display size … per section; composed: at most 2 display sizes per page
 * G25 (unchanged message)                      row of three icon cards: …
 *
 * Contrast (G3, G9): "large" = heading size ≥ 3, fact size ≥ 4, every sticker (3:1); else 4.5:1. A text's colour is its
 * `color`, else onRole(ground): background/surface → text, inverse → onInverse, band → onBand, primary → onPrimary. Its
 * ground: own `fill` > a field layer it lies in > the tone (default → background, alt → surface, inverse → inverse,
 * band → band ?? primary). Over a photo (a photo layer, or overlapping an image with a scrim) G3 decides, not G9. mix() is
 * per sRGB channel: mix(a, b, α) = α·a + (1 − α)·b.
 */
import { describe, expect, it } from "vitest";
import {
  BACKGROUND_LIMITS,
  CONTRAST_MIN,
  LARGE_TEXT,
  MOTION_BUDGET,
  PHOTOS_COUNT,
  PIN_LIMITS,
  QUIET_INK_MAX,
  SCRIM_ALPHA,
  compositionContext,
  isTextBearing,
  repairComposition,
  validateComposition,
  validateSite,
  type Colors,
  type ComposedSection,
  type CompositionContext,
  Element,
  Section,
  type SiteSpec,
} from "../src/index.ts";
import {
  GOLDEN_IDS,
  action,
  base,
  composed,
  composedFixture,
  decor,
  el,
  fact,
  golden,
  has,
  heading,
  iconFacts,
  issue,
  list,
  map,
  onPage,
  photo,
  photos,
  prices,
  quote,
  repairPath,
  ribbon,
  sticker,
  text,
  withId,
  wordmark,
  type Phone,
} from "./helpers/composed.ts";

/** Tablica's palette (tools/eval/composed/m.json). Contrasts used below: onInverse over an inverse scrim 2.04 / 3.10 / 5.06 / 8.68 at strength 1–4; accent on background 3.07; border on background 1.35; background on band 1.51; text on inverse 1.00; primary on background 17.81. */
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
const C: CompositionContext = { colors: PALETTE, imageIds: IMAGES };
const ctxWith = (extra: Partial<CompositionContext>): CompositionContext => ({ ...C, ...extra });

const photoLayer = (strength: number, image = "img_02", role = "inverse") => ({ kind: "photo", image, scrim: { role, strength } });
const field = (role: string, cols?: [number, number], rows?: [number, number]) => ({ kind: "field", role, ...(cols ? { cols: { from: cols[0], to: cols[1] } } : {}), ...(rows ? { rows: { from: rows[0], to: rows[1] } } : {}) });
const drawingLayer = (drawing = "motif/bakery/wheat-ear-line", color?: string) => ({ kind: "drawing", drawing, scale: 2, anchor: "end", ...(color ? { color } : {}) });
const paths = (r: { repairs: string[] }) => r.repairs.map(repairPath);
const props = (s: ComposedSection) => s.props as ComposedSection["props"] & Record<string, unknown>;
const elAt = (s: ComposedSection, i: number) => s.props.elements[i] as unknown as Record<string, unknown> & { desk: Record<string, unknown>; phone: Record<string, unknown> };
/** A quiet section before the one under test (no motion, no divider, default tone). */
const quiet = (id = "s_q") => withId(composed(base()), id);

describe("v20 limits are exported", () => {
  it("names the numbers the rules use", () => {
    expect(CONTRAST_MIN).toEqual({ text: 4.5, large: 3 });
    expect(LARGE_TEXT).toEqual({ headingSize: 3, factSize: 4 });
    expect(SCRIM_ALPHA).toEqual([0.35, 0.5, 0.65, 0.8]);
    expect(QUIET_INK_MAX).toBe(1.6);
    expect(BACKGROUND_LIMITS).toEqual({ layers: 2, photos: 1, drawings: 1 });
    expect(PIN_LIMITS).toEqual({ maxElements: 4, minRows: 3 });
    expect(MOTION_BUDGET).toEqual({ still: 0, calm: 3, lively: 5 });
    expect(PHOTOS_COUNT["before-after"]).toEqual([2, 2]);
  });
});

describe("G1 background layers", () => {
  it("passes one photo layer and a field with a drawing", () => {
    expect(validateComposition(composed(base(), { background: [photoLayer(4)] }, "inverse"), C)).toEqual([]);
    expect(validateComposition(composed(base(), { background: [field("surface", [1, 6]), drawingLayer("motif/bakery/wheat-ear-line", "border")] }), C)).toEqual([]);
  });

  it("rejects a second photo layer and a second drawing layer", () => {
    const two = composed(base(), { background: [photoLayer(4), photoLayer(4, "img_03")] }, "inverse");
    expect(issue(two, /at most one photo layer \(has 2\)/, C)).toMatchObject({ code: "structure", path: "/props/background/1" });
    const draw = composed(base(), { background: [drawingLayer(undefined, "border"), drawingLayer("ornament/rope-line", "border")] });
    expect(issue(draw, /at most one drawing layer \(has 2\)/, C)).toMatchObject({ code: "structure", path: "/props/background/1" });
  });

  it("rejects more than 2 layers (the schema's max, checked again for unparsed input)", () => {
    const three = composed(base(), { background: [field("surface", [1, 6]), field("surface", [7, 12]), drawingLayer(undefined, "border")] });
    expect(issue(three, /at most 2 background layers \(has 3\)/, C)).toMatchObject({ code: "structure", path: "/props/background/2" });
  });

  it("repairs by dropping the extra layers", () => {
    const two = composed(base(), { background: [photoLayer(4), photoLayer(4, "img_03")] }, "inverse");
    const r = repairComposition(two, C);
    expect(paths(r)).toEqual(["/props/background/1"]);
    expect(props(r.section).background).toEqual([photoLayer(4)]);
    expect(has(r.section, /photo layer/, C)).toBe(false);
    const three = composed(base(), { background: [field("surface", [1, 6]), field("surface", [7, 12]), drawingLayer(undefined, "border")] });
    expect(props(repairComposition(three, C).section).background).toHaveLength(2);
  });

  it("needs the layer's photo to exist and counts it toward 2 uses per page (layers before elements)", () => {
    const missing = composed(base(), { background: [photoLayer(4, "img_missing")] }, "inverse");
    expect(issue(missing, /unknown image img_missing/, C)).toMatchObject({ code: "reference", path: "/props/background/0/image" });
    const els = [heading("e_head", { col: 1, span: 6, row: 1 }, 0), photo("e_a", { col: 8, span: 5, row: 1 }, 1, "img_01"), photo("e_b", { col: 8, span: 5, row: 2 }, 2, "img_01")];
    const thrice = composed(els, { background: [photoLayer(4, "img_01")] }, "inverse");
    expect(issue(thrice, /img_01 is used more than 2 times on the page/, C)).toMatchObject({ code: "structure", path: "/props/elements/2/image" });
    expect(has(composed(els.slice(0, 2), { background: [photoLayer(4, "img_01")] }, "inverse"), /used more than/, C)).toBe(false);
    // An earlier section's photo layer counts too.
    const earlier = withId(composed(base().slice(0, 2), { background: [photoLayer(4, "img_01")] }, "inverse"), "s_e");
    expect(has(composed(els.slice(0, 2)), /img_01 is used more than 2 times/, onPage([earlier, earlier, composed(els.slice(0, 2))], 2, C))).toBe(true);
  });
});

describe("G2 field layers", () => {
  it("passes text wholly inside or outside a field, and a photo across its edge", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 1, span: 6, row: 2 }, 1), photo("e_photo", { col: 5, span: 8, row: 1, rowSpan: 3 }, 2)], { background: [field("surface", [1, 6])] });
    expect(validateComposition(s, C)).toEqual([]);
    const outside = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 8, span: 5, row: 2 }, 1)], { background: [field("surface", [1, 6])] });
    expect(validateComposition(outside, C)).toEqual([]);
  });

  it("rejects text across a field's edge", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 4, span: 6, row: 2 }, 1)], { background: [field("surface", [1, 6])] });
    expect(issue(s, /e_text straddles field layer 0; text sits wholly inside or outside a field/, C)).toMatchObject({ code: "structure", path: "/props/elements/1/desk" });
    const byRow = composed([heading("e_head", { col: 1, span: 6, row: 1, rowSpan: 2 }, 0)], { background: [field("surface", [1, 6], [2, 3])] });
    expect(has(byRow, /e_head straddles field layer 0/, C)).toBe(true);
  });

  it("lets text with its own fill cross a field's edge", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 4, span: 6, row: 2 }, 1, { fill: "surface" })], { background: [field("surface", [1, 6])] });
    expect(has(s, /straddles/, C)).toBe(false);
  });

  it("needs the elements inside a field to be contiguous in reading order (a band on phones)", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), photo("e_photo", { col: 8, span: 5, row: 1 }, 1), text("e_text", { col: 1, span: 6, row: 2 }, 2)], { background: [field("surface", [1, 6])] });
    expect(issue(s, /field layer 0: the elements inside it are not contiguous in reading order/, C)).toMatchObject({ code: "structure", path: "/props/background/0" });
  });
});

describe("G3 contrast over a photo", () => {
  it("passes text over a photo layer whose scrim holds over black and white", () => {
    expect(validateComposition(composed(base(), { background: [photoLayer(3)] }, "inverse"), C)).toEqual([]);
  });

  it("rejects a scrim too thin for the text over it, at the layer's scrim", () => {
    const s = composed(base(), { background: [photoLayer(1)] }, "inverse");
    expect(issue(s, /e_text over the photo fails contrast \([\d.]+ < 4\.5\)/, C)).toMatchObject({ code: "design", path: "/props/background/0/scrim" });
    expect(has(s, /e_head over the photo fails contrast \([\d.]+ < 3\)/, C)).toBe(true);
    expect(has(s, /over the photo/)).toBe(false); // no colours, no check
  });

  it("repairs by raising the strength to the lowest that passes every text (normal 4.5:1 → 3, large only 3:1 → 2)", () => {
    const r = repairComposition(composed(base(), { background: [photoLayer(1)] }, "inverse"), C);
    expect(paths(r)).toEqual(["/props/background/0/scrim/strength"]);
    expect(props(r.section).background).toEqual([photoLayer(3)]);
    expect(validateComposition(r.section, C)).toEqual([]);
    const large = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { size: 3 })], { background: [photoLayer(1)] }, "inverse");
    expect(props(repairComposition(large, C).section).background).toEqual([photoLayer(2)]);
  });

  it("checks text overlapping an image with a scrim", () => {
    const over = (strength: number, rest: Record<string, unknown> = {}, tone?: "inverse") =>
      composed([photo("e_photo", { col: 1, span: 12, row: 1, rowSpan: 3 }, 0, "img_01", {}, { scrim: { role: "inverse", strength } }), heading("e_head", { col: 2, span: 6, row: 2, layer: 1 }, 1, { size: 2, ...rest })], {}, tone);
    expect(validateComposition(over(3, {}, "inverse"), C)).toEqual([]);
    expect(issue(over(1, {}, "inverse"), /e_head over the photo fails contrast/, C)).toMatchObject({ code: "design", path: "/props/elements/0/scrim" });
    const r = repairComposition(over(1, {}, "inverse"), C);
    expect(paths(r)).toEqual(["/props/elements/0/scrim/strength"]);
    expect(elAt(r.section, 0).scrim).toEqual({ role: "inverse", strength: 3 });
  });

  it("drops an image's scrim when even strength 4 fails, so the solid panel applies", () => {
    const s = composed([photo("e_photo", { col: 1, span: 12, row: 1, rowSpan: 3 }, 0, "img_01", {}, { scrim: { role: "inverse", strength: 2 } }), heading("e_head", { col: 2, span: 6, row: 2, layer: 1 }, 1, { size: 2, color: "primary" })]);
    expect(has(s, /e_head over the photo fails contrast/, C)).toBe(true);
    const r = repairComposition(s, C);
    expect(paths(r)).toEqual(["/props/elements/0/scrim"]);
    expect(elAt(r.section, 0).scrim).toBeUndefined();
    expect(has(r.section, /over the photo/, C)).toBe(false);
  });
});

describe("G4 header over the first section", () => {
  const over = (layers: unknown[] | undefined) => composed(base(), { headerOver: true, ...(layers ? { background: layers } : {}) }, "inverse");

  it("passes on the page's first section with a photo or field layer", () => {
    expect(has(over([photoLayer(4)]), /headerOver/, onPage([over([photoLayer(4)])], 0, C))).toBe(false);
    expect(has(over([field("inverse")]), /headerOver/, onPage([over([field("inverse")])], 0, C))).toBe(false);
  });

  it("rejects it on a later section or without a layer, and repairs by dropping it", () => {
    const later = over([photoLayer(4)]);
    expect(issue(later, /headerOver only on the page's first section/, onPage([quiet(), later], 1, C))).toMatchObject({ code: "structure", path: "/props/headerOver" });
    const bare = over(undefined);
    expect(issue(bare, /headerOver needs a field or photo layer/, onPage([bare], 0, C))).toMatchObject({ code: "structure", path: "/props/headerOver" });
    const r = repairComposition(later, onPage([quiet(), later], 1, C));
    expect(paths(r)).toEqual(["/props/headerOver"]);
    expect(props(r.section).headerOver).toBeUndefined();
  });

  it.todo("checks the header's text over the band photo (360 px) and the layer (1280 px): needs the header's tone in the context");
});

describe("G5 top edge", () => {
  const top = (t: Record<string, unknown>, tone?: "inverse") => composed(base(), { top: t }, tone);

  it("passes an edge rising over a section of a different ground", () => {
    const s = top({ edge: "cut", rise: 1 }, "inverse");
    expect(validateComposition(s, onPage([quiet(), s], 1, C))).toEqual([]);
    const flat = top({ edge: "torn" });
    expect(validateComposition(flat, onPage([quiet(), flat], 1, C))).toEqual([]);
  });

  it("rejects a top edge on the first section and repairs by dropping it", () => {
    const s = top({ edge: "cut" });
    expect(issue(s, /a top edge can't be on the page's first section/, onPage([s], 0, C))).toMatchObject({ code: "structure", path: "/props/top" });
    const r = repairComposition(s, onPage([s], 0, C));
    expect(paths(r)).toEqual(["/props/top"]);
    expect(props(r.section).top).toBeUndefined();
  });

  it("rejects a rise over the same ground and repairs it to 0", () => {
    const s = top({ edge: "cut", rise: 2 });
    expect(issue(s, /rise needs a different ground from the previous section/, onPage([quiet(), s], 1, C))).toMatchObject({ code: "structure", path: "/props/top/rise" });
    const r = repairComposition(s, onPage([quiet(), s], 1, C));
    expect(paths(r)).toEqual(["/props/top/rise"]);
    expect((props(r.section).top as { rise?: number }).rise ?? 0).toBe(0);
    expect((props(r.section).top as { edge: string }).edge).toBe("cut");
  });

  it("rejects a second divider on one boundary and repairs by dropping this top", () => {
    const prev = withId(composed(base(), { surface: { divider: "rule" } }), "s_p");
    const s = top({ edge: "cut" }, "inverse");
    expect(issue(s, /the previous section already has a divider/, onPage([prev, s], 1, C))).toMatchObject({ code: "structure", path: "/props/top" });
    expect(paths(repairComposition(s, onPage([prev, s], 1, C)))).toEqual(["/props/top"]);
    const none = withId(composed(base(), { surface: { divider: "none" } }), "s_p");
    expect(has(s, /divider/, onPage([none, s], 1, C))).toBe(false);
  });

  it("needs a drawing exactly for edge \"drawing\"", () => {
    const missing = top({ edge: "drawing" });
    expect(issue(missing, /top edge "drawing" needs a drawing/, onPage([quiet(), missing], 1, C))).toMatchObject({ code: "structure", path: "/props/top/drawing" });
    const stray = top({ edge: "torn", drawing: "ornament/rope-line" });
    expect(issue(stray, /top\.drawing only with edge "drawing"/, onPage([quiet(), stray], 1, C))).toMatchObject({ code: "structure", path: "/props/top/drawing" });
    const ok = top({ edge: "drawing", drawing: "ornament/rope-line" });
    expect(has(ok, /drawing/, onPage([quiet(), ok], 1, C))).toBe(false);
  });
});

describe("G6 pinned column", () => {
  const pinned = (extra: Element[] = [], over: Record<string, unknown> = {}, sideRows = 4) =>
    composed([heading("e_head", { col: 1, span: 5, row: 1 }, 0), text("e_text", { col: 1, span: 5, row: 2 }, 1), ...extra, photo("e_photo", { col: 7, span: 6, row: 1, rowSpan: sideRows }, 9)], { rows: 4, pin: { col: 1, span: 5 }, ...over });
  const pinIssue = (s: ComposedSection, re: RegExp) => issue(s, re, C);

  it("passes a short pinned column beside a taller one", () => {
    expect(validateComposition(pinned(), C)).toEqual([]);
  });

  it("rejects what doesn't fit a pin, always at /props/pin", () => {
    const crossing = composed([heading("e_head", { col: 1, span: 5, row: 1 }, 0), text("e_text", { col: 3, span: 6, row: 2 }, 1), photo("e_photo", { col: 10, span: 3, row: 1, rowSpan: 4 }, 2)], { rows: 4, pin: { col: 1, span: 5 } });
    expect(pinIssue(crossing, /e_text crosses the pinned columns/)).toMatchObject({ code: "structure", path: "/props/pin" });
    const five = pinned([fact("e_f1", { col: 1, span: 2, row: 3 }, 2), fact("e_f2", { col: 4, span: 2, row: 3 }, 3), decor("e_d", { col: 1, span: 1, row: 4 }, 4)], { rows: 4 }, 4);
    expect(pinIssue(five, /at most 4 pinned elements \(has 5\)/)).toMatchObject({ path: "/props/pin" });
    const split = composed([heading("e_head", { col: 1, span: 5, row: 1 }, 0), photo("e_photo", { col: 7, span: 6, row: 1, rowSpan: 4 }, 1), text("e_text", { col: 1, span: 5, row: 2 }, 2)], { rows: 4, pin: { col: 1, span: 5 } });
    expect(pinIssue(split, /pinned elements are not contiguous in reading order/)).toMatchObject({ path: "/props/pin" });
    const tall = pinned([photo("e_tall", { col: 1, span: 5, row: 3 }, 2, "img_03", {}, { ratio: "3:4" })]);
    expect(pinIssue(tall, /e_tall in the pin is taller than 4:5/)).toMatchObject({ path: "/props/pin" });
    const short = composed([heading("e_head", { col: 1, span: 5, row: 1 }, 0), photo("e_photo", { col: 7, span: 6, row: 1, rowSpan: 2 }, 1)], { rows: 2, pin: { col: 1, span: 5 } });
    expect(pinIssue(short, /a pinned section needs at least 3 rows/)).toMatchObject({ path: "/props/pin" });
    expect(pinIssue(pinned([], {}, 2), /nothing outside the pin spans more rows than it/)).toMatchObject({ path: "/props/pin" });
  });

  it("repairs by dropping the pin", () => {
    const r = repairComposition(pinned([], {}, 2), C);
    expect(paths(r)).toEqual(["/props/pin"]);
    expect(props(r.section).pin).toBeUndefined();
  });
});

describe("G7 motion", () => {
  const moving = (id: string, motion = "reveal") => withId(composed(base(), { motion }), id);

  it("passes motion within the level's budget, after the first section", () => {
    const s = moving("s_m");
    expect(validateComposition(s, onPage([quiet(), s], 1, ctxWith({ motionLevel: "calm" })))).toEqual([]);
  });

  it("rejects any motion at level still and repairs by dropping it", () => {
    const s = moving("s_m");
    const ctx = onPage([quiet(), s], 1, ctxWith({ motionLevel: "still" }));
    expect(issue(s, /motion "reveal" isn't allowed at motion level still/, ctx)).toMatchObject({ code: "structure", path: "/props/motion" });
    const r = repairComposition(s, ctx);
    expect(paths(r)).toEqual(["/props/motion"]);
    expect(props(r.section).motion).toBeUndefined();
  });

  it("allows 3 sections with motion per page at calm and 5 at lively", () => {
    const page = [quiet(), moving("s_1"), moving("s_2"), moving("s_3"), moving("s_4")];
    expect(issue(page[4]!, /at most 3 sections with motion per page/, onPage(page, 4, ctxWith({ motionLevel: "calm" })))).toMatchObject({ code: "structure", path: "/props/motion" });
    expect(has(page[3]!, /sections with motion/, onPage(page, 3, ctxWith({ motionLevel: "calm" })))).toBe(false);
    expect(has(page[4]!, /sections with motion/, onPage(page, 4, ctxWith({ motionLevel: "lively" })))).toBe(false);
    const six = [...page, moving("s_5"), moving("s_6")];
    expect(has(six[6]!, /at most 5 sections with motion per page/, onPage(six, 6, ctxWith({ motionLevel: "lively" })))).toBe(true);
  });

  it("allows only motion safe at load on the page's first section", () => {
    const s = moving("s_m");
    const ctx = onPage([s], 0, ctxWith({ motionLevel: "lively" }));
    expect(issue(s, /the page's first section takes only motion that is safe at load/, ctx)).toMatchObject({ code: "structure", path: "/props/motion" });
    expect(paths(repairComposition(s, ctx))).toEqual(["/props/motion"]);
  });

  it("allows one moving ribbon per page and none at level still", () => {
    const two = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), ribbon("e_r1", { col: 1, span: 12, row: 2 }, 1, { move: "drift" }), ribbon("e_r2", { col: 1, span: 12, row: 3 }, 2, { move: "drift" })]);
    const ctx = onPage([quiet(), two], 1, ctxWith({ motionLevel: "lively" }));
    expect(issue(two, /at most one moving ribbon per page/, ctx)).toMatchObject({ code: "structure", path: "/props/elements/2/move" });
    const r = repairComposition(two, ctx);
    expect(paths(r)).toEqual(["/props/elements/2/move"]);
    expect(elAt(r.section, 1).move).toBe("drift");
    expect(elAt(r.section, 2).move).toBeUndefined();
    const one = composed(two.props.elements.slice(0, 2));
    expect(validateComposition(one, onPage([quiet(), one], 1, ctxWith({ motionLevel: "lively" })))).toEqual([]);
    const earlier = withId(one, "s_e");
    expect(has(one, /at most one moving ribbon per page/, onPage([earlier, one], 1, ctxWith({ motionLevel: "lively" })))).toBe(true);
    const still = onPage([quiet(), one], 1, ctxWith({ motionLevel: "still" }));
    expect(issue(one, /e_r1 moves but the motion level is still/, still)).toMatchObject({ path: "/props/elements/1/move" });
    expect(paths(repairComposition(one, still))).toEqual(["/props/elements/1/move"]);
  });

  it.todo("calm allows entrance presets only; scroll presets need lively (no scroll preset in MOTIONS yet)");
  it.todo("`loop` only on a ribbon, which renders a pause control (no `loop` in MOTIONS / ribbon.move yet)");
  it.todo("`counter` only on a fact whose value is a client number (no `counter` in MOTIONS yet)");
});

describe("G8 vocabulary names", () => {
  it("passes names from the lists", () => {
    const s = composed(
      [
        heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "stacked", text: "Kruh iz peči" }),
        fact("e_fact", { col: 1, span: 4, row: 2 }, 1, { treatment: "seal" }),
        photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2, "img_01", {}, { mask: "arch", treatment: "duotone" }),
        decor("e_d", { col: 6, span: 2, row: 3 }, 3, { motif: undefined, drawing: "motif/bakery/wheat-ear-line" }),
      ],
      { surface: { texture: "grain" } },
    );
    expect(has(s, /not in [A-Z_]+/, C)).toBe(false);
  });

  it("rejects unknown names, at their field", () => {
    const img = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1 }, 2, "img_01", {}, { mask: "blob", treatment: "sepia" })], { surface: { texture: "dots" } });
    expect(issue(img, /unknown mask "blob" \(not in MASKS\)/, C)).toMatchObject({ code: "reference", path: "/props/elements/2/mask" });
    expect(issue(img, /unknown treatment "sepia" \(not in IMAGE_TREATMENTS\)/, C)).toMatchObject({ path: "/props/elements/2/treatment" });
    expect(issue(img, /unknown texture "dots" \(not in TEXTURES\)/, C)).toMatchObject({ path: "/props/surface/texture" });
    const f = composed([fact("e_fact", { col: 1, span: 4, row: 1 }, 0, { treatment: "medal" })]);
    expect(issue(f, /unknown treatment "medal" \(not in FACT_OBJECTS\)/, C)).toMatchObject({ path: "/props/elements/0/treatment" });
    const h = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "wobble" })]);
    expect(issue(h, /unknown treatment "wobble" \(not in TYPE_TREATMENTS\)/, C)).toMatchObject({ path: "/props/elements/0/treatment" });
    const icons = composed([iconFacts("e_i", { col: 1, span: 6, row: 1 }, 0, { items: [{ fact: "sauna" }] })]);
    expect(issue(icons, /unknown fact "sauna" \(not in PRACTICAL_FACTS\)/, C)).toMatchObject({ path: "/props/elements/0/items/0/fact" });
    const edge = composed(base(), { top: { edge: "zigzag" } }, "inverse");
    expect(issue(edge, /unknown edge "zigzag" \(not in EDGES\)/, onPage([quiet(), edge], 1, C))).toMatchObject({ path: "/props/top/edge" });
    const motion = composed(base(), { motion: "spin" });
    expect(issue(motion, /unknown motion "spin" \(not in MOTIONS\)/, onPage([quiet(), motion], 1, C))).toMatchObject({ path: "/props/motion" });
    const d = composed([...base(), decor("e_d", { col: 6, span: 2, row: 3 }, 3, { motif: undefined, drawing: "ornament/nope" })]);
    expect(issue(d, /unknown drawing "ornament\/nope" \(not in DRAWINGS\)/, C)).toMatchObject({ path: "/props/elements/3/drawing" });
    const layer = composed(base(), { background: [drawingLayer("ornament/nope", "border")] });
    expect(issue(layer, /unknown drawing "ornament\/nope" \(not in DRAWINGS\)/, C)).toMatchObject({ path: "/props/background/0/drawing" });
  });

  it("with ctx.approved, needs every named asset approved (\"none\" needs nothing)", () => {
    const s = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1 }, 2, "img_01", {}, { mask: "arch", treatment: "none" })]);
    expect(issue(s, /mask\/arch is not an approved asset/, ctxWith({ approved: new Set(["mask/circle"]) }))).toMatchObject({ code: "reference", path: "/props/elements/2/mask" });
    expect(has(s, /approved/, ctxWith({ approved: new Set(["mask/arch"]) }))).toBe(false);
    expect(has(s, /approved/, C)).toBe(false);
    const d = composed([...base(), decor("e_d", { col: 6, span: 2, row: 3 }, 3, { motif: undefined, drawing: "ornament/rope-line" })]);
    expect(has(d, /ornament\/rope-line is not an approved asset/, ctxWith({ approved: new Set(["mask/arch"]) }))).toBe(true);
  });

  it("repairs element names to their neutral value", () => {
    const s = composed(
      [
        heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "wobble" }),
        fact("e_fact", { col: 1, span: 4, row: 2 }, 1, { treatment: "medal" }),
        photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2, "img_01", {}, { mask: "blob", treatment: "sepia" }),
      ],
      { surface: { texture: "dots" } },
    );
    const r = repairComposition(s, C);
    expect(paths(r).sort()).toEqual(["/props/elements/0/treatment", "/props/elements/1/treatment", "/props/elements/2/mask", "/props/elements/2/treatment", "/props/surface/texture"]);
    expect(elAt(r.section, 0).treatment).toBe("none");
    expect(elAt(r.section, 1).treatment).toBe("numeral");
    expect(elAt(r.section, 2)).toMatchObject({ mask: "none", treatment: "none" });
    expect(props(r.section).surface).toEqual({ texture: "none" });
    expect(has(r.section, /not in [A-Z_]+/, C)).toBe(false);
  });

  it("repairs section names by dropping them, and unknown drawings by dropping their element or layer", () => {
    const s = composed(base(), { top: { edge: "zigzag" }, motion: "spin" }, "inverse");
    const r = repairComposition(s, onPage([quiet(), s], 1, C));
    expect(paths(r).sort()).toEqual(["/props/motion", "/props/top"]);
    expect(props(r.section).top).toBeUndefined();
    expect(props(r.section).motion).toBeUndefined();
    const d = composed([...base(), decor("e_d", { col: 6, span: 2, row: 3 }, 3, { motif: undefined, drawing: "ornament/nope" })]);
    const rd = repairComposition(d, C);
    expect(paths(rd)).toEqual(["/props/elements/3"]);
    expect(rd.section.props.elements.map((e) => e.id)).toEqual(["e_head", "e_text", "e_photo"]);
    const layer = composed(base(), { background: [field("surface", [1, 6]), drawingLayer("ornament/nope", "border")] });
    const rl = repairComposition(layer, C);
    expect(paths(rl)).toEqual(["/props/background/1"]);
    expect(props(rl.section).background).toEqual([field("surface", [1, 6])]);
    const only = repairComposition(composed(base(), { background: [drawingLayer("ornament/nope", "border")] }), C);
    expect(props(only.section).background).toBeUndefined();
  });
});

describe("G9 element colours", () => {
  it("passes colours that hold against their ground (large text 3:1)", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { color: "accent", size: 3 }), text("e_text", { col: 1, span: 6, row: 2 }, 1, { color: "muted" }), sticker("e_s", { col: 8, span: 3, row: 1 }, 2, { fill: "band" })]);
    expect(validateComposition(s, C)).toEqual([]);
  });

  it("rejects a colour that fails against the tone's ground, and repairs by dropping it", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { color: "accent", size: 2 }), text("e_text", { col: 1, span: 6, row: 2 }, 1, { color: "border" })]);
    expect(issue(s, /e_text: border on background fails contrast \([\d.]+ < 4\.5\)/, C)).toMatchObject({ code: "design", path: "/props/elements/1/color" });
    expect(issue(s, /e_head: accent on background fails contrast \([\d.]+ < 4\.5\)/, C)).toMatchObject({ path: "/props/elements/0/color" });
    const r = repairComposition(s, C);
    expect(paths(r)).toEqual(["/props/elements/0/color", "/props/elements/1/color"]);
    expect(elAt(r.section, 1).color).toBeUndefined();
    expect(validateComposition(r.section, C)).toEqual([]);
    expect(has(s, /fails contrast/)).toBe(false); // no colours, no check
  });

  it("reads the ground from a field the element lies in, and from its own fill first", () => {
    const inField = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { color: "text" })], { background: [field("inverse", [1, 6])] });
    expect(has(inField, /e_head: text on inverse fails contrast/, C)).toBe(true);
    const onFill = composed([sticker("e_s", { col: 8, span: 3, row: 1 }, 0, { fill: "band", color: "background" })]);
    expect(issue(onFill, /e_s: background on band fails contrast \([\d.]+ < 3\)/, C)).toMatchObject({ path: "/props/elements/0/color" });
    const r = repairComposition(onFill, C);
    expect(paths(r)).toEqual(["/props/elements/0/color"]);
    expect(elAt(r.section, 0)).toMatchObject({ fill: "band" });
  });

  it("keeps a background drawing quiet and repairs its ink to border", () => {
    const quietInk = composed(base(), { background: [drawingLayer(undefined, "border")] });
    expect(validateComposition(quietInk, C)).toEqual([]);
    const loud = composed(base(), { background: [drawingLayer(undefined, "primary")] });
    expect(issue(loud, /drawing layer 0 is not quiet \([\d.]+ > 1\.6 against background\)/, C)).toMatchObject({ code: "design", path: "/props/background/0/color" });
    const r = repairComposition(loud, C);
    expect(paths(r)).toEqual(["/props/background/0/color"]);
    expect(props(r.section).background).toEqual([drawingLayer(undefined, "border")]);
  });
});

describe("G10 tilt", () => {
  const tilted = (e: Element) => composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), e]);

  it("passes tilt on a fact object, a sticker, a photo and a drawing", () => {
    expect(validateComposition(tilted(fact("e_f", { col: 8, span: 4, row: 1, tilt: -4 }, 1, { treatment: "seal" })), C)).toEqual([]);
    expect(validateComposition(tilted(sticker("e_s", { col: 8, span: 3, row: 2, tilt: 6 }, 1)), C)).toEqual([]);
    expect(validateComposition(tilted(photo("e_p", { col: 8, span: 5, row: 1, tilt: 3 }, 1)), C)).toEqual([]);
    expect(validateComposition(tilted(decor("e_d", { col: 8, span: 2, row: 1, tilt: 3 }, 1)), C)).toEqual([]);
  });

  it("rejects tilted running text and numerals, and repairs by dropping the tilt", () => {
    const h = composed([heading("e_head", { col: 1, span: 6, row: 1, tilt: 4 }, 0)]);
    expect(issue(h, /e_head \(heading\) can't tilt/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/desk/tilt" });
    const n = tilted(fact("e_f", { col: 8, span: 4, row: 1, tilt: -4 }, 1));
    expect(issue(n, /e_f \(fact numeral\) can't tilt/, C)).toMatchObject({ path: "/props/elements/1/desk/tilt" });
    const r = repairComposition(h, C);
    expect(paths(r)).toEqual(["/props/elements/0/desk/tilt"]);
    expect(elAt(r.section, 0).desk.tilt).toBeUndefined();
  });
});

describe("G11 bleed", () => {
  it("passes a photo bleeding toward the grid edge it touches, and a sticker past the section", () => {
    expect(validateComposition(composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1, bleedX: "end" }, 2)]), C)).toEqual([]);
    expect(validateComposition(composed([photo("e_photo", { col: 1, span: 12, row: 1, bleedX: "both" }, 0)]), C)).toEqual([]);
    expect(validateComposition(composed([...base(), sticker("e_s", { col: 1, span: 3, row: 3, bleedY: "bottom" }, 3)]), C)).toEqual([]);
  });

  it("rejects bleeding away from the grid edge, or on the wrong kind, and repairs by dropping it", () => {
    const away = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1, bleedX: "start" }, 2)]);
    expect(issue(away, /e_photo bleeds to the start but doesn't touch column 1/, C)).toMatchObject({ code: "structure", path: "/props/elements/2/desk/bleedX" });
    const both = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1, bleedX: "both" }, 2)]);
    expect(has(both, /e_photo bleeds to the start but doesn't touch column 1/, C)).toBe(true);
    const txt = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 1, span: 6, row: 2, bleedX: "start" }, 1)]);
    expect(issue(txt, /e_text \(text\) can't bleed/, C)).toMatchObject({ path: "/props/elements/1/desk/bleedX" });
    const head = composed([heading("e_head", { col: 1, span: 6, row: 1, bleedY: "top" }, 0)]);
    expect(issue(head, /e_head \(heading\) can't bleed past the section/, C)).toMatchObject({ path: "/props/elements/0/desk/bleedY" });
    const r = repairComposition(away, C);
    expect(paths(r)).toEqual(["/props/elements/2/desk/bleedX"]);
    expect(elAt(r.section, 2).desk.bleedX).toBeUndefined();
    expect(paths(repairComposition(head, C))).toEqual(["/props/elements/0/desk/bleedY"]);
  });
});

describe("G12 phone spans", () => {
  const onPhone = (span: Phone["span"], kind: "text" | "image" | "heading") => {
    const e = kind === "text" ? text("e_x", { col: 1, span: 6, row: 2 }, 1) : kind === "image" ? photo("e_x", { col: 8, span: 5, row: 2 }, 1) : heading("e_x", { col: 1, span: 6, row: 2 }, 1);
    (e.phone as { span: string }).span = span!;
    return composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), e]);
  };

  it("passes a bleeding photo and a half-width heading", () => {
    expect(validateComposition(onPhone("bleed", "image"), C)).toEqual([]);
    expect(validateComposition(onPhone("half", "heading"), C)).toEqual([]);
  });

  it("rejects bleeding or half-width running text and repairs to full", () => {
    expect(issue(onPhone("bleed", "text"), /e_x \(text\) can't bleed on phones/, C)).toMatchObject({ code: "structure", path: "/props/elements/1/phone/span" });
    expect(issue(onPhone("half", "text"), /e_x \(text\) can't be half width on phones/, C)).toMatchObject({ path: "/props/elements/1/phone/span" });
    expect(has(onPhone("bleed", "heading"), /e_x \(heading\) can't bleed on phones/, C)).toBe(true);
    for (const span of ["bleed", "half"] as const) {
      const r = repairComposition(onPhone(span, "text"), C);
      expect(paths(r)).toEqual(["/props/elements/1/phone/span"]);
      expect(elAt(r.section, 1).phone.span).toBe("full");
    }
  });
});

describe("G13 narrow text side by side", () => {
  const short = "Kruh pečemo ob štirih zjutraj.";
  const pair = (a: Record<string, unknown> = {}, partner?: Element, width = "wide") =>
    composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_a", { col: 1, span: 3, row: 2 }, 1, { size: 0, paragraphs: [short], ...a }), partner ?? text("e_b", { col: 5, span: 3, row: 2 }, 2, { size: 0 })], { width });

  it("passes two short texts of 3 columns on one row, or one beside a 4-column fact", () => {
    expect(validateComposition(pair(), C)).toEqual([]);
    expect(validateComposition(pair({}, fact("e_f", { col: 5, span: 4, row: 2 }, 2)), C)).toEqual([]);
  });

  it("rejects a 3-column text that is long, a lead, alone, two paragraphs or in a contained section", () => {
    const re = /running text spans 4–8 columns on desktop \(e_a spans 3\)/;
    expect(issue(pair({ paragraphs: ["x".repeat(141)] }), re, C)).toMatchObject({ code: "structure", path: "/props/elements/1/desk/span" });
    expect(has(pair({ paragraphs: [short, short] }), re, C)).toBe(true);
    expect(has(pair({ size: 1 }), re, C)).toBe(true);
    expect(has(pair({}, text("e_b", { col: 5, span: 6, row: 2 }, 2)), re, C)).toBe(true);
    expect(has(pair({}, text("e_b", { col: 5, span: 3, row: 3 }, 2, { size: 0 })), re, C)).toBe(true);
    expect(has(pair({}, undefined, "contained"), re, C)).toBe(true);
  });

  it("repairs by clamping to 4 (as today)", () => {
    const r = repairComposition(pair({ size: 1 }), C);
    expect(paths(r)).toEqual(["/props/elements/1/desk"]);
    expect(elAt(r.section, 1).desk).toMatchObject({ col: 1, span: 4 });
  });
});

describe("G14 fact links", () => {
  const linked = (target: Record<string, unknown>, more: Element[] = []) => composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), ...more, fact("e_fact", { col: 1, span: 4, row: 2 }, 5, { link: target })]);
  const known = { phone: "+38641555730", address: "Savska cesta 52, 4000 Kranj", town: "Kranj", bookingUrl: "https://example.si/termin", email: "info@example.si" };

  it("passes links the business can serve", () => {
    for (const action of ["call", "directions", "booking", "email"]) expect(validateComposition(linked({ action }), ctxWith({ business: known })), action).toEqual([]);
    expect(validateComposition(linked({ page: "p_home" }), ctxWith({ business: {} }))).toEqual([]);
    expect(has(linked({ action: "call" }), /links to/, C)).toBe(false); // no business, no check
  });

  it("rejects a link the business can't serve and repairs by dropping it", () => {
    const ctx = ctxWith({ business: {} });
    expect(issue(linked({ action: "call" }), /e_fact links to call but the business has no phone/, ctx)).toMatchObject({ code: "reference", path: "/props/elements/1/link" });
    expect(has(linked({ action: "directions" }), /e_fact links to directions but the business has no address/, ctx)).toBe(true);
    expect(has(linked({ action: "booking" }), /e_fact links to booking but the business has no bookingUrl/, ctx)).toBe(true);
    expect(has(linked({ action: "email" }), /e_fact links to email but the business has no email/, ctx)).toBe(true);
    const r = repairComposition(linked({ action: "call" }), ctx);
    expect(paths(r)).toEqual(["/props/elements/1/link"]);
    expect(elAt(r.section, 1).link).toBeUndefined();
  });

  it("counts a fact's call link with the call actions and repairs by dropping the fact's link", () => {
    const s = linked({ action: "call" }, [action("e_call", { col: 8, span: 3, row: 2 }, 1)]);
    const ctx = ctxWith({ business: known });
    expect(issue(s, /at most one call action per section/, ctx)).toMatchObject({ code: "banned", path: "/props/elements/2/link" });
    const r = repairComposition(s, ctx);
    expect(paths(r)).toEqual(["/props/elements/2/link"]);
    expect(elAt(r.section, 1)).toMatchObject({ action: "call" });
    expect(has(r.section, /call action/, ctx)).toBe(false);
  });
});

describe("G15 plate codes", () => {
  it("passes plateCode on a plate fact and plates prices", () => {
    expect(has(composed([fact("e_f", { col: 1, span: 4, row: 1 }, 0, { treatment: "plate", plateCode: true }), prices("e_p", { col: 1, span: 8, row: 2 }, 1, { style: "plates", plateCode: true })]), /plateCode/, C)).toBe(false);
  });

  it("rejects it elsewhere and repairs by dropping it", () => {
    const s = composed([fact("e_f", { col: 1, span: 4, row: 1 }, 0, { plateCode: true }), prices("e_p", { col: 1, span: 8, row: 2 }, 1, { plateCode: true })]);
    expect(issue(s, /e_f: plateCode only on a plate/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/plateCode" });
    expect(issue(s, /e_p: plateCode only on a plate/, C)).toMatchObject({ path: "/props/elements/1/plateCode" });
    const r = repairComposition(s, C);
    expect(paths(r)).toEqual(["/props/elements/0/plateCode", "/props/elements/1/plateCode"]);
    expect(elAt(r.section, 0).plateCode).toBeUndefined();
  });
});

describe("G16 lists", () => {
  const timeline = (items: unknown[], rest: Record<string, unknown> = {}) => composed([list("e_list", { col: 1, span: 6, row: 1 }, 0, { items, marker: "line", ...rest })]);

  it("passes a timeline whose every item has a lead, and a drawing marker with its drawing", () => {
    expect(validateComposition(timeline([{ lead: "2004", text: "Odprli smo pekarno" }, { lead: "2015", text: "Nova peč" }]), C)).toEqual([]);
    expect(validateComposition(composed([list("e_list", { col: 1, span: 6, row: 1 }, 0, { marker: "drawing", drawing: "ornament/rope-line" })]), C)).toEqual([]);
  });

  it("rejects a timeline item without a lead", () => {
    expect(issue(timeline([{ lead: "2004", text: "Odprli smo pekarno" }, "Nova peč"]), /e_list: a timeline \(marker line\) needs a lead on every item/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/items/1" });
  });

  it("rejects numbered leads", () => {
    expect(issue(timeline([{ lead: "01", text: "Odprli smo pekarno" }, { lead: "02", text: "Nova peč" }]), /numbered label: "01"/, C)).toMatchObject({ code: "banned", path: "/props/elements/0/items/0/lead" });
  });

  it("needs a drawing exactly for the drawing marker; repairs by dropping the marker or the drawing", () => {
    const noDrawing = composed([list("e_list", { col: 1, span: 6, row: 1 }, 0, { marker: "drawing" })]);
    expect(issue(noDrawing, /e_list: marker "drawing" needs a drawing/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/marker" });
    const r = repairComposition(noDrawing, C);
    expect(paths(r)).toEqual(["/props/elements/0/marker"]);
    expect(elAt(r.section, 0).marker).toBeUndefined();
    const stray = composed([list("e_list", { col: 1, span: 6, row: 1 }, 0, { marker: "dot", drawing: "ornament/rope-line" })]);
    expect(issue(stray, /e_list: a drawing only with marker "drawing"/, C)).toMatchObject({ path: "/props/elements/0/drawing" });
    const rs = repairComposition(stray, C);
    expect(paths(rs)).toEqual(["/props/elements/0/drawing"]);
    expect(elAt(rs.section, 0)).toMatchObject({ marker: "dot" });
    expect(elAt(rs.section, 0).drawing).toBeUndefined();
  });
});

describe("G17 two price columns on phones", () => {
  const two = (style: string, name = "Hlebec") => composed([prices("e_p", { col: 1, span: 8, row: 1 }, 0, { style, phoneColumns: 2, items: [{ name, price: { amount: 3.2 } }] })]);

  it("passes plates and tags with short names", () => {
    expect(validateComposition(two("plates"), C)).toEqual([]);
    expect(validateComposition(two("tags", "x".repeat(24)), C)).toEqual([]);
  });

  it("rejects other styles and long names, and repairs to 1", () => {
    expect(issue(two("rows"), /e_p can't set 2 columns on phones/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/phoneColumns" });
    expect(has(two("plates", "x".repeat(25)), /e_p can't set 2 columns on phones/, C)).toBe(true);
    const r = repairComposition(two("rows"), C);
    expect(paths(r)).toEqual(["/props/elements/0/phoneColumns"]);
    expect((elAt(r.section, 0).phoneColumns as number | undefined) ?? 1).toBe(1);
  });
});

describe("G18 decor sources and sizes", () => {
  const d = (rest: Record<string, unknown>) => composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0, rest)]);

  it("passes a drawing alone, and a fixed size", () => {
    expect(validateComposition(d({ motif: undefined, drawing: "ornament/rope-line" }), C)).toEqual([]);
    expect(validateComposition(d({ fit: "fixed", size: 4 }), C)).toEqual([]);
  });

  it("rejects a drawing next to a motif or an svg", () => {
    expect(issue(d({ drawing: "ornament/rope-line" }), /e_d needs exactly one of motif and svg/, C)).toMatchObject({ code: "structure", path: "/props/elements/0" });
    const svg = { width: 40, height: 40, paths: [{ d: "M0 0L10 10", fill: "none", stroke: "text" }] };
    expect(has(d({ motif: undefined, drawing: "ornament/rope-line", svg }), /e_d needs exactly one of motif and svg/, C)).toBe(true);
  });

  it("needs a size exactly for fit \"fixed\"", () => {
    expect(issue(d({ size: 4 }), /e_d: size only with fit "fixed"/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/size" });
    expect(issue(d({ fit: "fixed" }), /e_d: fit "fixed" needs a size/, C)).toMatchObject({ path: "/props/elements/0/size" });
  });
});

describe("G19 repeating strips", () => {
  const strip = (rest: Record<string, unknown>) => composed([decor("e_d", { col: 1, span: 12, row: 1 }, 0, { repeat: "x", ...rest })]);

  it("passes a repeatable drawing", () => {
    expect(validateComposition(strip({ motif: undefined, drawing: "ornament/rope-line" }), C)).toEqual([]);
  });

  it("rejects any other source and repairs by dropping the repeat", () => {
    const motif = strip({ motif: undefined, drawing: "motif/bakery/wheat-ear-line" });
    expect(issue(motif, /e_d: repeat only with a repeatable drawing/, C)).toMatchObject({ code: "banned", path: "/props/elements/0/repeat" });
    expect(has(strip({}), /e_d: repeat only with a repeatable drawing/, C)).toBe(true);
    const r = repairComposition(motif, C);
    expect(paths(r)).toEqual(["/props/elements/0/repeat"]);
    expect(elAt(r.section, 0).repeat).toBeUndefined();
  });
});

describe("G20 type treatments", () => {
  it("passes a stacked heading of 4 lines and a knockout over a field", () => {
    expect(validateComposition(composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "stacked", text: "Kruh iz naše peči" })]), C)).toEqual([]);
    const knock = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "knockout", size: 5 })], { background: [field("inverse", [1, 6])] });
    expect(has(knock, /knockout/, C)).toBe(false);
  });

  it("rejects a stacked heading over 4 lines and a knockout on a plain ground, and repairs by dropping the treatment", () => {
    const tall = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "stacked", text: "Kruh iz naše stare peči" })]);
    expect(issue(tall, /e_head: stacked takes at most 4 lines \(has 5\)/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/treatment" });
    const knock = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { treatment: "knockout", size: 5 })]);
    expect(issue(knock, /e_head: knockout only over a photo or a field/, C)).toMatchObject({ path: "/props/elements/0/treatment" });
    for (const s of [tall, knock]) {
      const r = repairComposition(s, C);
      expect(paths(r)).toEqual(["/props/elements/0/treatment"]);
      expect(elAt(r.section, 0).treatment).toBeUndefined();
    }
  });

  it.todo("vertical (size ≥ 4), circle (≤ 40 characters, size ≥ 2) and photo-fill (size ≥ 6, fillImage, 3:1 duotone roles): not in TYPE_TREATMENTS yet");
});

describe("G21 photos", () => {
  const set = (arrangement: string, n: number, rest: Record<string, unknown> = {}) =>
    composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), photos("e_ph", { col: 7, span: 6, row: 1, rowSpan: 2 }, 1, { arrangement, images: Array.from({ length: n }, (_, i) => `img_0${(i % 5) + 1}`), ...rest })]);

  it("passes each arrangement at its counts", () => {
    for (const [arr, n] of [["fan", 2], ["stack", 4], ["offset-pair", 3], ["strip", 3], ["strip", 5], ["before-after", 2]] as const) expect(validateComposition(set(arr, n), C), `${arr} ${n}`).toEqual([]);
  });

  it("rejects counts outside the arrangement's range", () => {
    expect(issue(set("fan", 5), /e_ph: fan takes 2–4 photos \(has 5\)/, C)).toMatchObject({ code: "structure", path: "/props/elements/1/images" });
    expect(has(set("strip", 2), /e_ph: strip takes 3–12 photos \(has 2\)/, C)).toBe(true);
    expect(has(set("before-after", 3), /e_ph: before-after takes exactly 2 photos \(has 3\)/, C)).toBe(true);
  });

  it("needs the client's own photos for before-after", () => {
    const images = new Map<string, { origin: "client" | "generated" }>([["img_01", { origin: "client" }], ["img_02", { origin: "generated" }]]);
    expect(issue(set("before-after", 2), /e_ph: before-after only with the client's own photos/, ctxWith({ images }))).toMatchObject({ code: "structure", path: "/props/elements/1/images" });
    expect(has(set("before-after", 2), /client's own photos/, ctxWith({ images: new Map([["img_01", { origin: "client" }], ["img_02", { origin: "client" }]]) }))).toBe(false);
  });

  it("needs every image to exist and counts each toward 2 uses per page", () => {
    const missing = composed([photos("e_ph", { col: 1, span: 6, row: 1 }, 0, { images: ["img_01", "img_missing"] })]);
    expect(issue(missing, /unknown image img_missing/, C)).toMatchObject({ code: "reference", path: "/props/elements/0/images/1" });
    const thrice = composed([photos("e_ph", { col: 1, span: 6, row: 1 }, 0, { images: ["img_01", "img_02"] }), photo("e_a", { col: 7, span: 3, row: 1 }, 1), photo("e_b", { col: 10, span: 3, row: 1 }, 2)]);
    expect(issue(thrice, /img_01 is used more than 2 times on the page/, C)).toMatchObject({ code: "structure", path: "/props/elements/2/image" });
    const inPhotos = composed([photo("e_a", { col: 1, span: 3, row: 1 }, 0), photo("e_b", { col: 4, span: 3, row: 1 }, 1), photos("e_ph", { col: 7, span: 6, row: 1 }, 2, { images: ["img_02", "img_01"] })]);
    expect(issue(inPhotos, /img_01 is used more than 2 times on the page/, C)).toMatchObject({ path: "/props/elements/2/images/1" });
  });
});

describe("G22 restraint", () => {
  const two = (make: typeof sticker) => composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), make("e_x1", { col: 8, span: 3, row: 1 }, 1), make("e_x2", { col: 8, span: 3, row: 2 }, 2)]);

  it("passes one sticker, one quote and one wordmark", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), sticker("e_s", { col: 8, span: 3, row: 1 }, 1), quote("e_q", { col: 1, span: 6, row: 2 }, 2), wordmark("e_w", { col: 8, span: 4, row: 3 }, 3)]);
    expect(validateComposition(s, C)).toEqual([]);
  });

  it("drops a second sticker in a section", () => {
    const s = two(sticker);
    expect(issue(s, /at most one sticker per section/, C)).toMatchObject({ code: "structure", path: "/props/elements/2" });
    const r = repairComposition(s, C);
    expect(paths(r)).toEqual(["/props/elements/2"]);
    expect(r.section.props.elements.map((e) => e.id)).toEqual(["e_head", "e_x1"]);
  });

  it("allows 2 stickers per page and 1 wordmark per page outside the header", () => {
    const one = (make: typeof sticker, id: string) => withId(composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), make("e_x1", { col: 8, span: 3, row: 1 }, 1)]), id);
    const page = [one(sticker, "s_1"), one(sticker, "s_2"), one(sticker, "s_3")];
    expect(issue(page[2]!, /at most 2 stickers per page/, onPage(page, 2, C))).toMatchObject({ path: "/props/elements/1" });
    expect(has(page[1]!, /stickers per page/, onPage(page, 1, C))).toBe(false);
    const marks = [one(wordmark, "s_1"), one(wordmark, "s_2")];
    expect(issue(marks[1]!, /at most one wordmark per page/, onPage(marks, 1, C))).toMatchObject({ path: "/props/elements/1" });
    const r = repairComposition(marks[1]!, onPage(marks, 1, C));
    expect(paths(r)).toEqual(["/props/elements/1"]);
    expect(r.section.props.elements.map((e) => e.kind)).toEqual(["heading"]);
  });

  it("rejects a second quote in a section, without a repair", () => {
    const s = two(quote);
    expect(issue(s, /at most one quote per section/, C)).toMatchObject({ code: "structure", path: "/props/elements/2" });
    expect(paths(repairComposition(s, C))).not.toContain("/props/elements/2");
  });
});

describe("G23 words are always shown and never overlap", () => {
  const kinds = {
    ribbon: ribbon("e_x", { col: 1, span: 12, row: 3 }, 3),
    sticker: sticker("e_x", { col: 1, span: 3, row: 3 }, 3),
    map: map("e_x", { col: 1, span: 6, row: 3 }, 3),
    iconFacts: iconFacts("e_x", { col: 1, span: 6, row: 3 }, 3),
    quote: quote("e_x", { col: 1, span: 6, row: 3 }, 3),
    wordmark: wordmark("e_x", { col: 1, span: 6, row: 3 }, 3),
    photos: photos("e_x", { col: 1, span: 6, row: 3 }, 3, { captions: ["Prej", "Potem"] }),
  } as const;

  it("counts the new kinds with words as text-bearing, photos only with captions", () => {
    for (const [kind, e] of Object.entries(kinds)) expect(isTextBearing(e), kind).toBe(true);
    expect(isTextBearing(photos("e_x", { col: 1, span: 6, row: 3 }, 3))).toBe(false);
  });

  it("rejects hiding them on phones and repairs by showing them", () => {
    for (const [kind, e] of Object.entries(kinds)) {
      const hidden = { ...e, phone: { ...e.phone, hidden: true } } as Element;
      const s = composed([...base(), hidden]);
      expect(issue(s, new RegExp(`e_x \\(${kind}\\) carries words and can't be hidden on phones`), C), kind).toMatchObject({ code: "structure", path: "/props/elements/3/phone/hidden" });
      const r = repairComposition(s, C);
      expect(paths(r), kind).toEqual(["/props/elements/3/phone/hidden"]);
      expect(r.section.props.elements[3]!.phone.hidden).toBeUndefined();
    }
  });

  it("treats captionless photos as a photo: hidden only as a second one", () => {
    const hidden = { ...photos("e_x", { col: 1, span: 6, row: 3 }, 3), phone: { order: 3, span: "full", hidden: true } } as Element;
    expect(has(composed([...base(), hidden]), /hidden/, C)).toBe(false);
    expect(has(composed([...base().slice(0, 2), hidden]), /e_x is the only photo shown on phones/, C)).toBe(true);
  });

  it("rejects them overlapping other text on desktop", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), quote("e_q", { col: 4, span: 6, row: 1 }, 1)]);
    expect(issue(s, /e_q overlaps e_head on desktop; text never overlaps text/, C)).toMatchObject({ code: "structure", path: "/props/elements/1/desk" });
    const overPhoto = composed([photo("e_photo", { col: 1, span: 12, row: 1, rowSpan: 3 }, 0), sticker("e_s", { col: 2, span: 3, row: 2, layer: 1 }, 1)]);
    expect(has(overPhoto, /overlaps/, C)).toBe(false);
  });
});

describe("G24 display sizes count a size-4 quote", () => {
  const big = heading("e_big", { col: 1, span: 8, row: 1 }, 0, { size: 7, weight: 800 });

  it("counts quote size 4, not 3", () => {
    expect(has(composed([big, quote("e_q", { col: 1, span: 8, row: 2 }, 1, { size: 4 })]), /one display size/, C)).toBe(true);
    expect(has(composed([big, quote("e_q", { col: 1, span: 8, row: 2 }, 1, { size: 3 })]), /one display size/, C)).toBe(false);
  });

  it("counts an earlier section's size-4 quote toward the page's two", () => {
    const q = (id: string) => withId(composed([quote("e_q", { col: 1, span: 8, row: 1 }, 0, { size: 4 })]), id);
    const page = [q("s_1"), q("s_2"), withId(composed([big]), "s_3")];
    expect(has(page[2]!, /at most 2 display sizes per page/, onPage(page, 2, C))).toBe(true);
  });
});

describe("G25 a row of three icon cards counts iconFacts, stickers and facts", () => {
  const card = (n: number, col: number, icon: (id: string, desk: { col: number; span: number; row: number }, order: number) => Element): Element[] => [
    icon(`e_i${n}`, { col, span: 4, row: 1 }, n * 3),
    heading(`e_h${n}`, { col, span: 4, row: 2 }, n * 3 + 1, { size: 1 }),
    text(`e_t${n}`, { col, span: 4, row: 3 }, n * 3 + 2),
  ];
  const row = (icon: Parameters<typeof card>[2]) => composed([...card(0, 1, icon), ...card(1, 5, icon), ...card(2, 9, icon)]);

  it("rejects three blocks of iconFacts, of stickers, and of plate facts", () => {
    expect(issue(row((id, d, o) => iconFacts(id, d, o)), /row of three icon cards/, C)).toMatchObject({ code: "banned" });
    expect(has(row((id, d, o) => sticker(id, d, o)), /row of three icon cards/, C)).toBe(true);
    expect(has(row((id, d, o) => fact(id, d, o, { treatment: "plate" })), /row of three icon cards/, C)).toBe(true);
  });

  it("allows two such blocks", () => {
    expect(has(composed([...card(0, 1, (id, d, o) => iconFacts(id, d, o)), ...card(1, 7, (id, d, o) => iconFacts(id, d, o))]), /row of three/, C)).toBe(false);
  });
});

describe("compositionContext (v20 fields)", () => {
  it("passes colours, business facts, image origins, the motion level and the previous section", () => {
    const spec = golden();
    spec.design.motion = "lively";
    spec.business.bookingUrl = "https://example.si/termin";
    spec.business.amenities = ["parking", "card"];
    spec.assets.images[1]!.origin = "generated";
    const ctx = compositionContext(spec, 0, 1);
    expect(ctx.colors).toEqual(spec.design.colors);
    expect(ctx.motionLevel).toBe("lively");
    expect(ctx.business).toMatchObject({ bookingUrl: "https://example.si/termin", amenities: ["parking", "card"] });
    expect(ctx.images?.get(spec.assets.images[1]!.id)).toEqual({ origin: "generated" });
    expect(ctx.images?.get(spec.assets.images[0]!.id)).toEqual({ origin: "client" });
    expect(ctx.prev).toBe(spec.pages[0]!.sections[0]);
    expect(ctx.approved).toBeUndefined();
    const first = compositionContext(golden(), 0, 0);
    expect(first.prev).toBeUndefined();
    expect(first.motionLevel).toBe("calm");
  });

  it("leaves placeholders out of the business facts", () => {
    const spec = composedFixture("m");
    const ctx = compositionContext(spec, 0, 0);
    expect(ctx.business?.phone).toBe("+38641555730");
    expect(ctx.business?.email).toBeUndefined(); // a placeholder in m.json
    expect(ctx.business).toMatchObject({ address: "Savska cesta 52, 4000 Kranj", town: "Kranj" });
  });
});

describe("the fixtures stay valid under the v20 rules (no over-tightening)", () => {
  const composedIssues = (spec: SiteSpec) =>
    spec.pages.flatMap((p, pi) => p.sections.flatMap((s, si) => (s.type === "composed" ? validateComposition(s as ComposedSection, compositionContext(spec, pi, si)) : [])));

  for (const id of ["m", "s", "j"] as const) {
    it(`tools/eval/composed/${id}.json validates with 0 issues`, () => {
      const spec = composedFixture(id);
      expect(composedIssues(spec)).toEqual([]);
      const v = validateSite(spec);
      expect(v.issues).toEqual([]);
      for (const p of spec.pages) for (const [si, s] of p.sections.entries()) if (s.type === "composed") expect(repairComposition(s as ComposedSection, compositionContext(spec, spec.pages.indexOf(p), si)).repairs, s.id).toEqual([]);
    });
  }

  it("every render golden validates with 0 issues", () => {
    for (const id of GOLDEN_IDS) expect(validateSite(golden(id)).issues, id).toEqual([]);
  });

  it("the shared builders produce schema-valid elements and sections", () => {
    const d = { col: 1, span: 6, row: 1 };
    const all = [...base(), fact("e_f", d, 3), decor("e_d", d, 4), action("e_a", d, 5), list("e_l", d, 6), prices("e_p", d, 7), photos("e_ph", d, 8), wordmark("e_w", d, 9), ribbon("e_r", d, 10), sticker("e_s", d, 11), map("e_m", d, 12), iconFacts("e_i", d, 13), quote("e_q", d, 14), el("e_c", "contact", d, { order: 15 }, { show: ["phone"] })];
    for (const e of all) expect(Element.safeParse(e).success, e.kind).toBe(true);
    const s = composed(base(), { background: [field("surface", [1, 6]), drawingLayer(undefined, "border")], top: { edge: "cut", rise: 1 }, motion: "reveal", pin: { col: 1, span: 6 }, headerOver: true }, "inverse");
    expect(Section.safeParse(s).success).toBe(true);
    expect(Section.safeParse(composed(base(), { background: [photoLayer(3)] })).success).toBe(true);
  });
});
