import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";

/** The wide header's "Več" (Plus has up to 20 pages): its script comes only with a page whose header has it. */
const goldenDir = new URL("../../../tools/eval/golden/", import.meta.url);
const golden = (file: string) => migrateSpec(JSON.parse(readFileSync(new URL(file, goldenDir), "utf8"))) as SiteSpec;

const LABELS = ["O nas", "Ponudba", "Cenik", "Sezonski izdelki", "Torte za vse priložnosti", "Kruh in pecivo", "Darilni paketi", "Naročila za podjetja", "Dostava na dom", "Galerija", "Novice", "Dogodki"];

describe("nav-more.js", () => {
  it("is on a golden's page exactly when its header has Več; the goldens' short menus fit from 64 rem on", () => {
    const withMore: string[] = [];
    for (const file of readdirSync(goldenDir).filter((f) => f.endsWith(".json"))) {
      const spec = golden(file);
      for (const p of spec.pages) {
        const html = renderPage(spec, p);
        const more = html.includes('class="site-nav__more"');
        expect(html.includes("nav-more.js"), `${file} ${p.slug}`).toBe(more);
        if (more) {
          withMore.push(file);
          // Tablets only: at 768 px a logo, three entries and "Rezervirajte termin" wrapped the row in two.
          expect(html, `${file} ${p.slug}`).toContain('data-until="64"');
        }
      }
    }
    expect([...new Set(withMore)]).toEqual(["fizioterapija-pregib.json"]);
  });

  it("comes with a header whose menu has entries under Več", () => {
    const spec = golden("pekarna-kvas.json");
    const home = spec.pages.find((p) => p.kind === "home")!;
    const extra = LABELS.map((label, i) => ({ ...home, id: `p_x${i}`, kind: "standard" as const, slug: `stran-${i}`, nav: { label, show: true }, sections: home.sections.slice(0, 1) }));
    spec.pages = [...spec.pages.filter((p) => p.kind === "home"), ...extra, ...spec.pages.filter((p) => p.kind !== "home")];
    const html = renderPage(spec, spec.pages[0]!);
    expect(html).toContain("site-nav__more");
    expect(html).toMatch(/<script src="[^"]*nav-more\.js"[^>]*><\/script>/);
  });
});
