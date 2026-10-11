/**
 * pnpm tsx tools/eval/src/mockup-sheet.ts
 *
 * The mockup spike's contact sheet (docs/plans/mockup-spike.md): top, every AI homepage mockup with its model, € and
 * seconds from eval/runs/mockup-spike/cost-log.jsonl; bottom, the two recreations in the composition language
 * (mockup-recreate.ts) beside their mockups, desktop and phone. Writes docs/design/mockup-spike/sheet.jpg (≤ 2.5 MB).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SPIKE = path.join(REPO_ROOT, "eval/runs/mockup-spike");
const SHEET = path.join(REPO_ROOT, "docs/design/mockup-spike/sheet.jpg");
const MAX_BYTES = 2.5 * 1024 * 1024;

const MODEL: Record<string, string> = {
  "openai/gpt-image-2.5/flare/edit": "GPT Image 2.5",
  "openai/gpt-image-2.5/flare/text-to-image": "GPT Image 2.5",
  "fal-ai/nano-banana-2/edit": "Nano Banana 2",
  "fal-ai/nano-banana-2": "Nano Banana 2",
  "bytedance/seedream/v5/lite/edit": "Seedream 5 Lite",
  "bytedance/seedream/v5/lite/text-to-image": "Seedream 5 Lite",
  "fal-ai/ideogram/v3": "Ideogram 3",
};

interface Row {
  job: string;
  endpoint: string;
  images: number;
  costEur: number;
  seconds: number;
  ok: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const label = (w: number, lines: [string, string?], big = false) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40"><text x="0" y="16" font-family="Segoe UI, sans-serif" font-size="${big ? 17 : 14}" font-weight="700" fill="#111">${esc(lines[0])}</text><text x="0" y="34" font-family="Segoe UI, sans-serif" font-size="12" fill="#444">${esc(lines[1] ?? "")}</text></svg>`,
  );
const heading = (w: number, text: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34"><text x="0" y="24" font-family="Segoe UI, sans-serif" font-size="22" font-weight="800" fill="#111">${esc(text)}</text></svg>`);

async function fit(file: string, w: number, h: number, position: "top" | "centre" = "top"): Promise<Buffer> {
  if (position === "centre") return sharp(file).resize({ width: w, height: h, fit: "contain", background: "#d9dce1" }).png().toBuffer();
  // A tall page: scaled to the box's width, its top as much as fits.
  const scaled = await sharp(file).resize({ width: w }).png().toBuffer();
  const meta = await sharp(scaled).metadata();
  const top = await sharp(scaled).extract({ left: 0, top: 0, width: w, height: Math.min(h, meta.height!) }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#d9dce1" } }).composite([{ input: top, left: 0, top: 0 }]).png().toBuffer();
}

async function main(): Promise<void> {
  const rows = readFileSync(path.join(SPIKE, "cost-log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  const byJob = new Map(rows.filter((r) => r.ok).map((r) => [r.job, r]));
  const PAD = 28;
  const GAP = 16;
  const layers: OverlayOptions[] = [];

  // Row 1: every mockup, 6 to a line; desktops 3:2 in a 380 × 254 box, phones in 120 × 254.
  const order = ["gpt-pekarna", "nano-pekarna", "seedream-pekarna", "ideogram-pekarna", "gpt-tattoo", "nano-tattoo", "seedream-tattoo", "ideogram-tattoo"];
  const tiles: { file: string; job: string; phone: boolean }[] = [];
  for (const job of order) for (const n of [1, 2]) tiles.push({ file: path.join(SPIKE, "mockups", `${job}-${n}.jpg`), job, phone: false });
  for (const job of ["gpt-pekarna-phone", "gpt-tattoo-phone"]) tiles.push({ file: path.join(SPIKE, "mockups", `${job}-1.jpg`), job, phone: true });
  const TW = 380, TH = 254, PW = 120, CAP = 42;
  let x = PAD;
  let y = PAD;
  layers.push({ input: heading(1600, "1 · AI homepage mockups (fal, 2026-10-11): model · € per image · seconds per call"), left: PAD, top: y });
  y += 44;
  const lineW = 6 * (TW + GAP);
  for (const t of tiles.filter((t) => existsSync(t.file))) {
    const w = t.phone ? PW : TW;
    if (x + w > PAD + lineW) {
      x = PAD;
      y += CAP + TH + GAP;
    }
    const r = byJob.get(t.job);
    const model = r ? MODEL[r.endpoint] ?? r.endpoint : "?";
    const per = r ? r.costEur / r.images : 0;
    const biz = t.job.includes("pekarna") ? "pekarna" : "tattoo";
    layers.push({ input: label(w, [t.phone ? `${model} · phone` : model, `${biz} · €${per.toFixed(3)} · ${r ? r.seconds.toFixed(0) : "?"} s`]), left: x, top: y });
    layers.push({ input: await fit(t.file, w, TH, t.phone ? "top" : "centre"), left: x, top: y + CAP });
    x += w + GAP;
  }
  y += CAP + TH + PAD * 2;

  // Row 2: each recreation beside its mockup: mockup desktop, recreation desktop (whole page, top), mockup phone, recreation phone.
  layers.push({ input: heading(1600, "2 · Recreated in the composition language (spec v21 composed sections, facts through slots): mockup | recreation"), left: PAD, top: y });
  y += 44;
  const MH = 560;
  const MW = Math.round((MH * 1536) / 1024 / 1.4);
  const RW = 340, PH = 150;
  x = PAD;
  for (const [biz, mock] of [["pekarna", "gpt-pekarna-1"], ["tattoo", "gpt-tattoo-2"]] as const) {
    const parts: [string, string, number, "top" | "centre"][] = [
      [path.join(SPIKE, "mockups", `${mock}.jpg`), `mockup ${mock}`, MW, "centre"],
      [path.join(SPIKE, "recreate", `${biz}-desk-full.png`), "recreation · 1280 px", RW, "top"],
      [path.join(SPIKE, "mockups", `gpt-${biz}-phone-1.jpg`), "mockup · phone", PH, "top"],
      [path.join(SPIKE, "recreate", `${biz}-phone-full.png`), "recreation · 360 px", PH, "top"],
    ];
    for (const [file, cap, w, pos] of parts) {
      layers.push({ input: label(w, [cap]), left: x, top: y });
      if (existsSync(file)) layers.push({ input: await fit(file, w, MH, pos), left: x, top: y + CAP });
      x += w + GAP;
    }
    x += PAD;
  }
  const width = Math.max(PAD * 2 + lineW, x + PAD);
  const height = y + CAP + MH + PAD;
  const png = await sharp({ create: { width, height, channels: 3, background: "#d9dce1" } }).composite(layers).png().toBuffer();
  await mkdir(path.dirname(SHEET), { recursive: true });
  let q = 84;
  let jpg = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  while (jpg.length > MAX_BYTES && q > 50) jpg = await sharp(png).jpeg({ quality: (q -= 6), mozjpeg: true }).toBuffer();
  await writeFile(SHEET, jpg);
  console.log(`${path.relative(REPO_ROOT, SHEET)}: ${width}×${height}, ${(jpg.length / 1024).toFixed(0)} KB, q${q}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
