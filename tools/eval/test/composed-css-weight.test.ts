import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { COMPOSED_SHEETS, renderSite, sharedBundle } from "@sb/render";
import { COMPOSED_SHEET_BUDGET } from "@sb/inventory";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { KITCHEN_SINK_FILE } from "../src/kitchen-sink.ts";
import { loadReferences } from "../src/references.ts";

/**
 * Per-page CSS weight (docs/plans/studio-phase1-review.md B3, §6.1): for the kitchen-sink pages, the goldens, the home
 * pages of m, s and j and the studio references, the stylesheets each rendered page actually links (parsed from its
 * HTML), printed as a table. Budgets (inventory COMPOSED_SHEET_BUDGET): per sheet raw, core at most 16 KiB and every v2
 * region 12 KiB (growth discipline); per page, gzipped as served, the composed sheets together at most 20 KiB and all
 * its stylesheets (the site sheet too) at most 36 KiB. The numbers are the point; the budgets only fail on a real overrun.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const KiB = 1024;
const load = async (file: string) => migrateSpec(JSON.parse(await readFile(file, "utf8"))) as SiteSpec;
const gz = (b: Uint8Array | string) => gzipSync(b).length;

/** The stylesheet files a rendered page links, by file name. */
export function linkedSheets(html: string): string[] {
  return [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)].map((m) => m[1]!.split("/").pop()!);
}

async function specs(): Promise<[string, SiteSpec][]> {
  const out: [string, SiteSpec][] = [["kitchen-sink", await load(KITCHEN_SINK_FILE)]];
  for (const id of ["m", "s", "j"]) out.push([id, await load(path.join(here, `../composed/${id}.json`))]);
  const goldenDir = path.join(here, "../golden");
  for (const f of (await readdir(goldenDir)).filter((n) => n.endsWith(".json")).sort()) out.push([`golden-${f.replace(/\.json$/, "")}`, await load(path.join(goldenDir, f))]);
  for (const r of loadReferences()) out.push([`ref-${r.id}`, r.spec]);
  return out;
}

describe("page CSS weight", () => {
  it("a page's linked sheets are read from its HTML", () => {
    expect(linkedSheets('<link rel="stylesheet" href="../_shared/abc/site.css"/><link rel="stylesheet" href="../_shared/abc/composed-1.css"/><link rel="icon" href="x.css"/>')).toEqual(["site.css", "composed-1.css"]);
  });

  it("prints the sheets each page links and their gzip bytes, within the budgets", async () => {
    const bundle = sharedBundle();
    const rows: string[] = [];
    let worstComposed = { id: "", bytes: 0 };
    let worstAll = { id: "", bytes: 0 };
    let worstRaw = { id: "", bytes: 0 };
    const all = await specs();
    expect(all.length).toBeGreaterThanOrEqual(1 + 3 + 24);
    for (const [id, spec] of all) {
      const rendered = renderSite(spec);
      const composedNames = new Set(Object.values(COMPOSED_SHEETS).map((get) => get().name));
      for (const [file, html] of rendered.pages) {
        const names = linkedSheets(html);
        const sizes = names.map((n) => {
          const data = bundle.files.get(n);
          expect(data, `${id}/${file}: ${n} is in the shared bundle`).toBeDefined();
          return { n, raw: data!.length, gz: gz(data!), composed: composedNames.has(n) };
        });
        const composed = sizes.filter((s) => s.composed);
        const composedGz = composed.reduce((t, s) => t + s.gz, 0);
        const allGz = sizes.reduce((t, s) => t + s.gz, 0);
        if (composed.length > 0 && composedGz > worstComposed.bytes) worstComposed = { id: `${id}/${file}`, bytes: composedGz };
        if (allGz > worstAll.bytes) worstAll = { id: `${id}/${file}`, bytes: allGz };
        const raw = composed.reduce((t, s) => t + s.raw, 0);
        if (raw > worstRaw.bytes) worstRaw = { id: `${id}/${file}`, bytes: raw };
        if (composed.length > 0) rows.push(`${`${id}/${file}`.padEnd(52)} composed ${String(composed.length).padStart(2)} sheets ${String(raw).padStart(6)} B raw ${String(composedGz).padStart(6)} B gzip | all CSS ${String(allGz).padStart(6)} B gzip`);
        for (const s of composed.filter((x) => x.n.startsWith("composed")))
          if (s.n === COMPOSED_SHEETS.core().name) expect(s.raw, `${id}/${file}: core`).toBeLessThanOrEqual(COMPOSED_SHEET_BUDGET.core);
        for (const r of ["section", "kinds", "extensions", "vocab"] as const) {
          const sheet = COMPOSED_SHEETS[r]();
          if (names.includes(sheet.name)) expect(bundle.files.get(sheet.name)!.length, `${id}/${file}: ${r}`).toBeLessThanOrEqual(COMPOSED_SHEET_BUDGET.region);
        }
        expect(composedGz, `${id}/${file}: composed sheets together, gzip`).toBeLessThanOrEqual(COMPOSED_SHEET_BUDGET.pageGzip.composed);
        expect(allGz, `${id}/${file}: all CSS, gzip`).toBeLessThanOrEqual(COMPOSED_SHEET_BUDGET.pageGzip.all);
      }
    }
    const kib = (b: number) => (b / KiB).toFixed(1);
    const lines = [`composed CSS per page (minified bytes; gzip per file as served)`, ...rows,
      `worst composed gzip: ${worstComposed.id} ${worstComposed.bytes} B (${kib(worstComposed.bytes)} KiB)`,
      `worst all CSS gzip: ${worstAll.id} ${worstAll.bytes} B (${kib(worstAll.bytes)} KiB)`,
      `worst composed raw: ${worstRaw.id} ${worstRaw.bytes} B (${kib(worstRaw.bytes)} KiB)`];
    console.log(`\n${lines.join("\n")}\n`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
  }, 240_000);
});
