import { describe, expect, it } from "vitest";
import { MIGRATIONS, SPEC_VERSION, migrateSpec } from "../src/index.ts";

describe("migrateSpec", () => {
  it("passes the current version through unchanged", () => {
    const spec = { specVersion: SPEC_VERSION, slug: "x" };
    expect(migrateSpec(spec)).toBe(spec);
  });

  it("has a migration step for every version below the current one", () => {
    for (let v = 1; v < SPEC_VERSION; v++) expect(MIGRATIONS[v], `migration from v${v}`).toBeTypeOf("function");
  });

  it("runs steps in order and bumps the version", () => {
    const steps = {
      1: (s: Record<string, unknown>) => ({ ...s, a: 1 }),
      2: (s: Record<string, unknown>) => ({ ...s, b: (s.a as number) + 1 }),
    };
    expect(migrateSpec({ specVersion: 1 }, steps, 3)).toEqual({ specVersion: 3, a: 1, b: 2 });
  });

  it("rejects missing, unknown and future versions", () => {
    expect(() => migrateSpec({})).toThrow(/specVersion/);
    expect(() => migrateSpec({ specVersion: SPEC_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrateSpec({ specVersion: 1 }, {}, 2)).toThrow(/No migration/);
    expect(() => migrateSpec(null)).toThrow();
  });
});
