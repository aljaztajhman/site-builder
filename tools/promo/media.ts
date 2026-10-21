/**
 * tsx tools/promo/media.ts <jobs.json> [--max-eur 2] [--only <id prefix>] [--force <id>]
 *
 * Generated media for a promo cut (docs/plans/promo-video.md): keyframes (image edit with a reference, so one
 * person stays the same across shots), clips (image to video from a keyframe), voice-over lines and music, through
 * fal's queue API. Endpoints and prices: tools/promo/models.json. Outputs go to the jobs file's `out` folder
 * (under the repo root, gitignored) as <id>.jpg / .mp4 / .mp3, and every paid job appends a row to costs.json.
 *
 * Money rules: the € estimate of the jobs still to run is printed first and the run stops before any call if it
 * exceeds --max-eur. A job whose output file exists is never run again (a rerun never re-pays) unless --force <id>.
 * Needs FAL_KEY.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, repoRoot } from "@sb/config";

type Kind = "edit" | "i2v" | "i2vDraft" | "tts" | "music" | "sfx";

export interface Job {
  id: string;
  kind: Kind;
  prompt?: string;
  /** edit: reference images (repo-relative paths or ids of earlier edit jobs). */
  images?: string[];
  /** edit: output aspect ratio, default 9:16. */
  aspect?: string;
  /** i2v: the first frame (repo-relative path or id of an earlier edit job). */
  image?: string;
  /** i2v: seconds. */
  duration?: number;
  /** tts: the line; voice: ElevenLabs voice name. */
  text?: string;
  voice?: string;
  /** music and sfx: length in seconds. */
  seconds?: number;
}

export interface JobsFile {
  out: string;
  jobs: Job[];
}

interface Model {
  endpoint: string;
  usdPerImage?: number;
  usdPerSecond?: number;
  extraSeconds?: number;
  usdPer1000Chars?: number;
  usdPerAudio?: number;
  params: Record<string, unknown>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODELS = JSON.parse(readFileSync(path.join(HERE, "models.json"), "utf8")) as Record<Kind, Model>;

export function extension(kind: Kind): string {
  // Stable Audio answers with PCM WAV, ElevenLabs with MP3.
  return kind === "edit" ? "jpg" : kind === "tts" || kind === "sfx" ? "mp3" : kind === "music" ? "wav" : "mp4";
}

/** USD for one job at the model's price; i2v includes the possible extra length. */
export function estimateUsd(job: Job, models = MODELS): number {
  const m = models[job.kind];
  if (job.kind === "edit") return m.usdPerImage ?? 0;
  if (job.kind === "i2v" || job.kind === "i2vDraft") return (m.usdPerSecond ?? 0) * ((job.duration ?? 5) + (m.extraSeconds ?? 0));
  if (job.kind === "tts") return ((m.usdPer1000Chars ?? 0) * (job.text ?? "").length) / 1000;
  if (job.kind === "sfx") return (m.usdPerSecond ?? 0) * (job.seconds ?? 5);
  return m.usdPerAudio ?? 0;
}

/** Jobs in run order: edits before the i2v jobs that start from them; each wave can run in parallel. */
export function waves(jobs: Job[]): Job[][] {
  const ids = new Set(jobs.map((j) => j.id));
  const dependsOn = (j: Job) => [...(j.images ?? []), ...(j.image ? [j.image] : [])].filter((r) => ids.has(r));
  const done = new Set<string>();
  const result: Job[][] = [];
  let left = [...jobs];
  while (left.length) {
    const wave = left.filter((j) => dependsOn(j).every((d) => done.has(d)));
    if (!wave.length) throw new Error(`Circular or missing references among: ${left.map((j) => j.id).join(", ")}`);
    wave.forEach((j) => done.add(j.id));
    result.push(wave);
    left = left.filter((j) => !done.has(j.id));
  }
  return result;
}

function dataUri(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

/** The request body for fal; `resolve` turns a reference (path or job id) into a local file. */
export function requestBody(job: Job, resolve: (ref: string) => string, models = MODELS): Record<string, unknown> {
  const m = models[job.kind];
  switch (job.kind) {
    case "edit":
      return { ...m.params, prompt: job.prompt, image_urls: (job.images ?? []).map((r) => dataUri(resolve(r))), aspect_ratio: job.aspect ?? "9:16" };
    case "i2v":
    case "i2vDraft":
      return { ...m.params, prompt: job.prompt, image_url: dataUri(resolve(job.image ?? "")), duration: job.duration ?? 5 };
    case "tts":
      return { ...m.params, text: job.text, ...(job.voice ? { voice: job.voice } : {}) };
    case "music":
      return { ...m.params, prompt: job.prompt, seconds_total: job.seconds ?? 30 };
    case "sfx":
      return { ...m.params, text: job.prompt, duration_seconds: job.seconds ?? 5 };
  }
}

function outputUrl(kind: Kind, result: Record<string, unknown>): string | undefined {
  if (kind === "edit") return (result.images as { url: string }[] | undefined)?.[0]?.url;
  if (kind === "i2v" || kind === "i2vDraft") return (result.video as { url: string } | undefined)?.url;
  return (result.audio as { url: string } | undefined)?.url;
}

const POLL_MS = 5_000;
const MAX_WAIT_MS = 15 * 60_000;

async function runOnFal(key: string, endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const sub = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  if (!sub.ok) throw new Error(`${endpoint}: submit HTTP ${sub.status} ${(await sub.text()).slice(0, 400)}`);
  const { status_url, response_url } = (await sub.json()) as { status_url: string; response_url: string };
  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`${endpoint}: not done after ${MAX_WAIT_MS / 60_000} min (request may still be billed)`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await fetch(status_url, { headers, signal: AbortSignal.timeout(60_000) });
    if (!st.ok) continue;
    const { status } = (await st.json()) as { status: string };
    if (status === "COMPLETED") break;
  }
  const res = await fetch(response_url, { headers, signal: AbortSignal.timeout(60_000) });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${endpoint}: result HTTP ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file) throw new Error("usage: tsx tools/promo/media.ts <jobs.json> [--max-eur N] [--only <prefix>] [--force <id>]");
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set.");
  const { eurPerUsd } = loadConfig();
  const spec = JSON.parse(readFileSync(file, "utf8")) as JobsFile;
  const outDir = path.resolve(repoRoot, spec.out);
  mkdirSync(outDir, { recursive: true });
  const only = arg(args, "--only") ?? "";
  const force = arg(args, "--force");
  const maxEur = Number(arg(args, "--max-eur") ?? 2);
  if (!Number.isFinite(maxEur) || maxEur <= 0) throw new Error(`--max-eur must be a number above 0 with a decimal point (got "${arg(args, "--max-eur")}")`);
  const outFile = (j: Job) => path.join(outDir, `${j.id}.${extension(j.kind)}`);
  const byId = new Map(spec.jobs.map((j) => [j.id, j]));
  const resolve = (ref: string) => (byId.has(ref) ? outFile(byId.get(ref)!) : path.resolve(repoRoot, ref));

  const todo = spec.jobs.filter((j) => j.id.startsWith(only) && (j.id === force || !existsSync(outFile(j))));
  const estimate = todo.reduce((s, j) => s + estimateUsd(j), 0) * eurPerUsd;
  console.log(`promo media: ${todo.length} of ${spec.jobs.length} jobs to run, estimated €${estimate.toFixed(2)} (limit €${maxEur.toFixed(2)}) → ${outDir}`);
  if (estimate > maxEur) {
    console.error(`Estimate exceeds --max-eur ${maxEur}; nothing generated.`);
    process.exit(1);
  }
  const costs = path.join(outDir, "costs.jsonl");
  let spent = 0;
  let failed = 0;
  for (const wave of waves(todo)) {
    await Promise.all(
      wave.map(async (j) => {
        const t0 = Date.now();
        const m = MODELS[j.kind];
        let submitted = false;
        try {
          for (const ref of [...(j.images ?? []), ...(j.image ? [j.image] : [])]) if (!existsSync(resolve(ref))) throw new Error(`missing input ${ref}`);
          const body = requestBody(j, resolve);
          submitted = true;
          const result = await runOnFal(key, m.endpoint, body);
          const url = outputUrl(j.kind, result);
          if (!url) throw new Error(`no output URL in ${JSON.stringify(result).slice(0, 300)}`);
          const got = await fetch(url, { signal: AbortSignal.timeout(180_000) });
          if (!got.ok) throw new Error(`download HTTP ${got.status}`);
          const bytes = Buffer.from(await got.arrayBuffer());
          writeFileSync(outFile(j), bytes);
          const eur = estimateUsd(j) * eurPerUsd;
          spent += eur;
          const seconds = (Date.now() - t0) / 1000;
          appendFileSync(costs, JSON.stringify({ at: new Date().toISOString(), id: j.id, kind: j.kind, endpoint: m.endpoint, eur: Number(eur.toFixed(4)), seconds, bytes: bytes.length, expanded_prompt: result.expanded_prompt ?? null }) + "\n");
          console.log(`${j.kind} ${j.id} ok ${seconds.toFixed(0)} s €${eur.toFixed(3)} (run €${spent.toFixed(2)})`);
        } catch (e) {
          failed++;
          if (submitted) {
            // Sent to fal: it may have run and billed. Book the estimate so the month's spend isn't understated.
            const eur = estimateUsd(j) * eurPerUsd;
            spent += eur;
            appendFileSync(costs, JSON.stringify({ at: new Date().toISOString(), id: j.id, kind: j.kind, endpoint: m.endpoint, eur: Number(eur.toFixed(4)), status: "failed-after-submit", error: (e as Error).message.slice(0, 300) }) + "\n");
          }
          console.error(`${j.kind} ${j.id} FAILED after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${(e as Error).message}`);
        }
      }),
    );
  }
  console.log(`\nSpend €${spent.toFixed(2)} (config prices; i2v at the requested length plus ${MODELS.i2v.extraSeconds} s; failed jobs sent to fal booked at their estimate), ${failed} failed.`);
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
