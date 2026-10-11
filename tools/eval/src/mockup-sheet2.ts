/**
 * pnpm tsx tools/eval/src/mockup-sheet2.ts
 *
 * Mockup spike 2's contact sheet (docs/plans/mockup-spike.md): one row per business with the art director's directions
 * as GPT Image 2.5 mockups (name, one-line idea, € and seconds from the ledger), then the rebuild of the best one in the
 * composition language at 1280 and 360 px (mockup-recreate2.ts), and the phone mockup where one was made. Writes
 * docs/design/mockup-spike/sheet-2.jpg (≤ 2.5 MB).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SPIKE = path.join(REPO_ROOT, "eval/runs/mockup-spike");
const SHEET = path.join(REPO_ROOT, "docs/design/mockup-spike/sheet-2.jpg");
const MAX_BYTES = 2.5 * 1024 * 1024;

/** The rebuilt direction per business (judged in docs/plans/mockup-spike.md). */
const BEST: Record<string, "a" | "b"> = { pekarna: "b", tattoo: "a", florist: "a" };

interface Row {
  job: string;
  costEur: number;
  images: number;
  seconds: number;
  ok: boolean;
  provider?: string;
  spike?: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    if ((line + " " + w).trim().length > n) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}
const caption = (w: number, title: string, lines: string[]) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="76"><text x="0" y="16" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700" fill="#111">${esc(title)}</text>${lines
      .slice(0, 3)
      .map((l, i) => `<text x="0" y="${34 + i * 15}" font-family="Segoe UI, sans-serif" font-size="12" fill="#333">${esc(l)}</text>`)
      .join("")}</svg>`,
  );
const heading = (w: number, text: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34"><text x="0" y="24" font-family="Segoe UI, sans-serif" font-size="22" font-weight="800" fill="#111">${esc(text)}</text></svg>`);

async function fitContain(file: string, w: number, h: number): Promise<Buffer> {
  return sharp(file).resize({ width: w, height: h, fit: "contain", background: "#d9dce1" }).png().toBuffer();
}
/** A tall page: scaled to the box's width, its top as much as fits. */
async function fitTop(file: string, w: number, h: number): Promise<Buffer> {
  const scaled = await sharp(file).resize({ width: w }).png().toBuffer();
  const meta = await sharp(scaled).metadata();
  const top = await sharp(scaled).extract({ left: 0, top: 0, width: w, height: Math.min(h, meta.height!) }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#d9dce1" } }).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer();
}

async function main(): Promise<void> {
  const rows = readFileSync(path.join(SPIKE, "cost-log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  const byJob = new Map(rows.filter((r) => r.spike === 2 && r.ok).map((r) => [r.job, r]));
  const PAD = 28, GAP = 16, CAP = 80;
  const MW = 560, MH = Math.round((MW * 1024) / 1536);
  const RW = 300, RH = 520, PW = 130;
  const layers: OverlayOptions[] = [];
  let y = PAD;
  const fal = rows.filter((r) => r.spike === 2 && r.provider !== "anthropic").reduce((s, r) => s + r.costEur, 0);
  const anth = rows.filter((r) => r.spike === 2 && r.provider === "anthropic").reduce((s, r) => s + r.costEur, 0);
  layers.push({ input: heading(1700, `Spike 2 · Opus art director → GPT Image 2.5 → rebuilt in the composition language (Anthropic €${anth.toFixed(2)}, fal €${fal.toFixed(2)})`), left: PAD, top: y });
  y += 46;
  let width = 1700 + PAD * 2;
  for (const biz of ["pekarna", "tattoo", "florist"] as const) {
    const dir = JSON.parse(readFileSync(path.join(SPIKE, "director", `${biz}.json`), "utf8")) as { directions: { name: string; idea: string }[] };
    const director = byJob.get(`director-${biz}`);
    let x = PAD;
    for (const [i, letter] of (["a", "b"] as const).entries()) {
      const d = dir.directions[i]!;
      const r = byJob.get(`d2-${biz}-${letter}`);
      const best = BEST[biz] === letter ? " (rebuilt)" : "";
      layers.push({ input: caption(MW, `${biz} ${letter.toUpperCase()} · ${d.name}${best} · €${r ? r.costEur.toFixed(3) : "?"} · ${r ? r.seconds.toFixed(0) : "?"} s`, wrap(d.idea, 92)), left: x, top: y });
      const f = path.join(SPIKE, "mockups", `d2-${biz}-${letter}-1.jpg`);
      if (existsSync(f)) layers.push({ input: await fitContain(f, MW, MH), left: x, top: y + CAP });
      x += MW + GAP;
    }
    x += GAP;
    const parts: [string, string, number][] = [
      [path.join(SPIKE, "recreate2", `${biz}-desk-full.png`), "rebuild · 1280 px", RW],
      [path.join(SPIKE, "recreate2", `${biz}-phone-full.png`), "rebuild · 360 px", PW],
    ];
    const phoneMock = path.join(SPIKE, "mockups", `d2-${biz}-${BEST[biz]}-phone-1.jpg`);
    if (existsSync(phoneMock)) parts.push([phoneMock, "mockup · phone", PW]);
    for (const [file, cap, w] of parts) {
      layers.push({ input: caption(w + 60, cap, cap.startsWith("rebuild · 1280") && director ? [`director €${director.costEur.toFixed(3)}`] : []), left: x, top: y });
      if (existsSync(file)) layers.push({ input: await fitTop(file, w, RH), left: x, top: y + CAP });
      x += w + GAP;
    }
    width = Math.max(width, x + PAD);
    y += CAP + Math.max(MH, RH) + PAD;
  }
  const png = await sharp({ create: { width, height: y, channels: 3, background: "#d9dce1" } }).composite(layers).png().toBuffer();
  await mkdir(path.dirname(SHEET), { recursive: true });
  let q = 84;
  let jpg = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  while (jpg.length > MAX_BYTES && q > 50) jpg = await sharp(png).jpeg({ quality: (q -= 6), mozjpeg: true }).toBuffer();
  await writeFile(SHEET, jpg);
  console.log(`${path.relative(REPO_ROOT, SHEET)}: ${width}×${y}, ${(jpg.length / 1024).toFixed(0)} KB, q${q}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
