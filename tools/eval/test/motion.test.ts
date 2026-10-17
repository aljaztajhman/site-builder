// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { MOTIONS, MOTION_META } from "@sb/spec";
import { composedIslands, renderPage, sharedBundle } from "@sb/render";
import { LCP_BUDGET_MS, REDUCED_DIFF_MAX, WIDTHS, motionSpec, startHarness, writeReport, type Harness, type MotionRun } from "../src/motion-harness.ts";

/**
 * Every motion preset in a browser at 360 and 1280 px, CPU throttled 4x (src/motion-harness.ts): CLS 0, LCP within 100 ms
 * of the same page with motion off, reduced motion static (no running animation, screenshot equal to the page without
 * the preset), and no island JS beyond 2 KiB gzip. The numbers are written to eval/runs/motion/report.json. No model call.
 */
let harness: Harness;
const runs: MotionRun[] = [];

beforeAll(async () => {
  harness = await startHarness();
}, 300_000);
afterAll(async () => {
  await harness?.close();
  if (runs.length) await writeReport(runs);
});

// SB_MOTION_SLICE="i/n" (CI's test-motion job) measures every n-th preset starting at i; without it, all of them.
const slice = /^(\d+)\/(\d+)$/.exec(process.env.SB_MOTION_SLICE ?? "");
const presets = slice ? MOTIONS.filter((_, i) => i % Number(slice[2]) === Number(slice[1]) - 1) : MOTIONS;

describe("motion presets in a browser", () => {
  for (const preset of presets) {
    for (const width of WIDTHS) {
      it(`${preset} at ${width}px: CLS 0, LCP within ${LCP_BUDGET_MS} ms of motion off, still under reduced motion`, async () => {
        const r = await harness.measure(preset, width);
        runs.push(r);
        console.log(`motion ${preset} ${width}px: CLS ${r.cls}, LCP ${Math.round(r.lcpMs)} ms vs ${Math.round(r.lcpOffMs)} ms off (delta ${Math.round(r.lcpDelta)} ms), animations ${r.animations}, reduced: ${r.reducedRunning} running, ${(r.reducedDiff * 100).toFixed(4)} % pixels differ`);
        expect(r.cls, "CLS").toBe(0);
        expect(r.lcpDelta, "LCP delta").toBeLessThanOrEqual(LCP_BUDGET_MS);
        // sticky-stack is desktop only: on a phone it is an ordinary static section (nothing animates, nothing pins).
        if (preset === "sticky-stack" && width < 1024) expect(r.animations, "static on a phone").toBe(0);
        else expect(r.animations, "the preset animates when motion is allowed").toBeGreaterThan(0);
        expect(r.reducedRunning, "running animations under reduced motion").toBe(0);
        expect(r.reducedDiff, "reduced-motion screenshot vs static").toBeLessThanOrEqual(REDUCED_DIFF_MAX);
      }, 180_000);
    }
  }
});

describe("counter", () => {
  it("counts the plain number once and leaves the phone number alone; the final value is in the text; reduced motion picks up nothing", async () => {
    const on = await harness.counter(false);
    console.log(`counter: picked ${JSON.stringify(on.picked)}, shortly after view ${JSON.stringify(on.mid)}, at the end ${JSON.stringify(on.end)}`);
    // Two showcase sections carry the numeral; the phone number's plate is never picked up.
    expect(on.picked).toEqual(["12", "12"]);
    expect(on.end).toContain("12");
    expect(on.end.join(" ")).toContain("041 555 730");
    const still = await harness.counter(true);
    expect(still.picked).toEqual([]);
    expect(still.end).toEqual(still.mid);
  }, 60_000);
});

describe("motion presets: JS", () => {
  it("a CSS preset ships no island; JS presets together stay within 2 KiB gzip", () => {
    let js = 0;
    for (const preset of MOTIONS) {
      const spec = motionSpec(preset);
      const home = spec.pages.find((p) => p.kind === "home")!;
      const html = renderPage(spec, home);
      const islands = composedIslands(home.sections);
      if (!MOTION_META[preset].js) {
        expect(islands, preset).toEqual([]);
        expect(html, preset).not.toContain("composed/motion.js");
      }
      for (const island of islands) js += gzipSync(sharedBundle().files.get(`js/${island}`) ?? "").length;
    }
    console.log(`motion island JS: ${js} B gzip over all presets`);
    expect(js).toBeLessThanOrEqual(2 * 1024);
  });
});
