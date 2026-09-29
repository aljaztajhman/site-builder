import jsonpatch, { type Operation } from "fast-json-patch";
import {
  Business,
  DIRECTIONS,
  Design,
  FONT_PAIRS,
  SECTION_DEFS,
  direction as directionById,
  enforceDesign,
  migrateSpec,
  sectionDef,
  toModelJsonSchema,
  validateSite,
  EDITOR_STARTER_TEXT as DEFAULT_TEXT,
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
  /** Human-readable notes on automatic corrections (e.g. contrast fixed). */
  adjustments: string[];
}

/**
 * Paths no edit may touch: the version, the slug (it names published storage) and asset identity
 * (ids, files, sizes are set by the image pipeline). Alt text and focal points stay editable.
 */
export function protectedPathIssues(ops: Operation[]): Issue[] {
  const blocked = (p: string) =>
    p === "" ||
    /^\/(specVersion|slug)(\/|$)/.test(p) ||
    /^\/assets(\/logo(\/|$)|\/images\/?$|\/images\/[^/]+\/?$|\/images\/[^/]+\/(id|src|width|height)(\/|$)|\/?$)/.test(p);
  const issues: Issue[] = [];
  for (const op of ops) {
    for (const p of [op.path, "from" in op ? (op as { from: string }).from : undefined]) {
      if (p !== undefined && blocked(p)) issues.push({ path: p, code: "structure", message: "this part of the site can't be edited" });
    }
  }
  return issues;
}

export function applyDirectEdit(spec: SiteSpec, ops: Operation[]): DirectEditResult {
  const guarded = protectedPathIssues(ops);
  if (guarded.length) return { ok: false, spec, issues: guarded, adjustments: [] };
  const invalid = jsonpatch.validate(ops, spec);
  if (invalid) {
    return { ok: false, spec, issues: [{ path: invalid.operation?.path ?? "", code: "schema", message: invalid.message }], adjustments: [] };
  }
  let next: SiteSpec;
  try {
    next = jsonpatch.applyPatch(structuredClone(spec), ops, true, false).newDocument;
  } catch (e) {
    return { ok: false, spec, issues: [{ path: "", code: "schema", message: (e as Error).message }], adjustments: [] };
  }
  next = migrateSpec(next);
  const adjustments: string[] = [];
  if (ops.some((o) => o.path.startsWith("/design"))) {
    const dir = DIRECTIONS.find((d) => d.id === next.design.direction);
    const parsed = Design.safeParse(next.design);
    if (dir && parsed.success) {
      const fixed = enforceDesign(parsed.data, dir);
      for (const [k, v] of Object.entries(fixed.colors)) {
        const before = (parsed.data.colors as Record<string, string>)[k];
        if (before !== v) adjustments.push(`${k} colour adjusted to ${v} for contrast`);
      }
      for (const k of ["radius", "baseFontSize", "scale", "headingWeight", "headingTracking", "headingCase", "density", "shadow", "fontPair", "imagery"] as const) {
        if (parsed.data[k] !== fixed[k]) adjustments.push(`${k} set to ${String(fixed[k])} (allowed by ${dir.name})`);
      }
      next.design = fixed;
    }
  }
  const v = validateSite(next);
  if (!v.ok) return { ok: false, spec, issues: v.issues, adjustments };
  return { ok: true, spec: v.spec, issues: [], adjustments };
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

/** Strings a client typed through the editor, for the fact-check corpus. */
export function typedText(ops: Operation[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    // Numbers too: a price or capacity typed in the editor is the client's own fact.
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const o of ops) if ("value" in o) walk(o.value);
  return out;
}
