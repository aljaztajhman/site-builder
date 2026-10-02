import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_LOCALES, Locale, validateSite, withSiteLocales, type SiteSpec } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
const issuesOf = (spec: SiteSpec) => {
  const v = validateSite(spec);
  return v.ok ? [] : v.issues;
};

describe("site locales", () => {
  it("are sl and en; the schema still reads the others", () => {
    expect([...SITE_LOCALES]).toEqual(["sl", "en"]);
    for (const l of ["de", "hr", "it"]) expect(Locale.safeParse(l).success).toBe(true);
  });

  it("validation refuses a locale without UI strings (a chat edit adding German) and accepts sl + en", () => {
    const spec = golden();
    expect(issuesOf(spec)).toEqual([]);
    spec.locales.enabled = ["sl", "en"];
    spec.translations = { en: { "/pages/0/nav/label": "Home" } };
    expect(issuesOf(spec)).toEqual([]);
    spec.locales.enabled = ["sl", "de"];
    spec.translations = { de: { "/pages/0/nav/label": "Start" } };
    expect(issuesOf(spec)).toContainEqual({ path: "/locales", code: "structure", message: "locale de is not available; sites can use sl, en" });
    const german = golden();
    german.locales = { default: "de", enabled: ["de"] };
    expect(issuesOf(german).map((i) => i.message)).toEqual(["locale de is not available; sites can use sl, en"]);
  });

  it("an existing spec with de/hr/it reads as sl/en and then validates", () => {
    const extra = golden();
    extra.locales = { default: "sl", enabled: ["sl", "de", "en"] };
    extra.translations = { de: { "/pages/0/nav/label": "Start" }, en: { "/pages/0/nav/label": "Home" } };
    const read = withSiteLocales(extra);
    expect(read.locales).toEqual({ default: "sl", enabled: ["sl", "en"] });
    expect(read.translations).toEqual({ en: { "/pages/0/nav/label": "Home" } });
    expect(issuesOf(read)).toEqual([]);
    // The stored spec is not changed in place.
    expect(extra.locales.enabled).toEqual(["sl", "de", "en"]);

    const german = golden();
    german.locales = { default: "de", enabled: ["de"] };
    expect(withSiteLocales(german).locales).toEqual({ default: "sl", enabled: ["sl"] });
    expect(issuesOf(withSiteLocales(german))).toEqual([]);

    const croatianFirst = golden();
    croatianFirst.locales = { default: "hr", enabled: ["hr", "en"] };
    expect(withSiteLocales(croatianFirst).locales).toEqual({ default: "sl", enabled: ["sl", "en"] });
  });

  it("leaves a spec with only sl/en as the same object", () => {
    const spec = golden();
    expect(withSiteLocales(spec)).toBe(spec);
    spec.locales.enabled = ["sl", "en"];
    expect(withSiteLocales(spec)).toBe(spec);
  });
});
