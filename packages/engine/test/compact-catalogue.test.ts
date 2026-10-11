import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { Business, SECTION_DEFS, toModelJsonSchema, type SiteSpec } from "@sb/spec";
import {
  ALL_PROMPT_FIXES,
  CATALOGUE_DESCRIPTIONS,
  COMPACT_NOTATION,
  CompactWriter,
  HERO_EYEBROW_NEW,
  HERO_EYEBROW_OLD,
  ModelClient,
  NO_PROMPT_FIXES,
  SLOVENE_STYLE,
  businessSchema,
  canonical,
  catalogueAliases,
  compactSectionCatalogue,
  critique,
  directionsCatalogue,
  editSpec,
  editSystem,
  sectionCatalogue,
  type ModelRequest,
  type PromptFixes,
} from "../src/index.ts";
import { Reader, aliasesOf, normal, sectionsOf } from "./compact-reader.ts";

type Js = Record<string, unknown>;
const config = loadConfig();
const SECTIONS = SECTION_DEFS.filter((d) => !d.systemOnly && !d.ownerOnly && !d.designerOnly);
const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const golden = (id: string) => JSON.parse(readFileSync(path.join(evalDir, "golden", `${id}.json`), "utf8")) as SiteSpec;

const withFix = (f: PromptFixes) => (json: Js): Js => (f.catalogue ? (JSON.parse(JSON.stringify(json).split(JSON.stringify(HERO_EYEBROW_OLD).slice(1, -1)).join(JSON.stringify(HERO_EYEBROW_NEW).slice(1, -1))) as Js) : json);

describe("compact catalogue notation (prompts.compactCatalogue)", () => {
  for (const [name, fixes] of [
    ["fixes off", NO_PROMPT_FIXES],
    ["catalogue fix on", { ...NO_PROMPT_FIXES, catalogue: true }],
    ["every fix on", ALL_PROMPT_FIXES],
  ] as const) {
    it(`${name}: every section, variant, description and prop with every limit parses back into its JSON Schema`, () => {
      const text = compactSectionCatalogue(fixes);
      expect(text).toBe(sectionCatalogue(fixes, { compact: true }));
      expect(text).toContain(COMPACT_NOTATION);
      const aliases = aliasesOf(text);
      expect(Object.keys(aliases)).toEqual(["PageId", "ImageId", "LinkTarget", "Link", "Placeholder", "Price"]);
      const blocks = sectionsOf(text);
      expect([...blocks.keys()]).toEqual(SECTIONS.map((d) => d.type));
      for (const d of SECTIONS) {
        const b = blocks.get(d.type)!;
        const fix = fixes.catalogue ? CATALOGUE_DESCRIPTIONS[d.type] : undefined;
        expect(b.lines, d.type).toEqual([`Variants: ${d.variants.join(", ")}. Photos: ${d.images}.`, fix ? d.description.replace(fix[0], fix[1]) : d.description, `Mobile: ${d.mobile}`]);
        const parsed = Reader.parse(b.props, aliases);
        expect(canonical(parsed), d.type).toBe(canonical(normal(withFix(fixes)(toModelJsonSchema(d.props)))));
      }
    });
  }

  it("is the JSON form's sections and wording, in about half the characters", () => {
    const json = sectionCatalogue(NO_PROMPT_FIXES);
    const compact = sectionCatalogue(NO_PROMPT_FIXES, { compact: true });
    // The JSON form's own section headers, so both list the same sections in the same order.
    expect(compact.match(/^### .+$/gm)).toEqual(json.match(/^### .+$/gm));
    expect(compact.length).toBeLessThan(json.length * 0.55);
    console.log(`section catalogue: ${json.length} → ${compact.length} characters`);
  });

  it("with the catalogue fix carries its wording (eyebrow, contact strip, cta) like the JSON form", () => {
    const off = compactSectionCatalogue(NO_PROMPT_FIXES);
    const on = compactSectionCatalogue({ ...NO_PROMPT_FIXES, catalogue: true });
    expect(off).toContain(HERO_EYEBROW_OLD);
    expect(on).not.toContain(HERO_EYEBROW_OLD);
    expect(on.split(HERO_EYEBROW_NEW).length).toBe(off.split(HERO_EYEBROW_OLD).length);
    expect(on).not.toContain("right after the hero on local-business homepages");
    expect(on).not.toContain("Use near the end of a page");
    expect(on).toContain("never to repeat call or directions");
  });

  it("the business schema parses back into its JSON Schema too", () => {
    const text = businessSchema({ compact: true });
    expect(text.length).toBeLessThan(businessSchema().length * 0.55);
    const aliases = aliasesOf(text);
    expect(Object.keys(aliases)).toEqual(["Placeholder"]);
    const schema = text.slice(text.indexOf("\nSchema: ") + "\nSchema: ".length);
    expect(canonical(Reader.parse(schema, aliases))).toBe(canonical(normal(toModelJsonSchema(Business.omit({ subtype: true })))));
  });

  it("a JSON Schema keyword it can't write throws instead of being dropped", () => {
    const w = new CompactWriter(catalogueAliases());
    expect(() => w.type({ type: "string", const: "x" })).toThrow(/unsupported JSON Schema keyword "const"/);
    expect(() => w.type({ type: "object", properties: {} })).toThrow(/additionalProperties/);
    expect(() => w.type({ type: "null" })).toThrow(/unsupported type/);
  });

  it("the directions catalogue is unchanged: it is prose, not JSON Schema", () => {
    expect(directionsCatalogue(NO_PROMPT_FIXES)).not.toContain('"type":');
  });
});

describe("the stages send the compact catalogue only with the switch", () => {
  const seen: ModelRequest[] = [];
  const client = (compact: boolean, answer: string, promptFixes: PromptFixes = NO_PROMPT_FIXES) =>
    new ModelClient({
      config: { ...config, promptFixes, prompts: { compactCatalogue: compact } } as AppConfig,
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: {
        async send(req, stage) {
          seen.push(req);
          return { text: answer, stopReason: "end_turn", model: stage.model, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
        },
      },
    });

  it("edit: the catalogue and the business schema", async () => {
    seen.length = 0;
    const spec = golden("pekarna-kvas");
    await editSpec(client(false, '{"reply": "Ni sprememb.", "patches": []}'), { spec, message: "Nič.", corpus: "" });
    await editSpec(client(true, '{"reply": "Ni sprememb.", "patches": []}'), { spec, message: "Nič.", corpus: "" });
    expect(seen[0]!.system[0]).toBe(sectionCatalogue(NO_PROMPT_FIXES));
    expect(seen[0]!.system[1]).toContain(businessSchema());
    expect(seen[1]!.system[0]).toBe(sectionCatalogue(NO_PROMPT_FIXES, { compact: true }));
    expect(seen[1]!.system[1]).toContain(businessSchema({ compact: true }));
    expect(seen[1]!.system[1]).not.toContain('"type":"object"');
  });

  it("composes with the catalogue and Slovene style fixes: the compact catalogue carries the catalogue wording, the style block stays in the second block", async () => {
    seen.length = 0;
    const fixes = { ...NO_PROMPT_FIXES, catalogue: true, sloveneStyle: true };
    await editSpec(client(true, '{"reply": "Ni sprememb.", "patches": []}', fixes), { spec: golden("pekarna-kvas"), message: "Nič.", corpus: "" });
    expect(seen[0]!.system[0]).toBe(compactSectionCatalogue(fixes));
    expect(seen[0]!.system[0]).toContain(HERO_EYEBROW_NEW);
    expect(seen[0]!.system[1]).toBe(`${editSystem(fixes)}\n\n${businessSchema({ compact: true })}`);
    expect(seen[0]!.system[1]).toContain(SLOVENE_STYLE);
  });

  it("critique: the catalogue", async () => {
    seen.length = 0;
    const sharp = (await import("sharp")).default;
    const png = async (w: number, h: number) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).png().toBuffer());
    const input = { spec: golden("pekarna-kvas"), mobilePng: await png(360, 800), desktopPng: await png(1280, 800), failures: [], corpus: "" };
    await critique(client(true, '{"issues": [], "patches": []}'), input);
    expect(seen[0]!.system[0]).toBe(sectionCatalogue(NO_PROMPT_FIXES, { compact: true }));
  });
});
