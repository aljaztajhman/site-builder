// The final-check businesses (tools/eval/final10): ten never-tested businesses for M1, run with `pnpm eval --fresh --fresh-dir`.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFixtures, loadFresh, loadHard, loadTwins, FRESH_DIR, resolveFreshDir } from "../src/fixtures/load.ts";
import { fixtureBusinessType } from "../src/outside-review.ts";
import { fullPrompt, loadPhotoPrompts, photoKey, promptsFileIn } from "../src/fixtures/photo-prompts.ts";
import { emailsIn, factTests, phonesIn } from "./fixture-facts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FINAL10 = path.resolve(here, "../final10");
const final10 = loadFresh(FINAL10);

/** Towns, ids and trades named as used before (Review 50's ids, the earlier towns the brief listed). */
const REVIEW50_IDS = ["avto-kovac", "brivnica", "cvetlicarna", "elektro", "frizerski-salon", "gostilna", "gostisce", "karoserija", "mizarstvo", "pizzeria", "salon", "vulkanizer"];
const LISTED_TOWNS = [
  "Celje", "Škofja Loka", "Luče", "Kranj", "Maribor", "Novo mesto", "Murska Sobota", "Ptuj", "Trbovlje", "Slovenj Gradec", "Ljubljana", "Idrija",
  "Domžale", "Radovljica", "Nova Gorica", "Krško", "Velenje", "Bohinj", "Ajdovščina", "Jesenice",
];

describe("final10 businesses", () => {
  const earlier = [...loadFixtures(), ...loadTwins(), ...loadHard(), ...loadFresh()];

  it("load and validate: ten of them, with the mix the final check needs", () => {
    expect(final10).toHaveLength(10);
    const withPhotos = final10.filter((f) => f.photos.length > 0);
    expect(withPhotos).toHaveLength(5);
    for (const f of withPhotos) expect(f.photos, f.id).toHaveLength(3);
    const logos = final10.filter((f) => f.logoPath);
    expect(logos.length).toBeGreaterThanOrEqual(2);
    expect(logos.length).toBeLessThanOrEqual(3);
    expect(final10.some((f) => f.brief.facts.name.length >= 40)).toBe(true);
    expect(final10.some((f) => Object.keys(f.brief.facts).length <= 3)).toBe(true);
    for (const k of ["prices", "hours", "email"] as const) expect(final10.some((f) => f.brief.missing.includes(k)), k).toBe(true);
    for (const f of final10) {
      expect(f.edits, f.id).toEqual([]);
      f.brief.photos.forEach((p, i) => expect(p.file).toBe(`photos/${String(i + 1).padStart(2, "0")}.jpg`));
      for (const p of f.photos) expect(p.from, f.id).toBeUndefined();
    }
  });

  it("ships simple SVG logos whose viewBox starts at 0 0", () => {
    for (const f of final10.filter((x) => x.logoPath)) {
      const svg = readFileSync(f.logoPath!, "utf8");
      expect(svg, f.id).toMatch(/^<svg[\s>]/);
      expect(svg, f.id).toMatch(/viewBox="0 0 \d+ \d+"/);
      expect(svg, f.id).not.toMatch(/href|<image|<script|url\(/);
    }
  });

  it("are new: no id, trade or town used by the fixtures, twins, hard, fresh or Review 50 sets", () => {
    const ids = new Set([...earlier.map((f) => f.id), ...REVIEW50_IDS]);
    const trades = new Set(earlier.map((f) => f.brief.trade).filter(Boolean));
    const towns = new Set([...LISTED_TOWNS, ...earlier.map((f) => f.brief.facts.address?.city).filter(Boolean)]);
    for (const f of final10) {
      expect(ids.has(f.id), f.id).toBe(false);
      expect(trades.has(f.brief.trade), `${f.id}: ${f.brief.trade}`).toBe(false);
      const city = f.brief.facts.address?.city;
      if (city) expect(towns.has(city), `${f.id}: ${city}`).toBe(false);
    }
    expect(new Set(final10.map((f) => f.brief.trade)).size).toBe(10);
    const cities = final10.map((f) => f.brief.facts.address?.city).filter(Boolean);
    expect(new Set(cities).size).toBe(cities.length);
  });

  it("use only fictional phone blocks and reserved email domains", () => {
    for (const f of final10) {
      for (const p of phonesIn(f.brief.description)) expect(p, `${f.id}: ${p}`).toMatch(/^\+386(\d555\d{4}|\d{2}555\d{3})$/);
      for (const e of emailsIn(f.brief.description)) expect(e, `${f.id}: ${e}`).toMatch(/\.example$/);
    }
  });

  it("tell the outside reviewers their trade", () => {
    expect(fixtureBusinessType("tapetnistvo-lesjak")).toBe("builder, tapetnik");
  });

  describe.each(final10.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    factTests(f);
  });
});

describe("final10 photos", () => {
  const prompts = loadPhotoPrompts(promptsFileIn(FINAL10));
  const keys = final10.flatMap((f) => f.photos.map((p) => photoKey(f.id, p.file)));
  // The photos come from a paid run (docs: tools/eval/final10/README.md). Until all of them are committed the file check is skipped.
  const FINAL10_PHOTOS_EXIST = final10.flatMap((f) => f.photos).every((p) => existsSync(p.path));

  it("has a shot list prompt for every planned photo and nothing else", () => {
    expect(keys).toHaveLength(15);
    expect(Object.keys(prompts.photos).sort()).toEqual([...keys].sort());
    expect(prompts.compare).toEqual([]);
    for (const k of keys) expect(fullPrompt(prompts, k).endsWith(prompts.style)).toBe(true);
  });

  it.skipIf(!FINAL10_PHOTOS_EXIST)("has every photo file once they are generated", () => {
    for (const f of final10) for (const p of f.photos) expect(existsSync(p.path), p.path).toBe(true);
  });
});

describe("--fresh-dir", () => {
  it("defaults to tools/eval/fresh and resolves a given folder", () => {
    expect(resolveFreshDir()).toBe(FRESH_DIR);
    expect(resolveFreshDir("tools/eval/final10")).toBe(path.resolve("tools/eval/final10"));
    expect(loadFresh(resolveFreshDir("tools/eval/final10")).map((f) => f.id)).toEqual(final10.map((f) => f.id));
  });

  it("keeps the default fresh ten apart from the final ten", () => {
    const fresh = loadFresh();
    expect(fresh).toHaveLength(10);
    expect(fresh.map((f) => f.id).filter((id) => final10.some((x) => x.id === id))).toEqual([]);
  });
});
