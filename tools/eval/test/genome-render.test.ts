import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { FONT_PAIRS, GROUNDS, Imagery, RHYTHMS, SHAPES, migrateSpec, validateSite } from "@sb/spec";
import { fixtureMedia } from "../src/families-sheet.ts";
import { GENOME_GOLDENS, coverLooks, genomeLooks, renderGenome, sheetPools } from "../src/genome-sheet.ts";

/**
 * Every value of every genome axis (spec v18, design.genome; variety Step 5) renders cleanly at 360 and 1280 px on five
 * goldens: three general directions (every axis free: all font pairs, imagery, shapes, grounds, rhythms between them) and
 * two trade templates. Per look: a valid spec, no horizontal scroll, no banned pattern, axe WCAG 2.2 A/AA, one h1, 44 px
 * targets with 8 px spacing, call and directions in the phone's first screen, and with a skeleton one call button per
 * screen. One browser for all of it. (The contact sheet: pnpm variety:genome.)
 */
const here = path.dirname(fileURLToPath(import.meta.url));
let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-genome-"));
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("genome axes at 360 and 1280 px", () => {
  it("the sheet shows every value of every axis each golden can take, and between the goldens every font pair, imagery, shape, ground and rhythm", async () => {
    const looks = await genomeLooks();
    for (const site of GENOME_GOLDENS) {
      const spec = migrateSpec(JSON.parse(await readFile(path.join(here, "../golden", `${site}.json`), "utf8")));
      const pools = sheetPools(spec, site);
      expect(coverLooks(spec, pools).unreachable, site).toEqual([]);
      const on = looks.filter((l) => l.site === site);
      for (const axis of ["type", "hero", "rhythm", "imagery", "shape", "density"] as const) {
        expect(new Set(on.map((l) => l.genome[axis])), `${site} ${axis}`).toEqual(new Set(pools[axis] as readonly string[]));
      }
      expect(new Set(on.map((l) => l.genome.palette)), site).toEqual(new Set(pools.palette.map((p) => p.id)));
      // Looks with a skeleton and looks without.
      expect(on.some((l) => l.spec.design.skeleton) && on.some((l) => !l.spec.design.skeleton), site).toBe(true);
      for (const l of on) expect(validateSite(l.spec).ok, `${site} ${l.label}`).toBe(true);
    }
    const all = looks.map((l) => l.genome);
    expect(new Set(all.map((g) => g.type))).toEqual(new Set(FONT_PAIRS.map((p) => p.id)));
    expect(new Set(all.map((g) => g.imagery))).toEqual(new Set(Imagery.options));
    expect(new Set(all.map((g) => g.shape))).toEqual(new Set(SHAPES));
    expect(new Set(all.map((g) => g.ground))).toEqual(new Set(GROUNDS));
    expect(new Set(all.map((g) => g.rhythm))).toEqual(new Set(RHYTHMS));
  });

  for (const site of GENOME_GOLDENS) {
    it(`${site}: every look passes the page checks`, async () => {
      const looks = (await genomeLooks([site])).filter((l) => l.site === site);
      for (const [n, look] of looks.entries()) {
        const media = await fixtureMedia(look.site, look.spec);
        const r = await renderGenome(browser, look, media, path.join(dir, `${site}-${n}`));
        for (const c of r.checks) expect(c.problems, `${site} ${look.label} at ${c.width} px`).toEqual([]);
      }
    }, 600_000);
  }
});
