import { describe, expect, it } from "vitest";
import { SECTION_DEFS, siteSpecJsonSchema, toModelJsonSchema } from "../src/index.ts";

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
    expect(schema.properties.specVersion?.const).toBe(1);
    expect(schema.required).toContain("specVersion");
  });

  it("is structured-output compatible for every section's props", () => {
    for (const d of SECTION_DEFS) assertStructuredOutputCompatible(toModelJsonSchema(d.props));
  });
});
