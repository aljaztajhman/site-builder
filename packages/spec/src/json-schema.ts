import { z } from "zod";
import { SiteSpec } from "./site.ts";
import { OWNER_ONLY, SYSTEM_ONLY } from "./common.ts";

/**
 * JSON Schema export for the model. Structured outputs accept anyOf but not oneOf, and require
 * additionalProperties: false on every object (zod's strictObject emits that). Length and numeric
 * limits are kept: the SDK strips unsupported constraints before sending and we re-validate with zod.
 */
export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  return normalise(js) as Record<string, unknown>;
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
    if (k === "$schema") continue;
    // The model is never offered what only the owner sets: the union loses that member, the rest stays as it was.
    const kept = (k === "anyOf" || k === "oneOf") && Array.isArray(x) ? x.filter((o) => !ownerOnly(o)) : x;
    out[k === "oneOf" ? "anyOf" : k] = normalise(kept);
  }
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
