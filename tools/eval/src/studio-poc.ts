/**
 * pnpm studio:poc --fixture <id> | --fixtures a,b,c | --fresh | --all  [--record | --replay | --bases-only] [--lenient-bases] [--mode mockup|picker|direct] [--picker] [--max-eur 2.00] [--max-fal 0.60]
 *
 * Design studio 0.5 / 0.5b (docs/plans/studio-0.5.md) on an eval fixture, exactly as the worker runs it for a trial
 * account. config studio.mode "mockup" (default) runs the mockup path (art director, GPT Image mockup, rebuild) and falls
 * back to the picker; --picker runs the 0.5 picker only.
 *
 * Fixtures (studio-fixtures.ts): --all is the original five (pekarna-kvas, avtoservis-mrak, instalacije-rebernik with
 * the golden spec as today's site; cvetlicarna-zvoncek, tattoo-crnilo with a hand-made stand-in base, studio-edge.ts).
 * --fresh runs the ten fresh businesses (tools/eval/fresh, also nameable with --fixture/--fixtures): their base is today's
 * pipeline replayed for free from tools/eval/recordings-fresh10/<id>/ (the recorded --fresh eval run, default config). The
 * brief prompt has changed since they were recorded (2026-10-15), so their bases are always replayed leniently (--lenient-bases
 * behaviour: the recorded answers through today's code; the changed-request count is in the log line).
 * --mode mockup|picker|direct overrides config studio.mode for the run ("direct": Fable composes from the art direction, no
 * mockup image; the config schema accepts it once the engine unit has merged) and gives the mode its own output directory,
 * eval/runs/studio-poc-<mode>/ (shots, specs, cost-log.jsonl), and its own recordings, tools/eval/recordings-studio-<mode>/<id>/.
 * Without --mode the older layout stays (eval/runs/studio-poc; --picker records in tools/eval/recordings-studio).
 * Any other golden (tools/eval/fixtures: the golden spec and its recorded brief), twin (tools/eval/twins) or hard fixture
 * (tools/eval/hard) can be named with --fixture or --fixtures. A twin's or hard fixture's base is today's pipeline,
 * replayed for free from tools/eval/recordings-home-off/<id>/; one without recordings, or whose requests changed since they
 * were recorded (the twins' were recorded on 2026-10-08 and the brief prompt has changed since), fails with the (paid)
 * command that records them, one fixture per command (a multi-fixture eval run makes earlier sites the later ones' neighbours):
 *   pnpm eval --record-missing --recordings tools/eval/recordings-home-off --only <id> --twins|--hard --scope home --photos 0 --no-edits --no-judge --no-lighthouse
 * --lenient-bases replays changed requests anyway (the recorded answers through today's code, the count in the log line),
 * free; a run that then needs a call the recordings don't have (a content retry) still fails.
 *
 * --record (the default without --replay) makes real calls: Anthropic (the art director, the rebuild, and the picker's
 * director if it falls back) and fal (the mockup). Model answers are recorded to tools/eval/recordings-studio-mockup/<id>/
 * (the picker only: tools/eval/recordings-studio/<id>/), the mockup image beside them (mockup.jpg) with its prompt; the unit
 * tests replay these. Every paid call is logged in eval/runs/studio-poc/cost-log.jsonl (provider, stage, model, tokens, €)
 * and stops before it would take this tool's total past --max-eur (Anthropic, all runs in the log) or --max-fal (fal).
 * --replay answers from the recordings for free. --bases-only builds and validates today's spec only (no studio call, no
 * key needed, nothing paid) and writes `<id>.today.spec.json` and the today screenshots.
 *
 * Writes eval/runs/studio-poc/: `<id>.today.spec.json` (today's spec), `<id>.spec.json` (the studio's), `<id>.studio.json`
 * (path, idea, sections, crops, dropped, € by stage), `<id>.prompts.json` (every model request the studio sent, pictures
 * as `[image: <type>, <n> KB]`, with its answer, and the mockup's prompt and reference count), `<id>-mockup.jpg`,
 * `<id>-crops/<imgId>.jpg`, and screenshots of the composed homepage and of today's at 1280 and 360 px, first screen and
 * whole page: `<id>-desk.png`, `<id>-deskFull.png`, `<id>-phone.png`, `<id>-phoneFull.png`, and `<id>-today-*.png`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { loadConfig, repoRoot } from "@sb/config";
import {
  AnthropicTransport,
  FalImageTransport,
  ImageGenerator,
  ModelClient,
  RecordMissingTransport,
  ReplayTransport,
  launchCheckBrowser,
  runStudio,
  serveStatic,
  type CheckBrowser,
  type ImageGenModelConfig,
  type ImageTransport,
  type MockupDeps,
  type ModelTransport,
} from "@sb/engine";
import { validateSite, type SiteSpec } from "@sb/spec";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { shoot } from "./okus-items.ts";
import { CaptureImageTransport, CaptureTransport, type PromptsFile } from "./studio-capture.ts";
import { STUDIO_MODES, fileFixture, fixtureKind, knownFixtures, modeDirs, parseFixtureArgs, replayedFixture, type StudioFixture, type StudioPocMode } from "./studio-fixtures.ts";

const args = process.argv.slice(2);
const val = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const replay = args.includes("--replay");
const basesOnly = args.includes("--bases-only");
const modeArg = val("--mode");
if (modeArg !== undefined && !(STUDIO_MODES as readonly string[]).includes(modeArg)) {
  console.error(`--mode needs one of ${STUDIO_MODES.join(", ")}, got "${modeArg}"`);
  process.exit(1);
}
if (modeArg !== undefined && args.includes("--picker") && modeArg !== "picker") {
  console.error(`--picker means --mode picker; it conflicts with --mode ${modeArg}`);
  process.exit(1);
}
const mode: StudioPocMode = (modeArg as StudioPocMode | undefined) ?? (args.includes("--picker") ? "picker" : "mockup");
const pickerOnly = mode === "picker";
// Twins and hard fixtures: replay recordings whose requests changed since they were recorded (the recorded answers, today's code).
const lenient = args.includes("--lenient-bases");
const maxEur = Number(val("--max-eur") ?? 2.0);
const maxFal = Number(val("--max-fal") ?? 0.6);
const known = knownFixtures();
const KNOWN = [...known.golden, ...known.twins, ...known.hard, ...known.edge];
const parsed = parseFixtureArgs(args, [...KNOWN, ...known.fresh], undefined, known.fresh);
if (!parsed.ok || !Number.isFinite(maxEur) || !Number.isFinite(maxFal)) {
  console.error(
    `${parsed.ok ? "" : `${parsed.error}\n`}Usage: studio:poc --fixture <id> | --fixtures a,b,c | --fresh | --all [--record | --replay | --bases-only] [--lenient-bases] [--mode mockup|picker|direct] [--picker] [--max-eur 2.00] [--max-fal 0.60]\n--all: the original five; --fresh: the ten fresh businesses\ngoldens: ${known.golden.join(", ")}\ntwins: ${known.twins.join(", ")}\nhard: ${known.hard.join(", ")}\nedge: ${known.edge.join(", ")}\nfresh: ${known.fresh.join(", ")}`,
  );
  process.exit(1);
}
const fixtures = parsed.fixtures;
if (!replay && !basesOnly && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Use --replay to run on the recorded answers, or --bases-only.");
  process.exit(2);
}
if (!replay && !basesOnly && mode === "mockup" && !process.env.FAL_KEY) {
  console.error("FAL_KEY is not set (the mockup image). Use --replay, or --mode picker / --mode direct (no mockup image).");
  process.exit(2);
}

export const STUDIO_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-studio");
export const MOCKUP_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-studio-mockup");
// --mode gives each mode its own output and recordings directories; without it the older layout stays.
const out = modeArg !== undefined ? modeDirs(mode, "").out : path.join(repoRoot, "eval/runs/studio-poc");
const LOG = path.join(out, "cost-log.jsonl");
const base = loadConfig();
// The schema's mode enum gains "direct" with the engine unit; the string is passed through, typed loosely until then.
const config = mode === base.studio.mode ? base : ({ ...base, studio: { ...base.studio, mode } } as typeof base);

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

async function shots(browser: CheckBrowser, entries: { id: string; fx: StudioFixture; spec: SiteSpec; crops: ReadonlyMap<string, Uint8Array> }[]): Promise<void> {
  const work = await mkdtemp(path.join(tmpdir(), "sb-studio-poc-"));
  const server = await serveStatic(work);
  try {
    for (const e of entries) {
      const spec = structuredClone(e.spec);
      await writeSiteFiles(spec, await e.fx.media(spec, e.crops), path.join(work, e.id));
      await shoot(browser.browser, e.id, `${server.url}/${e.id}/${spec.slug}/index.html`, out, null);
    }
  } finally {
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
}

const writeJson = (file: string, data: unknown) => writeFileSync(path.join(out, file), `${JSON.stringify(data, null, 2)}\n`);

mkdirSync(out, { recursive: true });
const browser = await launchCheckBrowser();
const failed: string[] = [];
try {
  for (const id of fixtures) {
    const kind = fixtureKind(id, known)!;
    console.log(`${id} (${kind}):`);
    let fx: StudioFixture;
    try {
      fx = kind === "twin" || kind === "hard" || kind === "fresh" ? await replayedFixture(id, kind, base, browser, !lenient && kind !== "fresh") : fileFixture(id, config);
      const v = validateSite(fx.spec);
      if (!v.ok) throw new Error(`today's spec does not validate: ${v.issues.slice(0, 4).map((i) => `${i.path} ${i.message}`).join("; ")}`);
    } catch (e) {
      console.error(`  FAILED: ${(e as Error).message}`);
      failed.push(id);
      continue;
    }
    writeJson(`${id}.today.spec.json`, fx.spec);
    const home = fx.spec.pages.find((p) => p.kind === "home");
    console.log(`  today: ${fx.note}; ${home?.sections.length ?? 0} homepage sections, ${fx.spec.assets.images.length} images${fx.brief ? ", brief" : ", no brief"}${fx.general ? ", general" : ""}`);
    if (basesOnly) {
      await shots(browser, [{ id: `${id}-today`, fx, spec: fx.spec, crops: new Map() }]);
      continue;
    }

    const dir = modeArg !== undefined ? modeDirs(mode, id).recordings : path.join(pickerOnly ? STUDIO_RECORDINGS : MOCKUP_RECORDINGS, id);
    // Recording keeps what is still valid: a call whose request is unchanged (same hash) is answered from the recording
    // for free, and a mockup whose prompt is unchanged is reused, so a re-run after a fix pays only for what changed.
    let recorder: RecordMissingTransport | null = null;
    const inner: ModelTransport = replay ? new ReplayTransport(dir) : (recorder = new RecordMissingTransport(new AnthropicTransport(), dir));
    const transport = new CaptureTransport(inner);
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
    const imageCapture = new CaptureImageTransport(images);
    // This tool's caps stand in for the daily cap: a call whose estimate would take the logged total past them is refused
    // (SpendCapError) before it is sent, and the studio falls back.
    const modelConfig = { ...config, limits: { ...config.limits, dailyModelSpendCapEur: maxEur } };
    const client = new ModelClient({ config: modelConfig, transport, spentToday: async () => (replay ? 0 : logged("anthropic")), onCall: log("anthropic") });
    const painter = new ImageGenerator({
      config: { ...config, limits: { ...config.limits, dailyModelSpendCapEur: maxFal } },
      transport: imageCapture,
      spentToday: async () => (replay ? 0 : logged("fal")),
      onCall: log("fal"),
    });
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
    writeJson(`${id}.studio.json`, report);
    if (r.mockupImage) await writeFile(path.join(out, `${id}-mockup.jpg`), r.mockupImage);
    const prompts: PromptsFile = {
      fixture: id,
      at: new Date().toISOString(),
      calls: transport.calls,
      mockup: imageCapture.last ? { ...imageCapture.last, image: `${id}-mockup.jpg` } : null,
    };
    writeJson(`${id}.prompts.json`, prompts);
    if (crops.size) {
      mkdirSync(path.join(out, `${id}-crops`), { recursive: true });
      for (const [imgId, jpeg] of crops) writeFileSync(path.join(out, `${id}-crops`, `${imgId}.jpg`), jpeg);
    }
    const m = r.mockup;
    console.log(`  ${m ? `mockup: ${m.ok ? `built (${m.sections?.join(", ")})` : `fell back: ${m.reason}`}${m.idea ? `\n  idea: ${m.idea}` : ""}\n  ` : ""}${r.ok ? `${r.path}: ${r.idea}${r.dropped.length ? `\n  dropped: ${r.dropped.join("; ")}` : ""}` : `today's site kept: ${r.reason}`}`);
    console.log(`  prompts: ${transport.calls.length} model call(s)${imageCapture.last ? `, mockup prompt with ${imageCapture.last.references} reference image(s)` : ""}; crops: ${crops.size}`);
    if (r.ok) writeJson(`${id}.spec.json`, r.spec);
    await shots(browser, [...(r.ok ? [{ id, fx, spec: r.spec, crops }] : []), { id: `${id}-today`, fx, spec: fx.spec, crops: new Map() }]);
  }
} finally {
  await browser.close();
}
if (failed.length) console.error(`failed: ${failed.join(", ")}`);
console.log(
  basesOnly
    ? `bases: ${fixtures.length - failed.length} of ${fixtures.length} built; in ${path.relative(repoRoot, out)}`
    : replay
      ? "replayed"
      : `logged so far: Anthropic €${logged("anthropic").toFixed(4)} of €${maxEur}, fal €${logged("fal").toFixed(4)} of €${maxFal}; shots in ${path.relative(repoRoot, out)}`,
);
if (failed.length) process.exitCode = 1;
