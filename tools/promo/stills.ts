/**
 * pnpm promo:stills [--model <name>] [--only <shot id prefix>] [--max-eur 1] [--out <dir>]
 *
 * Storyboard stills for the promo video (docs/plans/promo-video.md, step 2): every shot in storyboard.json,
 * `variants` times, through fal's image model from config imageGen.models (default nano-banana-2), portrait.
 * Writes <out>/<shot>-<n>.jpg, costs.json (one row per image, € from config prices) and contact-sheet.html + .png.
 * Default out: eval/runs/promo/<stamp>/ (gitignored). States the € estimate first and stops before starting if it
 * exceeds --max-eur. Needs FAL_KEY.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { loadConfig, repoRoot, type AppConfig } from "@sb/config";
import { FalImageTransport, imageCostEur, outputSize, requestBody, type ImageGenModelConfig, type ImageTransport } from "@sb/engine";

export interface Shot {
  id: string;
  concept: number;
  subject: string;
  prompt: string;
  variants?: number;
}

export interface Storyboard {
  style: string;
  shots: Shot[];
}

export interface Job {
  file: string;
  shot: Shot;
  prompt: string;
}

export interface Row {
  file: string;
  shot: string;
  concept: number;
  subject: string;
  model: string;
  prompt: string;
  width: number;
  height: number;
  seconds: number;
  eur: number;
  error?: string;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STORYBOARD_FILE = path.join(HERE, "storyboard.json");

export function loadStoryboard(file = STORYBOARD_FILE): Storyboard {
  return JSON.parse(readFileSync(file, "utf8")) as Storyboard;
}

/** One job per variant of every shot whose id starts with `only` (all when empty); the prompt is the shot's plus the style. */
export function planJobs(board: Storyboard, only = ""): Job[] {
  return board.shots
    .filter((s) => s.id.startsWith(only))
    .flatMap((shot) => Array.from({ length: Math.max(1, shot.variants ?? 1) }, (_, i) => ({ file: `${shot.id}-${i + 1}.jpg`, shot, prompt: `${shot.prompt} ${board.style}` })));
}

/** The run's € before it starts: every image at the portrait output size and the model's config price. */
export function estimateEur(config: AppConfig, model: ImageGenModelConfig, jobs: Job[]): number {
  const { width, height } = outputSize(config, true);
  return jobs.length * imageCostEur(config, model, width, height);
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function generate(config: AppConfig, modelName: string, model: ImageGenModelConfig, transport: ImageTransport, jobs: Job[], outDir: string): Promise<Row[]> {
  const rows: Row[] = [];
  let next = 0;
  let spent = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const out = path.join(outDir, job.file);
      const base = { file: job.file, shot: job.shot.id, concept: job.shot.concept, subject: job.shot.subject, model: modelName, prompt: job.prompt };
      const t0 = Date.now();
      try {
        const bytes = await transport.generate(model, requestBody(config, model, job.prompt, true));
        const meta = await sharp(bytes).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        await sharp(bytes).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
        const eur = imageCostEur(config, model, width, height);
        spent += eur;
        const seconds = (Date.now() - t0) / 1000;
        rows.push({ ...base, width, height, seconds, eur });
        console.log(`image.generate ${modelName} ${job.file} ${width}x${height} ${seconds.toFixed(1)} s €${eur.toFixed(3)} (run €${spent.toFixed(2)})`);
      } catch (e) {
        const seconds = (Date.now() - t0) / 1000;
        rows.push({ ...base, width: 0, height: 0, seconds, eur: 0, error: (e as Error).message });
        console.error(`image.generate ${modelName} ${job.file} FAILED after ${seconds.toFixed(1)} s: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The stills in storyboard order, the shot's subject under each, € and seconds small. */
export function contactSheetHtml(rows: Row[]): string {
  const cells = rows
    .map((r) =>
      r.error
        ? `<figure class="err"><div>failed</div><figcaption>${esc(r.shot)}<small>${esc(r.error)}</small></figcaption></figure>`
        : `<figure><img src="${esc(r.file)}" alt=""><figcaption><b>${esc(r.shot)}</b> ${esc(r.subject)}<small>€${r.eur.toFixed(3)} · ${r.seconds.toFixed(0)} s · ${r.width}×${r.height}</small></figcaption></figure>`,
    )
    .join("");
  const total = rows.reduce((s, r) => s + r.eur, 0);
  return `<!doctype html><meta charset="utf-8"><title>Promo storyboard</title><style>
    body{margin:24px;font:14px/1.35 system-ui,sans-serif;color:#1b1b1b;background:#fff}
    h1{font-size:18px;margin:0 0 16px}h1 small{font-weight:400;color:#555;margin-left:8px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
    figure{margin:0}img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;background:#eee}
    figcaption{margin-top:6px}small{display:block;color:#555;font-size:12px;margin-top:2px}
    .err div{aspect-ratio:2/3;display:grid;place-items:center;background:#fee;color:#a00}
  </style><h1>Promo storyboard<small>${rows.filter((r) => !r.error).length} stills · €${total.toFixed(2)}</small></h1><div class="grid">${cells}</div>`;
}

async function main() {
  const args = process.argv.slice(2);
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("FAL_KEY is not set.");
    process.exit(2);
  }
  const config = loadConfig();
  const modelName = arg(args, "--model") ?? "nano-banana-2";
  const model = config.imageGen.models[modelName];
  if (!model) throw new Error(`Unknown model "${modelName}"; configured: ${Object.keys(config.imageGen.models).join(", ")}`);
  const maxEur = Number(arg(args, "--max-eur") ?? 1);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.resolve(arg(args, "--out") ?? path.join(repoRoot, "eval/runs/promo", stamp));
  const jobs = planJobs(loadStoryboard(), arg(args, "--only") ?? "");
  const estimate = estimateEur(config, model, jobs);
  console.log(`promo:stills ${modelName}: ${jobs.length} images, estimated €${estimate.toFixed(2)} (limit €${maxEur.toFixed(2)}) → ${outDir}`);
  if (estimate > maxEur) {
    console.error(`Estimate exceeds --max-eur ${maxEur}; nothing generated.`);
    process.exit(1);
  }
  if (jobs.length === 0) return;
  mkdirSync(outDir, { recursive: true });
  const rows = await generate(config, modelName, model, new FalImageTransport(falKey), jobs, outDir);
  writeFileSync(path.join(outDir, "costs.json"), JSON.stringify(rows, null, 2) + "\n");
  const htmlFile = path.join(outDir, "contact-sheet.html");
  writeFileSync(htmlFile, contactSheetHtml(rows));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.screenshot({ path: path.join(outDir, "contact-sheet.png"), fullPage: true });
  } finally {
    await browser.close();
  }
  const spent = rows.reduce((s, r) => s + r.eur, 0);
  const failed = rows.filter((r) => r.error).length;
  console.log(`\nWrote ${rows.length - failed} stills to ${outDir}. Spend €${spent.toFixed(2)} (config prices), ${failed} failed.`);
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
