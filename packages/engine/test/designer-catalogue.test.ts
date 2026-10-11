import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComposedProps, DecorPath, VOCAB_KEY, VOCABS, Vocab, expandRefs, toModelJsonSchema } from "@sb/spec";
import {
  COMPACT_NOTATION,
  COMPOSED_SHARED,
  CompactWriter,
  VOCAB_NOTATION,
  canonical,
  catalogueAliases,
  compactPattern,
  composedAliases,
  designerCatalogue,
} from "../src/index.ts";
import { toStructuredOutputSchema } from "../src/llm/structured-schema.ts";
import { Reader, aliasesOf, normal, sectionsOf } from "./compact-reader.ts";

type Js = Record<string, unknown>;

/** Every node of a JSON Schema naming a vocabulary, by list (its description aside). */
function vocabNodes(js: unknown, out = new Map<string, Js>()): Map<string, Js> {
  if (Array.isArray(js)) for (const x of js) vocabNodes(x, out);
  else if (js && typeof js === "object") {
    const node = js as Js;
    if (typeof node[VOCAB_KEY] === "string") {
      const { description: _d, ...rest } = node;
      out.set(node[VOCAB_KEY], rest);
    }
    for (const x of Object.values(node)) vocabNodes(x, out);
  }
  return out;
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

/** A composed section using every shared shape and most vocabularies, as the designer might write it. */
const SAMPLE = {
  intent: "hero",
  width: "wide",
  rows: 3,
  surface: { texture: "grain" },
  top: { edge: "drawing", drawing: "ornament/rope-line" },
  motion: "reveal",
  background: [{ kind: "photo", image: "img_front", scrim: { role: "inverse", strength: 3 }, treatment: "duotone" }],
  elements: [
    { id: "e_h", kind: "heading", text: "Kruh iz kvasa", level: 1, size: 7, treatment: "stacked", color: "onInverse", desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
    { id: "e_img", kind: "image", image: "img_front", ratio: "4:5", mask: "arch", scrim: { role: "inverse", strength: 2 }, desk: { col: 8, span: 5, row: 1, rowSpan: 3, tilt: 2 }, phone: { order: 1, span: "bleed" } },
    { id: "e_f", kind: "fact", value: "1987", label: "pečemo od", treatment: "stamp", size: 4, link: { action: "call" }, desk: { col: 1, span: 3, row: 2 }, phone: { order: 2, span: "half" } },
    { id: "e_a", kind: "action", action: "link", label: "Ponudba", link: { label: "Ponudba", target: { page: "p_ponudba" } }, style: "primary", desk: { col: 4, span: 3, row: 2 }, phone: { order: 3, span: "half" } },
    { id: "e_p", kind: "prices", items: [{ name: "Hlebec", price: { amount: 4.5 } }, { name: "Torta", price: { $placeholder: "price" } }], style: "rows", desk: { col: 1, span: 6, row: 3 }, phone: { order: 4, span: "full" } },
    { id: "e_d", kind: "decor", svg: { width: 40, height: 40, paths: [{ d: "M0 0 L40 40", fill: "none", stroke: "accent" }] }, desk: { col: 7, span: 1, row: 3 }, phone: { order: 5, span: "full", hidden: true } },
    { id: "e_i", kind: "iconFacts", items: [{ fact: "parking" }, { fact: "card" }], desk: { col: 1, span: 4, row: 1, shiftY: 1 }, phone: { order: 6, span: "full" } },
    { id: "e_l", kind: "list", items: ["Kvas", { lead: "7:00", text: "Odpremo" }], marker: "drawing", drawing: "motif/bakery/wheat-ear-line", desk: { col: 1, span: 4, row: 2 }, phone: { order: 7, span: "full" } },
  ],
};

describe("compact writer: patterns with whitespace (the decor path)", () => {
  it("writes a pattern with a space as it is instead of throwing", () => {
    const w = new CompactWriter();
    expect(w.type({ type: "string", pattern: "^[a-z ,.-]{1,20}$" })).toBe("str /^[a-z ,.-]{1,20}$/");
    expect(() => w.type(toModelJsonSchema(DecorPath))).not.toThrow();
    expect(w.type(toModelJsonSchema(DecorPath))).toContain("d: str /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]{1,2000}$/");
  });

  it("keeps any pattern on one line and closed by its first unescaped slash, as the same regex", () => {
    const NBSP = String.fromCharCode(0xa0);
    for (const p of ["^a b$", "^a\tb$", "^a\nb$", `^a${NBSP}b$`, "^a/b$", "^a\\/b$", "^[/ ]+$", "^\\s+$"]) {
      const out = compactPattern(p);
      expect(out, p).not.toMatch(/[\n\r\t]/);
      expect(out, p).not.toContain(NBSP);
      // The first unescaped "/" is the end: there is none inside.
      expect(out.replace(/\\./g, ""), p).not.toContain("/");
      for (const probe of ["a b", "a\tb", "a\nb", `a${NBSP}b`, "a/b", "/ /", "  ", "ab"]) expect(new RegExp(out).test(probe), `${p} on ${JSON.stringify(probe)}`).toBe(new RegExp(p).test(probe));
    }
  });

  it("reads back the decor pattern with the test reader", () => {
    const js = toModelJsonSchema(DecorPath);
    expect(canonical(Reader.parse(new CompactWriter().type(js), {}))).toBe(canonical(normal(js)));
  });
});

describe("designer catalogue, compact (shared types and vocabularies named once)", () => {
  const text = designerCatalogue({ compact: true });
  const expanded = toModelJsonSchema(ComposedProps);
  const vocab = vocabNodes(expanded);

  it("defines each shared type and each vocabulary used exactly once, in the header", () => {
    expect(text).toContain(`${COMPACT_NOTATION} ${VOCAB_NOTATION}`);
    const header = text.split("\n### ")[0]!;
    const names = [...header.matchAll(/^([A-Z][A-Za-z_]+) = /gm)].map((m) => m[1]!);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["ColorRole", "Scrim", "ElementId", "Place", "PhonePlace", "ImageId", "Link", "LinkTarget", "Price", "Placeholder", "PageId"]) expect(names, name).toContain(name);
    expect(names.filter((n) => n in VOCABS).sort()).toEqual([...vocab.keys()].sort());
    // The shapes themselves appear once: nowhere inline in the props.
    expect(count(text, '"background"|"surface"|"text"')).toBe(1);
    expect(count(text, "First column, 1–12")).toBe(1);
    expect(count(text, "bleed: edge to edge")).toBe(1);
    expect(count(text, '"parking"|"free-parking"')).toBe(1);
    expect(count(text, VOCAB_KEY)).toBe(0);
  });

  it("every capitalised type in the props resolves to a definition", () => {
    const aliases = aliasesOf(text);
    const props = sectionsOf(text).get("composed")!.props;
    const words = new Set([...props.replace(/"(?:[^"\\]|\\.)*"/g, "").replace(/\/\/.*$/gm, "").matchAll(/\b([A-Z][A-Za-z_]+)\b/g)].map((m) => m[1]!));
    expect(words.size).toBeGreaterThan(5);
    for (const w of words) expect(aliases, w).toHaveProperty(w);
  });

  it("each vocabulary is its full list, and every name in it passes the field's own schema", () => {
    const aliases = aliasesOf(text);
    for (const [list, node] of vocab) {
      expect(aliases[list], list).toEqual({ type: "string", enum: [...VOCABS[list as keyof typeof VOCABS]] });
      const re = new RegExp(node.pattern as string);
      for (const n of VOCABS[list as keyof typeof VOCABS]) {
        expect(re.test(n), `${list} ${n}`).toBe(true);
        if (node.maxLength !== undefined) expect(n.length).toBeLessThanOrEqual(node.maxLength as number);
      }
    }
  });

  it("round trip: the props parse back into exactly the expanded JSON Schema (vocabulary names read as their fields)", () => {
    const aliases = aliasesOf(text);
    for (const [list, node] of vocab) aliases[list] = node;
    const parsed = Reader.parse(sectionsOf(text).get("composed")!.props, aliases);
    expect(canonical(parsed)).toBe(canonical(normal(expanded)));
  });

  it("is under 2.6k tokens (chars / 4) for the shared types and props", () => {
    const body = text.slice(text.indexOf("Shared types:\n"));
    console.log(`designer catalogue (compact): ${text.length} chars ≈ ${Math.round(text.length / 4)} tokens; shared types + props ${body.length} ≈ ${Math.round(body.length / 4)}`);
    expect(body.length / 4).toBeLessThanOrEqual(2600);
  });

  it("without the vocabularies the writer refuses x-vocab as before (the designer-off writers)", () => {
    expect(() => new CompactWriter(catalogueAliases()).type(toModelJsonSchema(Vocab("MASKS")))).toThrow(/unsupported JSON Schema keyword "x-vocab"/);
    expect(() => new CompactWriter(composedAliases(), { MASKS: ["Not A Name"] }).type(toModelJsonSchema(Vocab("MASKS")))).toThrow(/fails its field's schema/);
    expect(() => new CompactWriter(composedAliases(), {}).type(toModelJsonSchema(Vocab("MASKS")))).toThrow(/unknown vocabulary/);
  });
});

describe("designer catalogue, JSON ($defs and $ref)", () => {
  const expanded = toModelJsonSchema(ComposedProps);
  const aliased = toModelJsonSchema(ComposedProps, { shared: COMPOSED_SHARED });
  const json = JSON.stringify(aliased);

  it("defines each shared shape and vocabulary once and every $ref resolves internally", () => {
    const defs = aliased.$defs as Record<string, Js>;
    const names = Object.keys(defs);
    for (const name of ["ColorRole", "Scrim", "ElementId", "Place", "PhonePlace", "ImageId", "Link", "LinkTarget", "Price", "Placeholder", "PageId"]) expect(names, name).toContain(name);
    expect(names.filter((n) => n in VOCABS).sort()).toEqual([...vocabNodes(expanded).keys()].sort());
    const refs = [...json.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(50);
    for (const r of refs) {
      expect(r.startsWith("#/$defs/"), r).toBe(true);
      expect(names, r).toContain(r.slice("#/$defs/".length));
    }
    // Each def is used, and no def refers to itself (structured outputs reject recursive schemas).
    for (const n of names) expect(refs, n).toContain(`#/$defs/${n}`);
    for (const [n, d] of Object.entries(defs)) expect(JSON.stringify(d), n).not.toContain(`"#/$defs/${n}"`);
    expect(count(json, "First column, 1–12")).toBe(1);
    expect(count(json, '"background","surface","text"')).toBe(1);
  });

  it("round trip: expanding the refs gives the expanded schema back exactly", () => {
    expect(canonical(expandRefs(aliased))).toBe(canonical(expanded));
  });

  it("a designer's section valid against the expanded schema is valid against the aliased one, and the same mistakes fail both", () => {
    expect(ComposedProps.safeParse(SAMPLE).success).toBe(true);
    const viaRefs = z.fromJSONSchema(aliased as never);
    const viaExpanded = z.fromJSONSchema(expanded as never);
    expect(viaExpanded.safeParse(SAMPLE).success).toBe(true);
    expect(viaRefs.safeParse(SAMPLE).success).toBe(true);
    const bad = [
      { ...SAMPLE, elements: [{ ...SAMPLE.elements[0], color: "#ff0000" }] },
      { ...SAMPLE, elements: [{ ...SAMPLE.elements[0], desk: { col: 13, span: 1, row: 1 } }] },
      { ...SAMPLE, elements: [{ ...SAMPLE.elements[0], phone: { order: 0 } }] },
      { ...SAMPLE, elements: [{ ...SAMPLE.elements[1], scrim: { role: "inverse", strength: 9 } }] },
      { ...SAMPLE, elements: [{ ...SAMPLE.elements[0], id: "x" }] },
      { ...SAMPLE, surface: { texture: "Not a name" } },
    ];
    for (const b of bad) {
      expect(viaExpanded.safeParse(b).success, JSON.stringify(b).slice(0, 80)).toBe(false);
      expect(viaRefs.safeParse(b).success, JSON.stringify(b).slice(0, 80)).toBe(false);
    }
  });

  it("is about 40 % of the expanded JSON, and survives the structured-output conversion with its $defs", () => {
    console.log(`composed props JSON: ${JSON.stringify(expanded).length} → ${json.length} chars`);
    expect(json.length).toBeLessThan(JSON.stringify(expanded).length * 0.45);
    const so = toStructuredOutputSchema(aliased) as Js;
    expect(Object.keys(so.$defs as Js)).toEqual(Object.keys(aliased.$defs as Js));
    expect(JSON.stringify(so)).not.toMatch(/"(minimum|maximum|maxLength|minLength)":/);
  });

  it("the JSON designer catalogue prints that schema", () => {
    expect(designerCatalogue()).toContain(`Props schema: ${json}`);
  });
});
