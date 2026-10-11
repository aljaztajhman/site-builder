import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { measurePage, runAxe, serveStatic } from "@sb/engine";
import { STUDIO_REFERENCES, inventory } from "@sb/inventory";
import { ItemsFile, PairsFile, roundPairs, roundSources, toItem } from "../src/okus-round.ts";
import { ReferenceBrief, ReferenceMeta, checkReference, loadReference, loadReferences, referenceIds, writeReferenceSite } from "../src/references.ts";

/**
 * The studio references (tools/eval/references, I10, decision D3): every folder loads (brief and meta schemas), its
 * v20 site validates with no issue and holds no fact the brief doesn't give, its stance exists, it has a gap note; it
 * renders its homepage at 360 and 1280 px with no horizontal scroll and axe WCAG 2.2 A/AA clean; it is registered in
 * the inventory as reference/<id> with its stance and trades; Okus round 2 holds it and asks about it. No model call.
 */
const refs = loadReferences();
const config = loadConfig();

describe("reference format", () => {
  it("there are references, every folder loads", () => {
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.map((r) => r.id)).toEqual(referenceIds());
  });

  it("the schemas refuse a brief without the client's words and a meta without a gap note", () => {
    const brief = structuredClone(refs[0]!.brief);
    expect(ReferenceBrief.safeParse({ ...brief, description: "kratko" }).success).toBe(false);
    expect(ReferenceMeta.safeParse({ ...refs[0]!.meta, gapNote: " " }).success).toBe(false);
    expect(ReferenceMeta.safeParse({ ...refs[0]!.meta, sources: [] }).success).toBe(false);
  });

  it("the harness catches an invented fact, an unknown stance and a spec that doesn't validate", () => {
    const r = loadReference(refs[0]!.id);
    r.spec.business.phone = "+38641999999";
    r.meta.stance = "no-such-stance";
    (r.spec.pages[0]!.sections[0]!.props as { rows: number }).rows = 99;
    const problems = checkReference(r).join("\n");
    expect(problems).toContain("validateSite");
    expect(problems).toContain("no-such-stance");
    const r2 = loadReference(refs[0]!.id);
    r2.spec.business.phone = "+38641999999";
    expect(checkReference(r2).join("\n")).toMatch(/checkFacts phone/);
  });
});

describe.each(refs.map((r) => [r.id, r] as const))("reference %s", (_id, ref) => {
  it("validates with 0 issues, invents no fact, names an existing stance, has a gap note", () => {
    expect(checkReference(ref)).toEqual([]);
    expect(ref.meta.gapNote.trim().length).toBeGreaterThanOrEqual(40);
  });

  it("is registered in the inventory as a draft reference with its stance and trades", () => {
    const a = inventory().byId(`reference/${ref.id}`);
    expect(a?.kind).toBe("reference");
    expect(a?.status).toBe("draft");
    expect(a?.tags.stances).toEqual([ref.meta.stance]);
    expect(a?.tags.trades).toEqual(ref.meta.trades);
  });
});

describe("registration", () => {
  it("the inventory lists exactly the reference folders", () => {
    expect(STUDIO_REFERENCES.map((r) => r.id).sort()).toEqual(referenceIds());
    expect(inventory().byKind("reference").map((a) => a.id).sort()).toEqual(referenceIds().map((id) => `reference/${id}`));
  });
});

describe("Okus round 2", () => {
  const items = roundSources(2).map(toItem);
  const pairs = roundPairs(2, items);

  it("holds every studio reference with the goldens and the 19 hand-made references", () => {
    expect(() => ItemsFile.parse({ round: 2, items })).not.toThrow();
    const studio = items.filter((i) => i.kind === "studio");
    expect(studio.map((i) => i.id).sort()).toEqual(referenceIds().map((id) => `studio-${id}`));
    expect(items.filter((i) => i.kind === "reference")).toHaveLength(19);
    expect(items.filter((i) => i.kind === "golden").length).toBeGreaterThanOrEqual(10);
    expect(roundSources(2).map((s) => s.id)).toEqual(items.map((i) => i.id));
  });

  it("asks about every studio reference against its trade's golden and hand-made reference, deterministically", () => {
    expect(() => PairsFile.parse({ round: 2, pairs })).not.toThrow();
    expect(roundPairs(2, items)).toEqual(pairs);
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const s of items.filter((i) => i.kind === "studio")) {
      const mine = pairs.filter((p) => p.a === s.id || p.b === s.id);
      const other = (p: (typeof pairs)[number]) => byId.get(p.a === s.id ? p.b : p.a)!;
      expect(mine.some((p) => p.kind === "studio-golden" && other(p).kind === "golden" && other(p).trade === s.trade), s.id).toBe(true);
      expect(mine.some((p) => p.kind === "studio-reference" && other(p).kind === "reference" && other(p).trade === s.trade), s.id).toBe(true);
    }
    for (const p of pairs) expect(byId.get(p.a)!.kind === "studio" || byId.get(p.b)!.kind === "studio").toBe(true);
  });
});

describe("references in a browser at 360 and 1280 px", () => {
  let browser: Browser;
  let dir: string;
  let base = "";
  let close: () => Promise<void>;
  const homes = new Map<string, string>();

  beforeAll(async () => {
    browser = await chromium.launch();
    dir = await mkdtemp(path.join(tmpdir(), "sb-refs-"));
    const server = await serveStatic(dir);
    base = server.url;
    close = server.close;
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it.each(refs.flatMap((r) => [360, 1280].map((w) => [r.id, w] as const)))("%s at %i px: no horizontal scroll, axe clean", async (id, w) => {
    const phone = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    try {
      // Each reference is built in its own test (once, shared by both widths), so setup time doesn't grow with the set.
      if (!homes.has(id)) {
        const r = refs.find((x) => x.id === id)!;
        homes.set(id, `${id}/${await writeReferenceSite(r, path.join(dir, id), { widths: config.images.widths.slice(0, 1) })}`);
      }
      const page = await ctx.newPage();
      await page.goto(`${base}/${homes.get(id)}`, { waitUntil: "networkidle" });
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
