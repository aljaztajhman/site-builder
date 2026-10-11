/**
 * The hero bar's AI paintings (HQ sb-studio-quality-first, option hero-bar): one painterly picture per id through the
 * engine's image path (ImageGenerator → fal), with this script's own style line instead of the pipeline's photo style,
 * for a business that has no photos. Hard stop at €0.20 and four calls across runs: every call is booked in
 * eval/runs/hero-bar/ai/cost-log.jsonl and the ledger is what is left.
 *   FAL_KEY in the environment; pnpm tsx tools/eval/src/hero-bar-ai.ts <id> [model]
 * Writes eval/runs/hero-bar/ai/<id>.raw (as made) and <id>.jpg (cropped clear of the painted-in initials), read by hero-bar.ts.
 * `--crop-only` re-crops the .raw without a call.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { FalImageTransport, ImageGenerator, imageCostEur, outputSize } from "@sb/engine";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ALLOWANCE_EUR = 0.2;
const MAX_CALLS = 4;
const outDir = path.join(repoRoot, "eval/runs/hero-bar/ai");
const logFile = path.join(outDir, "cost-log.jsonl");

/** What each painting shows. Atmosphere only (validateSite allows a generated picture only in the opener): never the client's work, team or premises. */
export const PAINTINGS: Record<string, string> = {
  "warm-house":
    "An oil painting of a small whitewashed Slovenian country house on a gentle hill at dusk in deep winter: snow on the roof and the fields, a bare walnut tree, a low vineyard fence. Every window glows with warm golden light; a thin plume of steam rises from a small outdoor heat pump unit beside the house wall. Deep blue evening sky with the last warm light at the horizon. Painted with thick confident brushstrokes and palette-knife texture, rich blues against warm golds, like a contemporary gallery painting.",
};
/** Crops per painting (the model paints initials into a corner): left, top, width, height in the 1536×1024 output. */
const CROP: Record<string, { left: number; top: number; width: number; height: number }> = { "warm-house": { left: 0, top: 0, width: 1536, height: 900 } };

async function save(id: string, raw: Buffer | Uint8Array): Promise<void> {
  const crop = CROP[id];
  const img = crop ? sharp(raw).extract(crop) : sharp(raw);
  await img.jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(outDir, `${id}.jpg`));
}

const STYLE = "Painterly, not a photograph. No people and no part of a person, no text or lettering anywhere, no logos, no signature, no watermark, no borders or frame.";

function ledger(): { eur: number; calls: number } {
  if (!existsSync(logFile)) return { eur: 0, calls: 0 };
  const rows = readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { costEur: number });
  return { eur: rows.reduce((s, r) => s + r.costEur, 0), calls: rows.length };
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id || !PAINTINGS[id]) throw new Error(`usage: hero-bar-ai.ts <${Object.keys(PAINTINGS).join("|")}> [model | --crop-only]`);
  mkdirSync(outDir, { recursive: true });
  // Re-crop the picture already made, without a call.
  if (process.argv[3] === "--crop-only") return save(id, readFileSync(path.join(outDir, `${id}.raw`)));
  const base = loadConfig();
  const modelName = process.argv[3] ?? "flux-2-pro";
  const model = base.imageGen.models[modelName];
  if (!model) throw new Error(`no model ${modelName} in config imageGen.models`);
  const before = ledger();
  const size = outputSize(base, false);
  const estimate = imageCostEur(base, model, size.width, size.height);
  if (before.calls >= MAX_CALLS) throw new Error(`allowance: ${before.calls} calls made, at most ${MAX_CALLS}`);
  if (before.eur + estimate > ALLOWANCE_EUR) throw new Error(`allowance: €${before.eur.toFixed(4)} spent, €${estimate.toFixed(4)} more would pass €${ALLOWANCE_EUR}`);
  const config = {
    ...base,
    promptFixes: { ...base.promptFixes, pictures: false },
    imageGen: { ...base.imageGen, pipeline: { ...base.imageGen.pipeline, model: modelName, style: STYLE } },
    limits: { ...base.limits, dailyModelSpendCapEur: ALLOWANCE_EUR },
  };
  const gen = new ImageGenerator({
    config,
    transport: new FalImageTransport(),
    spentToday: async () => ledger().eur,
    onCall: async (r) => {
      appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), id, model: r.model, stage: r.stage, costEur: r.costEur, ok: r.ok, durationMs: r.durationMs }) + "\n");
    },
  });
  const img = await gen.generate(PAINTINGS[id]!);
  writeFileSync(path.join(outDir, `${id}.raw`), img.data);
  await save(id, img.data);
  console.log(`${id} (${modelName}): ${img.width}×${img.height}, €${img.costEur.toFixed(4)}; total €${ledger().eur.toFixed(4)} of €${ALLOWANCE_EUR}, ${ledger().calls}/${MAX_CALLS} calls`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
