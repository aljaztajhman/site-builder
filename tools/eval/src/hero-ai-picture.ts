/**
 * Hero style pilot 3 (HQ it-studio-drawing-pilot): ONE AI-made painterly bakery still life through the engine's image path
 * (ImageGenerator → fal), with this script's own style line instead of the pipeline's photo style. Hard stop at €0.30
 * across runs: every call is booked in eval/runs/hero-styles/ai/cost-log.jsonl and the ledger's cap is what is left.
 *   FAL_KEY in the environment; pnpm tsx tools/eval/src/hero-ai-picture.ts [model]
 * Then the picture is treated in the warm-craft palette (a gradient map from the text colour through a darkened primary to the
 * paper) for the hero: eval/runs/hero-styles/ai/treated.jpg.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { FalImageTransport, ImageGenerator, imageCostEur, outputSize } from "@sb/engine";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ALLOWANCE_EUR = 0.3;
/** The still life without the model's painted-in initials at the bottom right (x ≈ 1390, y ≈ 880 of 1536×1024). */
const CROP = { left: 140, top: 150, width: 1220, height: 813 };
const outDir = path.join(repoRoot, "eval/runs/hero-styles/ai");
const logFile = path.join(outDir, "cost-log.jsonl");

const PROMPT =
  "A still life painting of a round rustic sourdough loaf with one deep curved score and a dusting of flour, beside it a rolled walnut potica cut open to show its dark spiral of filling, on a coarse linen cloth on an old wooden table. Soft early-morning window light from the left, deep warm shadows on the right, plain dark wall behind. Painted in oils with visible confident brushwork and a little palette-knife texture, like a small gallery painting.";
const STYLE = "Painterly, not a photograph. No people and no part of a person, no text or lettering anywhere, no logos, no signature, no watermark, no borders or frame.";

/** The palette's ramp: shadows in the text colour, mid tones through the primary, highlights to the paper. */
const RAMP: [number, [number, number, number]][] = [
  [0, [0x22, 0x1b, 0x17]],
  [0.5, [0x8a, 0x45, 0x27]],
  [0.8, [0xd9, 0xa4, 0x80]],
  [1, [0xfb, 0xf4, 0xee]],
];

function spent(): number {
  if (!existsSync(logFile)) return 0;
  return readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .reduce((s, l) => s + (JSON.parse(l) as { costEur: number }).costEur, 0);
}

/** Tinted: the painting's own colour mixed with its palette ramp (TINT of the ramp), lifted a little. */
const TINT = 0.55;

async function treat(src: string, dst: string): Promise<void> {
  const cropped = sharp(src).extract(CROP);
  const { data, info } = await cropped.clone().greyscale().normalise().raw().toBuffer({ resolveWithObject: true });
  const colour = await cropped.clone().removeAlpha().raw().toBuffer();
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < data.length; i++) {
    const v = Math.pow(data[i]! / 255, 0.85);
    let k = 0;
    while (k < RAMP.length - 2 && v > RAMP[k + 1]![0]) k++;
    const [a, ca] = RAMP[k]!, [b, cb] = RAMP[k + 1]!;
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round((ca[c]! + (cb[c]! - ca[c]!) * t) * TINT + colour[i * 3 + c]! * (1 - TINT));
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toFile(dst);
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const raw = path.join(outDir, "raw.jpg");
  if (process.argv.includes("--treat-only")) return treat(raw, path.join(outDir, "treated.jpg"));
  const base = loadConfig();
  const modelName = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "flux-2-pro";
  const model = base.imageGen.models[modelName];
  if (!model) throw new Error(`no model ${modelName} in config imageGen.models`);
  const before = spent();
  const size = outputSize(base, false);
  const estimate = imageCostEur(base, model, size.width, size.height);
  if (before + estimate > ALLOWANCE_EUR) throw new Error(`allowance: €${before.toFixed(4)} spent, €${estimate.toFixed(4)} more would pass €${ALLOWANCE_EUR}`);
  const config = {
    ...base,
    promptFixes: { ...base.promptFixes, pictures: false },
    imageGen: { ...base.imageGen, pipeline: { ...base.imageGen.pipeline, model: modelName, style: STYLE } },
    limits: { ...base.limits, dailyModelSpendCapEur: ALLOWANCE_EUR },
  };
  const gen = new ImageGenerator({
    config,
    transport: new FalImageTransport(),
    spentToday: async () => spent(),
    onCall: async (r) => {
      appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), model: r.model, stage: r.stage, costEur: r.costEur, ok: r.ok, durationMs: r.durationMs }) + "\n");
    },
  });
  const img = await gen.generate(PROMPT);
  writeFileSync(raw, img.data);
  await treat(raw, path.join(outDir, "treated.jpg"));
  console.log(`${modelName}: ${img.width}×${img.height}, €${img.costEur.toFixed(4)}; total €${spent().toFixed(4)} of €${ALLOWANCE_EUR}`);
}

await main();
