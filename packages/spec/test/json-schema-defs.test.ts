import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComposedProps, Vocab, canonicalJson, expandRefs, toModelJsonSchema } from "../src/index.ts";

const Role = z.enum(["text", "accent"]);
const Paint = z.strictObject({ role: Role, strength: z.number().int().min(1).max(4) });
const Thing = z.strictObject({
  a: Paint,
  b: Paint.optional().describe("A second paint"),
  c: z.array(Role).min(1),
  d: z.union([Role, z.enum(["none"])]),
  m: Vocab("MASKS").optional(),
  n: Vocab("MASKS").describe("Another mask"),
});

describe("toModelJsonSchema with shared defs", () => {
  it("without `shared` prints no $defs or $ref (every designer-off schema stays expanded)", () => {
    expect(JSON.stringify(toModelJsonSchema(ComposedProps))).not.toMatch(/\$defs|\$ref/);
  });

  it("names each shared shape and vocabulary once; refs keep the node's own description; a def uses earlier ones", () => {
    const js = toModelJsonSchema(Thing, { shared: [{ name: "Role", schema: Role }, { name: "Paint", schema: Paint }] });
    const props = js.properties as Record<string, Record<string, unknown>>;
    expect(props.a).toEqual({ $ref: "#/$defs/Paint" });
    expect(props.b).toEqual({ $ref: "#/$defs/Paint", description: "A second paint" });
    expect(props.c!.items).toEqual({ $ref: "#/$defs/Role" });
    expect(props.d!.anyOf).toEqual([{ $ref: "#/$defs/Role" }, { type: "string", enum: ["none"] }]);
    expect(props.n).toEqual({ $ref: "#/$defs/MASKS", description: "Another mask" });
    const defs = js.$defs as Record<string, Record<string, unknown>>;
    expect(Object.keys(defs)).toEqual(["Role", "Paint", "MASKS"]);
    expect((defs.Paint!.properties as Record<string, unknown>).role).toEqual({ $ref: "#/$defs/Role" });
    expect(canonicalJson(expandRefs(js))).toBe(canonicalJson(toModelJsonSchema(Thing)));
  });

  it("expandRefs refuses refs it can't resolve", () => {
    expect(() => expandRefs({ $ref: "#/$defs/Nope", $defs: {} })).toThrow(/unresolved/);
    expect(() => expandRefs({ $ref: "https://example.com/x" })).toThrow(/external/);
  });
});
