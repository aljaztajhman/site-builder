import { describe, expect, it } from "vitest";
import { FONT_PAIRS, WORDMARK_STYLES, generateWordmark, wordmarkFits, wordmarkInitials, wordmarkLayout, type WordmarkStyle } from "../src/index.ts";

/** Names as the inventory's wordmark sheet uses them (packages/inventory/scripts/pages-v2.ts WORDMARK_NAMES), and the awkward ones. */
const NAMES = [
  "Pekarna Kvas",
  "Gostilna Zlata žlica",
  "Čevljarstvo Žnidaršič",
  "Šivalnica Zdenka Černe",
  "Kavarna Ob Savinji",
  "Mizarstvo Šuštar in sinovi",
  "Računovodski servis Nina Kovač s.p.",
  "Zobna ordinacija Ažman Šuštar Žigon",
  "Lana",
  "Đuro Ćosić",
  "Zobna ordinacija Ažman Šuštar Žigon Čehovi",
];
const design = (fontPair: string, headingWeight = 600, headingCase: "normal" | "uppercase" = "normal") => ({ fontPair, headingWeight, headingCase });
const designs = FONT_PAIRS.map((p) => design(p.id, p.id.length % 2 === 0 ? 800 : 500, p.id.length % 3 === 0 ? "uppercase" : "normal"));

describe("generateWordmark", () => {
  it("is deterministic: the same name, seed and design give the same result", () => {
    for (const name of NAMES) for (const d of designs) expect(generateWordmark(name, "abcdef12", d)).toEqual(generateWordmark(name, "abcdef12", d));
  });

  it("different seeds give different styles (a name with several fitting styles uses more than one across seeds)", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `seed${i.toString(36).padStart(4, "0")}`);
    for (const name of ["Pekarna Kvas", "Gostilna Zlata žlica", "Šivalnica Zdenka Černe"]) {
      const styles = new Set(seeds.map((s) => generateWordmark(name, s, design("fraunces-source-sans")).style));
      expect(styles.size, name).toBeGreaterThan(2);
    }
  });

  it("different names differ for one seed", () => {
    const styles = new Set(NAMES.map((n) => generateWordmark(n, "abcdef12", design("inter-tight-inter")).style));
    expect(styles.size).toBeGreaterThan(1);
  });

  it("picks only a style that fits the name, and every style it can pick is in WORDMARK_STYLES", () => {
    for (const name of NAMES)
      for (let i = 0; i < 30; i++) {
        const g = generateWordmark(name, `s${i}`, designs[i % designs.length]!);
        expect(WORDMARK_STYLES).toContain(g.style);
        expect(wordmarkFits(name, g.style), `${name} ${g.style}`).toBe(true);
        expect(wordmarkLayout(name, g.style).style).toBe(g.style);
      }
  });

  it("every style is reachable for a name it fits, so none is dead", () => {
    const seen = new Set<WordmarkStyle>();
    for (const name of NAMES)
      for (const d of designs)
        for (let i = 0; i < 12; i++) seen.add(generateWordmark(name, `k${i}`, d).style);
    expect([...WORDMARK_STYLES].filter((s) => !seen.has(s))).toEqual([]);
  });

  it("a serif over a sans sets signage styles in the text face; nothing else asks for it", () => {
    const roles = new Set<string>();
    for (const name of NAMES)
      for (const d of designs)
        for (let i = 0; i < 6; i++) {
          const g = generateWordmark(name, `r${i}`, d);
          if (g.role) {
            expect(["stamp", "stacked-caps"]).toContain(g.style);
            roles.add(g.role);
          }
        }
    expect([...roles]).toEqual(["text"]);
  });
});

describe("no invented text", () => {
  const letters = (s: string) => new Set([...s.toLocaleLowerCase("sl")].filter((c) => /\p{L}/u.test(c)));

  it("the options hold only letters of the name: lines are its words, the monogram its initials", () => {
    for (const name of NAMES)
      for (const style of WORDMARK_STYLES) {
        const { options } = wordmarkLayout(name, style);
        const allowed = letters(name);
        for (const c of letters(options.lines.join(" ") + options.monogram)) expect(allowed.has(c), `${name} ${style} ${c}`).toBe(true);
        expect(options.lines.join(" ")).toBe(options.lines.length === 1 ? name : name.replace(/\s+/g, " "));
        expect(options.monogram.length).toBeLessThanOrEqual(2);
        expect(options.monogram).toBe(options.monogram.toLocaleUpperCase("sl"));
      }
  });

  it("initials: the first and last capitalised word; one letter for a single word; Slovene letters stay whole", () => {
    expect(wordmarkInitials("Pekarna Kvas")).toBe("PK");
    expect(wordmarkInitials("Računovodski servis Nina Kovač s.p.")).toBe("RK");
    expect(wordmarkInitials("Šivalnica Zdenka Černe")).toBe("ŠČ");
    expect(wordmarkInitials("Lana")).toBe("L");
    expect(wordmarkInitials("Đuro Ćosić")).toBe("ĐĆ");
  });
});

describe("fit and fallback", () => {
  it("plain always fits; styles that cannot carry a name draw as plain, and a circle in the chrome as a monogram", () => {
    for (const name of NAMES) expect(wordmarkFits(name, "plain")).toBe(true);
    const long = "Zobna ordinacija Ažman Šuštar Žigon Čehovi";
    for (const s of ["stamp", "plate", "stacked-caps"] as const) expect(wordmarkLayout(long, s).style, s).toBe("plain");
    expect(wordmarkLayout(long, "circle").style).toBe("monogram");
    expect(wordmarkLayout("Lana", "lockup").style).toBe("plain");
    expect(wordmarkLayout("Pekarna Kvas", "circle").style).toBe("circle");
    expect(wordmarkLayout("Pekarna Kvas", "circle", "header").style).toBe("monogram");
    expect(wordmarkLayout("Lana", "circle", "header").style).toBe("plain");
  });

  it("the limits are what the 360 px header tests rely on", () => {
    expect(wordmarkFits("Pekarna Kvas", "stamp")).toBe(true);
    expect(wordmarkFits("Gostilna Zlata žlica", "stamp", "header")).toBe(true);
    expect(wordmarkFits("Računovodski servis Nina Kovač s.p.", "stamp")).toBe(false);
    expect(wordmarkFits("Računovodski servis Nina Kovač s.p.", "monogram")).toBe(true);
    expect(wordmarkFits("Računovodski servis Nina Kovač s.p.", "lockup")).toBe(true);
  });
});
