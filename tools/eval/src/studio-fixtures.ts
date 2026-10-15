/**
 * The businesses `pnpm studio:poc` runs the studio on, as the studio reads them: today's spec, the brief, the client's
 * text, the trade word, the photos and logo, and the site's media for the screenshots.
 *
 * - composer fixtures (pekarna-kvas, avtoservis-mrak, instalacije-rebernik): the golden spec and composerFixture's
 *   sources, as before.
 * - edge fixtures (cvetlicarna-zvoncek, tattoo-crnilo): the hand-made stand-in base (studio-edge.ts).
 * - the other goldens (tools/eval/fixtures): the golden spec stands in for today; the brief is the recorded one
 *   (tools/eval/recordings/<id>/*-brief.json, the full-scope run with the fixture's photos) with the facts the client
 *   didn't write dropped, as makeBrief does.
 * - twins (tools/eval/twins) and hard fixtures (tools/eval/hard): today's homepage as the pipeline makes it, replayed for
 *   free from tools/eval/recordings-home-off/<id>/ (the engine's generateSite on a ReplayTransport, homepage scope, no
 *   photos, variety switches off: the way those were recorded). The brief is that run's brief; generated pictures come
 *   from tools/eval/image-cache when the request is cached there, else a flat stand-in. A missing recording, or a request
 *   that changed since it was recorded, fails the fixture with the command that records it (paid):
 *
 *   pnpm eval --record-missing --recordings tools/eval/recordings-home-off --only <id> --twins|--hard --scope home --photos 0 --no-edits --no-judge --no-lighthouse
 *
 * (record-missing rewrites that fixture's recordings in place; the eval CLI refuses --twins and --hard with --replay, so
 * this file's replay is the only free way to rebuild those homepages.)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { repoRoot, type AppConfig } from "@sb/config";
import {
  Brief,
  ImageGenerator,
  ModelClient,
  ReplayTransport,
  StandInImageTransport,
  generateSite,
  loadMedia,
  processLogo,
  processPhoto,
  verifyBriefFacts,
  type CheckBrowser,
  type ImageGenModelConfig,
  type ImageTransport,
} from "@sb/engine";
import { COMPOSER_FIXTURES, composerFixture } from "@sb/inventory";
import { Repo, createDb, createFsStorage, migrate } from "@sb/platform";
import { variantFile, variantWidths } from "@sb/render";
import { migrateSpec, type PresetBrief, type SiteSpec } from "@sb/spec";
import { pictureKey } from "./eval-transports.ts";
import { FIXTURES_DIR, FRESH_DIR, HARD_DIR, TWINS_DIR, loadFixture } from "./fixtures/load.ts";
import { photoForImage } from "./okus-items.ts";
import { CaptureTransport } from "./studio-capture.ts";
import { EDGE_FIXTURES, edgeFixture, isEdgeFixture } from "./studio-edge.ts";

/** What --all runs: the original five (the three composer fixtures and the two edge ones). */
export const ORIGINAL_FIXTURES: readonly string[] = [...COMPOSER_FIXTURES, ...EDGE_FIXTURES];
export const HOME_OFF_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-home-off");
const FULL_RECORDINGS = path.join(repoRoot, "tools/eval/recordings");
/** The ten fresh businesses' homepages as today's pipeline made them (pnpm eval --fresh, 2026-10-15, default config). */
export const FRESH10_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-fresh10");
const IMAGE_CACHE = path.join(repoRoot, "tools/eval/image-cache");

export type FixtureKind = "composer" | "edge" | "golden" | "twin" | "hard" | "fresh";

/** The kinds whose base is today's pipeline replayed from recordings. */
export type ReplayedKind = "twin" | "hard" | "fresh";

/** The studio modes studio:poc can run; "direct" is accepted by the config schema once the engine unit has merged. */
export const STUDIO_MODES = ["mockup", "picker", "direct"] as const;
export type StudioPocMode = (typeof STUDIO_MODES)[number];

/**
 * Where a mode's run writes: its own output directory (shots, specs, cost log) and its own recordings directory, so
 * the modes never share a recording. `--mode` not given keeps the older layout (eval/runs/studio-poc).
 */
export function modeDirs(mode: StudioPocMode, id: string): { out: string; recordings: string } {
  return { out: path.join(repoRoot, "eval/runs", `studio-poc-${mode}`), recordings: path.join(repoRoot, "tools/eval", `recordings-studio-${mode}`, id) };
}

/** The recordings directory of a replayed base: the twins' and hard fixtures' (variety switches off, no photos) or the fresh ones'. */
export function baseRecordings(kind: ReplayedKind, id: string): string {
  return path.join(kind === "fresh" ? FRESH10_RECORDINGS : HOME_OFF_RECORDINGS, id);
}

const dirsIn = (root: string): string[] => (existsSync(root) ? readdirSync(root).filter((d) => existsSync(path.join(root, d, "brief.json"))).sort() : []);

/** Every fixture id studio:poc knows, by where it comes from. */
export function knownFixtures(): { golden: string[]; twins: string[]; hard: string[]; edge: string[]; fresh: string[] } {
  return { golden: dirsIn(FIXTURES_DIR), twins: dirsIn(TWINS_DIR), hard: dirsIn(HARD_DIR), edge: [...EDGE_FIXTURES], fresh: dirsIn(FRESH_DIR) };
}

export function fixtureKind(id: string, known = knownFixtures()): FixtureKind | null {
  if (isEdgeFixture(id)) return "edge";
  if ((COMPOSER_FIXTURES as readonly string[]).includes(id)) return "composer";
  if (known.golden.includes(id)) return "golden";
  if (known.twins.includes(id)) return "twin";
  if (known.hard.includes(id)) return "hard";
  if (known.fresh.includes(id)) return "fresh";
  return null;
}

/**
 * The fixtures named on the command line: `--all` (the original five), `--fresh` (the ten fresh businesses),
 * `--fixtures a,b,c` and/or `--fixture <id>` (repeatable), in that order, without repeats. An unknown id or no fixture
 * at all is an error.
 */
export function parseFixtureArgs(
  args: readonly string[],
  known: readonly string[],
  all: readonly string[] = ORIGINAL_FIXTURES,
  fresh: readonly string[] = [],
): { ok: true; fixtures: string[] } | { ok: false; error: string } {
  const picked: string[] = [];
  if (args.includes("--all")) picked.push(...all);
  if (args.includes("--fresh")) picked.push(...fresh);
  for (const [i, a] of args.entries()) {
    const next = args[i + 1];
    if (a === "--fixtures") {
      if (!next || next.startsWith("--")) return { ok: false, error: "--fixtures needs a comma-separated list of ids" };
      picked.push(...next.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--fixture") {
      if (!next || next.startsWith("--")) return { ok: false, error: "--fixture needs an id" };
      picked.push(next.trim());
    }
  }
  const fixtures = [...new Set(picked)];
  if (!fixtures.length) return { ok: false, error: "no fixture given (--fixture <id>, --fixtures a,b,c, --fresh or --all)" };
  const unknown = fixtures.filter((f) => !known.includes(f));
  if (unknown.length) return { ok: false, error: `unknown fixture(s): ${unknown.join(", ")}` };
  return { ok: true, fixtures };
}

/** The (paid) command that records a twin's, hard or fresh fixture's homepage (tools/eval/recordings-home-off, or recordings-fresh10). */
export function recordCommand(id: string, kind: ReplayedKind): string {
  if (kind === "fresh") return `pnpm eval --fresh --record-missing --recordings tools/eval/recordings-fresh10 --only ${id} --scope home --no-edits --no-judge --no-lighthouse`;
  return `pnpm eval --record-missing --recordings tools/eval/recordings-home-off --only ${id} ${kind === "twin" ? "--twins" : "--hard"} --scope home --photos 0 --no-edits --no-judge --no-lighthouse`;
}

/** A fixture as the studio reads it. */
export interface StudioFixture {
  id: string;
  kind: FixtureKind;
  spec: SiteSpec;
  brief?: PresetBrief;
  corpus: string;
  tradeWord?: string;
  general?: boolean;
  photo: (imgId: string) => Promise<Uint8Array | undefined>;
  logo?: () => Promise<Uint8Array | undefined>;
  /** The media files of `spec` (today's, or the studio's with its crops) for the screenshots; sets image sizes on `spec`. */
  media: (spec: SiteSpec, crops: ReadonlyMap<string, Uint8Array>) => Promise<Map<string, Uint8Array>>;
  /** How the base was made, one line. */
  note: string;
}

/** The goldens' and edge fixtures' media: the fixture's photos and logo for its own images, the crops from `crops`. */
function fileMedia(config: AppConfig, id: string) {
  return async (spec: SiteSpec, crops: ReadonlyMap<string, Uint8Array>): Promise<Map<string, Uint8Array>> => {
    const media = new Map<string, Uint8Array>();
    const widths = config.images.widths;
    const fx = isEdgeFixture(id) ? null : loadFixture(id);
    for (const [i, img] of spec.assets.images.entries()) {
      const crop = crops.get(img.id);
      const data =
        crop ??
        (fx && img.origin !== "generated"
          ? await (async () => {
              const p = photoForImage(fx.photos, img, i);
              return p ? new Uint8Array(await readFile(p.path)) : undefined;
            })()
          : undefined);
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
  };
}

/** A golden's own photos by image id, as the studio asks for them. */
function goldenPhoto(id: string, base: SiteSpec) {
  const files = loadFixture(id);
  return async (imgId: string): Promise<Uint8Array | undefined> => {
    const i = base.assets.images.findIndex((x) => x.id === imgId);
    const p = i >= 0 ? photoForImage(files.photos, base.assets.images[i]!, i) : undefined;
    return p ? new Uint8Array(await readFile(p.path)) : undefined;
  };
}

/**
 * The golden's recorded brief (tools/eval/recordings/<id>/: the last brief answer that parses, the one the pipeline
 * kept), with the facts the client didn't write dropped (verifyBriefFacts, as makeBrief does). No model call.
 */
export function recordedBrief(id: string, description: string, dir = path.join(FULL_RECORDINGS, id)): Brief {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+-brief\.json$/.test(f)).sort() : [];
  for (const f of files.reverse()) {
    const rec = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { response: { text: string } };
    try {
      const parsed = Brief.safeParse(JSON.parse(rec.response.text));
      if (parsed.success) return verifyBriefFacts(parsed.data, description).brief;
    } catch {
      // not JSON: an answer the pipeline retried
    }
  }
  throw new Error(`${id}: no recorded brief in ${path.relative(repoRoot, dir)}`);
}

/** A golden, an edge or a composer fixture. */
export function fileFixture(id: string, config: AppConfig): StudioFixture {
  const kind = fixtureKind(id);
  if (kind === "edge") {
    const e = edgeFixture(id as (typeof EDGE_FIXTURES)[number]);
    return { id, kind, spec: e.base, brief: e.brief, corpus: e.description, general: true, photo: async () => undefined, media: fileMedia(config, id), note: "stand-in base (studio-edge.ts)" };
  }
  if (kind === "composer") {
    const fx = composerFixture(id);
    const files = loadFixture(id);
    return {
      id,
      kind,
      spec: fx.base,
      ...(fx.sources.brief ? { brief: fx.sources.brief } : {}),
      corpus: fx.description,
      ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}),
      photo: goldenPhoto(id, fx.base),
      ...(files.logoPath ? { logo: async () => new Uint8Array(await readFile(files.logoPath!)) } : {}),
      media: fileMedia(config, id),
      note: "golden spec, composer sources",
    };
  }
  if (kind === "golden") {
    const files = loadFixture(id);
    const base = migrateSpec(JSON.parse(readFileSync(path.join(repoRoot, "tools/eval/golden", `${id}.json`), "utf8"))) as SiteSpec;
    return {
      id,
      kind,
      spec: base,
      brief: recordedBrief(id, files.brief.description) as PresetBrief,
      corpus: files.brief.description,
      photo: goldenPhoto(id, base),
      ...(files.logoPath ? { logo: async () => new Uint8Array(await readFile(files.logoPath!)) } : {}),
      media: fileMedia(config, id),
      note: "golden spec, recorded brief",
    };
  }
  throw new Error(`${id} is not a golden, composer or edge fixture`);
}

/** Generated pictures from the eval's picture cache (free); a request the cache doesn't hold gets a flat stand-in, never fal. */
export class CachedOrStandInImages implements ImageTransport {
  readonly stats = { cached: 0, standIn: 0 };
  private readonly standIn = new StandInImageTransport();
  constructor(private readonly dir = IMAGE_CACHE) {}
  async generate(model: ImageGenModelConfig, body: Record<string, unknown>): Promise<Uint8Array> {
    const key = pictureKey(model, body);
    const hit = ["jpg", "png", "webp"].map((ext) => path.join(this.dir, `${key}.${ext}`)).find((f) => existsSync(f));
    if (hit) {
      this.stats.cached++;
      return new Uint8Array(readFileSync(hit));
    }
    this.stats.standIn++;
    return this.standIn.generate(model, body);
  }
}

/**
 * A twin's or hard fixture's homepage as today's pipeline makes it, replayed from tools/eval/recordings-home-off/<id>/
 * (no network, no cost). `strict`: a request that changed since it was recorded fails the fixture.
 */
export async function replayedFixture(id: string, kind: ReplayedKind, config: AppConfig, browser: CheckBrowser, strict = true): Promise<StudioFixture> {
  const fixture = loadFixture(id, kind === "twin" ? TWINS_DIR : kind === "hard" ? HARD_DIR : FRESH_DIR);
  const recordings = baseRecordings(kind, id);
  const record = recordCommand(id, kind);
  if (!existsSync(recordings) || !readdirSync(recordings).some((f) => f.endsWith(".json"))) throw new Error(`${id}: no recordings in ${path.relative(repoRoot, recordings)}; record them (paid) with: ${record}`);
  const work = await mkdtemp(path.join(tmpdir(), `sb-studio-base-${id}-`));
  const db = await createDb("pglite://memory");
  try {
    await migrate(db);
    const repo = new Repo(db);
    const storage = createFsStorage(path.join(work, "storage"));
    const site = await repo.createSite({ name: id, slug: id, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "home" } });
    if (fixture.logoPath) {
      const data = new Uint8Array(await readFile(fixture.logoPath));
      const key = `sites/${site.id}/uploads/logo.svg`;
      await storage.put(key, data, "image/svg+xml");
      const logo = await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: key, mime: "image/svg+xml", width: null, height: null, bytes: data.length, original_name: "logo.svg" });
      await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: fixture.brief.description, scope: "home", photoAssetIds: [], logoAssetId: logo.id })]);
    }
    const replay = new ReplayTransport(recordings, strict);
    const capture = new CaptureTransport(replay);
    const client = new ModelClient({ config, transport: capture, spentToday: async () => 0, onCall: async () => undefined });
    const pictures = new CachedOrStandInImages();
    const images = new ImageGenerator({ config, transport: pictures, spentToday: async () => 0, onCall: async () => undefined });
    try {
      await generateSite({ config, repo, storage, client, browser, lighthouse: false, images }, site.id, null);
    } catch (e) {
      throw new Error(`${id}: the replay of ${path.relative(repoRoot, recordings)} failed (${(e as Error).message}); re-record it (paid) with: ${record}`, { cause: e });
    }
    const saved = await repo.getSpec(site.id);
    if (!saved) throw new Error(`${id}: the replay saved no spec; re-record it (paid) with: ${record}`);
    if (replay.remaining > 0) console.log(`  ${id}: ${replay.remaining} recording(s) left unused`);
    const spec = saved.spec;
    const brief = (await repo.getSite(site.id))!.brief as PresetBrief;
    const classify = capture.calls.find((c) => c.stage === "classify")?.response as { confidence?: number } | undefined;
    const general = typeof classify?.confidence === "number" && classify.confidence < config.studio.generalBelowConfidence;
    const widths = [...config.images.widths];
    const baseMedia = await loadMedia(storage, site.id, spec, widths);
    const largest = (imgId: string): Uint8Array | undefined => {
      const img = spec.assets.images.find((i) => i.id === imgId);
      const w = img ? Math.max(...variantWidths(img, widths)) : undefined;
      return img && w ? baseMedia.get(variantFile(imgId, w, "webp")) : undefined;
    };
    const logoFile = spec.assets.logo?.file;
    return {
      id,
      kind,
      spec,
      brief,
      corpus: fixture.brief.description,
      ...(general ? { general } : {}),
      photo: async (imgId) => largest(imgId),
      ...(logoFile && fixture.logoPath ? { logo: async () => new Uint8Array(await readFile(fixture.logoPath!)) } : {}),
      media: async (s, crops) => {
        const media = new Map(baseMedia);
        for (const [imgId, jpeg] of crops) {
          const processed = await processPhoto(imgId, jpeg, widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
          for (const v of processed.variants) media.set(v.file, v.data);
          const img = s.assets.images.find((i) => i.id === imgId);
          if (img) {
            img.width = processed.width;
            img.height = processed.height;
          }
        }
        return media;
      },
      note: `today's pipeline replayed (${capture.calls.map((c) => c.stage).join(", ")}; ${replay.hashMismatches.length} changed request(s); pictures ${pictures.stats.cached} cached, ${pictures.stats.standIn} stand-in; ${general ? "general" : "trade"} shortlist)`,
    };
  } finally {
    await db.close();
    await rm(work, { recursive: true, force: true });
  }
}
