import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXAMPLES, OUT_DIR, PRIMER_SLUG, exampleHtml, homepageFiles, primerSpec } from "../src/examples/examples.ts";

/**
 * The landing page's example sites are our engine's output, not a mock-up: the committed homepages
 * equal a fresh render of their specs. After a renderer change, run `pnpm examples:build`.
 * The shared bundle's hash comes from the source files' bytes, which differ by line endings between a
 * Windows checkout and CI, so pages are compared with the hash masked; the committed page and its
 * committed shared files stay consistent with each other.
 */
const masked = (html: string) => html.replace(/_shared\/[0-9a-f]+\//g, "_shared/HASH/");

describe("landing examples", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: the committed homepage equals a fresh render, and every file it uses is there`, () => {
      const { slug, html } = exampleHtml(ex);
      const file = path.join(OUT_DIR, slug, "index.html");
      expect(existsSync(file), "run pnpm examples:build").toBe(true);
      const committed = readFileSync(file, "utf8");
      expect(masked(committed), "stale example: run pnpm examples:build").toBe(masked(html));
      for (const m of committed.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
        for (const ref of m[1]!.split(",").map((s) => s.trim().split(" ")[0]!)) {
          if (ref.startsWith("media/") || ref.startsWith("../_shared/")) expect(existsSync(path.join(OUT_DIR, slug, ref)), ref).toBe(true);
        }
      }
      // One call button on a phone: the hero's own is hidden when the bar shows from the start.
      if (/data-action="call"[^>]*class="btn/.test(html) && html.includes('class="action-bar"')) expect(html).toContain("bar-covers-hero-call");
    });
  }
});

describe("landing Primer section", () => {
  it("is Pekarna Kvas rendered by the engine, with the cinnamon rolls' price marked missing", () => {
    const { slug, html } = homepageFiles(primerSpec());
    expect(slug).toBe(PRIMER_SLUG);
    const file = path.join(OUT_DIR, slug, "index.html");
    expect(existsSync(file), "run pnpm examples:build").toBe(true);
    const committed = readFileSync(file, "utf8");
    expect(masked(committed), "stale example: run pnpm examples:build").toBe(masked(html));
    expect(committed.match(/<mark class="ph"/g)).toHaveLength(1);
    for (const m of committed.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
      for (const ref of m[1]!.split(",").map((x) => x.trim().split(" ")[0]!)) {
        if (ref.startsWith("media/") || ref.startsWith("../_shared/")) expect(existsSync(path.join(OUT_DIR, slug, ref)), ref).toBe(true);
      }
    }
  });
});

describe("landing trade showcase", () => {
  it("the committed showcase sites and showcase.json equal a fresh build", async () => {
    const { SHOWCASES, SHOWCASE_JSON, showcaseJson, showcaseSpec } = await import("../src/examples/showcase.ts");
    const { homepageFiles } = await import("../src/examples/examples.ts");
    for (const s of SHOWCASES) {
      const { slug, html } = homepageFiles(showcaseSpec(s));
      const file = path.join(OUT_DIR, slug, "index.html");
      expect(existsSync(file), "run pnpm examples:build").toBe(true);
      expect(masked(readFileSync(file, "utf8")), `stale showcase ${s.id}: run pnpm examples:build`).toBe(masked(html));
      for (const m of html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) {
        for (const ref of m[1]!.split(",").map((x) => x.trim().split(" ")[0]!)) {
          if (ref.startsWith("media/") || ref.startsWith("../_shared/")) expect(existsSync(path.join(OUT_DIR, slug, ref)), `${s.id}: ${ref}`).toBe(true);
        }
      }
    }
    expect(masked(readFileSync(path.join(OUT_DIR, SHOWCASE_JSON), "utf8")), "stale showcase.json: run pnpm examples:build").toBe(masked(showcaseJson()));
  });
});
