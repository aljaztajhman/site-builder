import jsonpatch, { type Operation } from "fast-json-patch";
import {
  Business,
  COLOR_LABEL,
  DESIGN_LABEL,
  DIRECTIONS,
  DIRECTION_LABEL,
  Design,
  FONT_PAIRS,
  SECTION_DEFS,
  direction as directionById,
  enforceDesign,
  migrateSpec,
  repairSiteCopy,
  sectionDef,
  TOKEN_LABEL,
  toModelJsonSchema,
  validateSite,
  EDITOR_STARTER_TEXT as DEFAULT_TEXT,
  DAYS,
  capitalize,
  dayName,
  formatTime,
  type Day,
  type Issue,
  type SiteSpec,
} from "@sb/spec";

/**
 * Direct editor: deterministic spec changes with no model call. The dashboard sends RFC 6902
 * operations; they are applied to a copy, design tokens are brought back inside their direction,
 * and the result must validate. Text the client types counts as client-provided (no fact check).
 */
export interface DirectEditResult {
  ok: boolean;
  spec: SiteSpec;
  issues: Issue[];
  /** Slovene notes for the owner on automatic corrections (e.g. contrast fixed). */
  adjustments: string[];
}

/**
 * Paths no edit may touch: the version, the slug (it names published storage) and asset identity
 * (ids, files, sizes are set by the image pipeline; origin decides the "Ustvarjeno z UI" label, so no
 * edit may remove it). Alt text and focal points stay editable.
 */
export function protectedPathIssues(ops: Operation[]): Issue[] {
  const blocked = (p: string) =>
    p === "" ||
    /^\/(specVersion|slug)(\/|$)/.test(p) ||
    /^\/assets(\/logo(\/|$)|\/images\/?$|\/images\/[^/]+\/?$|\/images\/[^/]+\/(id|src|width|height|origin)(\/|$)|\/?$)/.test(p);
  const issues: Issue[] = [];
  for (const op of ops) {
    for (const p of [op.path, "from" in op ? (op as { from: string }).from : undefined]) {
      if (p !== undefined && blocked(p)) issues.push({ path: p, code: "structure", message: "this part of the site can't be edited" });
    }
  }
  return issues;
}

/** Why ops could not be applied, for each caller to word in its own way (the chat model, the owner). */
export type ApplyFailure =
  | { reason: "protected"; issues: Issue[] }
  | { reason: "invalid"; message: string; op: string | undefined; path: string | undefined }
  | { reason: "failed"; message: string };

/**
 * The first half of every edit (chat patches and the owner's direct edits): refuse protected paths, check the
 * ops against the spec, apply them to a copy and migrate it. Never mutates the input.
 */
export function applyOps(spec: SiteSpec, ops: Operation[]): { next: SiteSpec } | ApplyFailure {
  const guarded = protectedPathIssues(ops);
  if (guarded.length) return { reason: "protected", issues: guarded };
  const invalid = jsonpatch.validate(ops, spec);
  if (invalid) return { reason: "invalid", message: invalid.message, op: invalid.operation?.op, path: invalid.operation?.path };
  try {
    return { next: migrateSpec(jsonpatch.applyPatch(structuredClone(spec), ops, true, false).newDocument) };
  } catch (e) {
    return { reason: "failed", message: (e as Error).message };
  }
}

export function applyDirectEdit(spec: SiteSpec, ops: Operation[]): DirectEditResult {
  const applied = applyOps(spec, ops);
  if ("reason" in applied) {
    const issues: Issue[] =
      applied.reason === "protected"
        ? applied.issues
        : [{ path: applied.reason === "invalid" ? (applied.path ?? "") : "", code: "schema", message: applied.message }];
    return { ok: false, spec, issues, adjustments: [] };
  }
  const next = applied.next;
  const adjustments: string[] = [];
  if (repairSiteCopy(next).length) adjustments.push("Besedilo: dolgi pomišljaj (—) smo zamenjali s pomišljajem ( – )");
  if (ops.some((o) => o.path.startsWith("/design"))) {
    const dir = DIRECTIONS.find((d) => d.id === next.design.direction);
    const parsed = Design.safeParse(next.design);
    if (dir && parsed.success) {
      const fixed = enforceDesign(parsed.data, dir);
      for (const [k, v] of Object.entries(fixed.colors)) {
        const before = (parsed.data.colors as Record<string, string>)[k];
        if (before !== v) adjustments.push(`${COLOR_LABEL[k] ?? k}: barva popravljena na ${v} zaradi berljivosti`);
      }
      for (const k of ["radius", "baseFontSize", "scale", "headingWeight", "headingTracking", "headingCase", "density", "shadow", "fontPair", "imagery"] as const) {
        if (parsed.data[k] !== fixed[k]) {
          const shown = TOKEN_LABEL[k]?.[String(fixed[k])] ?? (k === "fontPair" ? FONT_PAIRS.find((p) => p.id === fixed[k])?.label : undefined) ?? String(fixed[k]);
          adjustments.push(`${DESIGN_LABEL[k] ?? k}: nastavljeno na ${shown}, kot dovoljuje smer »${DIRECTION_LABEL[dir.id]?.name ?? dir.name}«`);
        }
      }
      next.design = fixed;
    }
  }
  const v = validateSite(next);
  if (v.ok) return { ok: true, spec: v.spec, issues: [], adjustments };
  // Copy rules added after a site was made (new filler phrases, all-caps eyebrows) must not lock it: a
  // banned-copy issue the site already had, at the same place, doesn't block an unrelated edit. The
  // publish checklist still lists it.
  const key = (i: Issue) => `${i.path}|${i.message}`;
  const before = new Set(validateSite(spec).issues.filter((i) => i.code === "banned").map(key));
  const fresh = v.issues.filter((i) => !(i.code === "banned" && before.has(key(i))));
  if (fresh.length === 0 && v.spec) return { ok: true, spec: v.spec, issues: [], adjustments };
  return { ok: false, spec, issues: fresh, adjustments };
}

/** Switching direction resets tokens to the direction's defaults (keeping the brand primary colour). */
export function switchDirection(spec: SiteSpec, directionId: string): Design {
  const dir = directionById(directionId);
  const d: Design = {
    direction: dir.id,
    fontPair: dir.fontPairs[0]!,
    colors: { ...dir.palette.fallback, primary: spec.design.colors.primary, accent: spec.design.colors.accent },
    radius: dir.ranges.radius[0],
    baseFontSize: dir.ranges.baseFontSize[0],
    scale: dir.ranges.scale[0],
    headingWeight: dir.ranges.headingWeight[0],
    headingCase: dir.ranges.headingCase[0]!,
    headingTracking: dir.ranges.headingTracking[0],
    density: dir.ranges.density[0]!,
    shadow: dir.ranges.shadow[0]!,
    imagery: dir.imagery,
  };
  return enforceDesign(d, dir);
}

type Json = Record<string, unknown>;


/**
 * Minimal valid props for a new section, built from its JSON Schema. Missing facts become
 * placeholders; images use the site's first photos. Returns null when the section can't be
 * added to this site (e.g. it needs photos and there are none).
 */
export function defaultSection(spec: SiteSpec, type: string, id: string): Json | null {
  const def = sectionDef(type);
  if (def.systemOnly) return null;
  const images = spec.assets.images.map((i) => i.id);
  const home = spec.pages.find((p) => p.kind === "home")?.id ?? spec.pages[0]!.id;
  let imgIndex = 0;
  const build = (s: Json, key: string): unknown => {
    if (Array.isArray(s.anyOf)) {
      const opts = s.anyOf as Json[];
      const ph = opts.find((o) => (o.properties as Json | undefined)?.$placeholder);
      if (ph) return { $placeholder: key === "price" ? "price" : key === "name" ? "name" : "text" };
      return build(opts[0]!, key);
    }
    if ("const" in s) return s.const;
    if (Array.isArray(s.enum)) return s.enum[0];
    switch (s.type) {
      case "object": {
        const props = (s.properties ?? {}) as Record<string, Json>;
        const req = new Set((s.required as string[] | undefined) ?? []);
        const out: Json = {};
        for (const [k, sub] of Object.entries(props)) if (req.has(k)) out[k] = build(sub, k);
        if (props.page && !req.has("page")) out.page = home;
        return out;
      }
      case "array": {
        const n = Math.max(Number(s.minItems ?? 0), 1);
        return Array.from({ length: n }, () => build((s.items ?? {}) as Json, key));
      }
      case "string": {
        if (typeof s.pattern === "string" && s.pattern.includes("img_")) return images[imgIndex++ % Math.max(1, images.length)] ?? "img_missing";
        if (typeof s.pattern === "string" && s.pattern.includes("p_")) return home;
        const max = Number(s.maxLength ?? 200);
        return (DEFAULT_TEXT[key] ?? DEFAULT_TEXT.text!).slice(0, max);
      }
      case "integer":
      case "number":
        return Number(s.minimum ?? 1);
      case "boolean":
        return false;
      default:
        return null;
    }
  };
  const props = build(toModelJsonSchema(def.props), "");
  const section = { id, type, variant: def.variants[0], props };
  if (!def.schema.safeParse(section).success) return null;
  if (def.images === "required" && images.length === 0) return null;
  return section;
}

/** What the dashboard editor needs to build its forms: JSON Schemas generated from the spec. */
export function editorCatalogue(spec: SiteSpec) {
  return {
    sections: SECTION_DEFS.filter((d) => !d.systemOnly).map((d) => ({
      type: d.type,
      group: d.group,
      variants: d.variants,
      variantNeeds: d.variantNeeds ?? {},
      description: d.description,
      images: d.images,
      props: toModelJsonSchema(d.props),
      canAdd: defaultSection(spec, d.type, "s_probe") !== null,
    })),
    business: toModelJsonSchema(Business),
    directions: DIRECTIONS.map((d) => ({ id: d.id, name: d.name, summary: d.summary, fontPairs: d.fontPairs, ranges: d.ranges })),
    fontPairs: FONT_PAIRS.map((f) => ({ id: f.id, label: f.label })),
  };
}

const DAY_SET = new Set<string>(DAYS);

/**
 * Strings a client typed through the editor, for the fact-check corpus. The fact check pairs prices
 * with offerings and times with days, so a priced item also gives "Name: 18 €" and an opening-hours
 * row "Ponedeljek–petek 8.00–19.00." as its own paragraph. A price set on its own path gives
 * "Cena: 18 €", which counts for any offering (the owner typed it into that item's price field).
 */
export function typedText(ops: Operation[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    // Numbers too: a price or capacity typed in the editor is the client's own fact.
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : null;
      const amount = (o.price as { amount?: unknown } | undefined)?.amount;
      if (name && typeof amount === "number") out.push(`${name}: ${amount} €`);
      if (typeof o.from === "string" && typeof o.to === "string" && DAY_SET.has(o.from) && DAY_SET.has(o.to)) {
        const days = o.from === o.to ? capitalize(dayName(o.from as Day)) : `${capitalize(dayName(o.from as Day))}–${dayName(o.to as Day)}`;
        const open = typeof o.open === "string" ? o.open : null;
        const close = typeof o.close === "string" ? o.close : null;
        out.push(`\n${days} ${o.closed === true || !open || !close ? "zaprto" : `${formatTime(open)}–${formatTime(close)}`}.\n`);
      }
      Object.values(o).forEach(walk);
    }
  };
  for (const o of ops) {
    if (!("value" in o)) continue;
    // A price typed straight into a price field: the op doesn't say for what, so it names nothing
    // (its own paragraph, so the line before can't name it either).
    const typedPrice = typeof o.value === "number" ? o.value : (o.value as { amount?: unknown } | null)?.amount;
    if (/\/price(\/amount)?$/.test(o.path) && typeof typedPrice === "number") out.push(`\nCena: ${typedPrice} €`);
    walk(o.value);
  }
  return out;
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

/** The leaves a reduced value still holds: how much of it the owner changed. */
function leaves(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + leaves(x), 0);
  if (isPlain(v)) return Object.values(v).reduce((n: number, x) => n + leaves(x), 0);
  return v === undefined ? 0 : 1;
}

const label = (o: Plain) => (typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : undefined);
const isPriced = (o: Plain) => label(o) !== undefined && "price" in o;
const isHoursRow = (o: Plain) => DAY_SET.has(o.from as string) && DAY_SET.has(o.to as string);

/** The element of `old` that `v` most likely is: the same content, id or name, else the same position. */
function counterpart(old: unknown[], v: unknown, i: number): unknown {
  if (old.some((o) => same(o, v))) return v;
  if (isPlain(v)) {
    const byId = typeof v.id === "string" ? old.find((o) => isPlain(o) && o.id === v.id) : undefined;
    if (byId !== undefined) return byId;
    const name = label(v);
    const byName = name !== undefined ? old.find((o) => isPlain(o) && label(o) === name) : undefined;
    if (byName !== undefined) return byName;
  }
  return old[i];
}

/**
 * The part of `next` that differs from `prev`, or undefined when nothing does. A priced item or an
 * hours row stays whole once its name, price or times change: the fact check pairs a price with its
 * offering and times with their days, so the owner's new price needs its name beside it.
 */
function changed(prev: unknown, next: unknown): unknown {
  if (same(prev, next)) return undefined;
  if (Array.isArray(next)) {
    const old = Array.isArray(prev) ? prev : [];
    const out = next.map((v, i) => changed(counterpart(old, v, i), v)).filter((v) => v !== undefined);
    return out.length ? out : undefined;
  }
  if (!isPlain(next)) return next;
  const before = isPlain(prev) ? prev : {};
  if (isHoursRow(next)) return next;
  const out: Plain = {};
  for (const [k, v] of Object.entries(next)) {
    const d = changed(before[k], v);
    if (d !== undefined) out[k] = d;
  }
  if (isPriced(next) && ("price" in out || label(out) !== undefined)) {
    out.price = next.price;
    out[typeof next.name === "string" ? "name" : "title"] = label(next);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The owner's direct edit reduced to what they actually typed, for the fact-check corpus (`typedText`).
 * Editor forms send whole sections and a duplicated section arrives as a full copy; without this, every
 * price in it would count as the owner's own and skip the fact check. Each value is compared with what
 * was at its place before (an added array element with its closest sibling); unchanged parts are
 * dropped. The result describes the edit, it isn't meant to be applied.
 */
export function typedOps(before: SiteSpec, ops: Operation[]): Operation[] {
  let doc: unknown = structuredClone(before);
  const out: Operation[] = [];
  for (const op of ops) {
    if (op.op === "add" || op.op === "replace") {
      const parent = op.path.slice(0, op.path.lastIndexOf("/"));
      const key = op.path.slice(op.path.lastIndexOf("/") + 1).replace(/~1/g, "/").replace(/~0/g, "~");
      const container = parent === "" ? doc : jsonpatch.getValueByPointer(doc, parent);
      let reduced: unknown;
      if (op.op === "add" && Array.isArray(container) && (key === "-" || /^\d+$/.test(key))) {
        // A new element: as typed as its difference from the most similar element already there.
        reduced = op.value;
        for (const sibling of container) {
          const d = changed(sibling, op.value);
          if (leaves(d) < leaves(reduced)) reduced = d;
        }
      } else {
        reduced = changed(isPlain(container) || Array.isArray(container) ? (container as Plain)[key] : undefined, op.value);
      }
      if (reduced !== undefined) out.push({ op: "replace", path: op.path, value: reduced });
    }
    doc = jsonpatch.applyOperation(doc, op, false, true, false).newDocument;
  }
  return out;
}
