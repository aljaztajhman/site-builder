import type { AppConfig } from "@sb/config";
import { VersionConflictError, contentType, type Repo, type Storage } from "@sb/platform";
import { validateSite, walkStrings, type ImageAsset, type SiteSpec } from "@sb/spec";
import type { ModelClient } from "./llm/client.ts";
import { imageMeta, processPhoto, visionJpeg } from "./images.ts";
import { altTexts } from "./stages.ts";
import { mediaKey, uploadKey } from "./pipeline.ts";
import { claimImageIds } from "./image-ids.ts";

/**
 * The owner's photos after generation: add new ones, or put one in place of an existing picture
 * (typically a generated one). Deterministic and model-free: the variants are made here, and the
 * descriptions (alt text) come later from describePhotos, or from the owner in the editor.
 */

export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

export interface PhotoUpload {
  data: Uint8Array;
  mime: string;
  name: string;
}

/** A refusal the owner can act on; the message is Slovene and shown as is. */
export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

/** Sections (as "page › type") that show the image. */
export function imageUses(spec: SiteSpec, imageId: string): { page: string; section: string; type: string }[] {
  const out: { page: string; section: string; type: string }[] = [];
  for (const page of spec.pages) {
    for (const s of page.sections) {
      let used = false;
      walkStrings(s.props, (v) => {
        if (v === imageId) used = true;
      });
      if (used) out.push({ page: page.id, section: s.id, type: s.type });
    }
  }
  return out;
}

/** Puts `to` wherever the pages show `from`. */
function relink(spec: SiteSpec, from: string, to: string): SiteSpec["pages"] {
  const swap = (v: unknown): unknown => {
    if (v === from) return to;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  return swap(spec.pages) as SiteSpec["pages"];
}

export interface AddPhotosResult {
  version: number;
  /** The new image ids, in upload order. */
  added: string[];
  /** The image the first upload replaced (it is gone from the site). */
  replaced?: string;
}

/**
 * Adds the owner's photos as images (variants stored like intake photos), optionally putting the
 * first one in place of `replace` everywhere it is shown; the replaced image leaves the site. Saves
 * one new version. Alt text starts empty: describePhotos or the owner fills it, and an image without
 * one blocks publishing.
 */
export async function addPhotos(
  deps: { repo: Repo; storage: Storage; config: AppConfig },
  siteId: string,
  files: PhotoUpload[],
  opts: { replace?: string; baseVersion?: number } = {},
): Promise<AddPhotosResult> {
  const { repo, storage, config } = deps;
  const current = await repo.getSpec(siteId);
  if (!current) throw new PhotoError("Stran še nima vsebine.");
  if (typeof opts.baseVersion === "number" && opts.baseVersion !== current.version) throw new VersionConflictError(siteId, opts.baseVersion);
  if (files.length === 0) throw new PhotoError("Izberite vsaj eno fotografijo.");
  const spec = current.spec;
  if (opts.replace !== undefined) {
    if (!spec.assets.images.some((i) => i.id === opts.replace)) throw new PhotoError("Te slike na strani ni več. Osvežite urejevalnik.");
    if (files.length !== 1) throw new PhotoError("Sliko zamenjate z eno fotografijo.");
  }
  const ownAfter = spec.assets.images.filter((i) => i.origin !== "generated" && i.id !== opts.replace).length + files.length;
  if (ownAfter > config.limits.maxPhotos) throw new PhotoError(`Stran ima lahko največ ${config.limits.maxPhotos} fotografij.`);
  for (const f of files) {
    if (!PHOTO_TYPES[f.mime]) throw new PhotoError(`Nepodprta vrsta slike: ${f.name}. Uporabite JPG, PNG, WebP ali AVIF.`);
    if (f.data.length > config.limits.maxUploadBytes) throw new PhotoError(`Datoteka ${f.name} je prevelika.`);
    if (!(await imageMeta(f.data).catch(() => null))) throw new PhotoError(`Slike ${f.name} ni mogoče prebrati.`);
  }

  const ids = await claimImageIds(repo, siteId, "photo", files.length, spec.assets.images);
  const images: ImageAsset[] = [];
  for (const [i, f] of files.entries()) {
    const id = ids[i]!;
    const meta = await imageMeta(f.data);
    const assetId = `asset_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const key = `${uploadKey(siteId, assetId)}.${PHOTO_TYPES[f.mime]}`;
    await storage.put(key, f.data, f.mime);
    await repo.addAsset({ id: assetId, site_id: siteId, kind: "photo", storage_key: key, mime: f.mime, width: meta.width, height: meta.height, bytes: f.data.length, original_name: f.name.slice(0, 200) });
    const processed = await processPhoto(id, f.data, config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) await storage.put(mediaKey(siteId, v.file), v.data, contentType(v.file));
    images.push({ id, src: key, width: processed.width, height: processed.height, alt: "" });
  }

  let next: SiteSpec = { ...spec, assets: { ...spec.assets, images: [...spec.assets.images, ...images] } };
  if (opts.replace) {
    next = { ...next, pages: relink(next, opts.replace, ids[0]!) };
    next = { ...next, assets: { ...next.assets, images: next.assets.images.filter((i) => i.id !== opts.replace) } };
  }
  const v = validateSite(next);
  if (!v.ok) throw new PhotoError(`Sprememba ni veljavna: ${v.issues.slice(0, 2).map((i) => i.message).join("; ")}`);
  const message = opts.replace ? `zamenjana slika ${opts.replace}` : files.length === 1 ? "nova fotografija" : `${files.length} nove fotografije`;
  const version = await repo.saveSpec(siteId, v.spec, "manual", message, undefined, current.version);
  return { version, added: ids, ...(opts.replace ? { replaced: opts.replace } : {}) };
}

/**
 * Slovene alt text (and focal point) from the vision model for images that still have none. Applied to
 * the latest version, only where the alt is still empty (the owner may have typed one meanwhile).
 * Returns the new version, or null when there was nothing to describe.
 */
export async function describePhotos(deps: { repo: Repo; storage: Storage; client: ModelClient }, siteId: string, imageIds: string[]): Promise<number | null> {
  const { repo, storage, client } = deps;
  const current = await repo.getSpec(siteId);
  if (!current) return null;
  const todo = current.spec.assets.images.filter((i) => imageIds.includes(i.id) && !i.alt.trim());
  if (!todo.length) return null;
  const vision: { jpegBase64: string }[] = [];
  for (const img of todo) {
    const data = await storage.get(img.src);
    if (!data) throw new Error(`Original of ${img.id} missing from storage`);
    vision.push({ jpegBase64: await visionJpeg(data) });
  }
  const alts = await altTexts(client, vision);
  for (let attempt = 0; ; attempt++) {
    const latest = attempt === 0 ? current : await repo.getSpec(siteId);
    if (!latest) return null;
    const images = latest.spec.assets.images.map((img) => {
      const k = todo.findIndex((t) => t.id === img.id);
      if (k < 0 || img.alt.trim() || !alts[k]?.alt) return img;
      return { ...img, alt: alts[k]!.alt.slice(0, 180), focal: alts[k]!.focal };
    });
    const spec = { ...latest.spec, assets: { ...latest.spec.assets, images } };
    try {
      return await repo.saveSpec(siteId, spec, "edit", "opisi fotografij", undefined, latest.version);
    } catch (e) {
      // The owner saved meanwhile: apply the descriptions to their version instead (once).
      if (e instanceof VersionConflictError && attempt === 0) continue;
      throw e;
    }
  }
}
