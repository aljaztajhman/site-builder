import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DIRECTIONS, direction, migrateSpec, type Design, type SiteSpec } from "@sb/spec";
import { renderPage, tokensCss } from "../src/index.ts";

function designFor(id: string): Design {
  const d = direction(id);
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: { ...d.palette.fallback },
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[1],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

describe("template tokens", () => {
  it("gives a template direction its band, display sizes and motif pieces in the site's own colours", () => {
    const css = tokensCss(designFor("tablica"));
    expect(css).toContain("--c-band:#ffcc00");
    expect(css).toContain("--c-on-band:#15181c");
    expect(css).toMatch(/--fs-display:clamp\(/);
    expect(css).toContain("--plate-eu:#0b3fa8");
    // The tread is drawn in the band colour and the inverse colour, URL-encoded.
    const tread = /--motif-divider:url\("data:image\/svg\+xml,([^"]+)"\)/.exec(css)![1]!;
    expect(decodeURIComponent(tread)).toContain('fill="#ffcc00"');
    expect(decodeURIComponent(tread)).toContain('fill="#15181c"');
    const pipes = tokensCss(designFor("cevi"));
    expect(decodeURIComponent(pipes)).toContain('stroke="#d63c22"');
    expect(tokensCss(designFor("skorja"))).toContain("--motif-mark:");
  });

  it("leaves the other directions' tokens as they were", () => {
    for (const d of DIRECTIONS.filter((x) => !x.template)) {
      const css = tokensCss(designFor(d.id));
      expect(css, d.id).not.toMatch(/--c-band|--motif|--fs-display|--plate/);
    }
  });

  it("marks the page with the motif, so one stylesheet draws it in preview and published output alike", () => {
    const golden = migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/avtoservis-mrak.json", import.meta.url), "utf8")) as unknown) as SiteSpec;
    const spec: SiteSpec = { ...golden, design: designFor("tablica") };
    expect(renderPage(spec, spec.pages[0]!)).toContain('data-motif="plate"');
    expect(renderPage(golden, golden.pages[0]!)).not.toContain("data-motif");
  });
});
