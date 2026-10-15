// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { repeatedContact, serveStatic, type StaticServer } from "@sb/engine";
import { isPlaceholder, migrateSpec, type SiteSpec } from "@sb/spec";
import { WIDTHS, openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";

/**
 * Contact details once per page (the 50-page outside review: address and hours printed two or three times on 27–29
 * pages per reviewer), on the review's own saved specs, every page of the site, through the check the product runs:
 * the footer's visit block gives way to a section showing them, a call-out leaves out what the hero's fact strip
 * showed above it (the car-repair template), and the privacy page's controller sentence is the legal row.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-review50-contact-"));
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

describe("review 50: contact details once per page", () => {
  for (const [business, which] of [
    ["kljucavnicarstvo-hrovat", "regenerated"],
    ["avtoservis-mrak", "generated"],
    ["pizzeria-oljka", "generated"],
    ["kmetija-grabnar", "generated"],
  ] as const) {
    it(`${business} (${which}): no page shows the address or the hours in full twice`, async () => {
      const spec = await reviewSpec(business, which);
      const out = await renderToDir(spec, dir);
      const a = spec.business.address;
      const address = isPlaceholder(a) ? undefined : { street: a.street, place: `${a.postalCode} ${a.city}` };
      const files = (await readdir(out)).filter((f) => f.endsWith(".html"));
      expect(files).toContain("index.html");
      const found: string[] = [];
      for (const file of files) {
        const { page, ctx } = await openPage(browser, WIDTHS[0], `${server.url}/${spec.slug}/${file}`);
        try {
          for (const line of await repeatedContact(page, address)) found.push(`${file}: ${line}`);
        } finally {
          await ctx.close();
        }
      }
      expect(found).toEqual([]);
    }, 60_000);
  }
});
