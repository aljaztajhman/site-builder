/**
 * Contact sheet of a morph, frame by frame: opens a page in Chromium, starts a switch, pauses every
 * animation as soon as the view transition runs, then steps its clock and screenshots each step. Writes
 * <out>/frame-<ms>.png and <out>/index.html (all frames on one page). Use it to look at your own
 * adaptation before shipping: parts should never stretch, overlap wrongly or jump.
 *
 *   tsx packages/morph/scripts/sheet.ts <url> "<js that starts the switch>" [out] [width]
 *   tsx packages/morph/scripts/sheet.ts http://localhost:3092/examples/ "morphDemo.stop(); morphDemo.show('bikes')" sheet 1280
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const [url, start, out = "morph-sheet", width = "1280"] = process.argv.slice(2);
if (!url || !start) {
  console.error('usage: sheet.ts <url> "<js that starts the switch>" [out] [width]');
  process.exit(1);
}
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.goto(url);
await page.waitForLoadState("networkidle");
await page.evaluate(`void (${start})`);
// The first moment the view transition's animations exist: pause them all at 0.
const total = await page.waitForFunction(
  () => {
    const anims = document.getAnimations().filter((a) => /view-transition/.test((a.effect as KeyframeEffect | null)?.pseudoElement ?? ""));
    if (anims.length < 2) return null;
    for (const a of anims) a.pause();
    return Math.max(...anims.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)));
  },
  undefined,
  { polling: "raf", timeout: 10_000 },
);
const end = (await total.jsonValue()) as number;
const steps = 12;
const shots: string[] = [];
for (let i = 0; i <= steps; i++) {
  const t = Math.round((end * i) / steps);
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) a.currentTime = ms;
  }, t);
  const file = `frame-${String(t).padStart(5, "0")}.png`;
  await page.screenshot({ path: path.join(out, file) });
  shots.push(file);
}
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Morph contact sheet</title><style>body{margin:16px;font:13px system-ui;background:#111;color:#ddd}div{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}img{width:100%;display:block}</style><div>${shots.map((s) => `<figure><img src="${s}"><figcaption>${s}</figcaption></figure>`).join("")}</div>`,
);
await browser.close();
console.log(`${shots.length} frames over ${end} ms in ${out}/`);
