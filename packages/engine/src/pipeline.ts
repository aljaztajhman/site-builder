import type { AppConfig } from "@sb/config";
import { VersionConflictError, type Repo, type Storage } from "@sb/platform";
import { contentType } from "@sb/platform";
import { mediaFiles, siteFiles, exportZip } from "@sb/render";
import { blockerText, direction as directionById, publishChecklist, templateFor, validateSite, type ImageAsset, type PublishBlocker, type SiteSpec } from "@sb/spec";
import type { Operation } from "fast-json-patch";
import { ModelOutputError, SpendCapError, type ModelClient } from "./llm/client.ts";
import { classify, makeBrief, chooseDesign, altTexts, generateContent, critique, applyPatches, editSpec, drawsInsteadOfPhotos } from "./stages.ts";
import { extractSwatches, type Swatch } from "./palette.ts";
import { processLogo, processPhoto, visionJpeg } from "./images.ts";
import type { ImageGenerator } from "./image-gen.ts";
import { checkSite, type CheckBrowser, type SiteCheckReport } from "./check/index.ts";
import { typedText } from "./editor.ts";
import { checkFacts } from "./facts.ts";
import { newReleaseId, writeRelease } from "./published.ts";
import { keepOwnerFacts } from "./owner-facts.ts";
import { claimImageIds } from "./image-ids.ts";

export interface PipelineDeps {
  config: AppConfig;
  repo: Repo;
  storage: Storage;
  client: ModelClient;
  /** Shared browser for checks (optional). */
  browser?: CheckBrowser;
  /** Skip Lighthouse in the app pipeline when speed matters; eval always runs it. */
  lighthouse?: boolean;
  /** Generates mood images when the client gave too few photos (config imageGen.pipeline); absent = never. */
  images?: ImageGenerator;
}

/** The classifier couldn't place the description (below tiers.junk.minClassifierConfidence): stopped before the brief. */
export class JunkIntakeError extends Error {
  constructor(readonly confidence: number) {
    super(`The classifier couldn't place the description (confidence ${confidence.toFixed(2)}); stopped before any further model call`);
    this.name = "JunkIntakeError";
  }
}

export const mediaKey = (siteId: string, file: string) => `sites/${siteId}/media/${file}`;
export const uploadKey = (siteId: string, assetId: string) => `sites/${siteId}/uploads/${assetId}`;

export async function loadMedia(storage: Storage, siteId: string, spec: SiteSpec, widths: number[]): Promise<Map<string, Uint8Array>> {
  const media = new Map<string, Uint8Array>();
  for (const f of mediaFiles(spec, widths)) {
    const data = await storage.get(mediaKey(siteId, f));
    if (data) media.set(f, data);
  }
  return media;
}

/**
 * Everything the client wrote: intake description, chat messages and text typed in the direct editor.
 * The fact check compares against this.
 */
export async function clientCorpus(repo: Repo, siteId: string): Promise<string> {
  const site = await repo.getSite(siteId);
  const chat = await repo.listChat(siteId);
  const typed = (await repo.manualPatches(siteId)).flatMap((ops) => typedText(ops as Operation[]));
  return [site?.intake.description ?? "", ...chat.filter((c) => c.role === "user").map((c) => c.content), ...typed].join("\n");
}

type Log = (stage: string, message: string, data?: unknown) => Promise<void>;

function logger(repo: Repo, siteId: string, jobId: string | null): Log {
  return (stage, message, data) => repo.addEvent({ siteId, jobId, stage, message, data });
}

async function timed<T>(log: Log, stage: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  await log(stage, "start");
  const r = await fn();
  await log(stage, "done", { ms: Date.now() - t });
  return r;
}

export interface GenerateResult {
  version: number;
  check: SiteCheckReport | null;
  critiqueRounds: number;
  timings: Record<string, number>;
  /** From the start of the job to the first saved version, which the editor already shows as the preview. */
  firstVersionMs: number;
}

/** Pipeline steps 1–5 from docs/PRODUCT.md. Every model call is logged per stage with tokens and €. */
export async function generateSite(deps: PipelineDeps, siteId: string, jobId: string | null): Promise<GenerateResult> {
  const { repo, storage, config, client } = deps;
  const site = await repo.getSite(siteId);
  if (!site) throw new Error(`Site ${siteId} not found`);
  const log = logger(repo, siteId, jobId);
  const started = Date.now();
  const timings: Record<string, number> = {};
  const stageTime = async <T>(stage: string, fn: () => Promise<T>) => {
    const t = Date.now();
    const r = await timed(log, stage, fn);
    timings[stage] = (timings[stage] ?? 0) + (Date.now() - t);
    return r;
  };
  await repo.setStatus(siteId, "generating");
  const intake = site.intake;
  const assets = await repo.listAssets(siteId);
  const photos = intake.photoAssetIds.map((id) => assets.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  const logo = intake.logoAssetId ? assets.find((a) => a.id === intake.logoAssetId) : undefined;

  const originals = new Map<string, Uint8Array>();
  for (const a of [...photos, ...(logo ? [logo] : [])]) {
    const data = await storage.get(a.storage_key);
    if (!data) throw new Error(`Upload ${a.id} missing from storage`);
    originals.set(a.id, data);
  }

  // Steps 1–2 (brief, design) and step 3 (images) don't depend on each other: they run side by side,
  // so photo processing and alt text (up to ~20 s with many photos) are off the path to the first preview.
  const slots = generatedImageCount(config, photos.length, !!deps.images, intake.scope);
  // 1. Classify first. The intake may have asked the classifier already (its junk check). Junk, a
  // description the classifier can't place (config tiers.junk), gets no Sonnet or image call: the brief
  // and the photos' alt texts both wait for this.
  const classified = stageTime("classify", async () => intake.classification ?? (await classify(client, intake.description))).then((cls) => {
    if (cls.confidence < config.tiers.junk.minClassifierConfidence) throw new JunkIntakeError(cls.confidence);
    return cls;
  });
  // Awaited below by both branches; without a handler now, an early rejection would be unhandled.
  classified.catch(() => undefined);
  const planning = (async () => {
    // 1. Intake -> brief
    const cls = await classified;
    const { brief, dropped } = await stageTime("brief", () =>
      makeBrief(client, { description: intake.description, businessType: cls.businessType, photoCount: photos.length, generatedSlots: slots.wanted, hasLogo: !!logo, scope: intake.scope }),
    );
    if (dropped.length) await log("brief", "Dropped facts not found in the client's text", dropped);
    await repo.setBrief(siteId, brief, brief.name);

    // 3b. Too few photos: generated mood images, beside the design step (they don't need it). When the trade's
    // template draws instead of showing pictures (template S), they wait for the design: chosen, it needs none.
    if (slots.skipped) await log("imageGen", slots.skipped);
    const ideas = brief.imageIdeas.slice(0, slots.wanted);
    const template = templateFor(brief.businessType, photos.length);
    const waitForDesign = ideas.length > 0 && template !== undefined && drawsInsteadOfPhotos(template);
    const startImages = (): Promise<ImageAsset[]> => (ideas.length ? stageTime("imageGen", () => generateImages(deps, siteId, ideas, log)) : Promise.resolve([]));
    let generating: Promise<ImageAsset[]> = waitForDesign ? Promise.resolve([]) : startImages();
    // Awaited only after the design call: without a handler now, an early rejection (spend cap) would crash the process.
    generating.catch(() => undefined);

    // 2. Design direction (palette extracted in code)
    const swatches: Swatch[] = [];
    if (logo) swatches.push(...(await extractSwatches(originals.get(logo.id)!, "logo", 3)));
    for (const p of photos.slice(0, 3)) swatches.push(...(await extractSwatches(originals.get(p.id)!, "photo", 2)));
    const { design } = await stageTime("design", () => chooseDesign(client, { brief, swatches, photoCount: photos.length, generatedCount: ideas.length }));
    // The editor's live preview recolours its skeleton with these while the content is written.
    await log("design", "Direction chosen", { direction: design.direction, colors: design.colors });
    if (waitForDesign) {
      if (drawsInsteadOfPhotos(directionById(design.direction))) await log("imageGen", `${design.direction} draws the trade instead of showing pictures; no pictures generated`);
      else generating = startImages();
    }
    return { brief, design, generated: await generating };
  })();

  // 3. Images: variants + Slovene alt text
  const images: ImageAsset[] = [];
  let logoAsset: SiteSpec["assets"]["logo"];
  const heroIds: string[] = [];
  const imaging = stageTime("images", async () => {
    const vision: { jpegBase64: string }[] = [];
    for (const [i, p] of photos.entries()) {
      const id = `img_${String(i + 1).padStart(2, "0")}`;
      const processed = await processPhoto(id, originals.get(p.id)!, config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
      for (const v of processed.variants) await storage.put(mediaKey(siteId, v.file), v.data, contentType(v.file));
      images.push({ id, src: p.storage_key, width: processed.width, height: processed.height, alt: "" });
      vision.push({ jpegBase64: await visionJpeg(originals.get(p.id)!) });
    }
    // The variants exist now; the editor's live preview shows the photos before the alt texts are back.
    if (images.length) await log("images", "Photos ready", { ids: images.map((i) => i.id) });
    await classified;
    const alts = await altTexts(client, vision);
    alts.forEach((a, i) => {
      images[i]!.alt = a.alt.slice(0, 180);
      images[i]!.focal = a.focal;
      if (a.heroSuitable) heroIds.push(images[i]!.id);
    });
    if (logo) {
      const l = await processLogo(originals.get(logo.id)!, logo.mime);
      await storage.put(mediaKey(siteId, l.file), l.data, contentType(l.file));
      logoAsset = { src: logo.storage_key, width: l.width, height: l.height, file: l.file };
    }
  });
  // Both branches finish before either's failure is passed on, so a stopped job (junk, spend cap) leaves
  // no photo processing running behind it.
  const [planned, imaged] = await Promise.allSettled([planning, imaging]);
  if (planned.status === "rejected") throw planned.reason;
  if (imaged.status === "rejected") throw imaged.reason;
  const { brief, design, generated } = planned.value;
  // Generated pictures come after the client's photos; landscape, so they can carry a hero.
  images.push(...generated);
  heroIds.push(...generated.map((g) => g.id));

  // 4. Content and assembly (validate; retry with errors)
  const corpus = await clientCorpus(repo, siteId);
  const content = await stageTime("content", () =>
    generateContent(client, {
      slug: site.slug,
      brief,
      design,
      assets: { images, ...(logoAsset ? { logo: logoAsset } : {}) },
      scope: intake.scope,
      heroImageIds: heroIds,
      structuredOutput: config.structuredOutputForContent,
      retries: config.limits.contentRetries,
      corpus,
    }),
  );
  if (content.structuredFallback) await log("content", "Structured output rejected the content schema; used plain JSON");
  if (content.repairs.length) await log("content", "Repaired the content answer before validation", content.repairs);
  if (content.issues.length) await log("content", "Spec still has issues after retries", content.issues);
  let spec = content.spec;
  // A regeneration keeps the business facts of the version it replaces (typed in the editor since the intake).
  const replaced = await repo.getSpec(siteId);
  if (replaced) {
    const merged = keepOwnerFacts(replaced.spec, spec);
    const v = validateSite(merged.spec);
    // An already invalid regenerated spec can't be made worse by the owner's own facts: keep them.
    if (merged.kept.length && (v.ok || !validateSite(spec).ok)) {
      spec = v.ok ? v.spec : merged.spec;
      await log("content", "Kept the business facts of the previous version", merged.kept);
    } else if (merged.kept.length) await log("content", "Previous business facts don't fit the new site; used the regenerated ones", v.issues.slice(0, 5));
  }
  let version = await repo.saveSpec(siteId, spec, "generate");
  const firstVersionMs = Date.now() - started;
  await log("preview", "First version saved; the editor shows it while checks and critique run", { ms: firstVersionMs, version });

  // 5. Check + critique (max N iterations)
  let check: SiteCheckReport | null = null;
  let rounds = 0;
  const runCheck = async () => {
    const media = await loadMedia(storage, siteId, spec, config.images.widths);
    return checkSite(spec, siteFiles(spec, media, { imageWidths: config.images.widths }), {
      config,
      corpus,
      lighthouse: deps.lighthouse ?? true,
      ...(deps.browser ? { browser: deps.browser } : {}),
    });
  };
  try {
    check = await stageTime("check", runCheck);
  } catch (e) {
    // A browser or Lighthouse failure leaves a saved, valid version: the site is usable (publishing
    // runs its own checklist), it just gets no critique.
    await log("check", "Checks failed to run; kept the saved version without critique", (e as Error).message.slice(0, 300));
    await repo.setStatus(siteId, "ready");
    return { version, check: null, critiqueRounds: 0, timings, firstVersionMs };
  }
  await log("check", check.failures.length ? "Checks found problems" : "All checks passed", { failures: check.failures, lighthouse: check.lighthouse });
  while (rounds < config.limits.critiqueIterations) {
    rounds++;
    let c: Awaited<ReturnType<typeof critique>>;
    try {
      c = await stageTime("critique", () =>
        critique(client, { spec, mobilePng: check!.screenshots.mobileFull, desktopPng: check!.screenshots.desktop, failures: check!.failures, corpus }),
      );
    } catch (e) {
      // The site already passed validation and checks; a failed critique only means no polish.
      // The spend cap still stops the job.
      if (e instanceof SpendCapError) throw e;
      await log("critique", e instanceof ModelOutputError ? "Critique answer unusable; kept the checked site" : "Critique failed; kept the checked site", (e as Error).message.slice(0, 300));
      break;
    }
    await log("critique", `Round ${rounds}: ${c.issues.length} issues, ${c.patches.length} patches`, c.issues);
    if (c.patches.length === 0) break;
    const r = applyPatches(spec, c.patches as Operation[], corpus);
    if (r.issues.length) {
      await log("critique", "Critique patches rejected by validation", r.issues);
      break;
    }
    try {
      version = await repo.saveSpec(siteId, r.spec, "critique", c.issues.join("; ").slice(0, 500), undefined, version);
    } catch (e) {
      // The client edited the site while the critique ran; their edit wins.
      if (e instanceof VersionConflictError) {
        await log("critique", "Site changed during critique; critique patches not applied");
        break;
      }
      throw e;
    }
    spec = r.spec;
    try {
      check = await stageTime("check", runCheck);
    } catch (e) {
      await log("check", "Checks failed to run after the critique; kept the critique's version", (e as Error).message.slice(0, 300));
      check = null;
      break;
    }
    await log("check", check.failures.length ? "Checks found problems" : "All checks passed", { failures: check.failures, lighthouse: check.lighthouse });
  }
  await repo.setStatus(siteId, "ready");
  return { version, check, critiqueRounds: rounds, timings, firstVersionMs };
}

/**
 * How many mood images to generate for a site with `photoCount` client photos. When some are wanted but
 * no image service is configured (no FAL_KEY), says so: a silent skip left sites without any picture.
 */
export function generatedImageCount(config: AppConfig, photoCount: number, hasGenerator: boolean, scope: "home" | "full"): { wanted: number; skipped: string | null } {
  const missing = config.imageGen.pipeline.enabled ? Math.max(0, config.imageGen.pipeline.fillUpTo[scope] - photoCount) : 0;
  if (!missing) return { wanted: 0, skipped: null };
  if (!hasGenerator) return { wanted: 0, skipped: `${missing} generated picture(s) wanted, but no image service is configured (FAL_KEY); built without them` };
  return { wanted: missing, skipped: null };
}

/**
 * One generated image per idea, stored and processed like an upload, marked `origin: "generated"` so the
 * site labels it and validation keeps it to hero and image-text slots. A failed image is logged and
 * skipped; the site is built from what arrived. The spend cap still stops the job.
 */
async function generateImages(deps: PipelineDeps, siteId: string, ideas: { subject: string; alt: string }[], log: Log): Promise<ImageAsset[]> {
  const { config, storage, repo } = deps;
  // Fresh ids on every generation: the version this one replaces keeps its own pictures (restore shows them).
  const ids = await claimImageIds(repo, siteId, "generated", ideas.length, (await repo.getSpec(siteId))?.spec.assets.images ?? []);
  const results = await Promise.allSettled(
    ideas.map(async (idea, i): Promise<ImageAsset> => {
      const id = ids[i]!;
      const img = await deps.images!.generate(idea.subject);
      const key = `sites/${siteId}/generated/${id}.jpg`;
      await storage.put(key, img.data, "image/jpeg");
      const processed = await processPhoto(id, img.data, config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
      for (const v of processed.variants) await storage.put(mediaKey(siteId, v.file), v.data, contentType(v.file));
      // One event per picture as it lands, so the editor's live preview shows each one at once.
      await log("imageGen", "Image ready", { id, alt: idea.alt.slice(0, 180) });
      return { id, src: key, width: processed.width, height: processed.height, alt: idea.alt.slice(0, 180), origin: "generated" };
    }),
  );
  const out: ImageAsset[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") out.push(r.value);
    else if (r.reason instanceof SpendCapError) throw r.reason;
    else await log("imageGen", `Image ${i + 1} not generated; building without it`, String((r.reason as Error)?.message ?? r.reason).slice(0, 300));
  }
  await log("imageGen", `${out.length} of ${ideas.length} generated images`, out.map((o) => ({ id: o.id, alt: o.alt })));
  return out;
}

export class PublishBlockedError extends Error {
  readonly blockers: string[];
  constructor(readonly checklist: PublishBlocker[]) {
    const blockers = checklist.map(blockerText);
    super(`Cannot publish: ${blockers.length} blocking issue(s), e.g. ${blockers.slice(0, 3).join("; ")}`);
    this.name = "PublishBlockedError";
    this.blockers = blockers;
  }
}

/** Step 6: render static files to storage as a new release and switch the live site to it (published.ts). */
/** Another publish of the same site is writing its release right now. */
export class PublishBusyError extends Error {
  constructor() {
    super("Another publish of this site is in progress");
    this.name = "PublishBusyError";
  }
}

export async function publishSite(deps: Pick<PipelineDeps, "repo" | "storage" | "config">, siteId: string, version?: number): Promise<{ version: number; files: number }> {
  const { repo, storage, config } = deps;
  const site = await repo.getSite(siteId);
  const stored = await repo.getSpec(siteId, version);
  if (!site || !stored) throw new Error(`Site ${siteId} has no spec`);
  // Published paths always use the site's own slug, never a value from the spec.
  const current = { ...stored, spec: { ...stored.spec, slug: site.slug } };
  const checklist = await siteChecklist(repo, siteId, current.spec);
  if (checklist.length) throw new PublishBlockedError(checklist);
  // Two publishes at once (two tabs, a retry after a timeout) would each clean up the other's release.
  if (!(await repo.claimPublish(siteId))) throw new PublishBusyError();
  try {
    const media = await loadMedia(storage, siteId, current.spec, config.images.widths);
    const files = siteFiles(current.spec, media, { imageWidths: config.images.widths });
    const release = newReleaseId(current.version);
    await writeRelease(storage, site.slug, release, files);
    await repo.markPublished(siteId, current.version, release);
    await repo.addEvent({ siteId, stage: "publish", message: `Published version ${current.version}`, data: { files: files.size, release } });
    return { version: current.version, files: files.size };
  } finally {
    await repo.releasePublish(siteId);
  }
}

export async function exportSite(deps: Pick<PipelineDeps, "repo" | "storage" | "config">, siteId: string, version?: number): Promise<{ filename: string; zip: Uint8Array }> {
  const site = await deps.repo.getSite(siteId);
  const stored = await deps.repo.getSpec(siteId, version);
  if (!site || !stored) throw new Error(`Site ${siteId} has no spec`);
  const spec = { ...stored.spec, slug: site.slug };
  const media = await loadMedia(deps.storage, siteId, spec, deps.config.images.widths);
  return { filename: `${site.slug}-v${stored.version}.zip`, zip: exportZip(spec, media, { imageWidths: deps.config.images.widths }) };
}

/**
 * Everything that blocks publishing: validation, unfilled placeholders, starter text, and any fact
 * (phone, price, name, number …) that isn't in the client's own input.
 */
export async function siteChecklist(repo: Repo, siteId: string, spec: SiteSpec): Promise<PublishBlocker[]> {
  const corpus = await clientCorpus(repo, siteId);
  return [...publishChecklist(spec), ...checkFacts(spec, corpus).map((f): PublishBlocker => ({ path: f.path, kind: "fact", detail: f.kind, value: f.value }))];
}

/** siteChecklist as English lines. */
export async function siteBlockers(repo: Repo, siteId: string, spec: SiteSpec): Promise<string[]> {
  return (await siteChecklist(repo, siteId, spec)).map(blockerText);
}

/** Earlier chat messages (user and assistant) sent with an edit request. */
const CHAT_HISTORY_TURNS = 6;

/** Applies one chat message (already stored) to the current spec and stores the reply. */
export async function applyChatEdit(deps: Pick<PipelineDeps, "repo" | "client">, siteId: string, messageId: number): Promise<{ version: number | null; reply: string; issues: string[] }> {
  const { repo, client } = deps;
  const msg = await repo.getChat(messageId);
  const current = await repo.getSpec(siteId);
  if (!msg || !current) throw new Error("Message or spec not found");
  const before = (await repo.getSite(siteId))?.status;
  // Don't mask a running generation; only mark "editing" when the site was idle.
  const marked = before === "ready" || before === "failed" ? await repo.setStatusIf(siteId, before, "editing") : false;
  try {
    const corpus = await clientCorpus(repo, siteId);
    // The last few exchanges before this message, so a follow-up can refer to them.
    const history = (await repo.listChat(siteId))
      .filter((c) => Number(c.id) < Number(msg.id))
      .slice(-CHAT_HISTORY_TURNS)
      .map((c) => ({ role: c.role === "user" ? ("user" as const) : ("assistant" as const), content: c.content }));
    const r = await editSpec(client, { spec: current.spec, message: msg.content, corpus, history });
    let version: number | null = null;
    let reply = r.reply;
    const issues = [...r.issues];
    if (r.changed && r.issues.length === 0) {
      try {
        version = await repo.saveSpec(siteId, r.spec, "edit", msg.content.slice(0, 500), undefined, current.version);
      } catch (e) {
        if (!(e instanceof VersionConflictError)) throw e;
        // Never overwrite edits made while the model was working.
        reply = "Stran se je medtem spremenila, zato sprememba ni bila shranjena. Prosim, pošljite zahtevo znova.";
        issues.push("conflict: site changed during the edit");
      }
    }
    await repo.addChat(siteId, "assistant", reply, { version, issues });
    return { version, reply, issues };
  } finally {
    // A generation started while the model worked keeps its "generating".
    if (marked) await repo.setStatusIf(siteId, "editing", "ready");
  }
}
