import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { validateSite } from "@sb/spec";
import { ORIGINAL_FIXTURES, fileFixture, fixtureKind, knownFixtures, parseFixtureArgs, recordCommand, recordedBrief } from "../src/studio-fixtures.ts";
import { loadFixture } from "../src/fixtures/load.ts";

const KNOWN = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik", "cvetlicarna-zvoncek", "tattoo-crnilo", "frizerstvo-lana", "salon-tina", "foto-rozman"];

describe("parseFixtureArgs", () => {
  it("--all is the original five", () => {
    expect(ORIGINAL_FIXTURES).toEqual(["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik", "cvetlicarna-zvoncek", "tattoo-crnilo"]);
    expect(parseFixtureArgs(["--all", "--replay"], KNOWN)).toEqual({ ok: true, fixtures: [...ORIGINAL_FIXTURES] });
  });

  it("--fixtures takes a comma list, --fixture one id; together in order, without repeats", () => {
    expect(parseFixtureArgs(["--fixtures", "frizerstvo-lana, salon-tina,foto-rozman"], KNOWN)).toEqual({ ok: true, fixtures: ["frizerstvo-lana", "salon-tina", "foto-rozman"] });
    expect(parseFixtureArgs(["--fixture", "salon-tina", "--replay"], KNOWN)).toEqual({ ok: true, fixtures: ["salon-tina"] });
    expect(parseFixtureArgs(["--fixtures", "salon-tina,frizerstvo-lana", "--fixture", "salon-tina", "--fixture", "pekarna-kvas"], KNOWN)).toEqual({ ok: true, fixtures: ["salon-tina", "frizerstvo-lana", "pekarna-kvas"] });
  });

  it("refuses unknown ids, a missing value and no fixture at all", () => {
    expect(parseFixtureArgs(["--fixtures", "salon-tina,nope"], KNOWN)).toEqual({ ok: false, error: "unknown fixture(s): nope" });
    expect(parseFixtureArgs(["--fixtures", "--replay"], KNOWN)).toMatchObject({ ok: false, error: expect.stringContaining("--fixtures needs") });
    expect(parseFixtureArgs(["--fixture"], KNOWN)).toMatchObject({ ok: false, error: expect.stringContaining("--fixture needs") });
    expect(parseFixtureArgs(["--replay"], KNOWN)).toMatchObject({ ok: false, error: expect.stringContaining("no fixture") });
  });
});

describe("the fixtures studio:poc knows", () => {
  const known = knownFixtures();

  it("are the ten goldens, the twins, the hard ones and the two edge ones, each of one kind", () => {
    expect(known.golden).toHaveLength(10);
    expect(known.twins).toEqual(expect.arrayContaining(["elektro-zupan", "mizarstvo-lesnik", "pizzeria-oljka", "salon-tina"]));
    expect(known.hard).toEqual(expect.arrayContaining(["cebelarstvo-medved", "avtosola-volan", "foto-rozman", "apartmaji-pod-voglom"]));
    expect(fixtureKind("pekarna-kvas", known)).toBe("composer");
    expect(fixtureKind("tattoo-crnilo", known)).toBe("edge");
    // The edge florist shares its id with a hard fixture: the edge stand-in wins, as before.
    expect(fixtureKind("cvetlicarna-zvoncek", known)).toBe("edge");
    expect(fixtureKind("frizerstvo-lana", known)).toBe("golden");
    expect(fixtureKind("salon-tina", known)).toBe("twin");
    expect(fixtureKind("foto-rozman", known)).toBe("hard");
    expect(fixtureKind("nope", known)).toBeNull();
  });

  it("every golden builds a valid base with a recorded brief, no model call", () => {
    const config = loadConfig();
    for (const id of known.golden) {
      const fx = fileFixture(id, config);
      const v = validateSite(fx.spec);
      expect(v.ok ? [] : v.issues.slice(0, 3), id).toEqual([]);
      expect(fx.brief?.summary, id).toBeTruthy();
      expect(fx.corpus, id).toBe(loadFixture(id).brief.description);
    }
  });

  it("the recorded brief keeps only facts the client wrote", () => {
    const description = loadFixture("frizerstvo-lana").brief.description;
    const brief = recordedBrief("frizerstvo-lana", description);
    expect(brief.name).toBeTruthy();
    expect(() => recordedBrief("frizerstvo-lana", description, "/no/such/dir")).toThrow("no recorded brief");
  });

  it("names the paid command that records a twin's or hard fixture's homepage", () => {
    expect(recordCommand("salon-tina", "twin")).toBe("pnpm eval --record-missing --recordings tools/eval/recordings-home-off --only salon-tina --twins --scope home --photos 0 --no-edits --no-judge --no-lighthouse");
    expect(recordCommand("foto-rozman", "hard")).toContain("--only foto-rozman --hard ");
  });
});
