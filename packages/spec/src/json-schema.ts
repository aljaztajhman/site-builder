import { z } from "zod";
import { SiteSpec } from "./site.ts";

/**
 * JSON Schema export for the model. Structured outputs accept anyOf but not oneOf, and require
 * additionalProperties: false on every object (zod's strictObject emits that). Length and numeric
 * limits are kept: the SDK strips unsupported constraints before sending and we re-validate with zod.
 */
export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  return normalise(js) as Record<string, unknown>;
}

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "$schema") continue;
    out[k === "oneOf" ? "anyOf" : k] = normalise(x);
  }
  return out;
}

export function siteSpecJsonSchema(): Record<string, unknown> {
  return toModelJsonSchema(SiteSpec);
}
