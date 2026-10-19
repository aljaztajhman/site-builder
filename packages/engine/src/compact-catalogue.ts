import type { z } from "zod";
import { Business, ImageRef, Link, LinkTarget, PageRef, Placeholder, Price, VOCAB_KEY, canonicalJson, toModelJsonSchema, withoutDescription } from "@sb/spec";

/**
 * The compact catalogue notation (config prompts.compactCatalogue, HQ it-compact-catalogue): the props of each section
 * in a TypeScript-like form with the limits inline (`headline: text≤70`) instead of JSON Schema, and the shared shapes
 * (Link, ImageId, Placeholder, Price …) named once instead of repeated in every section. It is generated from the same
 * JSON Schema the JSON form prints (toModelJsonSchema of the spec's zod schemas), never kept by hand: an unknown
 * JSON Schema keyword throws, and a test parses the notation back into the JSON Schema of every section.
 */

type Js = Record<string, unknown>;

/** A named shape: written once in the header, referred to by name wherever its schema appears. */
export interface CompactAlias {
  name: string;
  schema: Js;
}

/** The shapes the section props share, in definition order (an alias may use the ones before it). */
const CATALOGUE_SHARED: [string, z.ZodType][] = [
  ["PageId", PageRef],
  ["ImageId", ImageRef],
  ["LinkTarget", LinkTarget],
  ["Link", Link],
  ["Placeholder", Placeholder],
  ["Price", Price],
];

export function catalogueAliases(): CompactAlias[] {
  return CATALOGUE_SHARED.map(([name, schema]) => ({ name, schema: toModelJsonSchema(schema) }));
}

/** What the notation means, for the model (the header of the compact catalogue). */
export const COMPACT_NOTATION = `Props are written in a TypeScript-like notation: \`name: type\` is required, \`name?: type\` may be left out, and an object takes no other keys. text≤N is a non-empty string of at most N characters; str≤N a string of at most N characters (str≥M at least M); uri and email a web address and an e-mail address; /…/ the pattern the string must match; int and number with their range (a..b, ≥a, ≤b); boolean true or false; "a"|"b" exactly one of those strings; T[] a list of T, T[a..b] with a to b items (T[≤b] at most b, T[≥a] at least a); A | B either shape. // explains the prop before it.`;

const KNOWN = new Set(["type", "properties", "required", "additionalProperties", "description", "minLength", "maxLength", "pattern", "format", "enum", "anyOf", "items", "minItems", "maxItems", "minimum", "maximum"]);

/** JSON with sorted keys, for comparing schemas whatever order zod wrote their keys in. */
export const canonical = canonicalJson;

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ");

/** A JSON Schema as the compact notation. Multi-line for objects whose props carry descriptions. */
export class CompactWriter {
  /** Aliases referred to so far (their names, in first-use order). */
  readonly used = new Set<string>();
  /** Vocabularies referred to so far (their list names). */
  readonly usedVocabs = new Set<string>();
  private readonly keys: { name: string; key: string }[];

  /**
   * `vocabs`: the lists a vocabulary field (`x-vocab`) may name (VOCABS). With them such a field is written as its list's
   * name and the list once in definitions(); without them an `x-vocab` keyword throws like any unknown one.
   */
  constructor(
    private readonly aliases: CompactAlias[] = [],
    private readonly vocabs?: Readonly<Record<string, readonly string[]>>,
  ) {
    this.keys = aliases.map((a) => ({ name: a.name, key: canonical(withoutDescription(a.schema)) }));
  }

  /** The type of `s` (its own description is the caller's: it becomes the prop's comment). */
  type(s: Js, indent = ""): string {
    const key = canonical(withoutDescription(s));
    const alias = this.keys.find((a) => a.key === key);
    if (alias) {
      this.markUsed(alias.name);
      return alias.name;
    }
    if (this.vocabs && typeof s[VOCAB_KEY] === "string") return this.vocab(s);
    for (const k of Object.keys(s)) if (!KNOWN.has(k)) throw new Error(`compact catalogue: unsupported JSON Schema keyword "${k}"`);
    if (s.anyOf) {
      const members = (s.anyOf as Js[]).map((m) => this.type(m, indent) + this.note(m));
      return members.join(" | ");
    }
    if (s.enum) {
      if (s.type !== "string" || !(s.enum as unknown[]).every((v) => typeof v === "string")) throw new Error("compact catalogue: only string enums are supported");
      return (s.enum as string[]).map((v) => JSON.stringify(v)).join("|");
    }
    switch (s.type) {
      case "string":
        return this.string(s);
      case "number":
      case "integer":
        return `${s.type === "integer" ? "int" : "number"}${range(s.minimum as number | undefined, s.maximum as number | undefined, " ")}`;
      case "boolean":
        return "boolean";
      case "array": {
        const items = s.items as Js;
        const inner = this.type(items, indent) + this.note(items);
        const union = !this.isAlias(items) && (items.anyOf !== undefined || (Array.isArray(items.enum) && items.enum.length > 1));
        const wrap = union ? `(${inner})` : inner;
        return `${wrap}[${range(s.minItems as number | undefined, s.maxItems as number | undefined, "").trim()}]`;
      }
      case "object":
        return this.object(s, indent);
      default:
        throw new Error(`compact catalogue: unsupported type ${JSON.stringify(s.type)}`);
    }
  }

  private isAlias(s: Js): boolean {
    const key = canonical(withoutDescription(s));
    return this.keys.some((a) => a.key === key);
  }

  /** A description on a node that isn't a prop (an anyOf member, list items), kept inline. */
  private note(s: Js): string {
    return typeof s.description === "string" ? ` /* ${oneLine(s.description)} */` : "";
  }

  private markUsed(name: string): void {
    this.used.add(name);
  }

  /**
   * A vocabulary field as its list's name. The list is a closer description than the string schema it stands for
   * (membership is guard G8's), so every name in it must pass that schema: one that didn't would be offered to the model
   * and then rejected.
   */
  private vocab(s: Js): string {
    const list = s[VOCAB_KEY] as string;
    const names = this.vocabs?.[list];
    if (!names) throw new Error(`compact catalogue: unknown vocabulary ${list}`);
    for (const k of Object.keys(s)) if (!["type", "pattern", "maxLength", "description", VOCAB_KEY].includes(k)) throw new Error(`compact catalogue: unsupported keyword "${k}" on vocabulary field ${list}`);
    if (s.type !== "string") throw new Error(`compact catalogue: vocabulary field ${list} is not a string`);
    const re = typeof s.pattern === "string" ? new RegExp(s.pattern) : undefined;
    const max = s.maxLength as number | undefined;
    for (const n of names) if ((re && !re.test(n)) || (max !== undefined && n.length > max)) throw new Error(`compact catalogue: ${list} name ${n} fails its field's schema`);
    this.usedVocabs.add(list);
    return list;
  }

  private string(s: Js): string {
    const format = s.format as string | undefined;
    const min = s.minLength as number | undefined;
    const max = s.maxLength as number | undefined;
    const name = format ?? (min === 1 ? "text" : "str");
    const lo = name === "text" || min === undefined ? "" : `≥${min}`;
    if (format !== undefined && min !== undefined) throw new Error("compact catalogue: a minLength on a formatted string is not supported");
    const hi = max === undefined ? "" : `≤${max}`;
    return `${name}${lo}${hi}${typeof s.pattern === "string" ? ` /${compactPattern(s.pattern)}/` : ""}`;
  }

  private object(s: Js, indent: string): string {
    if (s.additionalProperties !== false) throw new Error("compact catalogue: objects must have additionalProperties: false");
    const required = new Set((s.required as string[] | undefined) ?? []);
    const props = Object.entries((s.properties as Record<string, Js> | undefined) ?? {});
    const inner = indent + "  ";
    const entries = props.map(([k, p]) => {
      // A list whose items carry the description: it goes into the prop's comment as "each: …".
      const items = p.type === "array" ? (p.items as Js) : undefined;
      const each = items && typeof items.description === "string" ? oneLine(items.description) : "";
      const shown = each ? { ...p, items: withoutDescription(items!) } : p;
      const own = typeof p.description === "string" ? oneLine(p.description) : "";
      const note = each ? (own ? `${own} (each: ${each})` : `each: ${each}`) : own;
      return { head: `${k}${required.has(k) ? "" : "?"}: ${this.type(shown, inner)}`, note };
    });
    const inline = `{${entries.map((e) => e.head).join(", ")}}`;
    if (entries.every((e) => !e.note && !e.head.includes("\n") && !e.head.includes("/*")) && inline.length <= 100) return inline;
    const lines = entries.map((e) => {
      if (!e.note) return `${inner}${e.head}`;
      // The comment goes on the prop's first line (a multi-line object starts with "{").
      const [first, ...rest] = e.head.split("\n");
      return [`${inner}${first}  // ${e.note}`, ...rest].join("\n");
    });
    return `{\n${lines.join("\n")}\n${indent}}`;
  }

  /**
   * The header lines defining the aliases used, with the ones their definitions use (in definition order), then each
   * vocabulary used as `LIST = "a"|"b"|…` (in the vocabularies' order).
   */
  definitions(): string {
    const need = new Set(this.used);
    const vocabs = new Set(this.usedVocabs);
    const defs = new Map<string, string>();
    // An alias's definition uses only the aliases before it, so walking back finds every one needed.
    for (let i = this.aliases.length - 1; i >= 0; i--) {
      const a = this.aliases[i]!;
      if (!need.has(a.name)) continue;
      const w = new CompactWriter(this.aliases.slice(0, i), this.vocabs);
      defs.set(a.name, `${a.name} = ${w.type(a.schema)}${this.note(a.schema)}`);
      for (const n of w.used) need.add(n);
      for (const v of w.usedVocabs) vocabs.add(v);
    }
    const lists = Object.keys(this.vocabs ?? {}).filter((v) => vocabs.has(v));
    return [
      ...this.aliases.flatMap((a) => (defs.has(a.name) ? [defs.get(a.name)!] : [])),
      ...lists.map((v) => `${v} = ${this.vocabs![v]!.map((n) => JSON.stringify(n)).join("|")}`),
    ].join("\n");
  }
}

/**
 * A regex pattern as written between the notation's slashes: the same regex, on one line, closed by its first unescaped
 * "/". An unescaped "/" is escaped, and whitespace other than a plain space is written as its escape (\n, \r, \t,
 * \uXXXX) so a line break can't split the pattern. A plain space stays (the decor path's `[MmLl… 0-9 ,.-]`).
 */
export function compactPattern(p: string): string {
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "\\") {
      out += c + (p[i + 1] ?? "");
      i++;
    } else if (c === "/") out += "\\/";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else if (c !== " " && /\s/.test(c)) out += `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else out += c;
  }
  return out;
}

function range(min: number | undefined, max: number | undefined, sep: string): string {
  if (min !== undefined && max !== undefined) return `${sep}${min}..${max}`;
  if (min !== undefined) return `≥${min}`;
  if (max !== undefined) return `≤${max}`;
  return "";
}

/** The business facts schema (/business, the edit's second system block) in the compact notation. */
export function compactBusinessSchema(): string {
  const w = new CompactWriter(catalogueAliases());
  const body = w.type(toModelJsonSchema(Business.omit({ subtype: true })));
  return `# Business facts (/business)

In the notation of the section components above.
${w.definitions()}

Schema: ${body}`;
}
