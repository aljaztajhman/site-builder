import { describe, expect, it } from "vitest";
import { changes, groupVersions, undoTarget, type ListedVersion, type VersionRow } from "../src/client/versions.ts";

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

  it("after retention removed versions, goes to the nearest older version that is still kept", () => {
    // Kept after a prune: today's v40–v42, v30 (last of an older day), v12 (published), v9 (last of its day).
    const kept = [row(42), row(41), row(40), row(30), row(12, "manual"), row(9, "critique")];
    expect(undoTarget(kept, 42)).toBe(41);
    expect(undoTarget(kept, 40)).toBe(30); // v39 … v31 are gone
    expect(undoTarget(kept, 30)).toBe(12);
    expect(undoTarget(kept, 9)).toBeNull(); // nothing older is kept
    // Undo of a revert whose copied version was pruned: before that version, the nearest kept one.
    expect(undoTarget([revert(43, 25), ...kept], 43)).toBe(12);
    // A revert to a kept version still continues from it.
    expect(undoTarget([revert(43, 30), ...kept], 43)).toBe(12);
  });
});

const TZ = { timeZone: "Europe/Ljubljana" };
/** A listed version at a UTC time (Ljubljana is UTC+2 in October: 08:02Z is 10:02). */
const at = (version: number, time: string, source = "manual", message: string | null = "urejen razdelek hero", published = false): ListedVersion => ({
  version,
  source,
  message,
  created_at: `2026-10-01T${time}:00Z`,
  published,
});

describe("groupVersions", () => {
  it("joins consecutive text saves into one row: count, kind and time range", () => {
    const items = groupVersions([at(14, "08:14"), at(13, "08:10", "manual", "urejeno besedilo"), at(12, "08:06"), at(11, "08:02", "manual", "nastavitve strani")], TZ);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "group", label: "4 spremembe besedila, 10:02–10:14", range: "v11–v14", day: "1. 10. 2026" });
    const g = items[0]!;
    if (g.type !== "group") throw new Error("group expected");
    expect([g.newest.version, g.oldest.version, g.rows.length]).toEqual([14, 11, 4]);
  });

  it("starts a new group after a pause longer than the gap, or when the kind of change differs", () => {
    const items = groupVersions(
      [
        at(8, "09:30"), // a later session
        at(7, "09:29"),
        at(6, "08:05", "manual", "premik"), // layout
        at(5, "08:04", "manual", "premik"),
        at(4, "08:03"), // text
        at(3, "08:02"),
      ],
      TZ,
    );
    expect(items.map((i) => (i.type === "group" ? i.label : `v${i.row.version}`))).toEqual([
      "2 spremembi besedila, 11:29–11:30",
      "2 spremembi postavitve, 10:04–10:05",
      "2 spremembi besedila, 10:02–10:03",
    ]);
  });

  it("keeps generations, critique, chat edits, reverts and published versions as rows of their own", () => {
    const items = groupVersions(
      [
        at(9, "08:09"),
        at(8, "08:08", "manual", "urejen razdelek hero", true), // published
        at(7, "08:07"),
        at(6, "08:06", "revert", "povrnjeno na različico 3"),
        at(5, "08:05", "edit", "Temnejša glava"),
        at(4, "08:04", "edit", "opisi fotografij"),
        at(3, "08:03", "critique", "…"),
        at(2, "08:02", "generate", null),
        at(1, "08:01", "generate", null),
      ],
      TZ,
    );
    expect(items.map((i) => i.type)).toEqual(Array(9).fill("one"));
  });

  it("never joins across versions retention removed", () => {
    // v41 and v30 are a minute apart, but v31–v40 were removed between them.
    const items = groupVersions([at(42, "08:06"), at(41, "08:05"), at(30, "08:04"), at(29, "08:03")], TZ);
    expect(items.map((i) => (i.type === "group" ? i.range : `v${i.row.version}`))).toEqual(["v41–v42", "v29–v30"]);
  });

  it("labels kinds in Slovene, unknown messages without a noun, one minute without a range", () => {
    const label = (message: string) => {
      const [i] = groupVersions([at(2, "08:02", "manual", message), at(1, "08:02", "manual", message)], TZ);
      return i?.type === "group" ? i.label : null;
    };
    expect(label("podatki")).toBe("2 spremembi podatkov o podjetju, 10:02");
    expect(label("zamenjana slika img_02")).toBe("2 spremembi fotografij, 10:02");
    expect(label("smer warm-craft")).toBe("2 spremembi oblikovanja, 10:02");
    expect(label("dodan razdelek faq")).toBe("2 spremembi postavitve, 10:02");
    expect(label("nekaj novega")).toBe("2 spremembi, 10:02");
  });

  it("uses Slovene dual and plural", () => {
    expect([1, 2, 3, 4, 5, 12, 101, 102, 103, 111].map(changes)).toEqual([
      "1 sprememba",
      "2 spremembi",
      "3 spremembe",
      "4 spremembe",
      "5 sprememb",
      "12 sprememb",
      "101 sprememba",
      "102 spremembi",
      "103 spremembe",
      "111 sprememb",
    ]);
  });

  it("leaves a single save as a plain row", () => {
    expect(groupVersions([at(3, "09:00"), at(2, "08:00", "edit", "x"), at(1, "07:00")], TZ).map((i) => i.type)).toEqual(["one", "one", "one"]);
  });
});
