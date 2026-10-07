import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { DIRECTIONS, FAMILIES } from "@sb/spec";
import { familyVariants, fixtureMedia, renderVariant } from "../src/families-sheet.ts";

/**
 * Every new look of the template families (packages/spec/src/families.ts) renders cleanly at 360 and 1280 px: each
 * template's palettes with its own hero, and its alternate heroes with its own palette, on its trade's fixture. The
 * checks the eval uses: a valid spec, no horizontal scroll, no banned pattern, axe WCAG 2.2 A/AA, one h1, primary tap
 * targets. (The full template × palette × hero sheet: pnpm variety:sheet.)
 */
let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-families-"));
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("template family looks at 360 and 1280 px", () => {
  for (const d of DIRECTIONS.filter((x) => x.template && FAMILIES[x.id])) {
    it(`${d.id}: every palette and every hero`, async () => {
      const f = FAMILIES[d.id]!;
      const variants = (await familyVariants(d)).filter((v) => v.palette === f.palettes[0]!.id || v.hero === f.heroes[0]);
      expect(variants).toHaveLength(f.palettes.length + f.heroes.length - 1);
      for (const v of variants) {
        const media = await fixtureMedia(v.fixtureId, v.spec);
        const r = await renderVariant(browser, v, media, path.join(dir, `${v.template}-${v.palette}-${v.hero.replace(":", "-")}`));
        for (const c of r.checks) expect(c.problems, `${v.template} ${v.palette} ${v.hero} at ${c.width} px`).toEqual([]);
      }
    }, 240_000);
  }
});
