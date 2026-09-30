import { describe, expect, it } from "vitest";
import { DIRECTIONS, Design, checkDesign, contrast, enforceDesign, isCreamOrOffWhite, type Colors, type Direction } from "../src/index.ts";

function baseDesign(d: Direction, colors: Colors = d.palette.fallback): Design {
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors,
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[0],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

/** Everything wrong at once: cream page and surface, washed-out foregrounds, every number at the schema maximum. */
const BAD_HIGH = (d: Direction): Design => ({
  ...baseDesign(d, {
    background: "#fdf8f0",
    surface: "#f7efe0",
    text: "#c8c8c8",
    muted: "#e0e0e0",
    primary: "#fff3a0",
    onPrimary: "#fafafa",
    accent: "#fff8d0",
    border: "#eeeeee",
    inverse: "#1a1a1a",
    onInverse: "#333333",
  }),
  fontPair: "not-a-pair",
  radius: 12,
  baseFontSize: 19,
  scale: 1.414,
  headingWeight: 850,
  headingTracking: 0.08,
  headingCase: "uppercase",
  density: "compact",
  shadow: "subtle",
  imagery: d.imagery === "natural" ? "duotone" : "natural",
});

/** Every number at the schema minimum, dark foregrounds that vanish on dark pages. */
const BAD_LOW = (d: Direction): Design => ({
  ...baseDesign(d, {
    ...d.palette.fallback,
    text: "#2a2a2a",
    muted: "#3a3a3a",
    primary: "#202020",
    onPrimary: "#262626",
    accent: "#1c1c1c",
    onInverse: d.palette.fallback.inverse,
  }),
  radius: 0,
  baseFontSize: 16,
  scale: 1.125,
  headingWeight: 400,
  headingTracking: -0.04,
  headingCase: "normal",
  density: "airy",
  shadow: "none",
});

/** What the engine builds from a model choice: brand colour straight from a logo, accent = primary. */
const BRAND_YELLOW = (d: Direction): Design => {
  const c = { ...d.palette.fallback, primary: "#ffd400", accent: "#ffd400", onPrimary: "#111111" };
  return baseDesign(d, c);
};

describe("enforceDesign", () => {
  for (const d of DIRECTIONS) {
    describe(d.id, () => {
      for (const [name, make] of [
        ["bad high", BAD_HIGH],
        ["bad low", BAD_LOW],
        ["brand yellow", BRAND_YELLOW],
      ] as const) {
        it(`fixes ${name} input to zero issues`, () => {
          const input = make(d);
          const out = enforceDesign(input, d);
          expect(checkDesign(out, d)).toEqual([]);
          expect(() => Design.parse(out)).not.toThrow();
          expect(enforceDesign(out, d), "idempotent").toEqual(out);
        });
      }

      it("clamps every numeric token into the direction's range", () => {
        const hi = enforceDesign(BAD_HIGH(d), d);
        const lo = enforceDesign(BAD_LOW(d), d);
        expect(hi.radius).toBe(d.ranges.radius[1]);
        expect(lo.radius).toBe(d.ranges.radius[0]);
        expect(hi.baseFontSize).toBe(d.ranges.baseFontSize[1]);
        expect(lo.baseFontSize).toBe(d.ranges.baseFontSize[0]);
        expect(hi.scale).toBe(d.ranges.scale[1]);
        expect(lo.scale).toBe(d.ranges.scale[0]);
        expect(hi.headingWeight).toBeLessThanOrEqual(d.ranges.headingWeight[1]);
        expect(lo.headingWeight).toBeGreaterThanOrEqual(d.ranges.headingWeight[0]);
        expect(hi.headingTracking).toBe(d.ranges.headingTracking[1]);
        expect(lo.headingTracking).toBe(d.ranges.headingTracking[0]);
        expect(d.ranges.headingCase).toContain(hi.headingCase);
        expect(d.ranges.density).toContain(hi.density);
        expect(d.ranges.density).toContain(lo.density);
        expect(d.ranges.shadow).toContain(hi.shadow);
        expect(hi.imagery).toBe(d.imagery);
        expect(d.fontPairs).toContain(hi.fontPair);
      });

      it("replaces a cream page and surface", () => {
        const out = enforceDesign(BAD_HIGH(d), d);
        expect(isCreamOrOffWhite(out.colors.background)).toBe(false);
        expect(out.colors.surface).not.toBe("#f7efe0");
        if (d.palette.background !== "tint") expect(out.colors.background).toBe(d.palette.background === "white" ? "#ffffff" : d.palette.fallback.background);
      });

      it("keeps the fallback palette unchanged", () => {
        const input = baseDesign(d);
        expect(enforceDesign(input, d).colors).toEqual(d.palette.fallback);
      });
    });
  }
});

describe("checkDesign", () => {
  const d = DIRECTIONS[0]!;

  it("flags a cream page background", () => {
    const issues = checkDesign(baseDesign(d, { ...d.palette.fallback, background: "#fdf8f0" }), d);
    expect(issues.map((i) => i.path)).toContain("/design/colors/background");
    expect(issues.some((i) => /cream/.test(i.message))).toBe(true);
  });

  it("flags a warm cream section surface", () => {
    const issues = checkDesign(baseDesign(d, { ...d.palette.fallback, surface: "#f7efe0" }), d);
    expect(issues.some((i) => i.path === "/design/colors/surface" && /cream/.test(i.message))).toBe(true);
  });

  it("flags low contrast for text, muted, primary, onPrimary and accent", () => {
    const c: Colors = { ...d.palette.fallback, text: "#999999", muted: "#aaaaaa", primary: "#cccccc", onPrimary: "#dddddd", accent: "#eeeeee" };
    expect(contrast(c.text, c.background)).toBeLessThan(4.5);
    const paths = checkDesign(baseDesign(d, c), d).map((i) => i.path);
    for (const k of ["text", "muted", "primary", "onPrimary", "accent"]) expect(paths).toContain(`/design/colors/${k}`);
  });

  it("flags values outside the direction and an unknown direction", () => {
    const issues = checkDesign({ ...baseDesign(d), radius: 12, headingCase: "uppercase" }, d);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["/design/radius", "/design/headingCase"]));
    expect(checkDesign(baseDesign(d), undefined).map((i) => i.path)).toContain("/design/direction");
  });

  it("flags a light page for a dark direction and a tinted page for a white direction", () => {
    const dark = DIRECTIONS.find((x) => x.palette.background === "dark")!;
    expect(checkDesign(baseDesign(dark, { ...dark.palette.fallback, background: "#ffffff" }), dark).map((i) => i.message)).toContain(
      "direction requires a dark page",
    );
    const white = DIRECTIONS.find((x) => x.palette.background === "white")!;
    expect(checkDesign(baseDesign(white, { ...white.palette.fallback, background: "#eef4fb" }), white).map((i) => i.message)).toContain(
      "direction requires a white page",
    );
  });
});

describe("section surface stays on the page's side of light/dark", () => {
  it("repairs a mid-grey surface on a white page instead of failing text contrast (live eval, 'Barve naj bodo temnejše, bolj resne')", () => {
    const dir = DIRECTIONS.find((d) => d.id === "bold-local")!;
    const darkened = baseDesign(dir, { ...dir.palette.fallback, surface: "#5f5a55", primary: "#b8420a", inverse: "#1c1917" });
    expect(checkDesign(darkened, dir).length).toBeGreaterThan(0);
    const fixed = enforceDesign(darkened, dir);
    expect(fixed.colors.surface).toBe(dir.palette.fallback.surface);
    expect(checkDesign(fixed, dir)).toEqual([]);
  });

  it("keeps a light surface the model chose, and a dark surface on a dark page", () => {
    const light = DIRECTIONS.find((d) => d.id === "warm-craft")!;
    expect(enforceDesign(baseDesign(light, { ...light.palette.fallback, surface: "#eef0f2" }), light).colors.surface).toBe("#eef0f2");
    const dark = DIRECTIONS.find((d) => d.palette.background === "dark")!;
    expect(enforceDesign(baseDesign(dark, { ...dark.palette.fallback, surface: "#1f1a17" }), dark).colors.surface).toBe("#1f1a17");
    expect(enforceDesign(baseDesign(dark, { ...dark.palette.fallback, surface: "#9a9a9a" }), dark).colors.surface).toBe(dark.palette.fallback.surface);
  });
});
