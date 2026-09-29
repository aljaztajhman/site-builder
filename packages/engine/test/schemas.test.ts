import { describe, expect, it } from "vitest";
import { briefJsonSchema, classificationJsonSchema, contentJsonSchema } from "../src/index.ts";

type Node = Record<string, unknown>;
function walk(v: unknown, fn: (n: Node) => void): void {
  if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
  else if (v && typeof v === "object") {
    fn(v as Node);
    Object.values(v).forEach((x) => walk(x, fn));
  }
}

describe("schemas sent as structured output", () => {
  for (const [name, schema] of [
    ["classification", classificationJsonSchema()],
    ["brief", briefJsonSchema()],
    ["content", contentJsonSchema()],
  ] as const) {
    it(`${name}: anyOf only, additionalProperties false on every object`, () => {
      walk(schema, (n) => {
        expect(n).not.toHaveProperty("oneOf");
        if (n.type === "object") expect(n.additionalProperties).toBe(false);
      });
    });
  }

  it("content schema size is reported (large unions may be rejected; the stage falls back to plain JSON)", () => {
    const bytes = JSON.stringify(contentJsonSchema()).length;
    expect(bytes).toBeGreaterThan(1000);
    console.log(`content schema: ${bytes} bytes`);
  });
});

describe("toStructuredOutputSchema", () => {
  it("drops unsupported constraints and keeps them readable in the description", async () => {
    const { toStructuredOutputSchema } = await import("../src/llm/structured-schema.ts");
    const out = toStructuredOutputSchema({
      type: "object",
      properties: { n: { type: "number", minimum: 0, maximum: 1 }, s: { type: "string", maxLength: 70, description: "Headline" }, a: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } } },
      required: ["n"],
      additionalProperties: false,
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.n).toEqual({ type: "number", description: "(minimum 0, maximum 1)" });
    expect(out.properties.s).toEqual({ type: "string", description: "Headline (maxLength 70)" });
    expect(out.properties.a).toMatchObject({ minItems: 1, description: "(minItems 2, maxItems 6)" });
    for (const s of [contentJsonSchema(), briefJsonSchema(), classificationJsonSchema()]) {
      expect(JSON.stringify(toStructuredOutputSchema(s))).not.toMatch(/"(minimum|maximum|maxLength|minLength|maxItems)"/);
    }
  });
});
