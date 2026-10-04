import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { failuresOf, launchCheckBrowser, sampleEntryPages, sitePageFiles, type CheckBrowser, type SiteCheckReport } from "@sb/engine";
import { withCollections } from "../../../packages/render/test/collections-fixture.ts";
import { loadFixture } from "../src/fixtures/load.ts";
import { renderReport } from "../src/report.ts";
import { runFixture, type FixtureResult } from "../src/runner.ts";

/**
 * `pnpm eval` opens a site's collection entry pages, not only `spec.pages` (it-collections-plus, overnight plan
 * on-collections-plus): run offline (no model, no cost) on the bakery's golden with a blog and events, the entry
 * pages are checked like the others (axe, 360/1280 px scroll, text size, tap targets), one per collection gets
 * whole-page screenshots at 360 and 1280 px and Lighthouse beside the homepage, and the report names them.
 */
const ENTRIES = ["novice/nov-rzeni-kruh.html", "novice/kvasni-tecaj-za-zacetnike.html", "dogodki/dan-odprtih-vrat.html"];
let cb: CheckBrowser;
let dir: string;

beforeAll(async () => {
  cb = await launchCheckBrowser();
  dir = await mkdtemp(path.join(tmpdir(), "sb-eval-coll-"));
}, 60_000);
afterAll(async () => {
  await cb?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("the eval on a site with collections", () => {
  it("lists every entry page after the spec's pages, and one per collection to screenshot", () => {
    const spec = withCollections();
    expect(sitePageFiles(spec)).toEqual([...spec.pages.map((p) => `${p.slug || "index"}.html`), ...ENTRIES]);
    expect(sampleEntryPages(spec)).toEqual(["novice/nov-rzeni-kruh.html", "dogodki/dan-odprtih-vrat.html"]);
    const plain = withCollections();
    delete plain.collections;
    expect(sampleEntryPages(plain)).toEqual([]);
  });

  it("offline: checks the entry pages, writes their screenshots, and the report names them", async () => {
    const goldenDir = path.join(dir, "golden");
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path.join(goldenDir, "pekarna-kvas.json"), JSON.stringify(withCollections()));
    const outDir = path.join(dir, "out");
    const r = await runFixture(loadFixture("pekarna-kvas"), {
      mode: "offline",
      outDir,
      browser: cb,
      recordingsDir: path.join(dir, "recordings"),
      goldenDir,
      scope: "full",
      lighthouse: false,
      maxEur: 0,
      spentSoFar: () => 0,
      judge: false,
    });
    expect(r.error).toBeUndefined();
    const generated = r.checkpoints[0]!;
    expect(generated.pages.filter((p) => p.includes("/"))).toEqual(ENTRIES);
    // Nothing on the entry pages fails a check (facts and placeholders are the site's, not a page's).
    expect(generated.failures.filter((f) => ENTRIES.some((e) => f.startsWith(e)))).toEqual([]);
    const shots = (await readdir(path.join(outDir, "runs", "pekarna-kvas"))).filter((f) => f.startsWith("entry-")).sort();
    expect(shots).toEqual(["entry-dogodki-dan-odprtih-vrat-1280.png", "entry-dogodki-dan-odprtih-vrat-360.png", "entry-novice-nov-rzeni-kruh-1280.png", "entry-novice-nov-rzeni-kruh-360.png"]);
    const report = renderReport([r as FixtureResult], loadConfig(), { mode: "offline", scope: "full", startedAt: new Date(), totalEur: 0, wallMs: 1 });
    expect(report).toContain("Collection entry pages checked: 3 (novice/nov-rzeni-kruh.html, novice/kvasni-tecaj-za-zacetnike.html, dogodki/dan-odprtih-vrat.html).");
    // No model was called: nothing was logged as spent.
    expect(r.costByStage.reduce((a, c) => a + c.eur, 0)).toBe(0);
  }, 240_000);

  it("an entry page's Lighthouse below the bar fails the checkpoint, named by its file", () => {
    const spec = withCollections();
    const ok = { performance: 100, accessibility: 100, bestPractices: 100, seo: 100 };
    const report = {
      validation: [],
      facts: [],
      placeholders: 0,
      pages: [],
      lighthouse: ok,
      lighthousePages: [{ file: "novice/nov-rzeni-kruh.html", scores: { ...ok, accessibility: 88 } }],
      pageShots: [],
      screenshots: { mobile: new Uint8Array(), mobileFull: new Uint8Array(), desktop: new Uint8Array(), desktopFirst: new Uint8Array() },
      composition: null,
      failures: [],
    } as unknown as SiteCheckReport;
    const config = loadConfig();
    expect(failuresOf(spec, report, config)).toEqual([`novice/nov-rzeni-kruh.html: lighthouse accessibility 88 < ${config.checks.lighthouse.accessibility}`]);
  });
});
