/**
 * Realistic fixture photos from an image model on fal.ai (development only; fixtures are fiction).
 *
 *   pnpm fixtures:ai-photos compare [--models a,b] [--max-eur 5]
 *     The photos listed under "compare" in photo-prompts.json, once per model in config imageGen.models.
 *     Writes eval/runs/photo-compare/<stamp>/: <model>/<fixture>-NN.jpg, manifest.json, contact-sheet.png.
 *   pnpm fixtures:ai-photos generate --model <name> [--only <fixture id>] [--force] [--max-eur 5]
 *     Every fixture photo into tools/eval/fixtures/<id>/photos/NN.jpg (replacing the SVG stand-ins),
 *     plus tools/eval/fixtures/photo-manifest.json. Photos with a manifest entry are kept unless --force,
 *     or unless someone looked at one and set its entry's "reject" to the reason: then it is regenerated
 *     and the old attempt moves into "rejected" (reason, prompt, €).
 *   pnpm fixtures:ai-photos generate --model <name> --hard [--only <id>] [--max-eur 5]
 *     The same for the hard fixtures (tools/eval/hard): their shot list in tools/eval/hard/photo-prompts.json (the
 *     dark phone photos get its `poorStyle`), photos into tools/eval/hard/<id>/photos/, tools/eval/hard/photo-manifest.json.
 *
 * Needs FAL_KEY. States the € estimate first and stops before starting if it exceeds --max-eur.
 * Every call logs model, seconds and € (from config prices); the manifest records model, prompt and cost.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { loadConfig, repoRoot, type AppConfig } from "@sb/config";
import { FIXTURES_DIR, HARD_DIR, loadFixtures, loadHard } from "./load.ts";
import {
  estimateEur,
  fullPrompt,
  imageCostEur,
  isPortrait,
  loadPhotoPrompts,
  nextManifestEntry,
  photoKey,
  requestBody,
  HARD_PROMPTS_FILE,
  PROMPTS_FILE,
  type ImageGenModelConfig,
  type ManifestEntry,
  type PhotoPrompts,
} from "./photo-prompts.ts";

interface Job {
  key: string;
  subject: string;
  modelName: string;
  model: ImageGenModelConfig;
  out: string;
}

interface Result {
  key: string;
  subject: string;
  model: string;
  endpoint: string;
  prompt: string;
  file: string;
  width: number;
  height: number;
  seconds: number;
  eur: number;
  error?: string;
}

const CONCURRENCY = 4;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function callFal(key: string, endpoint: string, body: Record<string, unknown>): Promise<{ url: string }> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { images?: { url: string }[] };
      const url = json.images?.[0]?.url;
      if (!url) throw new Error(`${endpoint}: response has no image`);
      return { url };
    }
    const text = (await res.text()).slice(0, 300);
    if (res.status >= 500 && attempt < 2) continue;
    throw new Error(`${endpoint}: HTTP ${res.status} ${text}`);
  }
}

async function run(config: AppConfig, falKey: string, jobs: Job[], prompts: PhotoPrompts): Promise<Result[]> {
  const results: Result[] = [];
  let next = 0;
  let spent = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const prompt = fullPrompt(prompts, job.key);
      const t0 = Date.now();
      const base = { key: job.key, subject: job.subject, model: job.modelName, endpoint: job.model.endpoint, prompt, file: job.out };
      try {
        const { url } = await callFal(falKey, job.model.endpoint, requestBody(config, job.model, prompt, isPortrait(job.key)));
        const bytes = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120_000) })).arrayBuffer());
        const meta = await sharp(bytes).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        mkdirSync(path.dirname(job.out), { recursive: true });
        // Re-encode: consistent JPEG, no provider metadata, at most 1600 px on the long edge.
        await sharp(bytes).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toFile(job.out);
        const eur = imageCostEur(config, job.model, width, height);
        spent += eur;
        const seconds = (Date.now() - t0) / 1000;
        results.push({ ...base, width, height, seconds, eur });
        console.log(`image.generate ${job.modelName} ${job.key} ${width}x${height} ${seconds.toFixed(1)} s €${eur.toFixed(3)} (run €${spent.toFixed(2)})`);
      } catch (e) {
        const seconds = (Date.now() - t0) / 1000;
        results.push({ ...base, width: 0, height: 0, seconds, eur: 0, error: (e as Error).message });
        console.error(`image.generate ${job.modelName} ${job.key} FAILED after ${seconds.toFixed(1)} s: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return results.sort((a, b) => a.key.localeCompare(b.key) || a.model.localeCompare(b.model));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One row per photo, one column per model, with € and seconds under each image. */
async function contactSheet(dir: string, results: Result[], models: string[]): Promise<string> {
  const keys = [...new Set(results.map((r) => r.key))];
  const byModel = (m: string) => results.filter((r) => r.model === m && !r.error);
  const head = models
    .map((m) => {
      const rs = byModel(m);
      const eur = rs.reduce((s, r) => s + r.eur, 0);
      const secs = rs.map((r) => r.seconds).sort((a, b) => a - b);
      const median = secs.length ? secs[Math.floor(secs.length / 2)]! : 0;
      return `<th>${esc(m)}<small>${rs.length} images · €${eur.toFixed(2)} · median ${median.toFixed(0)} s</small></th>`;
    })
    .join("");
  const rows = keys
    .map((k) => {
      const subject = results.find((r) => r.key === k)!.subject;
      const cells = models
        .map((m) => {
          const r = results.find((x) => x.key === k && x.model === m);
          if (!r || r.error) return `<td class="err">failed<small>${esc(r?.error ?? "not run")}</small></td>`;
          const rel = path.relative(dir, r.file).split(path.sep).join("/");
          return `<td><img src="${rel}"><small>€${r.eur.toFixed(3)} · ${r.seconds.toFixed(0)} s · ${r.width}×${r.height}</small></td>`;
        })
        .join("");
      return `<tr><th class="k">${esc(k)}<small>${esc(subject)}</small></th>${cells}</tr>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:24px;font:14px/1.35 system-ui,sans-serif;color:#1b1b1b;background:#fff}
    table{border-collapse:collapse}th,td{padding:8px;vertical-align:top;text-align:left}
    thead th{font-size:16px}small{display:block;font-weight:400;color:#555;font-size:12px;margin-top:4px}
    th.k{width:180px}td img{display:block;max-width:360px;max-height:360px}td.err{width:360px;color:#a00}
    tr+tr{border-top:1px solid #ddd}
  </style><table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  const htmlFile = path.join(dir, "contact-sheet.html");
  writeFileSync(htmlFile, html);
  const png = path.join(dir, "contact-sheet.png");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.screenshot({ path: png, fullPage: true });
  } finally {
    await browser.close();
  }
  return png;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode !== "compare" && mode !== "generate") {
    console.error("usage: fixtures:ai-photos compare [--models a,b] [--max-eur N] | generate --model <name> [--hard] [--only <id>] [--force] [--max-eur N]");
    process.exit(2);
  }
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("FAL_KEY is not set. Create a key at fal.ai and set it as an environment variable (docs/research/image-generation.html).");
    process.exit(2);
  }
  // --hard: the hard fixtures' shot list (tools/eval/hard/photo-prompts.json) into tools/eval/hard/<id>/photos/.
  const hard = args.includes("--hard");
  manifestFile = path.join(hard ? HARD_DIR : FIXTURES_DIR, "photo-manifest.json");
  const config = loadConfig();
  const prompts = loadPhotoPrompts(hard ? HARD_PROMPTS_FILE : PROMPTS_FILE);
  const maxEur = Number(arg(args, "--max-eur") ?? 5);
  const subjects = new Map((hard ? loadHard() : loadFixtures()).flatMap((f) => f.photos.map((p) => [photoKey(f.id, p.file), { subject: p.subject, path: p.path }] as const)));

  const pickModel = (name: string): ImageGenModelConfig => {
    const m = config.imageGen.models[name];
    if (!m) throw new Error(`Unknown model "${name}"; configured: ${Object.keys(config.imageGen.models).join(", ")}`);
    return m;
  };

  let jobs: Job[];
  let outDir: string;
  if (mode === "compare") {
    const names = arg(args, "--models")?.split(",") ?? Object.keys(config.imageGen.models);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    outDir = path.join(repoRoot, "eval/runs/photo-compare", stamp);
    jobs = names.flatMap((name) =>
      prompts.compare.map((key) => {
        const s = subjects.get(key);
        if (!s) throw new Error(`compare lists ${key}, which is not a fixture photo`);
        return { key, subject: s.subject, modelName: name, model: pickModel(name), out: path.join(outDir, name, `${key.replace("/", "-")}.jpg`) };
      }),
    );
  } else {
    const name = arg(args, "--model");
    if (!name) throw new Error("generate needs --model <name>");
    const model = pickModel(name);
    const only = arg(args, "--only");
    const force = args.includes("--force");
    outDir = hard ? HARD_DIR : FIXTURES_DIR;
    const manifest = readManifest();
    jobs = [...subjects.entries()]
      .filter(([key]) => !only || key.startsWith(`${only}/`))
      // Keep photos this script already made unless --force or marked `reject`; SVG stand-ins are always replaced.
      .filter(([key, s]) => force || !(existsSync(s.path) && manifest[key]) || !!manifest[key]?.reject)
      .map(([key, s]) => ({ key, subject: s.subject, modelName: name, model, out: s.path }));
  }

  const estimate = jobs.reduce((sum, j) => sum + estimateEur(config, j.model, isPortrait(j.key)), 0);
  console.log(`fixtures:ai-photos ${mode}: ${jobs.length} images, estimated €${estimate.toFixed(2)} (limit €${maxEur.toFixed(2)})`);
  if (estimate > maxEur) {
    console.error(`Estimate exceeds --max-eur ${maxEur}; nothing generated.`);
    process.exit(1);
  }
  if (jobs.length === 0) return;

  const results = await run(config, falKey, jobs, prompts);
  const spent = results.reduce((s, r) => s + r.eur, 0);
  const failed = results.filter((r) => r.error).length;

  if (mode === "compare") {
    writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(results, null, 2));
    const names = [...new Set(jobs.map((j) => j.modelName))];
    const png = await contactSheet(outDir, results, names);
    console.log(`\nWrote ${png}`);
  } else {
    const manifest = readManifest();
    for (const r of results.filter((x) => !x.error)) {
      manifest[r.key] = nextManifestEntry(manifest[r.key], { model: r.model, endpoint: r.endpoint, prompt: r.prompt, width: r.width, height: r.height, eur: Number(r.eur.toFixed(4)), createdAt: new Date().toISOString() });
    }
    writeFileSync(manifestFile, JSON.stringify(sortKeys(manifest), null, 2) + "\n");
    console.log(`\nWrote ${results.length - failed} photos and ${manifestFile}`);
  }
  console.log(`Spend €${spent.toFixed(2)} (config prices), ${failed} failed.`);
  if (failed) process.exit(1);
}

/** Fixtures: tools/eval/fixtures/photo-manifest.json; --hard: tools/eval/hard/photo-manifest.json. */
let manifestFile = path.join(FIXTURES_DIR, "photo-manifest.json");

function readManifest(): Record<string, ManifestEntry> {
  return existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, ManifestEntry>) : {};
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

await main();
