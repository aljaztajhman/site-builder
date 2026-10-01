import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXAMPLES, OUT_DIR, exampleHtml } from "../src/examples/examples.ts";

/**
 * The landing page's example sites are our engine's output, not a mock-up: the committed homepages
 * equal a fresh render of their specs. After a renderer change, run `pnpm examples:build`.
 */
describe("landing examples", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: the committed homepage equals a fresh render, and every file it uses is there`, () => {
      const { slug, html, shared } = exampleHtml(ex);
      const file = path.join(OUT_DIR, slug, "index.html");
      expect(existsSync(file), "run pnpm examples:build").toBe(true);
      expect(readFileSync(file, "utf8"), "stale example: run pnpm examples:build").toBe(html);
      for (const p of shared.keys()) expect(existsSync(path.join(OUT_DIR, p)), p).toBe(true);
      for (const m of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
        for (const ref of m[1]!.split(",").map((s) => s.trim().split(" ")[0]!)) {
          if (ref.startsWith("media/")) expect(existsSync(path.join(OUT_DIR, slug, ref)), ref).toBe(true);
        }
      }
      // One call button on a phone: the hero's own is hidden when the bar shows from the start.
      if (/data-action="call"[^>]*class="btn/.test(html) && html.includes('class="action-bar"')) expect(html).toContain("bar-covers-hero-call");
    });
  }
});
