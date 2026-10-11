import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComposedProps, FACT_OBJECTS, TYPE_TREATMENTS, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { uncoveredClasses } from "./composed-coverage.ts";
import { STARTER_NAMES, VOCAB_DIR, composedSheets, renderPage, vocabFamilySheets, vocabPartials } from "../src/index.ts";

/**
 * Batch I6 (docs/plans/studio-phase1-design.md §5): the type treatments and fact objects beyond the starters. The heading
 * renderer wraps parts of the same words for four treatments (circle, oversized-first-word, drop-numeral, marker-highlight)
 * and never changes them; every name links its family sheet, whose rules cover every class the HTML carries; the family
 * sheets obey the bans every composed sheet obeys, plus the type bans (no italic, no tracked or forced capitals).
 */
const base = migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
const NEW_TYPE = TYPE_TREATMENTS.filter((t) => !STARTER_NAMES["type-treatments"].includes(t));
const NEW_FACT = FACT_OBJECTS.filter((t) => !STARTER_NAMES["fact-objects"].includes(t));

const desk = (col: number, span: number, row: number) => ({ col, span, row });
function sec(elements: object[], id = "s_x"): Section {
  return { id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "contained", rows: 2, elements }) } as Section;
}
function render(sections: Section[]): string {
  const spec = structuredClone(base);
  const page = spec.pages.find((p) => p.kind === "home")!;
  page.sections = sections;
  return renderPage(spec, page);
}
const heading = (text: string, treatment: string, more: object = {}) => ({ id: "e_h", kind: "heading", text, level: 2, size: 5, treatment, desk: desk(1, 6, 1), phone: { order: 0, span: "full" }, ...more });
const SAMPLE: Record<string, string> = { vertical: "Kontakt", "drop-numeral": "2008 – družinski servis v Kranju" };
const headingOf = (t: string) => heading(SAMPLE[t] ?? "Servis vseh znamk v Kranju", t, t === "vertical" ? { size: 4, case: "uppercase", weight: 800 } : {});
/** The heading element's HTML. */
const h2 = (page: string) => /<h2[^>]*cx-el--heading[\s\S]*?<\/h2>/.exec(page)![0];
/** What a screen reader reads of an element: its text without aria-hidden subtrees and tags. */
const spoken = (html: string) =>
  html
    .replace(/<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("I6a type treatments in the renderer", () => {
  for (const t of NEW_TYPE) {
    it(`${t}: the class cx-tt-${t}, the type-treatments sheet linked, every class covered, the words read as written`, () => {
      const el = headingOf(t);
      const s = sec([el]);
      const page = render([s]);
      expect(h2(page)).toContain(`cx-tt-${t}`);
      expect(composedSheets([s])).toContain("vocab-type-treatments");
      expect(uncoveredClasses(page)).toEqual([]);
      expect(spoken(h2(page))).toBe(el.text);
    });
  }

  it("circle: the words on an aria-hidden SVG path, the real text visually hidden in the heading, ids unique per section", () => {
    const page = render([sec([heading("Potica za praznike", "circle")], "s_a"), sec([heading("Potica za praznike", "circle")], "s_b")]);
    const [a, b] = [...page.matchAll(/<h2[^>]*cx-el--heading[\s\S]*?<\/h2>/g)].map((m) => m[0]);
    for (const [hh, s] of [[a!, "s_a"], [b!, "s_b"]] as const) {
      expect(hh).toContain('<span class="visually-hidden">Potica za praznike</span>');
      expect(hh).toMatch(/<svg class="cx-tt__c" viewBox="0 0 200 140" aria-hidden="true" focusable="false">/);
      expect(hh).toContain(`<path id="cx-c-${s}-e_h"`);
      expect(hh).toContain(`<textPath href="#cx-c-${s}-e_h" startOffset="50%" text-anchor="middle">Potica za praznike</textPath>`);
      expect(hh).toMatch(/--n:18/);
    }
  });

  it("oversized-first-word: the first word in a span (--wl its length), the rest as text", () => {
    const hh = h2(render([sec([heading("Servis vseh znamk v Kranju", "oversized-first-word")])]));
    expect(hh).toContain('<span class="cx-tt__w">Servis</span> vseh znamk v Kranju');
    expect(hh).toMatch(/--wl:6/);
  });

  it("drop-numeral: the leading number in a span only when the heading starts with one; never one added", () => {
    expect(h2(render([sec([heading("4,20 € pirin kruh z drožmi", "drop-numeral")])]))).toContain('<span class="cx-tt__n">4,20 €</span> <span>pirin kruh z drožmi</span>');
    const plain = h2(render([sec([heading("Družinski servis od leta 2008", "drop-numeral")])]));
    expect(plain).not.toContain("cx-tt__n");
    expect(spoken(plain)).toBe("Družinski servis od leta 2008");
  });

  it("marker-highlight: the words in one span (its box cloned per line); the others have no inner markup", () => {
    expect(h2(render([sec([heading("Ogled je brezplačen", "marker-highlight")])]))).toContain('<span class="cx-tt__t">Ogled je brezplačen</span>');
    for (const t of ["ruled-total", "title-block", "masthead", "typed-line", "rule-flanked", "fascia-lettering", "corner-marks", "vertical"]) {
      const hh = h2(render([sec([headingOf(t)])]));
      expect(hh.replace(/^<h2[^>]*>/, "").replace(/<\/h2>$/, ""), t).toBe(SAMPLE[t] ?? "Servis vseh znamk v Kranju");
    }
  });
});

describe("I6b fact objects in the renderer", () => {
  for (const t of NEW_FACT) {
    it(`${t}: the class cx-fact--${t}, the fact-objects sheet linked, every class covered; linked, the whole object is the link`, () => {
      const f = { id: "e_f", kind: "fact", value: "041 555 906", label: "Naročila", treatment: t, size: 4, desk: desk(1, 6, 1), phone: { order: 0, span: "full" } };
      const s = sec([f]);
      const page = render([s]);
      expect(page).toContain(`cx-fact cx-fact--${t}`);
      expect(composedSheets([s])).toContain("vocab-fact-objects");
      expect(uncoveredClasses(page)).toEqual([]);
      const linked = render([sec([{ ...f, link: { action: "call" } }])]);
      expect(linked).toMatch(/<a class="cx-fact__a" href="tel:\+38641555906"><div class="cx-fact__obj">/);
      expect(uncoveredClasses(linked)).toEqual([]);
    });
  }
});

describe("the I6 family sheets", () => {
  const families = [
    ["type-treatments", (n: string) => `.cx-tt-${n}`],
    ["fact-objects", (n: string) => `.cx-fact--${n}`],
  ] as const;

  it("hold one partial per added name, each rule scoped to its own name", () => {
    for (const [family, cls] of families) {
      const names = vocabPartials(family);
      expect(names.sort(), family).toEqual([...(family === "type-treatments" ? NEW_TYPE : NEW_FACT)].sort());
      for (const n of names) {
        const css = readFileSync(path.join(VOCAB_DIR, family, `${n}.css`), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/@[^{]+\{/g, "");
        const selectors = [...css.matchAll(/([^{}@;]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith("@") && s !== "");
        expect(selectors.length, n).toBeGreaterThan(0);
        for (const sel of selectors) for (const one of sel.split(/,(?![^(]*\))/)) expect(one, `${family}/${n}`).toMatch(new RegExp(`${cls(n).replace(/[.]/g, "\\.")}(?![a-z0-9-])`));
      }
    }
  });

  it("obey the bans: no gradient, blur, shadow, blend, motion, pill radius or monospace; colours are roles; clip-path only through --shape- tokens", () => {
    for (const [family] of families) {
      const css = vocabFamilySheets()[family].css;
      expect(css.length, family).toBeGreaterThan(0);
      expect(css, family).not.toMatch(/gradient\(|backdrop-filter|blur\(|shadow|mix-blend|animation|transition|@keyframes|border-radius:999|monospace/);
      expect(css, family).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(css, family).not.toMatch(/border-(left|right|inline-start|inline-end):[^;}]*var\(--c-(primary|accent)/);
      for (const m of css.matchAll(/clip-path:([^;}]+)/g)) expect(m[1], family).toMatch(/^var\(--shape-[a-z-]+\)$/);
    }
  });

  it("set no italic, no forced capitals and no tracking out (the banned tracked caps and italic accent words)", () => {
    for (const [family] of families) {
      const css = vocabFamilySheets()[family].css;
      expect(css, family).not.toMatch(/font-style|oblique|text-transform|font-variant-caps|small-caps/);
      for (const m of css.matchAll(/letter-spacing:([^;}]+)/g)) expect(m[1]!.trim(), family).toMatch(/^(-[\d.]+em|0|normal)$/);
    }
  });

  it("stay within their family budget (6 KiB each, minified)", () => {
    for (const [family] of families) expect(Buffer.byteLength(vocabFamilySheets()[family].css), family).toBeLessThanOrEqual(6 * 1024);
  });
});
