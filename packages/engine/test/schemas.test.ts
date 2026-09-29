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
