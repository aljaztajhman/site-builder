import { describe, expect, it } from "vitest";
import { COMPOSED_LAYOUT_KEYS, translatableTexts, type SiteSpec } from "../src/index.ts";

/** Quotes and the map's verbatim text are the client's words, shown as written in every language (studio-phase1-design.md §1.8). */
const desk = { col: 1, span: 6, row: 1 };
const phone = { order: 0, span: "full" };
const el = (e: object) => ({ id: "e_x", desk, phone, ...e });
const spec = (elements: unknown[]) =>
  ({ pages: [{ id: "p_home", sections: [{ id: "s_c", type: "composed", props: { intent: "story", width: "wide", rows: 2, elements } }] }] }) as unknown as SiteSpec;

describe("untranslated verbatim fields of a composed section", () => {
  it("leaves out a quote's text and attribution and a map's cross street and note, and keeps the rest", () => {
    const texts = translatableTexts(
      spec([
        el({ kind: "quote", text: "Lana mi je rešila dan", by: "Maja Novak" }),
        el({ kind: "map", style: "corner", cross: "Kidričeva ulica", note: "Ob parkirišču" }),
        el({ kind: "heading", text: "Naša zgodba", level: 2, size: 4 }),
        el({ kind: "sticker", text: "Brez čakanja", shape: "round" }),
        el({ kind: "photos", arrangement: "strip", images: ["img_a", "img_b"], captions: ["Pred", "Po"] }),
        el({ kind: "list", items: [{ lead: "Pon", text: "Zaprto" }] }),
      ]),
    ).map((t) => t.path.replace("/pages/0/sections/0/props/elements/", ""));
    expect(texts).toEqual(["2/text", "3/text", "4/captions/0", "4/captions/1", "5/items/0/lead", "5/items/0/text"]);
  });

  it("does not take a `text` or `by` of another element for a quote's", () => {
    const texts = translatableTexts(spec([el({ kind: "heading", text: "Naslov", level: 2, size: 4 })])).map((t) => t.text);
    expect(texts).toEqual(["Naslov"]);
  });
});

describe("COMPOSED_LAYOUT_KEYS holds the v20 layout fields", () => {
  it("has the 33 keys of §1.8", () => {
    const keys = "arrangement edge rise motion pin headerOver kind role cols rows scale anchor strength fit repeat labelAt plateCode phoneColumns marker weight shape move icons color fill bleedX bleedY tilt treatment mask drawing separator style fact".split(" ");
    expect(keys.filter((k) => !COMPOSED_LAYOUT_KEYS.has(k))).toEqual([]);
  });
});
