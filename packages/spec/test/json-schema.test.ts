import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OWNER_ONLY, Price, SECTION_DEFS, SPEC_VERSION, siteSpecJsonSchema, toModelJsonSchema } from "../src/index.ts";

type Node = Record<string, unknown>;

function walk(v: unknown, fn: (n: Node) => void): void {
  if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
  else if (v && typeof v === "object") {
    fn(v as Node);
    Object.values(v).forEach((x) => walk(x, fn));
  }
}

/** Structured outputs: anyOf not oneOf, additionalProperties false on every object, no recursive $ref. */
function assertStructuredOutputCompatible(schema: Record<string, unknown>): void {
  walk(schema, (n) => {
    expect(n).not.toHaveProperty("oneOf");
    if (n.type === "object") expect(n.additionalProperties, JSON.stringify(n).slice(0, 120)).toBe(false);
  });
  const defs = (schema.$defs ?? {}) as Record<string, unknown>;
  for (const [name, def] of Object.entries(defs)) {
    walk(def, (n) => expect(n.$ref).not.toBe(`#/$defs/${name}`));
  }
}

describe("model JSON Schema export", () => {
  it("exports the whole site spec with its version field (for prompts; not sent as a structured-output schema)", () => {
    const schema = siteSpecJsonSchema() as { properties: Record<string, { const?: number }>; required: string[] };
    expect(schema.properties.specVersion?.const).toBe(SPEC_VERSION);
    expect(schema.required).toContain("specVersion");
  });

  it("is structured-output compatible for every section's props", () => {
    for (const d of SECTION_DEFS) assertStructuredOutputCompatible(toModelJsonSchema(d.props));
  });

  it("never offers the model a price \"po dogovoru\": the owner's own (it-price-on-request)", () => {
    // The zod schema accepts it (the owner's edits) ...
    expect(Price.safeParse({ onRequest: true }).success).toBe(true);
    // ... the model's JSON Schema has the price as it was before: an amount or a placeholder.
    const price = toModelJsonSchema(Price) as { anyOf: Node[] };
    expect(price.anyOf.map((o) => Object.keys(o.properties as Node))).toEqual([["amount", "from", "unit"], ["$placeholder", "note"]]);
    const all = [siteSpecJsonSchema(), ...SECTION_DEFS.map((d) => toModelJsonSchema(d.props))];
    for (const schema of all)
      walk(schema, (n) => {
        expect(n).not.toHaveProperty(OWNER_ONLY);
        expect(Object.keys((n.properties ?? {}) as Node)).not.toContain("onRequest");
      });
    // Any union member marked owner-only goes, wherever it is.
    const marked = z.object({ a: z.union([z.string(), z.number().meta({ [OWNER_ONLY]: true })]) });
    expect((toModelJsonSchema(marked) as { properties: { a: { anyOf: Node[] } } }).properties.a.anyOf).toEqual([{ type: "string" }]);
  });
});
