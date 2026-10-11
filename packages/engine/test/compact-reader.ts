/** Reads the compact notation back into JSON Schema (shared by the compact-catalogue tests). */
type Js = Record<string, unknown>;

/**
 * Reads the compact notation back into JSON Schema, independently of the writer: if every section's props parse back
 * into exactly the JSON Schema the JSON form prints (types, limits, patterns, enums, required, descriptions), the
 * compact form carries every section, variant, prop and limit.
 */
export class Reader {
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
    const m = /^[A-Za-z$_]+/.exec(this.s.slice(this.i));
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
      // The pattern ends at its first unescaped "/" (the writer escapes every "/" inside it; it may contain spaces).
      let end = this.i;
      while (this.s[end] !== "/") {
        if (end >= this.s.length) throw new Error(`unterminated pattern at ${this.i}`);
        end += this.s[end] === "\\" ? 2 : 1;
      }
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
export function normal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normal);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(
    Object.entries(v)
      .filter(([k, x]) => !(k === "required" && Array.isArray(x) && x.length === 0))
      .map(([k, x]) => [k, k === "properties" ? Object.fromEntries(Object.entries(x as Js).map(([pk, pv]) => [pk, normal(pv)])) : normal(x)]),
  );
}

/** The alias table of a compact text: its "Name = type" lines before the first section (or the business schema). */
export function aliasesOf(text: string): Record<string, Js> {
  const out: Record<string, Js> = {};
  const lines = text.split("\n### ")[0]!.split("\nSchema: ")[0]!.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const m = /^([A-Z][A-Za-z_]+) = (.*)$/.exec(lines[n]!);
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
export function sectionsOf(text: string): Map<string, { lines: string[]; props: string }> {
  const out = new Map<string, { lines: string[]; props: string }>();
  for (const block of text.split("\n### ").slice(1)) {
    const [type, ...rest] = block.split("\n");
    const i = rest.findIndex((l) => l.startsWith("Props: "));
    out.set(type!, { lines: rest.slice(0, i), props: [rest[i]!.slice("Props: ".length), ...rest.slice(i + 1)].join("\n") });
  }
  return out;
}
