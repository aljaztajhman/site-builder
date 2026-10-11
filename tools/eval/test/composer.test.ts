import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { checkFacts, measurePage, runAxe, serveStatic } from "@sb/engine";
import { approvalPlan, type ApprovalPage, type ComposeResult } from "@sb/inventory";
import { loadFixture } from "../src/fixtures/load.ts";
import { writeComposedSite } from "../src/studio-compose.ts";

/**
 * The preset composer's pages (packages/inventory/src/composer.ts, studio-phase2-design.md P4a): all 30 approval pages
 * hold no fact the fixture's own text doesn't give (checkFacts against the fixture's description), and the 9 the design
 * names render at 360 and 1280 px with no horizontal scroll and axe WCAG 2.2 A/AA clean. No model call.
 */
const plan = approvalPlan();
const config = loadConfig();
const named = plan.pages.map((p, i) => [p, plan.results[i]!] as const).filter(([p]) => p.kind === "named");
const label = (p: ApprovalPage) => `${p.fixtureId} / ${p.stance}`;

describe("composed pages invent no fact", () => {
  it.each(plan.pages.map((p, i) => [label(p), plan.results[i]!] as const))("%s", (_label, r: ComposeResult) => {
    const corpus = loadFixture(r.used.fixtureId).brief.description;
    expect(checkFacts(r.spec, corpus)).toEqual([]);
  });
});

describe("the nine named pages in a browser at 360 and 1280 px", () => {
  let browser: Browser;
  let dir: string;
  let base = "";
  let close: () => Promise<void>;
  const homes = new Map<string, string>();

  beforeAll(async () => {
    browser = await chromium.launch();
    dir = await mkdtemp(path.join(tmpdir(), "sb-compose-"));
    const server = await serveStatic(dir);
    base = server.url;
    close = server.close;
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it("there are nine", () => {
    expect(named).toHaveLength(9);
  });

  it.each(named.flatMap(([p, r]) => [360, 1280].map((w) => [label(p), r, w] as const)))("%s at %i px: no horizontal scroll, axe clean", async (_label, r: ComposeResult, w: number) => {
    const phone = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    try {
      // Each page is built in its own test (once, shared by both widths), encoding one image width only, as references.test does.
      const slug = r.spec.slug;
      if (!homes.has(slug)) homes.set(slug, `${slug}/${await writeComposedSite(r.used.fixtureId, structuredClone(r.spec), path.join(dir, slug), { widths: config.images.widths.slice(0, 1) })}`);
      const page = await ctx.newPage();
      await page.goto(`${base}/${homes.get(slug)}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const t = config.checks.tapTarget;
      const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const problems: string[] = [];
      if (m.horizontalScroll) problems.push(`horizontal scroll (${m.scrollWidth} px)`);
      for (const a of await runAxe(page)) problems.push(`axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 3).join(", ")}`);
      expect(problems).toEqual([]);
    } finally {
      await ctx.close();
    }
  }, 90_000);
});
