/**
 * pnpm studio:poc --fixture <id> [--record | --replay] [--picker] [--max-eur 2.00] [--max-fal 0.60]   (or --all)
 *
 * Design studio 0.5 / 0.5b (docs/plans/studio-0.5.md) on an eval fixture, exactly as the worker runs it for a trial
 * account: the fixture's golden spec stands in for today's pipeline output (the edge fixtures: a stand-in base,
 * studio-edge.ts). config studio.mode "mockup" (default) runs the mockup path (art director, GPT Image mockup, rebuild)
 * and falls back to the picker; --picker runs the 0.5 picker only.
 *
 * --record (the default without --replay) makes real calls: Anthropic (the art director, the rebuild, and the picker's
 * director if it falls back) and fal (the mockup). Model answers are recorded to tools/eval/recordings-studio-mockup/<id>/
 * (the picker only: tools/eval/recordings-studio/<id>/), the mockup image beside them (mockup.jpg) with its prompt; the unit
 * tests replay these. Every paid call is logged in eval/runs/studio-poc/cost-log.jsonl (provider, stage, model, tokens, €)
 * and stops before it would take this tool's total past --max-eur (Anthropic, all runs in the log) or --max-fal (fal).
 * --replay answers from the recordings for free.
 *
 * Writes eval/runs/studio-poc/: `<id>.spec.json`, `<id>.studio.json` (path, idea, sections, crops, dropped, € by stage),
 * `<id>-mockup.jpg`, and screenshots of the composed homepage and of today's (the golden, or the edge stand-in) at 1280
 * and 360 px, first screen and whole page: `<id>-desk.png`, `<id>-deskFull.png`, `<id>-phone.png`, `<id>-phoneFull.png`,
 * and `<id>-today-*.png`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";
import { loadConfig, repoRoot } from "@sb/config";
import {
  AnthropicTransport,
  FalImageTransport,
  ImageGenerator,
  ModelClient,
  RecordMissingTransport,
  ReplayTransport,
  processLogo,
  processPhoto,
  runStudio,
  serveStatic,
  type ImageGenModelConfig,
  type ImageTransport,
  type MockupDeps,
  type ModelTransport,
} from "@sb/engine";
import { COMPOSER_FIXTURES, composerFixture } from "@sb/inventory";
import type { PresetBrief, SiteSpec } from "@sb/spec";
import { loadFixture } from "./fixtures/load.ts";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { photoForImage, shoot } from "./okus-items.ts";
import { EDGE_FIXTURES, edgeFixture, isEdgeFixture } from "./studio-edge.ts";

const args = process.argv.slice(2);
const val = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const replay = args.includes("--replay");
const pickerOnly = args.includes("--picker");
const maxEur = Number(val("--max-eur") ?? 2.0);
const maxFal = Number(val("--max-fal") ?? 0.6);
const ALL = [...COMPOSER_FIXTURES, ...EDGE_FIXTURES] as string[];
const fixtures = args.includes("--all") ? ALL : [val("--fixture") ?? ""];
if (fixtures.some((f) => !ALL.includes(f)) || !Number.isFinite(maxEur) || !Number.isFinite(maxFal)) {
  console.error(`Usage: studio:poc --fixture <id> | --all [--record | --replay] [--picker] [--max-eur 2.00] [--max-fal 0.60]\nfixtures: ${ALL.join(", ")}`);
  process.exit(1);
}
if (!replay && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --replay to run on the recorded answers.");
  process.exit(2);
}
if (!replay && !pickerOnly && !process.env.FAL_KEY) {
  console.error("FAL_KEY is not set (the mockup image). Use --replay, or --picker for the picker only.");
  process.exit(2);
}

export const STUDIO_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-studio");
export const MOCKUP_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-studio-mockup");
const out = path.join(repoRoot, "eval/runs/studio-poc");
const LOG = path.join(out, "cost-log.jsonl");
const base = loadConfig();
const config = pickerOnly ? { ...base, studio: { ...base.studio, mode: "picker" as const } } : base;

interface Row {
  provider: "anthropic" | "fal";
  costEur: number;
}
/** € already logged per provider (every run of this tool counts against its caps). */
function logged(provider: Row["provider"]): number {
  if (!existsSync(LOG)) return 0;
  return readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.provider === provider)
    .reduce((s, r) => s + r.costEur, 0);
}

/** Records fal's answer (the mockup) next to the model recordings, or replays it. */
class MockupImageTransport implements ImageTransport {
  constructor(
    private readonly dir: string,
    private readonly inner: ImageTransport | null,
  ) {}
  /** The last call reused the recorded image (same prompt): nothing was paid. */
  reused = false;
  async generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    const file = path.join(this.dir, "mockup.jpg");
    const promptFile = path.join(this.dir, "mockup-prompt.txt");
    this.reused = !this.inner || (existsSync(file) && existsSync(promptFile) && readFileSync(promptFile, "utf8") === String(body.prompt ?? ""));
    if (this.reused) return new Uint8Array(await readFile(file));
    const raw = await this.inner!.generate(model, body);
    const jpeg = new Uint8Array(await sharp(raw).jpeg({ quality: 85, mozjpeg: true }).toBuffer());
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(file, jpeg);
    writeFileSync(path.join(this.dir, "mockup-prompt.txt"), String(body.prompt ?? ""));
    return jpeg;
  }
}

/** A fixture as the studio reads it: today's spec, the brief, the client's text, the trade word, its photo files. */
function fixtureOf(id: string): { spec: SiteSpec; brief?: PresetBrief; corpus: string; tradeWord?: string; general?: boolean; photo: (imgId: string) => Promise<Uint8Array | undefined>; logo?: () => Promise<Uint8Array | undefined> } {
  if (isEdgeFixture(id)) {
    const e = edgeFixture(id);
    return { spec: e.base, brief: e.brief, corpus: e.description, general: true, photo: async () => undefined };
  }
  const fx = composerFixture(id);
  const files = loadFixture(id);
  return {
    spec: fx.base,
    ...(fx.sources.brief ? { brief: fx.sources.brief } : {}),
    corpus: fx.description,
    ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}),
    photo: async (imgId) => {
      const i = fx.base.assets.images.findIndex((x) => x.id === imgId);
      const p = i >= 0 ? photoForImage(files.photos, fx.base.assets.images[i]!, i) : undefined;
      return p ? new Uint8Array(await readFile(p.path)) : undefined;
    },
    ...(files.logoPath ? { logo: async () => new Uint8Array(await readFile(files.logoPath!)) } : {}),
  };
}

/** The site's media: the fixture's photos and logo for its own images, the crops from `crops`. */
async function mediaOf(id: string, spec: SiteSpec, crops: ReadonlyMap<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  const media = new Map<string, Uint8Array>();
  const widths = config.images.widths;
  const fx = isEdgeFixture(id) ? null : loadFixture(id);
  for (const [i, img] of spec.assets.images.entries()) {
    const crop = crops.get(img.id);
    const data = crop ?? (fx && img.origin !== "generated" ? await (async () => {
      const p = photoForImage(fx.photos, img, i);
      return p ? new Uint8Array(await readFile(p.path)) : undefined;
    })() : undefined);
    if (!data) continue;
    const processed = await processPhoto(img.id, data, [...widths], { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) media.set(v.file, v.data);
    img.width = processed.width;
    img.height = processed.height;
  }
  if (spec.assets.logo && fx?.logoPath) {
    const logo = await processLogo(new Uint8Array(await readFile(fx.logoPath)), "image/svg+xml");
    media.set(logo.file, logo.data);
    spec.assets.logo = { ...spec.assets.logo, file: logo.file, width: logo.width, height: logo.height };
  }
  return media;
}

async function shots(entries: { id: string; fixtureId: string; spec: SiteSpec; crops: ReadonlyMap<string, Uint8Array> }[]): Promise<void> {
  const work = await mkdtemp(path.join(tmpdir(), "sb-studio-poc-"));
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  try {
    for (const e of entries) {
      const spec = structuredClone(e.spec);
      await writeSiteFiles(spec, await mediaOf(e.fixtureId, spec, e.crops), path.join(work, e.id));
      await shoot(browser, e.id, `${server.url}/${e.id}/${spec.slug}/index.html`, out, null);
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
}

mkdirSync(out, { recursive: true });
for (const id of fixtures) {
  const dir = path.join(pickerOnly ? STUDIO_RECORDINGS : MOCKUP_RECORDINGS, id);
  // Recording keeps what is still valid: a call whose request is unchanged (same hash) is answered from the recording
  // for free, and a mockup whose prompt is unchanged is reused, so a re-run after a fix pays only for what changed.
  let transport: ModelTransport;
  let recorder: RecordMissingTransport | null = null;
  if (replay) transport = new ReplayTransport(dir);
  else transport = recorder = new RecordMissingTransport(new AnthropicTransport(), dir);
  let recorded = 0;
  const paid = (provider: Row["provider"]): boolean => {
    if (replay) return false;
    if (provider === "fal") return !images.reused;
    const now = recorder!.stats.recorded;
    const was = recorded;
    recorded = now;
    return now > was;
  };
  const log = (provider: Row["provider"]) => async (c: { stage: string; model: string; usage: unknown; costEur: number; durationMs: number; ok: boolean }) => {
    const spent = paid(provider);
    if (spent) appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), provider, fixture: id, stage: c.stage, model: c.model, usage: c.usage, costEur: c.costEur, seconds: c.durationMs / 1000, ok: c.ok })}\n`);
    console.log(`  ${c.stage} ${c.model}: €${c.costEur.toFixed(4)}${spent ? "" : " (from the recording, not spent)"}`);
  };
  const images = new MockupImageTransport(dir, replay ? null : new FalImageTransport());
  // This tool's caps stand in for the daily cap: a call whose estimate would take the logged total past them is refused
  // (SpendCapError) before it is sent, and the studio falls back.
  const modelConfig = { ...config, limits: { ...config.limits, dailyModelSpendCapEur: maxEur } };
  const client = new ModelClient({ config: modelConfig, transport, spentToday: async () => (replay ? 0 : logged("anthropic")), onCall: log("anthropic") });
  const painter = new ImageGenerator({
    config: { ...config, limits: { ...config.limits, dailyModelSpendCapEur: maxFal } },
    transport: images,
    spentToday: async () => (replay ? 0 : logged("fal")),
    onCall: log("fal"),
  });
  const fx = fixtureOf(id);
  const crops = new Map<string, Uint8Array>();
  const deps: MockupDeps = {
    painter,
    photo: fx.photo,
    ...(fx.logo ? { logo: fx.logo } : {}),
    imageIds: async (n) => Array.from({ length: n }, (_, i) => `img_mock${i + 1}`),
    store: async (imgId, jpeg) => {
      crops.set(imgId, jpeg);
      return `uploads/${imgId}.jpg`;
    },
  };
  console.log(`${id}:`);
  const r = await runStudio(client, modelConfig, {
    spec: fx.spec,
    ...(fx.brief ? { brief: fx.brief } : {}),
    corpus: fx.corpus,
    seed: 1,
    ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}),
    ...(fx.general ? { general: true } : {}),
    ...(pickerOnly ? {} : { mockup: deps }),
  });
  recorder?.finish();
  const report = {
    ok: r.ok,
    ...(r.ok ? { path: r.path, idea: r.idea, stance: r.stance, presets: r.used.presets, palette: r.used.palette, pairing: r.used.pairing, wordmark: r.used.wordmark, dropped: r.dropped } : { reason: r.reason, idea: r.idea ?? null }),
    mockup: r.mockup ?? null,
    art: r.art ?? null,
    eur: r.costEur,
  };
  writeFileSync(path.join(out, `${id}.studio.json`), `${JSON.stringify(report, null, 2)}\n`);
  if (r.mockupImage) await writeFile(path.join(out, `${id}-mockup.jpg`), r.mockupImage);
  const m = r.mockup;
  console.log(`  ${m ? `mockup: ${m.ok ? `built (${m.sections?.join(", ")})` : `fell back: ${m.reason}`}${m.idea ? `\n  idea: ${m.idea}` : ""}\n  ` : ""}${r.ok ? `${r.path}: ${r.idea}${r.dropped.length ? `\n  dropped: ${r.dropped.join("; ")}` : ""}` : `today's site kept: ${r.reason}`}`);
  if (r.ok) writeFileSync(path.join(out, `${id}.spec.json`), `${JSON.stringify(r.spec, null, 2)}\n`);
  await shots([...(r.ok ? [{ id, fixtureId: id, spec: r.spec, crops }] : []), { id: `${id}-today`, fixtureId: id, spec: fx.spec, crops: new Map() }]);
}
console.log(replay ? "replayed" : `logged so far: Anthropic €${logged("anthropic").toFixed(4)} of €${maxEur}, fal €${logged("fal").toFixed(4)} of €${maxFal}; shots in ${path.relative(repoRoot, out)}`);
