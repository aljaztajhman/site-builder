import { z } from "zod";
import { SiteSpec } from "./site.ts";
import { VOCAB_KEY } from "./composition/vocab.ts";
import { MODEL_VIEW, OWNER_ONLY, SYSTEM_ONLY } from "./common.ts";

/**
 * JSON Schema export for the model. Structured outputs accept anyOf but not oneOf, and require
 * additionalProperties: false on every object (zod's strictObject emits that). Length and numeric
 * limits are kept: the SDK strips unsupported constraints before sending and we re-validate with zod.
 */
export function toModelJsonSchema(schema: z.ZodType, opts: ModelJsonSchemaOptions = {}): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  const out = normalise(js) as Record<string, unknown>;
  return opts.shared ? withSharedDefs(out, opts.shared.map((d) => ({ name: d.name, schema: toModelJsonSchema(d.schema) }))) : out;
}

/** A shape printed once under `name` in `$defs` and referred to by `$ref` wherever its schema appears. */
export interface SharedDef {
  name: string;
  schema: z.ZodType;
}

export interface ModelJsonSchemaOptions {
  /**
   * Shared definitions (only the designer's catalogue passes them; every other model-facing schema stays expanded and
   * byte-identical): a node equal to one of these (descriptions aside) becomes `{"$ref": "#/$defs/<name>"}`, keeping its
   * own description beside the ref, and every vocabulary field (`x-vocab`) becomes a ref to a def named by its list.
   * An entry may use the ones before it. Structured outputs accept internal `$ref`/`$defs` (platform docs, "JSON Schema
   * limitations"); expandRefs undoes it.
   */
  shared?: SharedDef[];
}

type Js = Record<string, unknown>;

/** JSON with sorted keys, for comparing schemas whatever order zod wrote their keys in. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (!v || typeof v !== "object") return JSON.stringify(v);
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Js)[k])}`)
    .join(",")}}`;
}

export function withoutDescription(s: Js): Js {
  const { description: _d, ...rest } = s;
  return rest;
}

const DEFS_PREFIX = "#/$defs/";

/** `js` with the shapes of `shared` (already JSON Schema) and every vocabulary field moved into `$defs`. */
export function withSharedDefs(js: Js, shared: { name: string; schema: Js }[]): Js {
  const keys = shared.map((d) => ({ name: d.name, key: canonicalJson(withoutDescription(d.schema)) }));
  const used = new Set<string>();
  const vocabs = new Map<string, Js>();
  const ref = (name: string, node: Js): Js => (typeof node.description === "string" ? { $ref: DEFS_PREFIX + name, description: node.description } : { $ref: DEFS_PREFIX + name });

  /** Replaces, below and at `v`, the nodes equal to one of the first `upTo` shared shapes or naming a vocabulary. */
  const sub = (v: unknown, upTo: number, isSchema: boolean): unknown => {
    if (Array.isArray(v)) return v.map((x) => sub(x, upTo, isSchema));
    if (!v || typeof v !== "object") return v;
    const node = v as Js;
    if (isSchema) {
      const key = canonicalJson(withoutDescription(node));
      const hit = keys.slice(0, upTo).find((k) => k.key === key);
      if (hit) {
        used.add(hit.name);
        return ref(hit.name, node);
      }
      if (typeof node[VOCAB_KEY] === "string") {
        const list = node[VOCAB_KEY];
        const def = withoutDescription(node);
        const seen = vocabs.get(list);
        if (seen && canonicalJson(seen) !== canonicalJson(def)) throw new Error(`shared defs: vocabulary ${list} has two different schemas`);
        vocabs.set(list, def);
        return ref(list, node);
      }
    }
    // Under `properties` (and `$defs`) the values are schemas, the map itself isn't; everything else that is an object is.
    return Object.fromEntries(Object.entries(node).map(([k, x]) => [k, k === "properties" || k === "$defs" ? mapSchemas(x, upTo) : sub(x, upTo, k !== "enum" && k !== "required")]));
  };
  const mapSchemas = (x: unknown, upTo: number) => (x && typeof x === "object" ? Object.fromEntries(Object.entries(x as Js).map(([k, s]) => [k, sub(s, upTo, true)])) : x);

  const root = sub(js, shared.length, true) as Js;
  // A def uses only the shapes before it, so walking back from the last finds every one needed.
  const defs = new Map<string, Js>();
  for (let i = shared.length - 1; i >= 0; i--) {
    const d = shared[i]!;
    if (!used.has(d.name)) continue;
    // Matched against the shapes before it only, so a def never refers to itself.
    defs.set(d.name, sub(withoutDescription(d.schema), i, true) as Js);
  }
  if (!defs.size && !vocabs.size) return root;
  const ordered: Js = {};
  for (const d of shared) if (defs.has(d.name)) ordered[d.name] = defs.get(d.name);
  for (const [list, def] of vocabs) ordered[list] = def;
  return { ...root, $defs: ordered };
}

/** `js` with every internal `$ref` replaced by its definition (the ref's own description kept) and `$defs` dropped. */
export function expandRefs(js: Js): Js {
  const defs = (js.$defs as Record<string, Js> | undefined) ?? {};
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const node = v as Js;
    if (typeof node.$ref === "string") {
      if (!node.$ref.startsWith(DEFS_PREFIX)) throw new Error(`expandRefs: external $ref ${node.$ref}`);
      const def = defs[node.$ref.slice(DEFS_PREFIX.length)];
      if (!def) throw new Error(`expandRefs: unresolved $ref ${node.$ref}`);
      const { $ref: _r, ...rest } = node;
      return { ...(walk(def) as Js), ...rest };
    }
    return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$defs").map(([k, x]) => [k, walk(x)]));
  };
  return walk(js) as Js;
}

/** A union member only the owner may write (OWNER_ONLY, e.g. a price "po dogovoru"). */
const ownerOnly = (v: unknown) => !!v && typeof v === "object" && (v as Record<string, unknown>)[OWNER_ONLY] === true;
/** A property only the system sets (SYSTEM_ONLY, e.g. business.amenities). */
const systemOnly = (v: unknown) => !!v && typeof v === "object" && (v as Record<string, unknown>)[SYSTEM_ONLY] === true;

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "$schema" || k === MODEL_VIEW) continue;
    // The model is never offered what only the owner sets: the union loses that member, the rest stays as it was.
    const kept = (k === "anyOf" || k === "oneOf") && Array.isArray(x) ? x.filter((o) => !ownerOnly(o)) : x;
    out[k === "oneOf" ? "anyOf" : k] = normalise(kept);
  }
  // What the model is offered instead (MODEL_VIEW): those keys over the node's own, in the node's key order.
  const view = (v as Record<string, unknown>)[MODEL_VIEW];
  if (view && typeof view === "object") for (const [k, x] of Object.entries(view)) out[k] = x;
  // Nor what only the system sets (SYSTEM_ONLY): the property goes, and with it its place in `required`.
  const props = out.properties as Record<string, unknown> | undefined;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    const dropped = Object.keys(props).filter((k) => systemOnly(props[k]));
    if (dropped.length) {
      out.properties = Object.fromEntries(Object.entries(props).filter(([k]) => !dropped.includes(k)));
      if (Array.isArray(out.required)) out.required = (out.required as string[]).filter((k) => !dropped.includes(k));
    }
  }
  return out;
}

export function siteSpecJsonSchema(): Record<string, unknown> {
  return toModelJsonSchema(SiteSpec);
}
