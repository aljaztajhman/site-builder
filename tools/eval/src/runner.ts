import { existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, type AppConfig } from "@sb/config";
import {
  AnthropicTransport,
  FalImageTransport,
  ImageGenerator,
  ModelClient,
  StandInImageTransport,
  RecordMissingTransport,
  RecordingTransport,
  ReplayTransport,
  type BatchTransport,
  applyChatEdit,
  checkExportOffline,
  checkSite,
  sampleEntryPages,
  sitePageFiles,
  exportSite,
  generateSite,
  loadMedia,
  clientCorpus,
  extractSwatches,
  processLogo,
  processPhoto,
  type CheckBrowser,
  type ModelTransport,
  type Composition,
  type SiteCheckReport,
} from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Storage } from "@sb/platform";
import { siteFiles } from "@sb/render";
import { validateSite, type SiteSpec } from "@sb/spec";
import type { Fixture } from "./fixtures/schema.ts";
import { evaluateEditCheck, pagesText, type EditCheckResult } from "./edit-checks.ts";
import { homepageShape, type HomepageShape } from "./homepage-metrics.ts";
import { judgeHomepage, type JudgeOutput } from "./judge.ts";
import { CachedImageTransport, meteredImages, meteredModel, type Meter } from "./eval-transports.ts";
import { brandFit, lookFeatures, motifFit, screenPrint, type BrandFit, type LookSite, type MotifFit } from "./look-distance.ts";
import { homepageCopy, type HomepageCopy } from "./copy-similarity.ts";

export type Mode = "live" | "record" | "record-missing" | "replay" | "offline";

export interface Checkpoint {
  label: string;
  version: number | null;
  failures: string[];
  lighthouse: SiteCheckReport["lighthouse"];
  axe: number;
  maxScrollWidth360: number;
  placeholders: number;
  facts: number;
  valid: boolean;
  /** The page files checked: the spec's pages and the collection entries' own pages. */
  pages: string[];
  edit?: { message: string; lang: string; reply: string; check: EditCheckResult; issues: string[]; ms: number };
}

export interface FixtureResult {
  id: string;
  type: string;
  direction: string | null;
  checkpoints: Checkpoint[];
  costByStage: { stage: string; calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; eur: number; ms: number }[];
  generationEur: number;
  editsEur: number;
  generationMs: number;
  /** Job start to the first saved version (what the editor shows as the preview). */
  firstVersionMs: number | null;
  timings: Record<string, number>;
  /** The generated homepage (after critique), for the repetition and sameness numbers. */
  home: HomepageShape | null;
  mobileShot: Uint8Array | null;
  /** Desktop first screen (1280×800) as a visitor sees it, for the desktop contact sheet. */
  desktopShot: Uint8Array | null;
  /** First-screen composition of the generated homepage at phone and desktop size. */
  composition: { mobile: Composition; desktop: Composition } | null;
  /** The generated homepage's look (look-distance.ts): for the same-trade distance, brand fit and motif fit. */
  look: { site: LookSite; brand: BrandFit; motif: MotifFit } | null;
  /** The generated homepage's headings, for the copy overlap (copy-similarity.ts). */
  copy?: HomepageCopy | null;
  /** Photos the client gave (the photo-share target only applies when there are some). */
  photoCount: number;
  /** Vision judge's scores for the generated homepage (--judge), and what it cost. */
  judge: JudgeOutput | null;
  judgeError?: string;
  judgeEur: number;
  /** What this fixture really paid the providers, judge excluded: replayed answers and cached pictures cost nothing. */
  paidEur: number;
  /** --replay: requests that differ from the one recorded (a prompt changed since; the recorded answer is replayed anyway). */
  replayChanged?: number;
  /** --record-missing: calls answered from the recordings, and calls paid and recorded. */
  calls?: { replayed: number; recorded: number };
  /** Generated pictures from the cache, and pictures fal made (paid) in this run. */
  pictures?: { cached: number; made: number };
  /** The export zip opened from file:// (checked once, after generation). */
  exportCheck: { ok: boolean; bytes: number; pages: number; problems: string[] } | null;
  error?: string;
}

export interface RunOptions {
  mode: Mode;
  outDir: string;
  browser: CheckBrowser;
  recordingsDir: string;
  goldenDir: string;
  scope: "home" | "full";
  lighthouse: boolean;
  /** Abort once the run's total model spend passes this (CLAUDE.md: stop before €30). */
  maxEur: number;
  /**
   * Score the generated homepage with the vision judge (a real model call, not recorded). With `judgeBatch` the
   * request joins the run's batch (50 % off) and its promise goes to `judging`; the caller drains the batch at the end.
   */
  judge: boolean;
  judgeBatch?: { transport: BatchTransport; judging: Promise<void>[] };
  /** Where fal pictures are cached by request (live, record and record-missing runs). */
  imageCacheDir?: string;
  /** false (--no-edits): generate and check only, no scripted chat edits (40 % of a homepage run's cost). */
  edits?: boolean;
  spentSoFar: () => number;
}

function transportFor(
  opts: RunOptions,
  fixture: Fixture,
  live: () => ModelTransport,
): { transport: ModelTransport; finish?: () => void; calls?: () => FixtureResult["calls"]; changed?: () => number } {
  const dir = path.join(opts.recordingsDir, fixture.id);
  if (opts.mode === "replay") {
    const t = new ReplayTransport(dir);
    return { transport: t, changed: () => t.hashMismatches.length };
  }
  if (opts.mode === "record-missing") {
    const t = new RecordMissingTransport(live(), dir);
    return { transport: t, finish: () => t.finish(), calls: () => ({ ...t.stats }) };
  }
  // A re-record replaces the fixture's recordings; leftovers from a longer earlier run would replay as stale answers.
  // Only the files: home/ holds the homepage-scope replays (pnpm recordings:home), which aren't recorded here.
  if (opts.mode === "record" && existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".json")) rmSync(path.join(dir, f));
  return { transport: opts.mode === "record" ? new RecordingTransport(live(), dir) : live() };
}

function summarise(label: string, spec: SiteSpec, version: number | null, r: SiteCheckReport): Checkpoint {
  return {
    label,
    version,
    failures: r.failures,
    lighthouse: r.lighthouse,
    axe: r.pages.reduce((n, p) => n + p.axe.reduce((m, v) => m + v.nodes, 0), 0),
    maxScrollWidth360: Math.max(...r.pages.map((p) => p.mobile.scrollWidth)),
    placeholders: r.placeholders,
    facts: r.facts.length,
    valid: validateSite(spec).ok,
    pages: r.pages.map((p) => p.file),
  };
}

/**
 * Checks the site as it is now: every page, collection entries' own pages included (sitePageFiles); one entry page per
 * collection also gets whole-page screenshots at 360 and 1280 px and Lighthouse beside the homepage's.
 */
export async function checkCurrent(config: AppConfig, repo: Repo, storage: Storage, siteId: string, opts: Pick<RunOptions, "lighthouse" | "browser">) {
  const current = (await repo.getSpec(siteId))!;
  const media = await loadMedia(storage, siteId, current.spec, config.images.widths);
  const files = siteFiles(current.spec, media, { imageWidths: config.images.widths });
  const sample = sampleEntryPages(current.spec);
  const report = await checkSite(current.spec, files, {
    config,
    corpus: await clientCorpus(repo, siteId),
    lighthouse: opts.lighthouse,
    browser: opts.browser,
    pages: sitePageFiles(current.spec),
    shots: sample,
    lighthousePages: sample,
  });
  const html = [...files].filter(([k]) => k.endsWith(".html")).map(([, v]) => new TextDecoder().decode(v));
  return { current, report, text: pagesText(html) };
}

/** Generates one fixture end to end, applies its scripted edits, checks after every step. */
export async function runFixture(fixture: Fixture, opts: RunOptions): Promise<FixtureResult> {
  const config = loadConfig();
  const dir = path.join(opts.outDir, "runs", fixture.id);
  await mkdir(dir, { recursive: true });
  const db = await createDb("pglite://memory");
  await migrate(db);
  const repo = new Repo(db);
  const storage = createFsStorage(path.join(dir, "storage"));
  const result: FixtureResult = {
    id: fixture.id,
    type: fixture.brief.businessType,
    direction: null,
    checkpoints: [],
    costByStage: [],
    generationEur: 0,
    editsEur: 0,
    generationMs: 0,
    firstVersionMs: null,
    timings: {},
    home: null,
    mobileShot: null,
    desktopShot: null,
    composition: null,
    look: null,
    photoCount: fixture.photos.length,
    judge: null,
    judgeEur: 0,
    paidEur: 0,
    exportCheck: null,
  };
  const meter: Meter = { eur: 0 };
  let finishRecordings: (() => void) | undefined;
  let callStats: (() => FixtureResult["calls"]) | undefined;
  let replayChanged: (() => number) | undefined;
  let pictureStats: (() => FixtureResult["pictures"]) | undefined;
  try {
    const site = await repo.createSite({ name: fixture.id, slug: fixture.id, intake: { description: fixture.brief.description, photoAssetIds: [], scope: opts.scope } });
    const photoIds: string[] = [];
    for (const [i, p] of fixture.photos.entries()) {
      const data = new Uint8Array(await readFile(p.path));
      const key = `sites/${site.id}/uploads/photo${i}.jpg`;
      await storage.put(key, data, "image/jpeg");
      const row = await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: p.file });
      photoIds.push(row.id);
    }
    let logoAssetId: string | undefined;
    if (fixture.logoPath) {
      const data = new Uint8Array(await readFile(fixture.logoPath));
      const key = `sites/${site.id}/uploads/logo.svg`;
      await storage.put(key, data, "image/svg+xml");
      logoAssetId = (await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: key, mime: "image/svg+xml", width: null, height: null, bytes: data.length, original_name: "logo.svg" })).id;
    }
    await db.query("update sites set intake = $2 where id = $1", [
      site.id,
      JSON.stringify({ description: fixture.brief.description, scope: opts.scope, photoAssetIds: photoIds, ...(logoAssetId ? { logoAssetId } : {}) }),
    ]);

    // One transport per fixture: generation and edits share it, so recordings are numbered in call order.
    const transports = opts.mode === "offline" ? null : transportFor(opts, fixture, () => meteredModel(new AnthropicTransport(), config, meter));
    const transport = transports?.transport ?? null;
    finishRecordings = transports?.finish;
    callStats = transports?.calls;
    replayChanged = transports?.changed;
    if (!transport) {
      await seedGolden(fixture, opts.goldenDir, repo, storage, site.id, config);
    } else {
      const client = new ModelClient({
        config,
        transport,
        // The eval has its own budget; the app's daily cap is for deployed environments.
        spentToday: async () => (opts.spentSoFar() >= opts.maxEur ? Number.POSITIVE_INFINITY : 0),
        onCall: async (r) => {
          await repo.logModelCall({
            siteId: site.id,
            jobId: null,
            stage: r.stage,
            model: r.model,
            inputTokens: r.usage.input_tokens,
            outputTokens: r.usage.output_tokens,
            cacheCreationTokens: r.usage.cache_creation_input_tokens,
            cacheReadTokens: r.usage.cache_read_input_tokens,
            costEur: r.costEur,
            durationMs: r.durationMs,
            ok: r.ok,
          });
        },
      });
      // Generated images for fixtures with too few photos: fal when live (FAL_KEY), cached by request; flat stand-ins when replaying.
      const cache =
        opts.mode !== "replay" && process.env.FAL_KEY
          ? new CachedImageTransport(meteredImages(new FalImageTransport(), config, meter), opts.imageCacheDir ?? path.join(opts.recordingsDir, "../image-cache"))
          : null;
      if (cache) pictureStats = () => ({ ...cache.stats });
      const imageTransport = opts.mode === "replay" ? new StandInImageTransport() : cache;
      const images = imageTransport
        ? new ImageGenerator({
            config,
            transport: imageTransport,
            spentToday: async () => (opts.spentSoFar() >= opts.maxEur ? Number.POSITIVE_INFINITY : 0),
            onCall: async (r) => {
              await repo.logModelCall({ siteId: site.id, jobId: null, stage: r.stage, model: r.model, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: r.costEur, durationMs: r.durationMs, ok: r.ok });
            },
          })
        : undefined;
      const t0 = Date.now();
      const gen = await generateSite({ config, repo, storage, client, browser: opts.browser, lighthouse: opts.lighthouse, ...(images ? { images } : {}) }, site.id, null);
      result.generationMs = Date.now() - t0;
      result.timings = gen.timings;
      result.firstVersionMs = gen.firstVersionMs;
      result.generationEur = (await repo.siteCost(site.id)).reduce((a, c) => a + c.eur, 0);
    }

    const first = await checkCurrent(config, repo, storage, site.id, opts);
    result.direction = first.current.spec.design.direction;
    result.home = homepageShape(first.current.spec);
    result.mobileShot = first.report.screenshots.mobile;
    result.desktopShot = first.report.screenshots.desktopFirst;
    result.composition = first.report.composition;
    const features = lookFeatures(first.current.spec);
    const logoColours = fixture.logoPath ? (await extractSwatches(new Uint8Array(await readFile(fixture.logoPath)), "logo", 3)).map((s) => s.hex) : null;
    result.look = {
      site: {
        id: fixture.id,
        trade: fixture.brief.businessType,
        features,
        shots: { mobile: await screenPrint(first.report.screenshots.mobile), desktop: await screenPrint(first.report.screenshots.desktopFirst) },
      },
      brand: brandFit(features, logoColours),
      motif: motifFit(features.motif, fixture.brief.businessType, fixture.brief.trade),
    };
    result.copy = homepageCopy(fixture.id, fixture.brief.businessType, first.current.spec);
    result.checkpoints.push(summarise("generated", first.current.spec, first.current.version, first.report));
    const { zip } = await exportSite({ repo, storage, config }, site.id);
    const ex = await checkExportOffline(zip, first.current.spec.slug, opts.browser.browser);
    result.exportCheck = { ok: ex.ok, bytes: ex.bytes, pages: ex.files, problems: ex.problems };
    for (const p of ex.problems) result.checkpoints[0]!.failures.push(`export offline: ${p}`);
    await writeFile(path.join(dir, "home-360.png"), first.report.screenshots.mobileFull);
    await writeFile(path.join(dir, "home-1280.png"), first.report.screenshots.desktop);
    // First screens as a visitor sees them (sticky bar included), for the review sheets.
    await writeFile(path.join(dir, "home-360-first.png"), first.report.screenshots.mobile);
    await writeFile(path.join(dir, "home-1280-first.png"), first.report.screenshots.desktopFirst);
    // A collection entry's own page per collection, whole: "entry-novice-odprtje-360.png".
    for (const s of first.report.pageShots) {
      const name = `entry-${s.file.replace(/\.html$/, "").replace(/\//g, "-")}`;
      await writeFile(path.join(dir, `${name}-360.png`), s.mobile);
      await writeFile(path.join(dir, `${name}-1280.png`), s.desktop);
    }
    if (opts.judge) {
      // Its own client: judge calls are never recorded or replayed, and their cost stays out of the site's. Through
      // the run's batch when there is one (the answer comes when the caller drains it), else live.
      const judgeClient = new ModelClient({
        config,
        transport: opts.judgeBatch?.transport ?? new AnthropicTransport(),
        spentToday: async () => (opts.spentSoFar() >= opts.maxEur ? Number.POSITIVE_INFINITY : 0),
        onCall: async (r) => {
          result.judgeEur += r.costEur;
        },
      });
      // Reads only the screenshots already written to `dir`, so it may finish after this function returns.
      const generated = first.current.spec.assets.images.filter((i) => i.origin === "generated").length;
      const judging = judgeHomepage(judgeClient, dir, { businessType: fixture.brief.businessType, direction: result.direction, photos: fixture.photos.length, generated }).then(
        (j) => void (result.judge = j),
        (e: unknown) => void (result.judgeError = (e as Error).message.slice(0, 300)),
      );
      if (opts.judgeBatch) opts.judgeBatch.judging.push(judging);
      else await judging;
    }
    await writeFile(path.join(dir, "spec-generated.json"), JSON.stringify(first.current.spec, null, 2));

    const edits = opts.edits !== false;
    if (transport && edits) {
      const client = new ModelClient({
        config,
        transport,
        spentToday: async () => (opts.spentSoFar() >= opts.maxEur ? Number.POSITIVE_INFINITY : 0),
        onCall: async (r) => {
          await repo.logModelCall({ siteId: site.id, jobId: "edit", stage: r.stage, model: r.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, cacheCreationTokens: r.usage.cache_creation_input_tokens, cacheReadTokens: r.usage.cache_read_input_tokens, costEur: r.costEur, durationMs: r.durationMs, ok: r.ok });
        },
      });
      let before = first.current.spec;
      for (const [i, edit] of fixture.edits.entries()) {
        const msg = await repo.addChat(site.id, "user", edit.message);
        const t = Date.now();
        const r = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
        const ms = Date.now() - t;
        const after = await checkCurrent(config, repo, storage, site.id, opts);
        const cp = summarise(`edit ${i + 1}`, after.current.spec, after.current.version, after.report);
        cp.edit = { message: edit.message, lang: edit.lang, reply: r.reply, check: evaluateEditCheck(edit.check, before, after.current.spec, after.text), issues: r.issues, ms };
        result.checkpoints.push(cp);
        await writeFile(path.join(dir, `edit-${i + 1}-360.png`), after.report.screenshots.mobileFull);
        before = after.current.spec;
      }
      await writeFile(path.join(dir, "spec-final.json"), JSON.stringify(before, null, 2));
    }
    result.costByStage = await repo.siteCost(site.id);
    const total = result.costByStage.reduce((a, c) => a + c.eur, 0);
    result.editsEur = total - result.generationEur;
    // Only a complete run may drop the recordings it didn't reach; a failed one, or one without its edits, leaves them.
    if (edits) finishRecordings?.();
  } catch (e) {
    result.error = (e as Error).stack ?? String(e);
  } finally {
    result.paidEur = meter.eur;
    const calls = callStats?.();
    const pictures = pictureStats?.();
    if (calls) result.calls = calls;
    if (pictures) result.pictures = pictures;
    if (replayChanged) result.replayChanged = replayChanged();
    await db.close();
  }
  return result;
}

/** Offline mode: no model. Uses a hand-authored golden spec and the fixture's real photos. */
export async function seedGolden(fixture: Fixture, goldenDir: string, repo: Repo, storage: Storage, siteId: string, config: AppConfig, slug = fixture.id): Promise<void> {
  const file = path.join(goldenDir, `${fixture.id}.json`);
  const raw = JSON.parse(await readFile(file, "utf8")) as SiteSpec;
  const spec: SiteSpec = { ...raw, slug };
  for (const [i, img] of spec.assets.images.entries()) {
    const photo = fixture.photos[i];
    if (!photo) throw new Error(`${fixture.id}: golden spec has more images than the fixture has photos`);
    const processed = await processPhoto(img.id, new Uint8Array(await readFile(photo.path)), config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) await storage.put(`sites/${siteId}/media/${v.file}`, v.data, v.file.endsWith(".avif") ? "image/avif" : "image/webp");
    img.width = processed.width;
    img.height = processed.height;
  }
  if (spec.assets.logo && fixture.logoPath) {
    // Same processing as the pipeline: the logo is served as a rasterised PNG.
    const logo = await processLogo(new Uint8Array(await readFile(fixture.logoPath)), "image/svg+xml");
    await storage.put(`sites/${siteId}/media/${logo.file}`, logo.data, "image/png");
    spec.assets.logo = { ...spec.assets.logo, file: logo.file, width: logo.width, height: logo.height };
  }
  await repo.saveSpec(siteId, spec, "manual", "golden");
}
