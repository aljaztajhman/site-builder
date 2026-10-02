import { describe, expect, it } from "vitest";
import { minifyCss, sharedBundle } from "../src/index.ts";

describe("minifyCss", () => {
  it("keeps descendant pseudo-class selectors intact", () => {
    expect(minifyCss(".tone-inverse :focus-visible { outline: 3px solid red; }")).toBe(".tone-inverse :focus-visible{outline:3px solid red}");
    expect(minifyCss("a:hover , b > c { color : blue ; }")).toBe("a:hover,b>c{color:blue}");
  });
});

describe("shared stylesheet", () => {
  const css = new TextDecoder().decode(sharedBundle().files.get("site.css"));

  it("contains no banned visual patterns", () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/monospace/);
    expect(css).not.toMatch(/font-style:italic/);
    // Pill buttons: no fully rounded radius on buttons.
    expect(css).not.toMatch(/\.btn[^{]*\{[^}]*border-radius:(9{3,}px|50%)/);
  });

  /** Every rule as [selector, declarations]; rules inside @media come out with their own selector. */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    decls: m[2]!.split(";").filter(Boolean).map((d) => {
      const i = d.indexOf(":");
      return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
    }),
  }));

  it("parses the stylesheet into rules", () => {
    expect(rules.length).toBeGreaterThan(200);
    expect(rules.find((r) => r.selector === ".eyebrow")).toBeDefined();
  });

  it("never draws an accent-coloured border on one side of a box (give-away)", () => {
    const accent = /var\(--c-(primary|accent)\)/;
    const side = /^border-(top|right|bottom|left|inline|block)/;
    for (const r of rules) {
      const oneSide = r.decls.some((d) => side.test(d.prop));
      for (const d of r.decls) {
        if (side.test(d.prop) && accent.test(d.value)) expect.fail(`${r.selector}: ${d.prop}: ${d.value}`);
        if (oneSide && /^border(-color)?$/.test(d.prop) && accent.test(d.value)) expect.fail(`${r.selector}: ${d.prop}: ${d.value} with a single-side border`);
      }
    }
  });

  it("keeps eyebrows in sentence case with letter-spacing at most 0.04em (give-away)", () => {
    const eyebrow = rules.filter((r) => /\.eyebrow\b/.test(r.selector));
    expect(eyebrow.length).toBeGreaterThan(0);
    for (const r of eyebrow) {
      for (const d of r.decls) {
        if (d.prop === "text-transform") expect(d.value, r.selector).toBe("none");
        if (d.prop === "letter-spacing") {
          const m = /^(-?[\d.]+)em$/.exec(d.value);
          expect(m, `${r.selector}: letter-spacing ${d.value} must be in em`).not.toBeNull();
          expect(Number(m![1]), r.selector).toBeLessThanOrEqual(0.04);
        }
      }
    }
    // The base rule pins both, so no container's case or tracking reaches an eyebrow.
    const base = rules.find((r) => r.selector === ".eyebrow")!;
    expect(base.decls).toEqual(expect.arrayContaining([{ prop: "text-transform", value: "none" }]));
  });

  it("keeps the inverse focus ring selector", () => {
    expect(css).toContain(".tone-inverse :focus-visible");
  });

  it("ships every font face and island", () => {
    const files = [...sharedBundle().files.keys()];
    expect(files.filter((f) => f.startsWith("fonts/"))).toHaveLength(19);
    expect(files).toEqual(expect.arrayContaining(["js/nav.js", "js/consent.js", "js/gallery.js", "site.css"]));
  });
});
