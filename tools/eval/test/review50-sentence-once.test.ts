// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { renderedPageText, repeatedSentences, serveStatic, type StaticServer } from "@sb/engine";
import { migrateSpec, repairRepeatedSentences, type SiteSpec } from "@sb/spec";
import { WIDTHS, openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";

/**
 * A sentence once per page (the 50-page outside review: "the same sentence twice" held frizerstvo-lana and
 * gostisce-na-gricu with all three reviewers), on the review's own saved specs, every page of the site, at 1280 and
 * 360 px, through the check the product runs. The two hours-note pages are rendered as saved (the hours section leaves
 * out a note the hours print); the pages whose copy repeats a sentence across sections get generation's repair first.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-review50-sentence-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const REVIEW = path.join(repoRoot, "eval/outside-review/review50-specs");
const reviewSpec = async (business: string, which: "generated" | "regenerated"): Promise<SiteSpec> =>
  migrateSpec(JSON.parse(await readFile(path.join(REVIEW, business, `spec-${which}.json`), "utf8")));

async function repeatsOnSite(spec: SiteSpec): Promise<string[]> {
  const out = await renderToDir(spec, dir);
  const files = (await readdir(out)).filter((f) => f.endsWith(".html"));
  expect(files).toContain("index.html");
  const found: string[] = [];
  for (const file of files)
    for (const w of WIDTHS) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${spec.slug}/${file}`);
      try {
        for (const line of await repeatedSentences(page)) found.push(`${file} ${w.width}: ${line}`);
      } finally {
        await ctx.close();
      }
    }
  return found;
}

describe("review 50: a sentence once per page", () => {
  for (const [business, which] of [
    ["frizerstvo-lana", "generated"],
    ["gostisce-na-gricu", "regenerated"],
  ] as const) {
    it(`${business} (${which}), as saved: the hours note shows once`, async () => {
      expect(await repeatsOnSite(await reviewSpec(business, which))).toEqual([]);
    }, 60_000);
  }

  for (const [business, which] of [
    ["elektro-zupan", "generated"],
    ["frizerstvo-lana", "regenerated"],
    ["kljucavnicarstvo-hrovat", "generated"],
    ["kljucavnicarstvo-hrovat", "regenerated"],
    ["kmetija-grabnar", "regenerated"],
    ["pekarna-kvas", "generated"],
    ["racunovodstvo-seliskar", "generated"],
  ] as const) {
    it(`${business} (${which}), after generation's repair: no sentence twice`, async () => {
      const spec = await reviewSpec(business, which);
      repairRepeatedSentences(spec, renderedPageText);
      expect(await repeatsOnSite(spec)).toEqual([]);
    }, 60_000);
  }

  it("karoserija-hribar (generated), whose copies are all required: the check holds it", async () => {
    const spec = await reviewSpec("karoserija-hribar", "generated");
    repairRepeatedSentences(spec, renderedPageText);
    const found = await repeatsOnSite(spec);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((l) => l.includes("Sodelujemo z vsemi zavarovalnicami"))).toBe(true);
  }, 60_000);
});
