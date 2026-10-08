import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { SUBMOTIFS } from "@sb/spec";
import { fixtureMedia } from "../src/families-sheet.ts";
import { motifVariants, renderMotif } from "../src/motifs-sheet.ts";

/**
 * Every sub-trade motif (variety engine Step 3: wire, joint, tiles and strip on Cevi's layout, stem and tag on
 * Etiketa's) renders cleanly at 360 and 1280 px beside its template's own motif: a valid spec, no horizontal scroll,
 * no banned pattern, axe WCAG 2.2 A/AA, one h1, primary tap targets, and the page marked with its sub-trade. (The
 * contact sheet: pnpm motifs:sheet.)
 */
let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-motifs-"));
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("sub-trade motifs at 360 and 1280 px", () => {
  it("every motif and its template's own", async () => {
    const variants = await motifVariants();
    expect(variants.map((v) => v.motif)).toEqual(["pipes", "wire", "joint", "tiles", "strip", "label", "stem", "tag"]);
    expect(variants.filter((v) => (SUBMOTIFS as readonly string[]).includes(v.motif))).toHaveLength(SUBMOTIFS.length);
    for (const v of variants) {
      const media = await fixtureMedia(v.fixtureId, v.spec);
      const r = await renderMotif(browser, v, media, path.join(dir, v.motif));
      for (const c of r.checks) expect(c.problems, `${v.motif} at ${c.width} px`).toEqual([]);
    }
  }, 300_000);
});
