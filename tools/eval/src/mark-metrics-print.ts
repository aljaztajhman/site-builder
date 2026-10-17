/**
 * Prints the ink of every heading face's marked capitals and descenders, measured in Chromium (lib/mark-metrics.ts), as
 * the MARK_INK table of packages/render/src/mark-room.ts. Run after adding a heading face: `pnpm exec tsx tools/eval/src/mark-metrics-print.ts`.
 */
import { chromium } from "playwright";
import { measureMarkInk } from "./lib/mark-metrics.ts";

const browser = await chromium.launch();
try {
  const ink = await measureMarkInk(browser);
  const r2 = (n: number) => Math.ceil(n * 1000) / 1000;
  for (const [file, m] of Object.entries(ink).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  "${file}": { mark: ${r2(m.mark)}, desc: ${r2(m.desc)}, capsDesc: ${r2(m.capsDesc)} },`);
  }
} finally {
  await browser.close();
}
