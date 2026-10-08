import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MIGRATIONS, migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";

/** The design genome (spec v18, design.genome) in the rendered page; no browser. */
const raw = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];

describe("migration 17 → 18 renders byte-identical HTML", () => {
  it("every page of every golden: the v17 site and the migrated v18 site with its preset genome", () => {
    for (const id of GOLDENS) {
      const stored = raw(id);
      const { genome: _genome, ...design } = stored.design;
      const v17 = { ...stored, specVersion: 17, design } as unknown as SiteSpec;
      const v18 = migrateSpec(v17, MIGRATIONS, 18);
      expect(v18.design.genome?.source, id).toBe("preset");
      for (const page of v17.pages) {
        const before = renderPage(v17, page);
        const after = renderPage(v18, v18.pages.find((p) => p.id === page.id)!);
        expect(after, `${id} ${page.id}`).toBe(before);
        expect(after, `${id} ${page.id}`).not.toContain("data-shape");
      }
    }
  });
});

describe("a picked genome's shape in the page", () => {
  const spec = migrateSpec(raw("pekarna-kvas"));
  const withShape = (shape: "square" | "soft" | "cut" | "arch", source: "picked" | "preset" = "picked"): SiteSpec => ({
    ...spec,
    design: { ...spec.design, imagery: "natural", radius: shape === "square" || shape === "cut" ? 0 : 8, genome: { source, palette: "preset", rhythm: "alternate", shape } },
  });
  const body = (s: SiteSpec) => /<body[^>]*>/.exec(renderPage(s, s.pages[0]!))![0];

  it("cut corners and arched tops are named on <body>; square and soft are the radius token only", () => {
    expect(body(withShape("cut"))).toContain('data-shape="cut"');
    expect(body(withShape("arch"))).toContain('data-shape="arch"');
    expect(body(withShape("square"))).not.toContain("data-shape");
    expect(body(withShape("soft"))).not.toContain("data-shape");
    // A preset genome renders nothing of its own.
    expect(body(withShape("cut", "preset"))).not.toContain("data-shape");
  });
});
