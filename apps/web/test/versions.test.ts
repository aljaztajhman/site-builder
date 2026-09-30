import { describe, expect, it } from "vitest";
import { undoTarget, type VersionRow } from "../src/client/versions.ts";

const row = (version: number, source = "manual", message: string | null = null): VersionRow => ({ version, source, message });
const revert = (version: number, to: number) => row(version, "revert", `povrnjeno na različico ${to}`);

describe("undoTarget", () => {
  it("goes one version back after a normal change", () => {
    expect(undoTarget([row(3, "edit"), row(2, "critique"), row(1, "generate")], 3)).toBe(2);
  });

  it("keeps walking back when undo is pressed again instead of redoing", () => {
    // v4 manual → undo writes v5 (= v3) → undo again must give v2, not v4.
    const versions = [revert(6, 2), revert(5, 3), row(4), row(3, "edit"), row(2, "critique"), row(1, "generate")];
    expect(undoTarget(versions.slice(2), 4)).toBe(3);
    expect(undoTarget(versions.slice(1), 5)).toBe(2);
    expect(undoTarget(versions, 6)).toBe(1);
  });

  it("has nothing to undo at the first version, or after undoing back to it", () => {
    expect(undoTarget([row(1, "generate")], 1)).toBeNull();
    expect(undoTarget([revert(2, 1), row(1, "generate")], 2)).toBeNull();
    expect(undoTarget([], null)).toBeNull();
  });
});
