import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPOSED_SHEETS, composedSheets } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { KITCHEN_SINK_FILE } from "../src/kitchen-sink.ts";

/**
 * Per-page composed CSS weight (docs/plans/studio-phase1-design.md §3.4.8): for the kitchen-sink pages and the home
 * pages of m, s and j, the composed sheets each page links and their minified bytes, printed as a table. Budgets: core
 * at most 16 KiB, every v2 region sheet at most 12 KiB, and a page's composed sheets together at most 40 KiB (§3.4.8:
 * a page using every v20 feature plus its vocabulary families). The numbers are the point; the budgets only fail on a
 * real overrun.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const KiB = 1024;
const load = async (file: string) => migrateSpec(JSON.parse(await readFile(file, "utf8"))) as SiteSpec;

describe("composed CSS weight per page", () => {
  it("prints the sheets each page links and their bytes, within the budgets", async () => {
    const rows: string[] = [];
    const specs: [string, SiteSpec][] = [["kitchen-sink", await load(KITCHEN_SINK_FILE)], ...(await Promise.all(["m", "s", "j"].map(async (id) => [id, await load(path.join(here, `../composed/${id}.json`))] as [string, SiteSpec])))];
    for (const [id, spec] of specs) {
      for (const page of spec.pages) {
        const keys = composedSheets(page.sections);
        if (keys.length === 0) continue;
        const sizes = keys.map((k) => ({ k, bytes: Buffer.byteLength(COMPOSED_SHEETS[k]().css) }));
        const total = sizes.reduce((n, s) => n + s.bytes, 0);
        rows.push(`${`${id}/${page.id}`.padEnd(26)} ${sizes.map((s) => `${s.k} ${s.bytes}`).join(" + ").padEnd(64)} = ${total} B (${(total / KiB).toFixed(1)} KiB)`);
        for (const s of sizes) expect(s.bytes, `${id}/${page.id}: ${s.k}`).toBeLessThanOrEqual((s.k === "core" ? 16 : 12) * KiB);
        expect(total, `${id}/${page.id}: composed sheets together`).toBeLessThanOrEqual(40 * KiB);
      }
    }
    console.log(`\ncomposed CSS per page (minified bytes)\n${rows.join("\n")}\n`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});
