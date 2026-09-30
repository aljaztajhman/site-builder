import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@sb/spec";
import { homepageShape, skeletonSimilarity } from "../src/homepage-metrics.ts";

const spec = (sections: [string, string][]) =>
  ({ pages: [{ id: "p_home", kind: "home", sections: sections.map(([type, variant], i) => ({ id: `s_${i}`, type, variant, props: {} })) }] }) as unknown as SiteSpec;

describe("homepage metrics", () => {
  it("counts every block that shows the contact facts", () => {
    const s = homepageShape(spec([["hero-type", "with-facts"], ["contact-strip", "bar"], ["services-list", "rows"], ["opening-hours", "table"], ["booking", "simple"]]));
    expect(s.contactBlocks).toBe(3);
    expect(s.sections[0]).toBe("hero-type:with-facts");
  });

  it("scores identical skeletons 1, disjoint 0, and ignores variants", () => {
    const a = homepageShape(spec([["hero-split", "image-left"], ["contact-strip", "bar"], ["cta", "band"]]));
    const b = homepageShape(spec([["hero-split", "image-right"], ["contact-strip", "cards"], ["cta", "split"]]));
    const c = homepageShape(spec([["hero-type", "large"], ["menu", "classic"]]));
    expect(skeletonSimilarity([a, b])).toBe(1);
    expect(skeletonSimilarity([a, c])).toBe(0);
    expect(skeletonSimilarity([a, b, c])).toBeCloseTo(1 / 3);
  });
});
