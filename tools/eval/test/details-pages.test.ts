// The pure parts of pnpm details-pages (tools/eval/src/details-pages.ts): the two arms and the run-dir layout
// that `pnpm outside-review --run-dir <out>/off` and `<out>/on` read.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { SiteSpec } from "@sb/spec";
import { ARMS, RUN_DIR_FILES, manifestOf, planArms, shotPaths } from "../src/details-pages.ts";
import { pairRows } from "../src/details-sheet.ts";
import { loadRunDirItems } from "../src/outside-review.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (id: string) => JSON.parse(readFileSync(path.join(here, "../golden", `${id}.json`), "utf8")) as SiteSpec;
const pages = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"].map((id) => ({ id, business: id, trade: id.split("-")[0]!, spec: golden(id) }));

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("planArms", () => {
  const plans = planArms(pages);

  it("leaves the off arm exactly today's spec", () => {
    for (const [i, p] of plans.entries()) expect(p.off).toEqual(pages[i]!.spec);
  });

  it("changes only the design on the on arm, and sets no structure preset", () => {
    for (const [i, p] of plans.entries()) {
      const before = pages[i]!.spec;
      expect(p.on.design).not.toEqual(before.design);
      expect({ ...p.on, design: before.design }).toEqual(before);
      expect(JSON.stringify(p.on)).not.toContain("composition/hero/");
    }
  });

  it("assigns the voices over the whole set, so --only renders what a full run does", () => {
    const one = planArms(pages, ["avtoservis-mrak"]);
    expect(one.map((p) => p.id)).toEqual(["avtoservis-mrak"]);
    expect(one[0]!.voice).toBe(plans.find((p) => p.id === "avtoservis-mrak")!.voice);
  });
});

describe("run-dir layout", () => {
  it("writes the four screenshot names outside-review reads, per arm and page", () => {
    expect(Object.values(RUN_DIR_FILES).sort()).toEqual(["home-1280-first.png", "home-1280.png", "home-360-first.png", "home-360.png"]);
    expect(shotPaths("/o", "on", "x").desktopFirst).toBe(path.join("/o", "on", "x", "home-1280-first.png"));
  });

  it("is read by loadRunDirItems for both arms, and by details-sheet's manifest", () => {
    const out = mkdtempSync(path.join(tmpdir(), "details-pages-"));
    dirs.push(out);
    const plans = planArms(pages);
    for (const arm of ARMS) {
      for (const p of plans) {
        const shots = shotPaths(out, arm, p.id);
        mkdirSync(path.dirname(shots.mobile), { recursive: true });
        for (const f of Object.values(shots)) writeFileSync(f, "png");
      }
      writeFileSync(path.join(out, arm, "manifest.json"), JSON.stringify(manifestOf(plans, arm)));
      const items = loadRunDirItems(path.join(out, arm));
      expect(items.map((i) => i.id)).toEqual(plans.map((p) => p.id).sort());
      for (const i of items) expect(Object.values(i.files).every((f) => f.startsWith(path.join(out, arm, i.id)))).toBe(true);
    }
    const m = (arm: string) => (JSON.parse(readFileSync(path.join(out, arm, "manifest.json"), "utf8")) as ReturnType<typeof manifestOf>).map((e) => ({ ...e, desk: path.join(out, arm, e.desk), phone: path.join(out, arm, e.phone) }));
    expect(pairRows(m("off"), m("on")).pairs).toHaveLength(plans.length);
    expect(m("on")[0]!.voice).toBe(plans[0]!.voice);
    expect(m("off")[0]!.voice).toBeUndefined();
  });
});
