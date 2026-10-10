import { describe, expect, it } from "vitest";
import { contrast, ensureContrast, hexToHsl, hexToRgb, hslToHex, isCreamOrOffWhite, isWarmCream, luminance, mix, rgbToHex } from "../src/index.ts";

describe("contrast", () => {
  it("matches known WCAG values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#123456", "#123456")).toBe(1);
  });

  it("computes relative luminance", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 6);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#808080")).toBeCloseTo(0.2159, 3);
  });
});

describe("hex/hsl conversion", () => {
  it("round-trips", () => {
    for (const hex of ["#1d4ed8", "#b4441f", "#f2c200", "#14110f", "#eef5ef", "#ffffff", "#000000"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      const back = hexToRgb(hslToHex(hexToHsl(hex)));
      hexToRgb(hex).forEach((v, i) => expect(Math.abs(v - back[i]!)).toBeLessThanOrEqual(1));
    }
  });

  it("rejects malformed colours", () => {
    expect(() => hexToRgb("#fff")).toThrow();
  });
});

describe("ensureContrast", () => {
  const cases: [string, string, number][] = [
    ["#999999", "#ffffff", 4.5],
    ["#ffd400", "#ffffff", 3],
    ["#444444", "#111111", 4.5],
    ["#1d4ed8", "#111418", 3],
    ["#c9a46a", "#f2ece5", 4.5],
    ["#eeeeee", "#f1f6fb", 7],
  ];
  for (const [fg, bg, min] of cases) {
    it(`${fg} on ${bg} reaches ${min}:1`, () => {
      const out = ensureContrast(fg, bg, min);
      expect(contrast(out, bg)).toBeGreaterThanOrEqual(min);
    });
  }

  it("returns the colour unchanged when it already passes", () => {
    expect(ensureContrast("#111418", "#ffffff", 4.5)).toBe("#111418");
  });

  it("keeps the hue when it can", () => {
    const out = ensureContrast("#6fa8ff", "#ffffff", 4.5);
    expect(Math.abs(hexToHsl(out).h - hexToHsl("#6fa8ff").h)).toBeLessThan(3);
  });
});

describe("banned backgrounds", () => {
  it("detects cream and off-white", () => {
    for (const c of ["#fdf8f0", "#faf7f2", "#f5f5f0", "#fafafa"]) expect(isCreamOrOffWhite(c), c).toBe(true);
  });

  it("allows pure white, cool tints and dark pages", () => {
    for (const c of ["#ffffff", "#eef4fb", "#121212", "#eef5ef", "#f1f6fb"]) expect(isCreamOrOffWhite(c), c).toBe(false);
  });

  it("flags warm cream surfaces but not cool greys", () => {
    expect(isWarmCream("#f7efe0")).toBe(true);
    expect(isWarmCream("#fdf8f0")).toBe(true);
    expect(isWarmCream("#f1f4f8")).toBe(false);
    expect(isWarmCream("#f2f3f5")).toBe(false);
  });
});

describe("mix", () => {
  it("blends a over b per sRGB channel: alpha·a + (1 − alpha)·b", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 0.25)).toBe("#4000bf");
    expect(mix("#123456", "#abcdef", 1)).toBe("#123456");
    expect(mix("#123456", "#abcdef", 0)).toBe("#abcdef");
  });

  it("reproduces the scrim contrasts the composition guards use", () => {
    const worst = (alpha: number) => Math.min(contrast("#f5f5f5", mix("#15181c", "#000000", alpha)), contrast("#f5f5f5", mix("#15181c", "#ffffff", alpha)));
    expect(worst(0.35)).toBeCloseTo(2.04, 1);
    expect(worst(0.8)).toBeCloseTo(8.68, 1);
  });
});
