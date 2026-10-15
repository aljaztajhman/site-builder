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
 *
 * The direct path (studio.mode "direct", the Fable studio) is the same run without step 2 and the crops: the art
 * director writes for direct composition (stage artDirectorDirect), the composer writes the page from the direction
 * alone (stage composeDirect, the rebuild's answer format), and the image model is never called.
 */
import sharp from "sharp";
import { costEur as priceOf, type AppConfig, type ModelStageName } from "@sb/config";
import { type ImageAsset, type SiteSpec } from "@sb/spec";
import type { ComposeSources } from "@sb/inventory";
import { ModelOutputError, estimateCallEur, extractJson, type ModelClient, type ModelRequest, type ModelResponse } from "../llm/client.ts";
import { imageCostEur, type ImageGenerator } from "../image-gen.ts";
import { ArtDirection, artDirectorRequest, mockupPrompt, mockupTexts } from "./art-director.ts";
import { HEADLINE_MAX, LEAD_MAX, keptCopy } from "./director.ts";
import { RebuildAnswer, RebuildError, assembleRebuild, checkCrops, literalContext, rebuildRequest, rebuildWordmarks, unknownNames, type CropVerdict } from "./rebuild.ts";

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
  /** What the run spent, by step (direct: artDirector is stage artDirectorDirect, rebuild is composeDirect, mockup stays 0). */
  eur: { artDirector: number; mockup: number; rebuild: number };
  /** The mockup as painted (JPEG), for the eval's sheets; never published. */
  mockup?: Uint8Array;
  /** The art director's whole answer (the eval writes it next to the shots). */
  art?: ArtDirection;
  /** Estimates of paid calls sent and not yet booked (counted as spent when the run is cut off). */
  inFlightEur: number;
}

export const newMockupRun = (): MockupRun => ({ ok: false, dropped: [], crops: [], eur: { artDirector: 0, mockup: 0, rebuild: 0 }, inFlightEur: 0 });

/** What the run has booked. */
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
 * The mockup path on one site, or with `direct` the direct path (no mockup, no crops, no image call). Never throws.
 * `known`: the digit runs the client gave (director.ts knownNumbers); `budget`: what the run may still spend.
 */
export async function runMockup(
  client: ModelClient,
  config: AppConfig,
  input: {
    spec: SiteSpec;
    sources: ComposeSources;
    known: ReadonlySet<string>;
    /** Everything the client wrote: the literal check's words and web addresses. */
    corpus: string;
    deps: MockupDeps;
    budget: number;
    /** studio.mode "direct": the art director and the composer on their direct stages; the painter is never called. */
    direct?: boolean;
    /** Aborted (the time limit): nothing more is sent; the run stops at its next step. */
    signal?: AbortSignal;
    /** The run's record, when the caller wants to read its spend while it runs (the time limit). */
    run?: MockupRun;
  },
): Promise<MockupRun> {
  const run: MockupRun = input.run ?? newMockupRun();
  const m = config.studio.mockup;
  const spent = () => runTotal(run);
  const fits = (what: string, estimate: number) => {
    if (input.signal?.aborted) throw new MockupStop(`stopped before ${what}: ${String(input.signal.reason ?? "aborted")}`);
    if (spent() + estimate > input.budget) throw new MockupStop(`cost cap: ${what} (est. €${estimate.toFixed(3)}) would take the run to €${(spent() + estimate).toFixed(3)}, over €${input.budget.toFixed(2)}`);
  };
  /** A paid step: its estimate counts as in flight until it is booked. */
  const paid = async <T>(what: string, estimate: number, fn: () => Promise<T>): Promise<T> => {
    fits(what, estimate);
    run.inFlightEur += estimate;
    try {
      return await fn();
    } finally {
      run.inFlightEur -= estimate;
    }
  };
  const direct = input.direct === true;
  /** A model call on its request's stage, booked under the run's artDirector or rebuild step. */
  const call = async (req: ModelRequest, step: "artDirector" | "rebuild"): Promise<ModelResponse> =>
    paid(req.stage, estimateCallEur(config, client.stageConfig(req.stage), req), async () => {
      try {
        const res = await client.call(req);
        run.eur[step] += priced(config, req.stage, client, res);
        return res;
      } catch (e) {
        if (e instanceof ModelOutputError) run.eur[step] += e.costEur;
        throw e;
      }
    });
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
    const adReq = artDirectorRequest({ spec, sources, photos: vision, ...(logo ? { logoPngBase64: b64(logo) } : {}), ...(direct ? { direct } : { size: { width: m.width, height: m.height } }) });
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
    const literal = literalContext(spec, sources, input.corpus, input.known);
    const named = (s: string | undefined, what: string): string | undefined => {
      const names = s ? unknownNames(s, literal.words) : [];
      if (names.length) run.dropped.push(`${what}: ${names.join(", ")} not in the client's words`);
      return names.length ? undefined : s;
    };
    const headline = named(keptCopy(direction.copy.headline, HEADLINE_MAX, input.known, run.dropped, "art director headline"), "art director headline");
    const lead = named(keptCopy(direction.copy.lead, LEAD_MAX, input.known, run.dropped, "art director lead"), "art director lead");
    const heroCopy = { ...sources.copy.hero, ...(headline ? { headline } : {}), ...(lead ? { lead } : {}) };

    const rbPhotos = async () => Promise.all(photoBytes.map(async (p) => ({ id: p.id, alt: p.alt, jpegBase64: b64(await visionJpeg(p.data, 512)) })));
    const rbDirection = { name: direction.name, idea: direction.idea, signature: direction.signature, composition: direction.composition, pairing: direction.pairing };
    const parseAnswer = (res: ModelResponse, what: string): RebuildAnswer => {
      try {
        return RebuildAnswer.parse(JSON.parse(extractJson(res.text)));
      } catch (e) {
        throw new MockupStop(`${what}: unusable answer (${(e as Error).message.slice(0, 200)})`);
      }
    };
    const finish = (answer: RebuildAnswer, crops: ReadonlyMap<string, ImageAsset>): MockupRun => {
      const page = assembleRebuild({ base: spec, sources, answer, heroCopy, literal, crops, idea: direction.idea });
      run.dropped.push(...run.crops.filter((c) => !c.ok).map((c) => `${c.id} refused: ${c.reason}`), ...page.dropped);
      return { ...run, ok: true, spec: page.spec, sections: page.sections };
    };

    if (direct) {
      // 2–3 without a picture: the composer works from the direction's words (palette, type, imagery too) and the photos.
      const cdReq = rebuildRequest({ spec, sources, photos: await rbPhotos(), direction: { ...rbDirection, palette: direction.palette, typeCharacter: direction.typeCharacter, imagery: direction.imagery }, heroCopy, wordmarks: rebuildWordmarks(spec) });
      const answer = parseAnswer(await call(cdReq, "rebuild"), "compose");
      // Nothing to cut: any crop or photo region the answer names is ignored, and a "{crop.N}" element is dropped.
      return finish({ ...answer, crops: [], photoRegions: [] }, new Map());
    }

    // 2. The mockup.
    const refs = photoBytes.length || logo;
    const modelName = refs ? m.model : m.textModel;
    const model = config.imageGen.models[modelName];
    if (!model) throw new MockupStop(`config: imageGen.models has no ${modelName}`);
    const refUrls = refs ? [...(await Promise.all(photoBytes.map(async (p) => `data:image/jpeg;base64,${b64(await visionJpeg(p.data, m.refMaxSide, 85))}`))), ...(logo ? [`data:image/png;base64,${b64(logo)}`] : [])] : [];
    const prompt = mockupPrompt(direction, mockupTexts(spec, sources, heroCopy), { photos: photoBytes.length > 0, logo: !!logo });
    const painted = await paid("mockup", imageCostEur(config, model, m.width, m.height), async () => {
      try {
        return await deps.painter.paint(modelName, { prompt, image_size: { width: m.width, height: m.height }, quality: m.quality, output_format: "jpeg", ...(refUrls.length ? { image_urls: refUrls } : {}) }, { stage: "mockup", ...(input.signal ? { signal: input.signal } : {}) });
      } catch (e) {
        throw new MockupStop(`mockup image: ${(e as Error).message.slice(0, 200)}`);
      }
    });
    run.eur.mockup += painted.costEur;
    run.mockup = painted.data;

    // 3. The rebuild.
    const rbReq = rebuildRequest({
      spec,
      sources,
      mockup: { jpegBase64: b64(painted.data), width: painted.width, height: painted.height },
      photos: await rbPhotos(),
      direction: rbDirection,
      heroCopy,
      wordmarks: rebuildWordmarks(spec),
    });
    const answer = parseAnswer(await call(rbReq, "rebuild"), "rebuild");

    // 4. The crops, then the page.
    run.crops = checkCrops(answer, { width: painted.width, height: painted.height }, m.maxCrops, { clientPhotos: photoBytes.length });
    const ok = run.crops.filter((c) => c.ok);
    const ids = ok.length ? await deps.imageIds(ok.length) : [];
    const crops = new Map<string, ImageAsset>();
    for (const [i, c] of ok.entries()) {
      const id = ids[i]!;
      const jpeg = new Uint8Array(await sharp(painted.data).extract({ left: c.box.x, top: c.box.y, width: c.box.w, height: c.box.h }).jpeg({ quality: 90 }).toBuffer());
      const src = await deps.store(id, jpeg);
      crops.set(c.id, { id, src, width: c.box.w, height: c.box.h, alt: c.alt, origin: "generated" });
    }
    return finish(answer, crops);
  } catch (e) {
    const reason = e instanceof MockupStop || e instanceof RebuildError ? e.message : `${(e as Error).name}: ${(e as Error).message}`;
    return { ...run, ok: false, reason: reason.slice(0, 400) };
  }
}
