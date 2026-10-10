import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  Business,
  ComposedProps,
  Design,
  Drawing,
  ELEMENT_KINDS,
  Element,
  SYSTEM_ONLY,
  Section,
  VOCAB_KEY,
  composedFallback,
  toModelJsonSchema,
  type ComposedSection,
  type SiteSpec,
} from "../src/index.ts";

/** Composition language v2 (spec v20, docs/plans/studio-phase1-design.md §1): every new field and kind parses, limits hold. */

const at = { desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } };
const el = (fields: object) => ({ id: "e_x", ...at, ...fields });
const okEl = (fields: object) => Element.safeParse(el(fields)).success;

/** One valid element of each v20 kind. */
const NEW_KINDS = {
  photos: { kind: "photos", images: ["img_a", "img_b"], arrangement: "fan", mask: "arch", treatment: "duotone", captions: ["Prej", "Potem"] },
  wordmark: { kind: "wordmark", size: 4, color: "primary" },
  ribbon: { kind: "ribbon", items: ["Kruh", "Pecivo"], separator: "ornament/rope-line", move: "drift", color: "onBand", fill: "band" },
  sticker: { kind: "sticker", text: "Odprto tudi ob nedeljah", shape: "round", fill: "accent" },
  map: { kind: "map", style: "corner", cross: "Glavni trg", note: "Vhod z dvorišča", color: "text" },
  iconFacts: { kind: "iconFacts", items: [{ fact: "parking" }, { fact: "card", note: "Tudi Activa" }], icons: "line", color: "muted" },
  quote: { kind: "quote", text: "Pečemo kot nekoč.", by: "Ana", size: 3, color: "text" },
} as const;

const section = (more: object = {}) => ({
  intent: "story",
  width: "wide",
  rows: 2,
  elements: [el({ kind: "heading", text: "Naslov", level: 2, size: 4 })],
  ...more,
});
const okSection = (more: object) => ComposedProps.safeParse(section(more)).success;

describe("composition language v2: new kinds", () => {
  it("has 17 kinds, each new one parsing as an Element", () => {
    expect(ELEMENT_KINDS.length).toBe(17);
    for (const [kind, fields] of Object.entries(NEW_KINDS)) {
      expect(ELEMENT_KINDS as readonly string[]).toContain(kind);
      expect(okEl(fields), kind).toBe(true);
      expect(okEl({ ...fields, extra: 1 }), `${kind} strict`).toBe(false);
    }
  });

  it("photos: 2–12 images, known arrangements, ≤ 12 captions of ≤ 80 characters", () => {
    const p = NEW_KINDS.photos;
    for (const a of ["fan", "stack", "offset-pair", "strip", "before-after"]) expect(okEl({ ...p, arrangement: a }), a).toBe(true);
    expect(okEl({ ...p, arrangement: "grid" })).toBe(false);
    expect(okEl({ ...p, images: ["img_a"] })).toBe(false);
    expect(okEl({ ...p, images: Array.from({ length: 12 }, (_, i) => `img_${i}`) })).toBe(true);
    expect(okEl({ ...p, images: Array.from({ length: 13 }, (_, i) => `img_${i}`) })).toBe(false);
    expect(okEl({ ...p, images: ["img_a", "photo.jpg"] })).toBe(false);
    expect(okEl({ ...p, captions: Array.from({ length: 13 }, () => "x") })).toBe(false);
    expect(okEl({ ...p, captions: ["x".repeat(81)] })).toBe(false);
    expect(okEl({ ...p, mask: "Arch" })).toBe(false);
  });

  it("wordmark: size 2–8, colour a role, no text field", () => {
    const w = NEW_KINDS.wordmark;
    expect(okEl({ ...w, size: 2 }) && okEl({ ...w, size: 8 })).toBe(true);
    expect(okEl({ ...w, size: 1 })).toBe(false);
    expect(okEl({ ...w, size: 9 })).toBe(false);
    expect(okEl({ ...w, color: "#000000" })).toBe(false);
    expect(okEl({ ...w, text: "Pekarna" })).toBe(false);
    expect(okEl({ ...w, fill: "primary" })).toBe(false);
  });

  it("ribbon: 1–6 items of ≤ 40 characters, a drawing id as separator, still, drift or loop", () => {
    const r = NEW_KINDS.ribbon;
    expect(okEl({ ...r, items: [] })).toBe(false);
    expect(okEl({ ...r, items: Array.from({ length: 7 }, () => "x") })).toBe(false);
    expect(okEl({ ...r, items: ["x".repeat(41)] })).toBe(false);
    expect(okEl({ ...r, separator: "dot" })).toBe(false);
    expect(okEl({ ...r, move: "spin" })).toBe(false);
  });

  it("sticker: ≤ 32 characters, four shapes", () => {
    const s = NEW_KINDS.sticker;
    for (const shape of ["round", "oval", "rect", "tag"]) expect(okEl({ ...s, shape }), shape).toBe(true);
    expect(okEl({ ...s, shape: "star" })).toBe(false);
    expect(okEl({ ...s, text: "x".repeat(33) })).toBe(false);
    expect(okEl({ ...s, text: "" })).toBe(false);
  });

  it("map: three styles, cross ≤ 40, note ≤ 80, colour only", () => {
    const m = NEW_KINDS.map;
    expect(okEl({ ...m, style: "satellite" })).toBe(false);
    expect(okEl({ ...m, cross: "x".repeat(41) })).toBe(false);
    expect(okEl({ ...m, note: "x".repeat(81) })).toBe(false);
    expect(okEl({ ...m, fill: "surface" })).toBe(false);
  });

  it("iconFacts: 1–8 items, each a well-formed fact key with an optional note ≤ 60", () => {
    const f = NEW_KINDS.iconFacts;
    expect(okEl({ ...f, items: [] })).toBe(false);
    expect(okEl({ ...f, items: Array.from({ length: 9 }, () => ({ fact: "wifi" })) })).toBe(false);
    expect(okEl({ ...f, items: [{ fact: "Free Parking" }] })).toBe(false);
    expect(okEl({ ...f, items: [{ fact: "wifi", note: "x".repeat(61) }] })).toBe(false);
    expect(okEl({ ...f, items: [{ fact: "wifi", icon: "x" }] })).toBe(false);
    expect(okEl({ ...f, icons: "emoji" })).toBe(false);
  });

  it("quote: text ≤ 400, by ≤ 60, size 0–4", () => {
    const q = NEW_KINDS.quote;
    expect(okEl({ ...q, text: "x".repeat(400) })).toBe(true);
    expect(okEl({ ...q, text: "x".repeat(401) })).toBe(false);
    expect(okEl({ ...q, by: "x".repeat(61) })).toBe(false);
    expect(okEl({ ...q, size: 0 }) && okEl({ ...q, size: 4 })).toBe(true);
    expect(okEl({ ...q, size: 5 })).toBe(false);
    expect(okEl({ ...q, size: -1 })).toBe(false);
  });
});

describe("composition language v2: extended kinds and shared fields", () => {
  const heading = { kind: "heading", text: "Naslov", level: 2, size: 4 };

  it("desk place: tilt −8…8, bleedX and bleedY; phone span bleed", () => {
    expect(okEl({ ...heading, desk: { col: 1, span: 6, row: 1, tilt: -8, bleedX: "both", bleedY: "top" } })).toBe(true);
    expect(okEl({ ...heading, desk: { col: 1, span: 6, row: 1, tilt: 9 } })).toBe(false);
    expect(okEl({ ...heading, desk: { col: 1, span: 6, row: 1, tilt: 2.5 } })).toBe(false);
    expect(okEl({ ...heading, desk: { col: 1, span: 6, row: 1, bleedX: "top" } })).toBe(false);
    expect(okEl({ ...heading, desk: { col: 1, span: 6, row: 1, bleedY: "start" } })).toBe(false);
    expect(okEl({ ...heading, phone: { order: 0, span: "bleed" } })).toBe(true);
    expect(okEl({ ...heading, phone: { order: 0, span: "edge" } })).toBe(false);
  });

  it("Paint: color and fill are colour roles on heading, text, list, fact, prices, hours, contact", () => {
    const kinds = [
      heading,
      { kind: "text", paragraphs: ["Besedilo."] },
      { kind: "list", items: ["Ena"] },
      { kind: "fact", value: "1998", label: "Leto", treatment: "plate", size: 4 },
      { kind: "prices", style: "rows", items: [{ name: "Pregled", price: { amount: 20 } }] },
      { kind: "hours", style: "table" },
      { kind: "contact", show: ["phone"] },
    ];
    for (const k of kinds) {
      expect(okEl({ ...k, color: "onInverse", fill: "inverse" }), k.kind).toBe(true);
      expect(okEl({ ...k, color: "#ffffff" }), k.kind).toBe(false);
      expect(okEl({ ...k, fill: "gold" }), k.kind).toBe(false);
    }
    // Actions stay token-driven.
    expect(okEl({ kind: "action", action: "call", label: "Pokliči", style: "primary", color: "accent" })).toBe(false);
  });

  it("heading: a type treatment name and a photo for photo-fill", () => {
    expect(okEl({ ...heading, treatment: "stacked", fillImage: "img_kruh" })).toBe(true);
    expect(okEl({ ...heading, treatment: "Stacked" })).toBe(false);
    expect(okEl({ ...heading, fillImage: "kruh.jpg" })).toBe(false);
  });

  it("text: drop cap", () => {
    expect(okEl({ kind: "text", paragraphs: ["Besedilo."], dropCap: true })).toBe(true);
    expect(okEl({ kind: "text", paragraphs: ["Besedilo."], dropCap: "yes" })).toBe(false);
  });

  it("list: items with a lead ≤ 24, six markers, a drawing, weight and size 0–2", () => {
    const list = { kind: "list", items: ["Ena", { lead: "1998", text: "Odprli smo pekarno" }] };
    expect(okEl(list)).toBe(true);
    for (const marker of ["none", "rule", "dot", "dash", "line", "drawing"]) expect(okEl({ ...list, marker }), marker).toBe(true);
    expect(okEl({ ...list, marker: "number" })).toBe(false);
    expect(okEl({ ...list, items: [{ lead: "x".repeat(25), text: "Ena" }] })).toBe(false);
    expect(okEl({ ...list, items: [{ lead: "1998" }] })).toBe(false);
    expect(okEl({ ...list, items: [{ lead: "1998", text: "Ena", note: "x" }] })).toBe(false);
    expect(okEl({ ...list, marker: "drawing", drawing: "motif/bakery/wheat-ear-line" })).toBe(true);
    expect(okEl({ ...list, drawing: "wheat" })).toBe(false);
    for (const weight of ["regular", "medium", "bold"]) expect(okEl({ ...list, weight }), weight).toBe(true);
    expect(okEl({ ...list, weight: 700 })).toBe(false);
    expect(okEl({ ...list, size: 2 })).toBe(true);
    expect(okEl({ ...list, size: 3 })).toBe(false);
  });

  it("fact: an object name, a link target, label before or after, plate code", () => {
    const fact = { kind: "fact", value: "041 555 730", label: "Pokličite", treatment: "plate", size: 5 };
    expect(okEl({ ...fact, treatment: "badge", link: { action: "call" }, labelAt: "before", plateCode: true })).toBe(true);
    expect(okEl({ ...fact, link: { action: "fax" } })).toBe(false);
    expect(okEl({ ...fact, link: "tel:041555730" })).toBe(false);
    expect(okEl({ ...fact, labelAt: "above" })).toBe(false);
    expect(okEl({ ...fact, treatment: "Plate" })).toBe(false);
  });

  it("image: a scrim of a role at strength 1–4", () => {
    const image = { kind: "image", image: "img_a", ratio: "4:3", mask: "arch", treatment: "tint" };
    expect(okEl({ ...image, scrim: { role: "inverse", strength: 1 } }) && okEl({ ...image, scrim: { role: "inverse", strength: 4 } })).toBe(true);
    expect(okEl({ ...image, scrim: { role: "inverse", strength: 0 } })).toBe(false);
    expect(okEl({ ...image, scrim: { role: "inverse", strength: 5 } })).toBe(false);
    expect(okEl({ ...image, scrim: { role: "#000", strength: 2 } })).toBe(false);
    expect(okEl({ ...image, scrim: { strength: 2 } })).toBe(false);
  });

  it("prices: seven styles, phone columns 1–2, size 0–2, plate code", () => {
    const prices = { kind: "prices", style: "plates", items: [{ name: "Pregled", price: { amount: 20 } }] };
    for (const style of ["rows", "plates", "tags", "leaders", "board", "docket", "sheet"]) expect(okEl({ ...prices, style }), style).toBe(true);
    expect(okEl({ ...prices, style: "cards" })).toBe(false);
    expect(okEl({ ...prices, phoneColumns: 2, size: 2, plateCode: true })).toBe(true);
    expect(okEl({ ...prices, phoneColumns: 3 })).toBe(false);
    expect(okEl({ ...prices, phoneColumns: 0 })).toBe(false);
    expect(okEl({ ...prices, size: 3 })).toBe(false);
  });

  it("decor: a drawing id, colour, fit, fixed size 1–10, an x repeat", () => {
    const decor = { kind: "decor", drawing: "ornament/rope-line" };
    expect(okEl({ ...decor, color: "accent", fit: "fixed", size: 10, repeat: "x" })).toBe(true);
    expect(okEl({ ...decor, fit: "cell" })).toBe(true);
    expect(okEl({ ...decor, size: 0 })).toBe(false);
    expect(okEl({ ...decor, size: 11 })).toBe(false);
    expect(okEl({ ...decor, fit: "cover" })).toBe(false);
    expect(okEl({ ...decor, repeat: "y" })).toBe(false);
    expect(okEl({ ...decor, drawing: "icon/line/wifi" })).toBe(false);
    // A v19 motif decor still parses.
    expect(okEl({ kind: "decor", motif: "plate" })).toBe(true);
  });
});

describe("composition language v2: the preset fallback", () => {
  it("names a services list from items with a lead by their text", () => {
    const s = {
      id: "s_c",
      type: "composed",
      variant: "free",
      props: section({
        intent: "services",
        elements: [
          el({ id: "e_h", kind: "heading", text: "Storitve", level: 2, size: 4 }),
          { id: "e_l", kind: "list", items: ["Menjava olja", { lead: "1 ura", text: "Pregled zavor" }], desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
        ],
      }),
    };
    const parsed = Section.parse(s) as ComposedSection;
    expect(composedFallback(parsed)).toMatchObject({ type: "services-list", props: { items: [{ name: "Menjava olja" }, { name: "Pregled zavor" }] } });
  });
});

describe("composition language v2: section level", () => {
  it("background: 1–2 layers of field, photo and drawing", () => {
    const field = { kind: "field", role: "band", cols: { from: 1, to: 7 }, rows: { from: 1, to: 2 } };
    const photo = { kind: "photo", image: "img_a", treatment: "duotone", scrim: { role: "inverse", strength: 3 }, phone: "cover" };
    const drawing = { kind: "drawing", drawing: "motif/bakery/wheat-ear-line", scale: 4, anchor: "end", color: "border" };
    expect(okSection({ background: [field, photo] })).toBe(true);
    expect(okSection({ background: [drawing] })).toBe(true);
    expect(okSection({ background: [{ kind: "field", role: "surface" }] })).toBe(true);
    expect(okSection({ background: [] })).toBe(false);
    expect(okSection({ background: [field, photo, drawing] })).toBe(false);
    expect(okSection({ background: [{ kind: "gradient", role: "band" }] })).toBe(false);
    expect(okSection({ background: [{ ...field, cols: { from: 0, to: 12 } }] })).toBe(false);
    expect(okSection({ background: [{ ...field, cols: { from: 1, to: 13 } }] })).toBe(false);
    expect(okSection({ background: [{ ...field, rows: { from: 1, to: 9 } }] })).toBe(false);
    expect(okSection({ background: [{ ...field, role: "#123456" }] })).toBe(false);
    const { scrim: _s, ...noScrim } = photo;
    expect(okSection({ background: [noScrim] })).toBe(false);
    expect(okSection({ background: [{ ...photo, phone: "hidden" }] })).toBe(false);
    expect(okSection({ background: [{ ...drawing, scale: 0 }] })).toBe(false);
    expect(okSection({ background: [{ ...drawing, scale: 5 }] })).toBe(false);
    expect(okSection({ background: [{ ...drawing, anchor: "left" }] })).toBe(false);
  });

  it("top edge with rise 0–2 and a drawing; motion, pin, headerOver; texture as a vocabulary name", () => {
    expect(okSection({ top: { edge: "drawing", drawing: "ornament/rope-line", rise: 2 } })).toBe(true);
    expect(okSection({ top: { edge: "torn" } })).toBe(true);
    expect(okSection({ top: { edge: "torn", rise: 3 } })).toBe(false);
    expect(okSection({ top: { edge: "Torn" } })).toBe(false);
    expect(okSection({ top: { rise: 1 } })).toBe(false);
    expect(okSection({ motion: "reveal" })).toBe(true);
    expect(okSection({ motion: "Reveal!" })).toBe(false);
    expect(okSection({ pin: { col: 1, span: 5 } })).toBe(true);
    expect(okSection({ pin: { col: 13, span: 5 } })).toBe(false);
    expect(okSection({ pin: { col: 1, span: 0 } })).toBe(false);
    expect(okSection({ headerOver: true })).toBe(true);
    expect(okSection({ headerOver: "yes" })).toBe(false);
    expect(okSection({ surface: { texture: "paper", divider: "rule" } })).toBe(true);
    expect(okSection({ surface: { texture: "Paper" } })).toBe(false);
    expect(okSection({ surface: { divider: "torn" } })).toBe(false);
  });

  it("keeps the composed sheets m, s and j parsing", () => {
    for (const f of ["m", "s", "j"]) {
      const spec = JSON.parse(readFileSync(new URL(`../../../tools/eval/composed/${f}.json`, import.meta.url), "utf8")) as SiteSpec;
      for (const s of spec.pages.flatMap((p) => p.sections).filter((s) => s.type === "composed")) expect(ComposedProps.safeParse(s.props).success, `${f}: ${s.id}`).toBe(true);
    }
  });
});

describe("spec v20 outside the section: design.motion, design.wordmark, business.amenities", () => {
  const golden = (): SiteSpec => JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")) as SiteSpec;

  it("parse when set, and reject what is out of range", () => {
    const d = golden().design;
    expect(Design.safeParse({ ...d, motion: "lively", wordmark: { style: "plain", role: "display" } }).success).toBe(true);
    expect(Design.safeParse({ ...d, wordmark: { style: "plain" } }).success).toBe(true);
    expect(Design.safeParse({ ...d, motion: "wild" }).success).toBe(false);
    expect(Design.safeParse({ ...d, wordmark: { style: "Plain" } }).success).toBe(false);
    expect(Design.safeParse({ ...d, wordmark: { style: "plain", role: "logo" } }).success).toBe(false);
    expect(Design.safeParse({ ...d, wordmark: { style: "plain", symbol: "bread" } }).success).toBe(false);
    const b = golden().business;
    expect(Business.safeParse({ ...b, amenities: ["parking", "card", "wifi"] }).success).toBe(true);
    expect(Business.safeParse({ ...b, amenities: Array.from({ length: 20 }, () => "wifi") }).success).toBe(true);
    expect(Business.safeParse({ ...b, amenities: Array.from({ length: 21 }, () => "wifi") }).success).toBe(false);
    expect(Business.safeParse({ ...b, amenities: ["Free WiFi"] }).success).toBe(false);
  });

  it("are never in the model's JSON Schema; the composed props name their vocabularies", () => {
    const business = toModelJsonSchema(Business) as { properties: Record<string, unknown> };
    expect(Object.keys(business.properties)).not.toContain("amenities");
    const design = toModelJsonSchema(Design) as { properties: Record<string, unknown> };
    expect(Object.keys(design.properties)).not.toContain("motion");
    expect(Object.keys(design.properties)).not.toContain("wordmark");
    expect(JSON.stringify([business, design])).not.toContain(SYSTEM_ONLY);
    const composed = JSON.stringify(toModelJsonSchema(ComposedProps));
    for (const v of ["MASKS", "IMAGE_TREATMENTS", "TEXTURES", "EDGES", "FACT_OBJECTS", "TYPE_TREATMENTS", "MOTIONS", "PRACTICAL_FACTS", "DRAWINGS"]) expect(composed).toContain(`"${VOCAB_KEY}":"${v}"`);
    expect(composed).not.toContain('"const"');
  });
});

describe("the Drawing format", () => {
  const d = { id: "ornament/rope-line", style: "line", viewBox: [120, 24], paths: [{ d: "M0 12 C20 0 40 24 60 12", fill: "none", stroke: "text", width: 1.5 }], repeat: { axis: "x", gap: 8 } };
  const ok = (more: object) => Drawing.safeParse({ ...d, ...more }).success;

  it("parses path data with roles, a viewBox 8–400 and 1–24 paths", () => {
    expect(ok({})).toBe(true);
    expect(ok({ style: "solid", repeat: undefined })).toBe(true);
    expect(ok({ style: "sketch" })).toBe(false);
    expect(ok({ viewBox: [7, 24] })).toBe(false);
    expect(ok({ viewBox: [120, 401] })).toBe(false);
    expect(ok({ viewBox: [120] })).toBe(false);
    expect(ok({ paths: [] })).toBe(false);
    expect(ok({ paths: Array.from({ length: 25 }, () => d.paths[0]) })).toBe(false);
    expect(ok({ paths: [{ ...d.paths[0], stroke: "#000" }] })).toBe(false);
    expect(ok({ id: "icon/line/wifi" })).toBe(false);
    expect(ok({ repeat: { axis: "y", gap: 8 } })).toBe(false);
    expect(ok({ repeat: { axis: "x", gap: -1 } })).toBe(false);
  });
});
