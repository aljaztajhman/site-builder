import type { z } from "zod";
import { Business, ImageRef, Link, LinkTarget, PageRef, Placeholder, Price, toModelJsonSchema } from "@sb/spec";

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
export function catalogueAliases(): CompactAlias[] {
  const named: [string, z.ZodType][] = [
    ["PageId", PageRef],
    ["ImageId", ImageRef],
    ["LinkTarget", LinkTarget],
    ["Link", Link],
    ["Placeholder", Placeholder],
    ["Price", Price],
  ];
  return named.map(([name, schema]) => ({ name, schema: toModelJsonSchema(schema) }));
}

/** What the notation means, for the model (the header of the compact catalogue). */
export const COMPACT_NOTATION = `Props are written in a TypeScript-like notation: \`name: type\` is required, \`name?: type\` may be left out, and an object takes no other keys. text≤N is a non-empty string of at most N characters; str≤N a string of at most N characters (str≥M at least M); uri and email a web address and an e-mail address; /…/ the pattern the string must match; int and number with their range (a..b, ≥a, ≤b); boolean true or false; "a"|"b" exactly one of those strings; T[] a list of T, T[a..b] with a to b items (T[≤b] at most b, T[≥a] at least a); A | B either shape. // explains the prop before it.`;

const KNOWN = new Set(["type", "properties", "required", "additionalProperties", "description", "minLength", "maxLength", "pattern", "format", "enum", "anyOf", "items", "minItems", "maxItems", "minimum", "maximum"]);

/** JSON with sorted keys, for comparing schemas whatever order zod wrote their keys in. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (!v || typeof v !== "object") return JSON.stringify(v);
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((v as Js)[k])}`)
    .join(",")}}`;
}

const withoutDescription = (s: Js): Js => {
  const { description: _d, ...rest } = s;
  return rest;
};

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ");

/** A JSON Schema as the compact notation. Multi-line for objects whose props carry descriptions. */
export class CompactWriter {
  /** Aliases referred to so far (their names, in first-use order). */
  readonly used = new Set<string>();
  private readonly keys: { name: string; key: string }[];

  constructor(private readonly aliases: CompactAlias[] = []) {
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

  private string(s: Js): string {
    if (typeof s.pattern === "string" && /[\s]/.test(s.pattern)) throw new Error(`compact catalogue: pattern with whitespace: ${s.pattern}`);
    const format = s.format as string | undefined;
    const min = s.minLength as number | undefined;
    const max = s.maxLength as number | undefined;
    const name = format ?? (min === 1 ? "text" : "str");
    const lo = name === "text" || min === undefined ? "" : `≥${min}`;
    if (format !== undefined && min !== undefined) throw new Error("compact catalogue: a minLength on a formatted string is not supported");
    const hi = max === undefined ? "" : `≤${max}`;
    return `${name}${lo}${hi}${typeof s.pattern === "string" ? ` /${s.pattern}/` : ""}`;
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

  /** The header lines defining the aliases used, with the ones their definitions use (in definition order). */
  definitions(): string {
    const need = new Set(this.used);
    const defs = new Map<string, string>();
    // An alias's definition uses only the aliases before it, so walking back finds every one needed.
    for (let i = this.aliases.length - 1; i >= 0; i--) {
      const a = this.aliases[i]!;
      if (!need.has(a.name)) continue;
      const w = new CompactWriter(this.aliases.slice(0, i));
      defs.set(a.name, `${a.name} = ${w.type(a.schema)}${this.note(a.schema)}`);
      for (const n of w.used) need.add(n);
    }
    return this.aliases.flatMap((a) => (defs.has(a.name) ? [defs.get(a.name)!] : [])).join("\n");
  }
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
