import { describe, expect, it } from "vitest";
import {
  SLOTS,
  SLOT_MARKER,
  fillPreset,
  fullSources,
  hasSlotMarker,
  parseSlot,
  presetSection,
  presetSources,
  slotProblem,
  slotValue,
  validateComposition,
  validatePreset,
  validateSite,
  walkStrings,
  type CompositionPreset,
  type PresetSources,
  type SiteSpec,
} from "../src/index.ts";
import { composed, composedFixture, golden, heading, text } from "./helpers/composed.ts";

/** Composition presets (studio-phase1-design.md §5, I3-0): the slot vocabulary, fillPreset and the leftover-marker guard. */

const d = (col: number, span: number, row: number, rowSpan?: number) => ({ col, span, row, ...(rowSpan ? { rowSpan } : {}) });
const ph = (order: number) => ({ order, span: "full" as const });

/** A split opener: headline, lead and call on the left, a photo on the right. */
const split = (more: Partial<CompositionPreset> = {}): CompositionPreset => ({
  id: "composition/hero/test-split",
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, desk: d(1, 7, 1), phone: ph(0) },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: d(1, 6, 2), phone: ph(1) },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite {business.name}", style: "primary", desk: d(1, 4, 3), phone: ph(2) },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", desk: d(8, 5, 1, 3), phone: ph(3) },
    ],
  },
  ...more,
});

/** Prices from the brief's offerings beside a heading. */
const priceList = (): CompositionPreset => ({
  id: "composition/prices/test-rows",
  props: {
    intent: "prices",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "Cenik", level: 2, size: 4, desk: d(1, 5, 1), phone: ph(0) },
      {
        id: "e_p",
        kind: "prices",
        style: "rows",
        items: [0, 1, 2, 3].map((i) => ({ name: `{brief.offerings[${i}].name}`, note: `{brief.offerings[${i}].description}`, price: `{brief.offerings[${i}].price}` })),
        desk: d(7, 6, 1, 2),
        phone: ph(1),
      },
    ],
  },
});

const pekarna = (copy: PresetSources["copy"] = { headline: "Kruh z drožmi, ki vzhaja čez noč", lead: "Družinska pekarna na začetku stare ulice." }): PresetSources =>
  presetSources(golden("pekarna-kvas"), {
    summary: "Mala družinska pekarna v Kamniku.",
    highlights: ["Samo z drožmi"],
    offerings: [
      { name: "Pirin kruh z drožmi", description: "Vzhajan čez noč.", group: "Kruh", price: { amount: 4.2, from: false, unit: null } },
      { name: "Polnozrnate žemlje", description: null, group: "Kruh", price: null },
      { name: "Orehova potica", description: null, group: null, price: { amount: 18, from: true, unit: "1 kg" } },
    ],
    facts: { people: [{ name: "Jure Petek", role: "pek" }] },
  }, copy);

const strings = (v: unknown): string[] => {
  const out: string[] = [];
  walkStrings(v, (s) => out.push(s));
  return out;
};

describe("slot vocabulary", () => {
  it("names a fixed list; indices 0–11", () => {
    expect(parseSlot("brief.offerings[2].name")).toEqual({ pattern: "brief.offerings[].name", indices: [2] });
    expect(slotProblem("business.name")).toBeNull();
    expect(slotProblem("brief.offerings[11].price")).toBeNull();
    expect(slotProblem("brief.offerings[12].price")).toMatch(/index 12/);
    expect(slotProblem("business.rating")).toMatch(/unknown slot/);
    expect(slotProblem("brief.offerings.name")).toMatch(/unknown slot/);
    expect(Object.keys(SLOTS)).toHaveLength(28);
  });

  it("the marker pattern is the design's", () => {
    expect(SLOT_MARKER.source).toBe("\\{[a-z][a-z0-9.[\\]]*\\}");
    expect(hasSlotMarker("Pokličite {business.name}")).toBe(true);
    expect(hasSlotMarker("{images[0]}")).toBe(true);
    expect(hasSlotMarker("Odprto {Pon}–pet")).toBe(false);
    expect(hasSlotMarker("{ business.name }")).toBe(false);
  });

  it("reads values only from the sources: phone as dialled, address on one line, a placeholder fact has none", () => {
    const src = pekarna();
    expect(slotValue("business.phone", src)).toBe("041 555 906");
    expect(slotValue("business.address", src)).toBe("Šutna 30, 1241 Kamnik");
    expect(slotValue("business.town", src)).toBe("Kamnik");
    expect(slotValue("brief.priced[1].name", src)).toBe("Orehova potica");
    expect(slotValue("brief.offerings[1].price", src)).toEqual({ $placeholder: "price" });
    expect(slotValue("brief.offerings[2].price", src)).toEqual({ amount: 18, from: true, unit: "1 kg" });
    expect(slotValue("brief.people[0].role", src)).toBe("pek");
    expect(slotValue("brief.offerings[3].name", src)).toBeUndefined();
    expect(slotValue("images[2]", src)).toBe("img_03");
    const noAddress = { ...src, business: { ...src.business, address: { $placeholder: "address" as const } } };
    expect(slotValue("business.address", noAddress)).toBeUndefined();
    expect(slotValue("business.town", noAddress)).toBeUndefined();
  });
});

describe("validatePreset", () => {
  it("passes a well-formed preset", () => {
    expect(validatePreset(split())).toEqual([]);
    expect(validatePreset(priceList())).toEqual([]);
  });

  it("rejects unknown and malformed markers", () => {
    const p = split();
    (p.props.elements[0] as { text: string }).text = "{business.rating} in {Business.Name}";
    const problems = validatePreset(p);
    expect(problems.some((m) => /unknown slot \{business\.rating\}/.test(m))).toBe(true);
    expect(problems.some((m) => /malformed marker \{Business\.Name\}/.test(m))).toBe(true);
  });

  it("price, image and amenity slots only as the whole value of their field; text slots never there", () => {
    const p = split();
    (p.props.elements[1] as { paragraphs: string[] }).paragraphs = ["Od {brief.offerings[0].price} naprej"];
    (p.props.elements[3] as { image: string }).image = "{business.name}";
    const problems = validatePreset(p);
    expect(problems.some((m) => /fills a price and must be the whole value/.test(m))).toBe(true);
    expect(problems.some((m) => /\{business\.name\} is text; a image field/.test(m))).toBe(true);
  });

  it("images and prices come from slots; fixed copy carries no numbers", () => {
    const p = priceList();
    (p.props.elements[1] as { items: { price: unknown }[] }).items[0]!.price = { amount: 12 };
    (p.props.elements[0] as { text: string }).text = "Cenik 2026";
    const q = split();
    (q.props.elements[3] as { image: string }).image = "img_01";
    expect(validatePreset(p).some((m) => /a price must be a slot/.test(m))).toBe(true);
    expect(validatePreset(p).some((m) => /fixed copy with a number "Cenik 2026"/.test(m))).toBe(true);
    expect(validatePreset(q).some((m) => /image must be a slot/.test(m))).toBe(true);
  });

  it("id, intent, needs and reflow must agree with the props", () => {
    expect(validatePreset(split({ id: "composition/story/test-split" }))[0]).toMatch(/intent story but props.intent hero/);
    expect(validatePreset(split({ id: "composition/hero/Test" }))[0]).toMatch(/not composition\/<intent>\/<name>/);
    expect(validatePreset(split({ needs: ["copy.title"] }))).toEqual(["needs: unknown slot {copy.title}"]);
    expect(validatePreset(split({ reflow: { e_gone: { e_title: { span: 9 } } } }))).toEqual(["reflow: no element e_gone"]);
  });

  it("must fill from full sources with nothing dropped and 0 guard issues", () => {
    const p = split();
    (p.props.elements[1] as { desk: object }).desk = d(1, 7, 1); // the lead on the headline: text over text
    expect(validatePreset(p).join(" ")).toMatch(/full sources: invalid .*overlaps/);
    expect(fillPreset(split(), fullSources()).ok).toBe(true);
  });
});

describe("fillPreset", () => {
  it("fills every marker; no marker survives; the result passes the guards", () => {
    const r = fillPreset(split(), pekarna());
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped).toEqual([]);
    expect(strings(r.props).filter(hasSlotMarker)).toEqual([]);
    expect(r.props.elements.map((e) => e.kind)).toEqual(["heading", "text", "action", "image"]);
    expect(r.props.elements[0]).toMatchObject({ text: "Kruh z drožmi, ki vzhaja čez noč" });
    expect(r.props.elements[2]).toMatchObject({ label: "Pokličite Pekarna Kvas" });
    expect(r.props.elements[3]).toMatchObject({ image: "img_01" });
    expect(validateComposition(presetSection(split(), r.props))).toEqual([]);
  });

  it("a missing slot drops its element; the preset's reflow closes the gap and empty rows go", () => {
    const p = split({ reflow: { e_photo: { e_title: { span: 10 } } } });
    const r = fillPreset(p, { ...pekarna(), images: [] });
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped).toEqual([{ id: "e_photo", kind: "image", missing: ["images[0]"] }]);
    expect(r.props.elements.find((e) => e.id === "e_title")!.desk.span).toBe(10);
    expect(r.props.rows).toBe(3);
  });

  it("without a reflow the fluid neighbours widen into the gap (text clamped by the guard repair)", () => {
    const r = fillPreset(split(), { ...pekarna(), images: [] });
    if (!r.ok) throw new Error(r.issues.join("; "));
    const span = (id: string) => r.props.elements.find((e) => e.id === id)!.desk.span;
    expect([span("e_title"), span("e_lead"), span("e_call")]).toEqual([12, 8, 4]);
    expect(r.repairs.some((l) => /text spans 8 columns \(was 12\)/.test(l))).toBe(true);
  });

  it("a dropped element alone in its row takes the row with it; the rows below move up", () => {
    const p: CompositionPreset = {
      id: "composition/story/test-rows",
      props: {
        intent: "story",
        width: "wide",
        rows: 3,
        background: [{ kind: "field", role: "surface", cols: { from: 1, to: 12 }, rows: { from: 3, to: 3 } }],
        elements: [
          { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: d(1, 6, 1), phone: ph(0) },
          { id: "e_q", kind: "quote", text: "{brief.highlights[5]}", desk: d(1, 8, 2), phone: ph(1) },
          { id: "e_t", kind: "text", paragraphs: ["{brief.summary}"], desk: d(1, 6, 3), phone: ph(2) },
        ],
      },
    };
    const r = fillPreset(p, pekarna());
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped.map((x) => x.id)).toEqual(["e_q"]);
    expect(r.props.rows).toBe(2);
    expect(r.props.elements.map((e) => [e.id, e.desk.row])).toEqual([["e_h", 1], ["e_t", 2]]);
    expect(r.props.background).toEqual([{ kind: "field", role: "surface", cols: { from: 1, to: 12 }, rows: { from: 2, to: 2 } }]);
  });

  it("a lead missing beside a tall photo is a hole unless the preset moves something into it", () => {
    expect(fillPreset(split(), pekarna({ headline: "Kruh z drožmi" }))).toMatchObject({ ok: false, reason: "hole", missing: ["copy.lead"] });
    const r = fillPreset(split({ reflow: { e_lead: { e_call: { row: 2 } } } }), pekarna({ headline: "Kruh z drožmi" }));
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.props.elements.find((e) => e.id === "e_call")!.desk.row).toBe(2);
  });

  it("a gap above content that no neighbour closes is a hole: the preset isn't used", () => {
    const p: CompositionPreset = {
      id: "composition/story/test-hole",
      props: {
        intent: "story",
        width: "wide",
        rows: 2,
        elements: [
          { id: "e_q", kind: "quote", text: "{brief.highlights[3]}", desk: d(1, 5, 1), phone: ph(0) },
          { id: "e_h", kind: "heading", text: "Zgodba", level: 2, size: 4, desk: d(1, 5, 2), phone: ph(1) },
          { id: "e_i", kind: "image", image: "{images[0]}", ratio: "4:5", desk: d(7, 6, 1, 2), phone: ph(2) },
        ],
      },
    };
    const r = fillPreset(p, pekarna());
    expect(r).toMatchObject({ ok: false, reason: "hole", missing: ["brief.highlights[3]"] });
  });

  it("list and price items without a value are removed; an offering without a price is the marked placeholder", () => {
    const r = fillPreset(priceList(), pekarna());
    if (!r.ok) throw new Error(r.issues.join("; "));
    const prices = r.props.elements.find((e) => e.kind === "prices");
    expect(prices && prices.kind === "prices" && prices.items).toEqual([
      { name: "Pirin kruh z drožmi", note: "Vzhajan čez noč.", price: { amount: 4.2 } },
      { name: "Polnozrnate žemlje", price: { $placeholder: "price" } },
      { name: "Orehova potica", price: { amount: 18, from: true, unit: "1 kg" } },
    ]);
  });

  it("an element whose list is left empty is dropped; with nothing that carries words left, the preset isn't used", () => {
    const r = fillPreset(priceList(), { ...pekarna(), brief: {} });
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped).toEqual([{ id: "e_p", kind: "prices", missing: ["brief.offerings[0].name", "brief.offerings[0].description", "brief.offerings[0].price", "brief.offerings[1].name", "brief.offerings[1].description", "brief.offerings[1].price", "brief.offerings[2].name", "brief.offerings[2].description", "brief.offerings[2].price", "brief.offerings[3].name", "brief.offerings[3].description", "brief.offerings[3].price"] }]);
    const photoOnly: CompositionPreset = { id: "composition/gallery/test-one", props: { intent: "gallery", width: "wide", rows: 1, elements: [{ id: "e_i", kind: "image", image: "{images[0]}", ratio: "4:5", desk: d(1, 6, 1), phone: ph(0) }, { id: "e_t", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: d(8, 5, 1), phone: ph(1) }] } };
    expect(fillPreset(photoOnly, pekarna({}))).toMatchObject({ ok: false, reason: "empty" });
  });

  it("needs: a preset without its required slot isn't used", () => {
    expect(fillPreset(split(), pekarna({}))).toMatchObject({ ok: false, reason: "needs", missing: ["copy.headline"] });
  });

  it("business facts a kind needs: a call without a phone is dropped, contact lines without a value are left out", () => {
    const src = pekarna();
    const noPhone = { ...src, business: { ...src.business, phone: { $placeholder: "phone" as const } } };
    const r = fillPreset(split(), noPhone);
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped).toEqual([{ id: "e_call", kind: "action", missing: ["business.phone"] }]);
    const contact: CompositionPreset = {
      id: "composition/contact/test-lines",
      props: { intent: "contact", width: "contained", rows: 2, elements: [{ id: "e_h", kind: "heading", text: "Kontakt", level: 2, size: 4, desk: d(1, 6, 1), phone: ph(0) }, { id: "e_c", kind: "contact", show: ["phone", "email", "address"], desk: d(1, 6, 2), phone: ph(1) }] },
    };
    const c = fillPreset(contact, noPhone);
    expect(c.ok && c.props.elements[1]).toMatchObject({ show: ["email", "address"] });
  });
});

describe("the leftover-marker guard", () => {
  it("validateComposition rejects any composed string that still holds a marker", () => {
    const s = composed([heading("e_head", d(1, 6, 1), 0, { text: "Dobrodošli v {business.name}" }), text("e_text", d(1, 6, 2), 1, { paragraphs: ["{brief.summary}"] })]);
    const issues = validateComposition(s, { at: "/pages/0/sections/1" });
    expect(issues.filter((i) => /unfilled slot marker/.test(i.message)).map((i) => i.path)).toEqual(["/pages/0/sections/1/props/elements/0/text", "/pages/0/sections/1/props/elements/1/paragraphs/0"]);
  });

  it("reaches publishing: validateSite reports it on a site", () => {
    const spec = structuredClone(composedFixture("m")) as SiteSpec;
    const page = spec.pages.find((p) => p.sections.some((s) => s.type === "composed"))!;
    const s = page.sections.find((x) => x.type === "composed")!;
    const h = (s.props as { elements: { kind: string; text?: string }[] }).elements.find((e) => e.kind === "heading")!;
    expect(validateSite(spec).issues.filter((i) => /unfilled slot marker/.test(i.message))).toEqual([]);
    h.text = "{copy.headline}";
    const v = validateSite(spec);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => /unfilled slot marker \{copy\.headline\}/.test(i.message))).toBe(true);
  });

  it("text with braces that aren't a marker passes", () => {
    const s = composed([heading("e_head", d(1, 6, 1), 0, { text: "Kruh {Pon–Pet}" })]);
    expect(validateComposition(s).filter((i) => /slot marker/.test(i.message))).toEqual([]);
  });
});
