import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatPhoneNational } from "@sb/spec";
import { FixtureBrief } from "../src/fixtures/schema.ts";

/** Studio 0.5 edge fixtures (tools/eval/fixtures-edge): businesses outside the ten trades, invented fixture data. */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures-edge");
const ids = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

describe("edge fixtures", () => {
  it("there are the florist and the tattoo studio", () => {
    expect(ids.sort()).toEqual(["cvetlicarna-zvoncek", "tattoo-crnilo"]);
  });

  it.each(ids)("%s: a valid brief whose facts are all in the client's own text, with fixture-only contacts", (id) => {
    const brief = FixtureBrief.parse(JSON.parse(readFileSync(path.join(dir, id, "brief.json"), "utf8")));
    expect(brief.id).toBe(id);
    const d = brief.description;
    const f = brief.facts;
    expect(d).toContain(f.address!.street);
    expect(d).toContain(f.address!.city);
    expect(d).toContain(formatPhoneNational(f.phone!));
    expect(f.email).toMatch(/\.example$/);
    expect(f.phone).toMatch(/^\+38641555/);
    for (const p of f.prices ?? []) expect(d, p.item).toContain(`${p.amount} €`);
    for (const p of f.people ?? []) expect(d, p.name).toContain(p.name);
    for (const o of f.other ?? []) expect(d, o).toContain(o);
    expect(brief.photos).toEqual([]);
  });
});
