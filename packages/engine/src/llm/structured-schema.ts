/**
 * Structured outputs accept a subset of JSON Schema: no numeric bounds, no string length limits,
 * no array size limits beyond minItems 0/1 (API returned 400 "For 'number' type, properties maximum,
 * minimum are not supported"). This removes those keywords and moves them into the description so
 * the model still sees the limits; zod validates the real limits on the response.
 */
const DROP = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems"] as const;

export function toStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStructuredOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [k, v] of Object.entries(src)) {
    if ((DROP as readonly string[]).includes(k)) {
      notes.push(`${k} ${String(v)}`);
      continue;
    }
    if (k === "minItems" && typeof v === "number" && v > 1) {
      notes.push(`minItems ${v}`);
      out.minItems = 1;
      continue;
    }
    out[k] = k === "properties" || k === "$defs" || k === "definitions" ? mapValues(v) : toStructuredOutputSchema(v);
  }
  if (notes.length) out.description = [typeof src.description === "string" ? src.description : "", `(${notes.join(", ")})`].filter(Boolean).join(" ");
  return out;
}

function mapValues(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toStructuredOutputSchema(x)]));
}
