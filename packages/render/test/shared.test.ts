import { describe, expect, it } from "vitest";
import { minifyCss, motifsIn, sharedBundle, sharedStylesheet, stylesheetFor, subMotifsIn } from "../src/index.ts";

describe("minifyCss", () => {
  it("keeps descendant pseudo-class selectors intact", () => {
    expect(minifyCss(".tone-inverse :focus-visible { outline: 3px solid red; }")).toBe(".tone-inverse :focus-visible{outline:3px solid red}");
    expect(minifyCss("a:hover , b > c { color : blue ; }")).toBe("a:hover,b>c{color:blue}");
  });
});

describe("shared stylesheet", () => {
  // Every stylesheet a site can get (site.css and one per trade motif), so the checks cover motif rules too.
  const css = [...sharedBundle().files].filter(([f]) => f.endsWith(".css")).map(([, d]) => new TextDecoder().decode(d)).join("\n");

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

describe("one stylesheet per trade motif", () => {
  const full = minifyCss(sharedStylesheet());
  const motifs = motifsIn(full);
  const files = sharedBundle().files;
  const text = (f: string) => new TextDecoder().decode(files.get(f));

  it("ships site.css and a sheet per motif, each without the other trades' rules", () => {
    expect(motifs).toEqual(["bend", "crust", "label", "ledger", "mirror", "pipes", "plate", "smile", "spoon", "trail"]);
    expect(text("site.css")).not.toMatch(/\[data-motif="/);
    for (const m of motifs) {
      const sheet = text(`site-${m}.css`);
      expect(sheet, m).toContain(`[data-motif="${m}"]`);
      // Nothing in it only for other trades: every selector naming motifs names this one (some name a group).
      expect(stylesheetFor(sheet, m)).toBe(sheet);
      for (const sel of sheet.match(/[^{}]*\[data-motif="[a-z-]+"\][^{}]*\{/g) ?? []) {
        for (const one of sel.split(/,(?![^(]*\))/)) if (one.includes("[data-motif=")) expect(one, `${m}: ${one}`).toContain(`[data-motif="${m}"]`);
      }
      // Smaller than the whole sheet, and everything for sites without a motif is in it, in order.
      expect(sheet.length).toBeLessThan(full.length);
      expect(stylesheetFor(sheet, null)).toBe(text("site.css"));
    }
  });

  it("ships a sheet per sub-trade motif on its template's layout; the template's own sheet has none of their rules", () => {
    expect(subMotifsIn(full)).toEqual([
      { motif: "pipes", sub: "joint" },
      { motif: "label", sub: "stem" },
      { motif: "pipes", sub: "strip" },
      { motif: "label", sub: "tag" },
      { motif: "pipes", sub: "tiles" },
      { motif: "pipes", sub: "wire" },
    ]);
    for (const m of motifs) expect(text(`site-${m}.css`), m).not.toContain("data-submotif");
    expect(text("site.css")).not.toContain("data-submotif");
    for (const { motif, sub } of subMotifsIn(full)) {
      const sheet = text(`site-${motif}-${sub}.css`);
      // The template's whole sheet, plus this sub-trade's rules and no other's.
      expect(stylesheetFor(sheet, motif)).toBe(text(`site-${motif}.css`));
      expect(sheet).toContain(`[data-submotif="${sub}"]`);
      for (const other of subMotifsIn(full).filter((o) => o.sub !== sub)) expect(sheet, sub).not.toContain(`[data-submotif="${other.sub}"]`);
    }
    // A sub-trade rule under another sub-trade, or without one, is dropped.
    const css = '.a{color:red}[data-submotif="x"] .b{color:blue}[data-submotif="y"] .c{margin:0}';
    expect(stylesheetFor(css, "m", "x")).toBe('.a{color:red}[data-submotif="x"] .b{color:blue}');
    expect(stylesheetFor(css, "m")).toBe(".a{color:red}");
  });

  it("keeps order and splits mixed selector lists, @media blocks and quoted braces correctly", () => {
    const css =
      '.a{color:red}[data-motif="x"] .b,[data-motif="y"] .b,.c{color:blue}@media (min-width:1px){[data-motif="y"] .d{margin:0}}' +
      '[data-motif] .e{padding:0}[data-motif="x"] .f::before{content:"{}"}.g{color:green}';
    expect(stylesheetFor(css, "x")).toBe('.a{color:red}[data-motif="x"] .b,.c{color:blue}[data-motif] .e{padding:0}[data-motif="x"] .f::before{content:"{}"}.g{color:green}');
    expect(stylesheetFor(css, "y")).toBe('.a{color:red}[data-motif="y"] .b,.c{color:blue}@media (min-width:1px){[data-motif="y"] .d{margin:0}}[data-motif] .e{padding:0}.g{color:green}');
    expect(stylesheetFor(css, null)).toBe(".a{color:red}.c{color:blue}[data-motif] .e{padding:0}.g{color:green}");
  });
});
