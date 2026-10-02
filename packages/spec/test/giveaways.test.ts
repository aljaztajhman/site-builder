import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BANNED_PHRASES,
  DIRECTIONS,
  MIGRATIONS,
  OFF_BLACK_MIN,
  OFF_WHITE_MAX,
  SPEC_VERSION,
  checkDesign,
  clampLuminance,
  enforceDesign,
  findBannedCopy,
  isAllCapsLabel,
  issueMessage,
  luminance,
  migrateSpec,
  repairSiteCopy,
  replaceEmDashes,
  validateSite,
  type Design,
  type SiteSpec,
} from "../src/index.ts";

/** AI-site give-aways added to the banned list by the owner's decision sb-giveaway-additions (2026-10-02). */

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
const rules = (text: string, key = "text") => findBannedCopy({ [key]: text }).map((v) => v.rule);

describe("Slovene filler additions", () => {
  const banned: [string, string][] = [
    ["Brezhibna izvedba vsakega projekta.", "brezhibno"],
    ["Vse opravimo brezhibno.", "brezhibno"],
    ["Celovit pristop k vašemu zdravju.", "celovit pristop"],
    ["Dvignite svoj nasmeh na višjo raven.", "na višjo raven"],
    ["Povzdignite pričesko na višji nivo in na višjo raven.", "na višjo raven"],
    ["Odklenite svoj potencial.", "odklenite"],
    ["Opolnomočimo vas za zdravo življenje.", "opolnomočimo"],
    ["Inovativne rešitve za vaš dom.", "inovativne rešitve"],
    ["Vrhunski kruh iz Kamnika.", "vrhunski"],
    ["Storitve po meri vaših potreb.", "po meri vaših potreb"],
    ["Z vami smo na vsakem koraku.", "z vami na vsakem koraku"],
    ["V današnjem hitrem tempu potrebujete počitek.", "v današnjem hitrem tempu"],
    ["Kjer se sanje uresničijo.", "sanje se uresničijo"],
    ["Uresničite svoje sanje o domu.", "sanje se uresničijo"],
    ["Izkusite pravo domačo kuhinjo.", "izkusite"],
  ];
  for (const [text, label] of banned) {
    it(`flags "${text}"`, () => expect(rules(text)).toContain(`filler: ${label}`));
  }

  it("keeps the older labels and reports vrhunska kakovost once", () => {
    expect(rules("Vrhunska kakovost kruha")).toEqual(["filler: vrhunska kakovost"]);
    expect(BANNED_PHRASES.map((b) => b.label)).toEqual(expect.arrayContaining(["vrhunska kakovost", "celovite rešitve", "strast do …", "brezhibno", "izkusite"]));
  });

  it("leaves ordinary words alone", () => {
    for (const ok of [
      "Preizkusite brezplačno.",
      "Z dvajsetimi leti izkušenj pri delu z lesom.",
      "Obleke šivamo po meri.",
      "Odklenemo vrata brez poškodb.",
      "Celovita prenova kopalnice v treh dneh.",
      "Kamnik leži na višini 380 metrov.",
      "Na prvem koraku izmerimo prostor.",
      "Sanjsko jezero je deset minut stran.",
    ]) {
      expect(rules(ok), ok).toEqual([]);
    }
  });

  it("names the new filler in Slovene in the editor", () => {
    const spec = golden();
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "Vrhunski kruh iz krušne peči";
    const v = validateSite(spec);
    const issue = v.ok ? undefined : v.issues.find((i) => i.path === "/pages/0/sections/0/props/headline");
    expect(issue && issueMessage(issue)).toBe("vsebuje prazno frazo »vrhunski«; napišite konkretno, kaj ponujate");
  });
});

describe("em dash (U+2014)", () => {
  it("is banned in copy", () => {
    expect(rules("Kruh — vsak dan")).toEqual(["em dash"]);
    expect(rules("Kruh – vsak dan")).toEqual([]);
    expect(issueMessage({ path: "/x", code: "banned", message: 'em dash: "Kruh — vsak dan"' })).toBe(
      "vsebuje dolgi pomišljaj (—); uporabite pomišljaj s presledki ( – ) ali vejico",
    );
  });

  it("is replaced mechanically with what Slovene uses", () => {
    expect(replaceEmDashes("Kruh — vsak dan")).toBe("Kruh – vsak dan");
    expect(replaceEmDashes("Kruh—vsak dan")).toBe("Kruh – vsak dan");
    expect(replaceEmDashes("Odprto 8.00—16.00")).toBe("Odprto 8.00–16.00");
    expect(replaceEmDashes("Pon—pet 7.00 — 19.00")).toBe("Pon – pet 7.00–19.00");
    expect(replaceEmDashes("— Kruh z drožmi —")).toBe("Kruh z drožmi");
    expect(replaceEmDashes("Brez pomišljaja – in tako ostane")).toBe("Brez pomišljaja – in tako ostane");
  });

  it("is repaired in every string of the pages and translations, never in business facts", () => {
    const spec = golden();
    const hero = spec.pages[0]!.sections[0]!.props as { headline: string; intro: string };
    hero.headline = "Kruh z drožmi — vsak dan";
    spec.pages[0]!.seo.title = "Pekarna Kvas — Kamnik";
    spec.business.name = "Pekarna — Kvas";
    spec.locales.enabled = ["sl", "en"];
    spec.translations = { en: { "/pages/0/sections/0/props/headline": "Bread — every day" } };
    const repairs = repairSiteCopy(spec);
    expect(repairs).toEqual([
      "/pages/0/seo/title: em dash replaced",
      "/pages/0/sections/0/props/headline: em dash replaced",
      "/translations/en/~1pages~10~1sections~10~1props~1headline: em dash replaced",
    ]);
    expect(hero.headline).toBe("Kruh z drožmi – vsak dan");
    expect(spec.pages[0]!.seo.title).toBe("Pekarna Kvas – Kamnik");
    expect(spec.translations.en!["/pages/0/sections/0/props/headline"]).toBe("Bread – every day");
    expect(spec.business.name).toBe("Pekarna — Kvas");
    expect(repairSiteCopy(spec), "idempotent").toEqual([]);
  });
});

describe("eyebrow case", () => {
  it("flags an eyebrow typed in capitals, not acronyms or other fields", () => {
    expect(isAllCapsLabel("PEKARNA V KAMNIKU")).toBe(true);
    expect(isAllCapsLabel("BIO")).toBe(false);
    expect(isAllCapsLabel("Pekarna v Kamniku")).toBe(false);
    expect(isAllCapsLabel("DDV 22 %")).toBe(false);
    expect(rules("ŠUTNA 30, KAMNIK", "eyebrow")).toEqual(["all-caps eyebrow"]);
    expect(rules("Šutna 30, Kamnik", "eyebrow")).toEqual([]);
    expect(rules("KRUH IZ KRUŠNE PEČI", "headline")).toEqual([]);
    expect(issueMessage({ path: "/x", code: "banned", message: 'all-caps eyebrow: "ŠUTNA 30"' })).toBe(
      "nadnaslov naj ne bo napisan z velikimi črkami; pišite ga kot navaden stavek",
    );
  });
});

describe("off-black and off-white colours", () => {
  const design = (d = DIRECTIONS[0]!, colors: Partial<Design["colors"]> = {}): Design => ({
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: { ...d.palette.fallback, ...colors },
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[0],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  });

  it("flags pure black text and surfaces and pure white text, but not a white page or white button text", () => {
    const issues = checkDesign(design(undefined, { text: "#000000", inverse: "#000000", onInverse: "#ffffff" }), DIRECTIONS[0]);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["/design/colors/text", "/design/colors/inverse", "/design/colors/onInverse"]));
    expect(issueMessage({ path: "/design/colors/text", code: "design", message: issues.find((i) => i.path === "/design/colors/text")!.message })).toBe(
      "barva ne sme biti čisto črna ali čisto bela; izberite malo mehkejši odtenek",
    );
    const white = checkDesign(design(undefined, { onPrimary: "#ffffff" }), DIRECTIONS[0]);
    expect(white).toEqual([]);
  });

  it("every direction's fallback palette is inside the bounds", () => {
    for (const d of DIRECTIONS) {
      for (const k of ["text", "muted", "onInverse"] as const) {
        expect(luminance(d.palette.fallback[k]), `${d.id} ${k}`).toBeGreaterThanOrEqual(OFF_BLACK_MIN);
        expect(luminance(d.palette.fallback[k]), `${d.id} ${k}`).toBeLessThanOrEqual(OFF_WHITE_MAX);
      }
      for (const k of ["background", "surface", "inverse"] as const) expect(luminance(d.palette.fallback[k]), `${d.id} ${k}`).toBeGreaterThanOrEqual(OFF_BLACK_MIN);
    }
  });

  it("enforceDesign moves pure black and white inside the bounds and keeps contrast, in every direction", () => {
    for (const d of DIRECTIONS) {
      const dark = d.palette.background === "dark";
      const input = design(d, dark ? { text: "#ffffff", onInverse: "#ffffff", inverse: "#000000", background: "#000000", surface: "#000000" } : { text: "#000000", muted: "#000000", inverse: "#000000", onInverse: "#ffffff" });
      const out = enforceDesign(input, d);
      expect(checkDesign(out, d), d.id).toEqual([]);
      expect(enforceDesign(out, d), "idempotent").toEqual(out);
    }
  });

  it("darkens a mid-tone inverse that no off-white or off-black text can pass on", () => {
    const d = DIRECTIONS[0]!;
    // #757575: off-white #f5f5f5 gets 4.2:1 on it, off-black #0d0d0d 4.3:1; only pure white or black passed.
    // (A dark accent, so the accent's own 3:1 on the white page and on the inverse can both hold.)
    const out = enforceDesign(design(d, { inverse: "#757575", onInverse: "#ffffff", accent: "#1a1a1a" }), d);
    expect(checkDesign(out, d)).toEqual([]);
    expect(luminance(out.colors.inverse)).toBeLessThan(luminance("#757575"));
  });

  it("clampLuminance keeps the hue and only moves lightness", () => {
    expect(clampLuminance("#000000", OFF_BLACK_MIN)).toBe("#0d0d0d");
    expect(clampLuminance("#ffffff", 0, OFF_WHITE_MAX)).toBe("#f5f5f5");
    expect(clampLuminance("#123456", OFF_BLACK_MIN, OFF_WHITE_MAX)).toBe("#123456");
  });
});

describe(`migration 3 → 4 (give-away rules), current version ${SPEC_VERSION}`, () => {
  it("repairs em dashes and pure white text in a stored v3 site and leaves everything else", () => {
    const v4 = golden();
    const v3 = structuredClone(v4) as unknown as Record<string, unknown> & SiteSpec;
    v3.specVersion = 3 as never;
    v3.design.colors.onInverse = "#ffffff";
    v3.design.colors.text = "#000000";
    (v3.pages[0]!.sections[0]!.props as { intro: string }).intro = "Kruh z drožmi — vsak dan od 7.00—12.00.";
    const out = migrateSpec(v3, MIGRATIONS, 4);
    expect(out.specVersion).toBe(4);
    expect((out.pages[0]!.sections[0]!.props as { intro: string }).intro).toBe("Kruh z drožmi – vsak dan od 7.00–12.00.");
    expect(out.design.colors.onInverse).toBe("#f5f5f5");
    expect(luminance(out.design.colors.text)).toBeGreaterThanOrEqual(OFF_BLACK_MIN);
    expect(validateSite(out).ok).toBe(true);
    // The input is not changed.
    expect(v3.design.colors.onInverse).toBe("#ffffff");
    // Nothing else moves.
    expect({ ...out, design: v4.design, pages: v4.pages }).toEqual({ ...v4, specVersion: 4 });
  });

  it("leaves a stored site that already follows the rules unchanged apart from the version", () => {
    const v4 = golden();
    expect(migrateSpec({ ...v4, specVersion: 3 }, MIGRATIONS, 4)).toEqual(v4);
  });
});
