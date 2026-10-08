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

type Js = Record<string, unknown>;
const config = loadConfig();
const SECTIONS = SECTION_DEFS.filter((d) => !d.systemOnly && !d.ownerOnly);
const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const golden = (id: string) => JSON.parse(readFileSync(path.join(evalDir, "golden", `${id}.json`), "utf8")) as SiteSpec;

/**
 * Reads the compact notation back into JSON Schema, independently of the writer: if every section's props parse back
 * into exactly the JSON Schema the JSON form prints (types, limits, patterns, enums, required, descriptions), the
 * compact form carries every section, variant, prop and limit.
 */
class Reader {
  private i = 0;
  /** A prop comment found on its object's opening line, for the prop being read. */
  private lead: string | undefined;
  constructor(
    private readonly s: string,
    private readonly aliases: Record<string, Js>,
  ) {}

  static parse(text: string, aliases: Record<string, Js>): Js {
    const r = new Reader(text, aliases);
    const t = r.union("");
    r.ws();
    if (r.i !== r.s.length) throw new Error(`trailing text at ${r.i}: ${JSON.stringify(r.s.slice(r.i, r.i + 40))}`);
    return t;
  }

  private peek(n = 1) {
    return this.s.slice(this.i, this.i + n);
  }
  private eat(lit: string) {
    if (!this.s.startsWith(lit, this.i)) throw new Error(`expected ${JSON.stringify(lit)} at ${this.i}: ${JSON.stringify(this.s.slice(this.i, this.i + 40))}`);
    this.i += lit.length;
  }
  private ws() {
    while (/\s/.test(this.peek())) this.i++;
  }
  private num(): number {
    const m = /^-?\d+(\.\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`number expected at ${this.i}`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  private union(indent: string): Js {
    const members = [this.primary(indent)];
    while (this.s.startsWith(" | ", this.i)) {
      this.i += 3;
      members.push(this.primary(indent));
    }
    return members.length === 1 ? members[0]! : { anyOf: members };
  }

  private primary(indent: string): Js {
    let t = this.base(indent);
    for (;;) {
      if (this.s.startsWith(" /* ", this.i)) {
        const end = this.s.indexOf(" */", this.i + 4);
        t = { ...t, description: this.s.slice(this.i + 4, end) };
        this.i = end + 3;
      } else if (this.peek() === "[") {
        this.i++;
        const arr: Js = { type: "array", items: t };
        if (this.peek() === "≤") {
          this.i++;
          arr.maxItems = this.num();
        } else if (this.peek() === "≥") {
          this.i++;
          arr.minItems = this.num();
        } else if (this.peek() !== "]") {
          arr.minItems = this.num();
          this.eat("..");
          arr.maxItems = this.num();
        }
        this.eat("]");
        t = arr;
      } else return t;
    }
  }

  private base(indent: string): Js {
    const c = this.peek();
    if (c === "(") {
      this.i++;
      const t = this.union(indent);
      this.eat(")");
      return t;
    }
    if (c === "{") return this.object(indent);
    if (c === '"') {
      const values: string[] = [];
      for (;;) {
        const m = /^"(?:[^"\\]|\\.)*"/.exec(this.s.slice(this.i));
        if (!m) throw new Error(`string literal expected at ${this.i}`);
        values.push(JSON.parse(m[0]) as string);
        this.i += m[0].length;
        if (this.s.startsWith('|"', this.i)) this.i++;
        else break;
      }
      return { type: "string", enum: values };
    }
    const m = /^[A-Za-z$]+/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`type expected at ${this.i}: ${JSON.stringify(this.s.slice(this.i, this.i + 40))}`);
    const name = m[0];
    this.i += name.length;
    if (this.aliases[name]) return structuredClone(this.aliases[name]);
    if (name === "boolean") return { type: "boolean" };
    if (name === "number" || name === "int") {
      const t: Js = { type: name === "int" ? "integer" : "number" };
      if (this.s.startsWith(" ", this.i) && /\d|-/.test(this.s[this.i + 1] ?? "")) {
        this.i++;
        t.minimum = this.num();
        this.eat("..");
        t.maximum = this.num();
      } else if (this.peek() === "≥") {
        this.i++;
        t.minimum = this.num();
      } else if (this.peek() === "≤") {
        this.i++;
        t.maximum = this.num();
      }
      return t;
    }
    if (!["text", "str", "uri", "email"].includes(name)) throw new Error(`unknown type ${name}`);
    const t: Js = { type: "string" };
    if (name === "text") t.minLength = 1;
    if (name === "uri" || name === "email") t.format = name;
    if (this.peek() === "≥") {
      this.i++;
      t.minLength = this.num();
    }
    if (this.peek() === "≤") {
      this.i++;
      t.maxLength = this.num();
    }
    if (this.s.startsWith(" /", this.i) && !this.s.startsWith(" /*", this.i)) {
      this.i += 2;
      // The pattern ends at the "/" that a delimiter follows.
      let end = this.i;
      while (!(this.s[end] === "/" && /^[\s,})|[\]]?$/.test(this.s[end + 1] ?? ""))) end++;
      t.pattern = this.s.slice(this.i, end);
      this.i = end + 1;
    }
    return t;
  }

  private object(indent: string): Js {
    this.eat("{");
    const properties: Record<string, Js> = {};
    const required: string[] = [];
    // The comment of the prop this object is the type of sits on its opening line.
    let lead: string | undefined;
    if (this.s.startsWith("  // ", this.i)) {
      const end = this.s.indexOf("\n", this.i);
      lead = this.s.slice(this.i + 5, end);
      this.i = end;
    }
    const multi = this.peek() === "\n";
    const inner = indent + "  ";
    for (;;) {
      if (multi) {
        this.eat("\n");
        if (this.s.startsWith(`${indent}}`, this.i)) {
          this.i += indent.length + 1;
          break;
        }
        this.eat(inner);
      } else if (this.peek() === "}") {
        this.i++;
        break;
      }
      const km = /^([A-Za-z$][A-Za-z0-9$]*)(\??): /.exec(this.s.slice(this.i));
      if (!km) throw new Error(`prop expected at ${this.i}: ${JSON.stringify(this.s.slice(this.i, this.i + 40))}`);
      this.i += km[0].length;
      let t = this.union(inner);
      let note = this.lead;
      this.lead = undefined;
      if (multi && this.s.startsWith("  // ", this.i)) {
        const end = this.s.indexOf("\n", this.i);
        note = this.s.slice(this.i + 5, end < 0 ? undefined : end);
        this.i = end < 0 ? this.s.length : end;
      }
      if (note !== undefined) {
        const both = /^(.*) \(each: (.*)\)$/.exec(note);
        const each = /^each: (.*)$/.exec(note);
        if (both) t = { ...t, description: both[1], items: { ...(t.items as Js), description: both[2] } };
        else if (each) t = { ...t, items: { ...(t.items as Js), description: each[1] } };
        else t = { ...t, description: note };
      }
      properties[km[1]!] = t;
      if (!km[2]) required.push(km[1]!);
      if (!multi && this.s.startsWith(", ", this.i)) this.i += 2;
    }
    this.lead = lead;
    return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
  }
}

/** The JSON form, as compared: empty `required` lists dropped (the notation has no way, and no need, to say "none"). */
function normal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normal);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(([k, x]) => !(k === "required" && Array.isArray(x) && x.length === 0))
      .map(([k, x]) => [k, k === "properties" ? Object.fromEntries(Object.entries(x as Js).map(([pk, pv]) => [pk, normal(pv)])) : normal(x)]),
  );
}

/** The alias table of a compact text: its "Name = type" lines before the first section (or the business schema). */
function aliasesOf(text: string): Record<string, Js> {
  const out: Record<string, Js> = {};
  const lines = text.split("\n### ")[0]!.split("\nSchema: ")[0]!.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const m = /^([A-Z][A-Za-z]+) = (.*)$/.exec(lines[n]!);
    if (!m) continue;
    let def = m[2]!;
    // A multi-line definition runs to its closing brace at column 0.
    if (def.endsWith("{")) {
      do def += `\n${lines[++n]}`;
      while (!lines[n]!.startsWith("}"));
    }
    out[m[1]!] = Reader.parse(def, out);
  }
  return out;
}

/** The section blocks of a compact catalogue, by type: their header lines and their parsed props. */
function sectionsOf(text: string): Map<string, { lines: string[]; props: string }> {
  const out = new Map<string, { lines: string[]; props: string }>();
  for (const block of text.split("\n### ").slice(1)) {
    const [type, ...rest] = block.split("\n");
    const i = rest.findIndex((l) => l.startsWith("Props: "));
    out.set(type!, { lines: rest.slice(0, i), props: [rest[i]!.slice("Props: ".length), ...rest.slice(i + 1)].join("\n") });
  }
  return out;
}

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
