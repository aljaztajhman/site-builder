import type { AppConfig } from "@sb/config";
import type { Repo, Storage } from "@sb/platform";
import { contentType } from "@sb/platform";
import { mediaFiles, siteFiles, exportZip, sharedBundle } from "@sb/render";
import { publishBlockers, type ImageAsset, type SiteSpec } from "@sb/spec";
import type { Operation } from "fast-json-patch";
import type { ModelClient } from "./llm/client.ts";
import { classify, makeBrief, chooseDesign, altTexts, generateContent, critique, applyPatches, editSpec } from "./stages.ts";
import { extractSwatches, type Swatch } from "./palette.ts";
import { processLogo, processPhoto, visionJpeg } from "./images.ts";
import { checkSite, type CheckBrowser, type SiteCheckReport } from "./check/index.ts";
import { typedText } from "./editor.ts";

export interface PipelineDeps {
  config: AppConfig;
  repo: Repo;
  storage: Storage;
  client: ModelClient;
  /** Shared browser for checks (optional). */
  browser?: CheckBrowser;
  /** Skip Lighthouse in the app pipeline when speed matters; eval always runs it. */
  lighthouse?: boolean;
}

export const mediaKey = (siteId: string, file: string) => `sites/${siteId}/media/${file}`;
export const uploadKey = (siteId: string, assetId: string) => `sites/${siteId}/uploads/${assetId}`;
export const publishedPrefix = "published";

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
}

/** Pipeline steps 1–5 from docs/PRODUCT.md. Every model call is logged per stage with tokens and €. */
export async function generateSite(deps: PipelineDeps, siteId: string, jobId: string | null): Promise<GenerateResult> {
  const { repo, storage, config, client } = deps;
  const site = await repo.getSite(siteId);
  if (!site) throw new Error(`Site ${siteId} not found`);
  const log = logger(repo, siteId, jobId);
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

  // 1. Intake -> brief
  const cls = await stageTime("classify", () => classify(client, intake.description));
  const { brief, dropped } = await stageTime("brief", () =>
    makeBrief(client, { description: intake.description, businessType: cls.businessType, photoCount: photos.length, hasLogo: !!logo, scope: intake.scope }),
  );
  if (dropped.length) await log("brief", "Dropped facts not found in the client's text", dropped);
  await repo.setBrief(siteId, brief, brief.name);

  // 2. Design direction (palette extracted in code)
  const originals = new Map<string, Uint8Array>();
  for (const a of [...photos, ...(logo ? [logo] : [])]) {
    const data = await storage.get(a.storage_key);
    if (!data) throw new Error(`Upload ${a.id} missing from storage`);
    originals.set(a.id, data);
  }
  const swatches: Swatch[] = [];
  if (logo) swatches.push(...(await extractSwatches(originals.get(logo.id)!, "logo", 3)));
  for (const p of photos.slice(0, 3)) swatches.push(...(await extractSwatches(originals.get(p.id)!, "photo", 2)));
  const { design } = await stageTime("design", () => chooseDesign(client, { brief, swatches, photoCount: photos.length }));

  // 3. Images: variants + Slovene alt text
  const images: ImageAsset[] = [];
  let logoAsset: SiteSpec["assets"]["logo"];
  const heroIds: string[] = [];
  await stageTime("images", async () => {
    const vision: { jpegBase64: string }[] = [];
    for (const [i, p] of photos.entries()) {
      const id = `img_${String(i + 1).padStart(2, "0")}`;
      const processed = await processPhoto(id, originals.get(p.id)!, config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
      for (const v of processed.variants) await storage.put(mediaKey(siteId, v.file), v.data, contentType(v.file));
      images.push({ id, src: p.storage_key, width: processed.width, height: processed.height, alt: "" });
      vision.push({ jpegBase64: await visionJpeg(originals.get(p.id)!) });
    }
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
  if (content.issues.length) await log("content", "Spec still has issues after retries", content.issues);
  let spec = content.spec;
  let version = await repo.saveSpec(siteId, spec, "generate");

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
  check = await stageTime("check", runCheck);
  await log("check", check.failures.length ? "Checks found problems" : "All checks passed", { failures: check.failures, lighthouse: check.lighthouse });
  while (rounds < config.limits.critiqueIterations) {
    rounds++;
    const c = await stageTime("critique", () =>
      critique(client, { spec, mobilePng: check!.screenshots.mobileFull, desktopPng: check!.screenshots.desktop, failures: check!.failures, corpus }),
    );
    await log("critique", `Round ${rounds}: ${c.issues.length} issues, ${c.patches.length} patches`, c.issues);
    if (c.patches.length === 0) break;
    const r = applyPatches(spec, c.patches as Operation[], corpus);
    if (r.issues.length) {
      await log("critique", "Critique patches rejected by validation", r.issues);
      break;
    }
    spec = r.spec;
    version = await repo.saveSpec(siteId, spec, "critique", c.issues.join("; ").slice(0, 500));
    check = await stageTime("check", runCheck);
    await log("check", check.failures.length ? "Checks found problems" : "All checks passed", { failures: check.failures, lighthouse: check.lighthouse });
  }
  await repo.setStatus(siteId, "ready");
  return { version, check, critiqueRounds: rounds, timings };
}

export class PublishBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super(`Cannot publish: ${blockers.length} blocking issue(s), e.g. ${blockers.slice(0, 3).join("; ")}`);
    this.name = "PublishBlockedError";
  }
}

/** Step 6: render static files to storage under published/{slug}/ and published/_shared/{hash}/. */
export async function publishSite(deps: Pick<PipelineDeps, "repo" | "storage" | "config">, siteId: string, version?: number): Promise<{ version: number; files: number }> {
  const { repo, storage, config } = deps;
  const site = await repo.getSite(siteId);
  const current = await repo.getSpec(siteId, version);
  if (!site || !current) throw new Error(`Site ${siteId} has no spec`);
  const blockers = publishBlockers(current.spec);
  if (blockers.length) throw new PublishBlockedError(blockers);
  const media = await loadMedia(storage, siteId, current.spec, config.images.widths);
  const files = siteFiles(current.spec, media, { imageWidths: config.images.widths });
  await storage.deletePrefix(`${publishedPrefix}/${current.spec.slug}/`);
  const hash = sharedBundle().hash;
  const sharedExists = (await storage.list(`${publishedPrefix}/_shared/${hash}/`)).length > 0;
  for (const [rel, data] of files) {
    if (rel.startsWith("_shared/") && sharedExists) continue;
    await storage.put(`${publishedPrefix}/${rel}`, data, contentType(rel));
  }
  await repo.markPublished(siteId, current.version);
  await repo.addEvent({ siteId, stage: "publish", message: `Published version ${current.version}`, data: { files: files.size } });
  return { version: current.version, files: files.size };
}

export async function exportSite(deps: Pick<PipelineDeps, "repo" | "storage" | "config">, siteId: string, version?: number): Promise<{ filename: string; zip: Uint8Array }> {
  const current = await deps.repo.getSpec(siteId, version);
  if (!current) throw new Error(`Site ${siteId} has no spec`);
  const media = await loadMedia(deps.storage, siteId, current.spec, deps.config.images.widths);
  return { filename: `${current.spec.slug}-v${current.version}.zip`, zip: exportZip(current.spec, media, { imageWidths: deps.config.images.widths }) };
}

/** Applies one chat message (already stored) to the current spec and stores the reply. */
export async function applyChatEdit(deps: Pick<PipelineDeps, "repo" | "client">, siteId: string, messageId: number): Promise<{ version: number | null; reply: string; issues: string[] }> {
  const { repo, client } = deps;
  const msg = await repo.getChat(messageId);
  const current = await repo.getSpec(siteId);
  if (!msg || !current) throw new Error("Message or spec not found");
  await repo.setStatus(siteId, "editing");
  try {
    const corpus = await clientCorpus(repo, siteId);
    const r = await editSpec(client, { spec: current.spec, message: msg.content, corpus });
    const version = r.changed && r.issues.length === 0 ? await repo.saveSpec(siteId, r.spec, "edit", msg.content.slice(0, 500)) : null;
    await repo.addChat(siteId, "assistant", r.reply, { version, issues: r.issues });
    return { version, reply: r.reply, issues: r.issues };
  } finally {
    await repo.setStatus(siteId, "ready");
  }
}
