import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORDMARK_STYLES, migrateSpec, wordmarkLayout, type SiteSpec, type WordmarkStyle } from "@sb/spec";
import { COMPOSED_SHEETS, composedSheets, renderSite, vocabFamilySheets } from "../src/index.ts";

/**
 * The wordmark in the header and footer (I9a): a site without a logo and with design.wordmark shows it there through the
 * same component as the wordmark block; with a logo, or without design.wordmark, the header and footer are what they
 * were (the goldens in composed-goldens.test.ts hold the second byte for byte). The wordmark rules are linked by the
 * pages that show one, also a page with no composed section.
 */
const goldenDir = new URL("../../../tools/eval/golden/", import.meta.url);
const golden = (f: string) => migrateSpec(JSON.parse(readFileSync(new URL(f, goldenDir), "utf8"))) as SiteSpec;
const files = readdirSync(goldenDir).filter((f) => f.endsWith(".json")).sort();
const NOW = new Date("2026-10-10T12:00:00Z");
const home = (spec: SiteSpec) => renderSite(spec, { now: NOW }).pages.get("index.html")!;
const header = (html: string) => /<header[\s\S]*?<\/header>/.exec(html)![0];
const footerName = (html: string) => /<p class="site-footer__name">[\s\S]*?<\/p>/.exec(html)![0];

function without(f: string, style?: WordmarkStyle, logo = false): SiteSpec {
  const spec = golden(f);
  if (!logo) delete (spec.assets as { logo?: unknown }).logo;
  if (style) spec.design.wordmark = { style };
  return spec;
}

describe("header and footer wordmark", () => {
  it("none of the goldens has design.wordmark, so none of them changes", () => {
    for (const f of files) expect(golden(f).design.wordmark, f).toBeUndefined();
  });

  it("a site without a logo shows the styled wordmark in the header and the footer, through the Wordmark component", () => {
    let shown = 0;
    for (const f of files)
      for (const style of ["lockup", "stamp", "plate", "monogram"] as const) {
        const spec = without(f, style);
        const name = spec.business.name;
        const html = home(spec);
        const h = header(html);
        const drawn = wordmarkLayout(name, style, "header").style;
        if (drawn === "plain") {
          expect(h, `${f} ${style}: a name the style does not fit draws as the header's own plain name`).toContain("site-header__name");
          expect(footerName(html)).not.toContain("cx-wm");
          continue;
        }
        expect(h, `${f} ${style}`).toContain(`cx-wm wm-${drawn}`);
        expect(footerName(html), `${f} ${style}`).toContain(`cx-wm wm-${drawn}`);
        expect(h).not.toContain('class="site-header__name');
        shown++;
      }
    expect(shown).toBeGreaterThan(15);
  });

  it("plain, or a style the name does not fit, keeps the header's own markup; with a logo nothing changes", () => {
    const f = files[0]!;
    const plain = home(without(f, "plain"));
    expect(header(plain)).toBe(header(home(without(f))));
    const withLogo = (style?: WordmarkStyle) => {
      const spec = golden(f);
      if (style) spec.design.wordmark = { style };
      return home(spec);
    };
    if (golden(f).assets.logo) expect(header(withLogo("stamp"))).toBe(header(withLogo()));
  });

  it("a page with no composed section links the kinds sheet and the wordmarks sheet, and a page without a wordmark none", () => {
    const f = files[0]!;
    const html = home(without(f, "stamp"));
    const links = [...html.matchAll(/<link rel="stylesheet" href="[^"]*?(composed[^"]*)"/g)].map((m) => m[1]);
    expect(links).toEqual([COMPOSED_SHEETS.kinds().name, COMPOSED_SHEETS["vocab-wordmarks"]().name]);
    expect(home(without(f))).not.toContain("composed");
    expect(home(without(f, "plain"))).toContain(COMPOSED_SHEETS.kinds().name);
  });

  it("composedSheets: the chrome's wordmark alone gives kinds and the wordmarks family, no core; a wordmark block gives them after core", () => {
    expect(composedSheets([], undefined, { style: "stamp", chrome: true })).toEqual(["kinds", "vocab-wordmarks"]);
    expect(composedSheets([], undefined, { style: "stamp", chrome: false })).toEqual([]);
    expect(composedSheets([], undefined, { style: "plain", chrome: true })).toEqual(["kinds"]);
    expect(composedSheets([])).toEqual([]);
  });
});

describe("the wordmarks family sheet", () => {
  it("has a partial for every style beyond plain, each within 1.5 KiB, and no colour of its own (the palette's roles only)", () => {
    const sheet = vocabFamilySheets().wordmarks;
    expect(sheet.names).toEqual(WORDMARK_STYLES.filter((s) => s !== "plain").sort());
    expect(Buffer.byteLength(sheet.css)).toBeLessThanOrEqual(WORDMARK_STYLES.length * 1.5 * 1024);
    expect(sheet.css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|gradient|blur|border-radius:\s*(9999|50%|999)/i);
    expect(sheet.css).toMatch(/var\(--c-primary\)/);
  });
});
