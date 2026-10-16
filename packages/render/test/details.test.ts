import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import { ComposedProps, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { renderPage, renderSite, siteFiles } from "../src/index.ts";

/**
 * M1 type and details proof, piece A (docs/plans/m1-type-details.md): RenderOptions.details. Off by default and
 * byte-identical then; on, the page carries the switches' classes and the details sheet inline (never the shared bundle).
 */
const golden = (name: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${name}.json`, import.meta.url), "utf8"))) as SiteSpec;
const NOW = new Date("2026-10-16T12:00:00Z");
const ALL = { cta: true, header: true, aiCaption: true, fit: true, scale: true };

describe("details off: byte-identical", () => {
  for (const name of ["pekarna-kvas", "racunovodstvo-seliskar"]) {
    it(`${name}: absent, {} and every switch false render the same site`, () => {
      const spec = golden(name);
      const base = renderSite(spec, { now: NOW, sharedHash: "h" });
      for (const details of [{}, { cta: false, header: false, aiCaption: false, fit: false, scale: false }]) {
        const other = renderSite(spec, { now: NOW, sharedHash: "h", details });
        expect([...other.pages.keys()]).toEqual([...base.pages.keys()]);
        for (const [p, html] of base.pages) expect(other.pages.get(p), p).toBe(html);
      }
    });
  }
});

describe("details on", () => {
  const spec = golden("pekarna-kvas");
  const home = spec.pages[0]!;

  it("names the switches on <html> and inlines the details sheet, minified", () => {
    const html = renderPage(spec, home, { now: NOW, details: ALL });
    expect(html).toMatch(/^<!doctype html><html lang="sl" class="dt-cta dt-header dt-ai-caption dt-fit dt-scale"><head>/);
    expect(html).toContain(":where(.dt-cta) .btn.btn--call.btn--call");
    expect(html).not.toContain("/*");
    const one = renderPage(spec, home, { now: NOW, details: { fit: true } });
    expect(one).toMatch(/<html lang="sl" class="dt-fit">/);
  });

  it("passes through siteFiles (publish and export), and leaves the shared bundle alone", () => {
    const off = siteFiles(spec, new Map());
    const on = siteFiles(spec, new Map(), { details: ALL });
    expect(strFromU8(on.get(`${spec.slug}/index.html`)!)).toContain('class="dt-cta');
    expect([...on.keys()].filter((k) => k.startsWith("_shared/"))).toEqual([...off.keys()].filter((k) => k.startsWith("_shared/")));
  });

  it("captions the first section with a generated picture once, and draws no chip", () => {
    const s = structuredClone(spec);
    s.assets.images = s.assets.images.map((i) => ({ ...i, origin: "generated" as const }));
    const composed = (id: string, image: string): Section =>
      ({
        id,
        type: "composed",
        variant: "free",
        props: ComposedProps.parse({
          intent: "story",
          width: "wide",
          rows: 1,
          elements: [
            { id: "e_h", kind: "heading", text: "Iz naše peči", level: 2, size: 4, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
            { id: "e_i", kind: "image", image, ratio: "1:1", desk: { col: 7, span: 6, row: 1 }, phone: { order: 1, span: "full" } },
          ],
        }),
      }) as Section;
    s.pages[0]!.sections = [s.pages[0]!.sections[0]!, composed("s_a", "img_02"), composed("s_b", "img_03")] as never;
    const html = renderPage(s, s.pages[0]!, { now: NOW, details: { aiCaption: true } });
    expect(html.match(/class="container ai-caption"/g)).toHaveLength(1);
    expect(html).not.toContain("media--ai");
    expect(html).toContain('data-ai="generated"');
    // The opener (hero-split) shows img_01, so the caption ends it.
    const opener = html.slice(html.indexOf("<main"), html.indexOf("</section>") + 10);
    expect(opener).toContain("Slike na tej strani so ustvarjene z umetno inteligenco.");
  });
});
