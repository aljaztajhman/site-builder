/**
 * Studio 0.5b, the mockup pipeline (docs/plans/studio-0.5.md "Mockup pipeline", docs/plans/mockup-spike.md spike 2):
 *
 *   1. the art director (Opus, vision: the client's photos and logo) writes one direction and the image prompt;
 *   2. GPT Image paints one desktop homepage mockup from it, the client's photos and logo as references (fal, booked
 *      under the daily cap as stage "mockup");
 *   3. the rebuild (Opus, vision) writes the page in the composition language, facts only through slots;
 *   4. code cuts the accepted decorative crops (labelled AI pictures), assembles and checks the page.
 *
 * Every paid call is sent only when the run's spend so far plus its estimate stays within studio.perRunMaxEur. Any
 * failure is `ok: false` with the reason; the caller (runStudio) falls back to the picker, then to today's site.
 */
import sharp from "sharp";
import { costEur as priceOf, type AppConfig, type ModelStageName } from "@sb/config";
import { type ImageAsset, type SiteSpec } from "@sb/spec";
import type { ComposeSources } from "@sb/inventory";
import { ModelOutputError, estimateCallEur, extractJson, type ModelClient, type ModelRequest, type ModelResponse } from "../llm/client.ts";
import { imageCostEur, type ImageGenerator } from "../image-gen.ts";
import { ArtDirection, artDirectorRequest, mockupPrompt, mockupTexts } from "./art-director.ts";
import { HEADLINE_MAX, LEAD_MAX, keptCopy } from "./director.ts";
import { RebuildAnswer, RebuildError, assembleRebuild, checkCrops, rebuildRequest, rebuildWordmarks, type CropVerdict } from "./rebuild.ts";

/** What the mockup path needs from its host (the pipeline's storage, the eval's fixture files). */
export interface MockupDeps {
  /** Paints the mockup (fal); its `paint` books under the daily cap. */
  painter: Pick<ImageGenerator, "paint">;
  /** The client's photo by image id (any format sharp reads), or undefined. */
  photo(id: string): Promise<Uint8Array | undefined>;
  /** The client's logo (PNG or SVG bytes), when they gave one. */
  logo?(): Promise<Uint8Array | undefined>;
  /** Fresh image ids for `n` crops. */
  imageIds(n: number): Promise<string[]>;
  /** Stores a crop's JPEG under its id and returns the asset's src (storage key). */
  store(id: string, jpeg: Uint8Array): Promise<string>;
}

export interface MockupRun {
  ok: boolean;
  reason?: string;
  spec?: SiteSpec;
  idea?: string;
  direction?: string;
  sections?: string[];
  dropped: string[];
  crops: CropVerdict[];
  /** What the run spent, by stage. */
  eur: { artDirector: number; mockup: number; rebuild: number };
  /** The mockup as painted (JPEG), for the eval's sheets; never published. */
  mockup?: Uint8Array;
  /** The art director's whole answer (the eval writes it next to the shots). */
  art?: ArtDirection;
}

export const runTotal = (r: Pick<MockupRun, "eur">): number => r.eur.artDirector + r.eur.mockup + r.eur.rebuild;

class MockupStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockupStop";
  }
}

const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");

async function visionJpeg(data: Uint8Array, maxSide: number, quality = 72): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { density: 200 }).rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer());
}

async function logoPng(data: Uint8Array, maxSide: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { density: 300 }).resize(maxSide, maxSide, { fit: "inside" }).flatten({ background: "#ffffff" }).png().toBuffer());
}

const priced = (config: AppConfig, stage: ModelStageName, client: ModelClient, res: ModelResponse): number =>
  priceOf(config, config.pricesUsdPerMTok[res.model] ? res.model : client.stageConfig(stage).model, res.usage);

/**
 * The mockup path on one site. Never throws. `known`: the digit runs the client gave (director.ts knownNumbers);
 * `budget`: what the run may still spend.
 */
export async function runMockup(client: ModelClient, config: AppConfig, input: { spec: SiteSpec; sources: ComposeSources; known: ReadonlySet<string>; deps: MockupDeps; budget: number }): Promise<MockupRun> {
  const run: MockupRun = { ok: false, dropped: [], crops: [], eur: { artDirector: 0, mockup: 0, rebuild: 0 } };
  const m = config.studio.mockup;
  const spent = () => runTotal(run);
  const fits = (what: string, estimate: number) => {
    if (spent() + estimate > input.budget) throw new MockupStop(`cost cap: ${what} (est. €${estimate.toFixed(3)}) would take the run to €${(spent() + estimate).toFixed(3)}, over €${input.budget.toFixed(2)}`);
  };
  const call = async (req: ModelRequest, stage: "artDirector" | "rebuild"): Promise<ModelResponse> => {
    fits(stage, estimateCallEur(config, client.stageConfig(stage), req));
    try {
      const res = await client.call(req);
      run.eur[stage] += priced(config, stage, client, res);
      return res;
    } catch (e) {
      if (e instanceof ModelOutputError) run.eur[stage] += e.costEur;
      throw e;
    }
  };
  try {
    const { spec, sources, deps } = input;
    // The client's photos (never generated pictures) and logo, once for both vision calls and the image model.
    const clientPhotos = spec.assets.images.filter((i) => (i.origin ?? "client") === "client").slice(0, 4);
    const photoBytes: { id: string; alt: string; data: Uint8Array }[] = [];
    for (const p of clientPhotos) {
      const data = await deps.photo(p.id);
      if (data) photoBytes.push({ id: p.id, alt: p.alt, data });
    }
    const logoRaw = spec.assets.logo && deps.logo ? await deps.logo() : undefined;
    const vision = await Promise.all(photoBytes.map(async (p) => ({ id: p.id, alt: p.alt, jpegBase64: b64(await visionJpeg(p.data, 768)) })));
    const logo = logoRaw ? await logoPng(logoRaw, 512) : undefined;

    // 1. The art director.
    const adReq = artDirectorRequest({ spec, sources, photos: vision, ...(logo ? { logoPngBase64: b64(logo) } : {}), size: { width: m.width, height: m.height } });
    const adRes = await call(adReq, "artDirector");
    let direction: ArtDirection;
    try {
      direction = ArtDirection.parse(JSON.parse(extractJson(adRes.text)));
    } catch (e) {
      throw new MockupStop(`art director: unusable answer (${(e as Error).message.slice(0, 160)})`);
    }
    run.art = direction;
    run.idea = direction.idea;
    run.direction = direction.name;
    // The hero copy: the art director's where it passes the copy checks, else today's.
    const headline = keptCopy(direction.copy.headline, HEADLINE_MAX, input.known, run.dropped, "art director headline");
    const lead = keptCopy(direction.copy.lead, LEAD_MAX, input.known, run.dropped, "art director lead");
    const heroCopy = { ...sources.copy.hero, ...(headline ? { headline } : {}), ...(lead ? { lead } : {}) };

    // 2. The mockup.
    const refs = photoBytes.length || logo;
    const modelName = refs ? m.model : m.textModel;
    const model = config.imageGen.models[modelName];
    if (!model) throw new MockupStop(`config: imageGen.models has no ${modelName}`);
    fits("mockup", imageCostEur(config, model, m.width, m.height));
    const refUrls = refs ? [...(await Promise.all(photoBytes.map(async (p) => `data:image/jpeg;base64,${b64(await visionJpeg(p.data, m.refMaxSide, 85))}`))), ...(logo ? [`data:image/png;base64,${b64(logo)}`] : [])] : [];
    const prompt = mockupPrompt(direction, mockupTexts(spec, sources, heroCopy), { photos: photoBytes.length > 0, logo: !!logo });
    const painted = await (async () => {
      try {
        return await deps.painter.paint(modelName, { prompt, image_size: { width: m.width, height: m.height }, quality: m.quality, output_format: "jpeg", ...(refUrls.length ? { image_urls: refUrls } : {}) }, { stage: "mockup" });
      } catch (e) {
        throw new MockupStop(`mockup image: ${(e as Error).message.slice(0, 200)}`);
      }
    })();
    run.eur.mockup += painted.costEur;
    run.mockup = painted.data;

    // 3. The rebuild.
    const rbPhotos = await Promise.all(photoBytes.map(async (p) => ({ id: p.id, alt: p.alt, jpegBase64: b64(await visionJpeg(p.data, 512)) })));
    const rbReq = rebuildRequest({
      spec,
      sources,
      mockup: { jpegBase64: b64(painted.data), width: painted.width, height: painted.height },
      photos: rbPhotos,
      direction: { name: direction.name, idea: direction.idea, signature: direction.signature, composition: direction.composition, pairing: direction.pairing },
      heroCopy,
      wordmarks: rebuildWordmarks(spec),
    });
    const rbRes = await call(rbReq, "rebuild");
    let answer: RebuildAnswer;
    try {
      answer = RebuildAnswer.parse(JSON.parse(extractJson(rbRes.text)));
    } catch (e) {
      throw new MockupStop(`rebuild: unusable answer (${(e as Error).message.slice(0, 200)})`);
    }

    // 4. The crops, then the page.
    run.crops = checkCrops(answer, { width: painted.width, height: painted.height }, m.maxCrops);
    const ok = run.crops.filter((c) => c.ok);
    const ids = ok.length ? await deps.imageIds(ok.length) : [];
    const crops = new Map<string, ImageAsset>();
    for (const [i, c] of ok.entries()) {
      const id = ids[i]!;
      const jpeg = new Uint8Array(await sharp(painted.data).extract({ left: c.box.x, top: c.box.y, width: c.box.w, height: c.box.h }).jpeg({ quality: 90 }).toBuffer());
      const src = await deps.store(id, jpeg);
      crops.set(c.id, { id, src, width: c.box.w, height: c.box.h, alt: c.alt, origin: "generated" });
    }
    const page = assembleRebuild({ base: spec, sources, answer, heroCopy, known: input.known, crops, idea: direction.idea });
    run.dropped.push(...run.crops.filter((c) => !c.ok).map((c) => `${c.id} refused: ${c.reason}`), ...page.dropped);
    return { ...run, ok: true, spec: page.spec, sections: page.sections };
  } catch (e) {
    const reason = e instanceof MockupStop || e instanceof RebuildError ? e.message : `${(e as Error).name}: ${(e as Error).message}`;
    return { ...run, ok: false, reason: reason.slice(0, 400) };
  }
}
