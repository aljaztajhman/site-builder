import type { AppConfig } from "@sb/config";
import type { PrunedVersion, Repo, SiteRow, Storage } from "@sb/platform";
import { mediaFiles } from "@sb/render";
import type { SiteSpec } from "@sb/spec";
import { mediaKey } from "./pipeline.ts";

/**
 * Version retention (config `versions.retention`, owner's decision `sb-autosave-versions` = prune):
 * the nightly job keeps every recent version, the last one of each older day, every published version,
 * every version an "Ustvari znova" replaced (`sb-keep-replaced`) and the current one (Repo.pruneVersions),
 * then removes the files only the removed versions used.
 *
 * Files are removed only when nothing kept can need them:
 * - never the published release (published/…): releases are complete copies, written and cleaned up by publishSite;
 * - only keys under the site's own `sites/{id}/` prefix;
 * - never a file a kept version references, and never an intake upload ("Ustvari znova" builds from those again);
 * - not while a job runs on the site (a generation rewrites the intake photos' variants before saving): the
 *   site waits for the next night, and is checked again just before the files go.
 *
 * Image ids are never issued twice on a site (image-ids.ts), so a file named by a removed version's image id
 * belongs to that image alone: no kept version, upload in progress or later generation can be using it.
 */

const BUSY = new Set(["generating", "editing", "publishing"]);

type Deps = { repo: Repo; storage: Storage; config: AppConfig };

export interface PruneResult {
  siteId: string;
  /** Version numbers removed. */
  removed: number[];
  /** Their stored size in the database (bytes, as Postgres keeps them). */
  bytes: number;
  /** Storage keys removed with them. */
  files: string[];
  /** Why nothing was done. */
  skipped?: string;
}

/** Applies retention to one site. Running it again the same day changes nothing. */
export async function pruneSite(deps: Deps, siteId: string, now = new Date()): Promise<PruneResult> {
  const { repo, storage, config } = deps;
  const site = await repo.getSite(siteId);
  if (!site) return { siteId, removed: [], bytes: 0, files: [], skipped: "no such site" };
  if (BUSY.has(site.status)) return { siteId, removed: [], bytes: 0, files: [], skipped: `a job is running (${site.status})` };
  if (site.publishing_since) return { siteId, removed: [], bytes: 0, files: [], skipped: "a publish is running" };
  const pruned = await repo.pruneVersions(siteId, config.versions.retention, now);
  if (pruned.length === 0) return { siteId, removed: [], bytes: 0, files: [] };

  const unused = await unusedFiles(deps, site, pruned);
  const fresh = await repo.getSite(siteId);
  const files = fresh && !BUSY.has(fresh.status) && !fresh.publishing_since ? unused : [];
  if (files.length) {
    await storage.delete(files);
    await repo.deleteAssetsByKey(siteId, files);
  }
  const removed = pruned.map((p) => p.version);
  const bytes = pruned.reduce((n, p) => n + p.bytes, 0);
  await repo.addEvent({
    siteId,
    stage: "retention",
    message: `Removed ${removed.length} old version(s) and ${files.length} file(s) only they used`,
    data: { versions: removed, bytes, files: files.length, ...(unused.length > files.length ? { filesKept: "a job started; files wait" } : {}) },
  });
  return { siteId, removed, bytes, files };
}

/**
 * Applies retention to every site that has versions old enough to remove, then sweeps every site's generated
 * pictures that no version uses (`sweepOrphanPictures`). One failure doesn't stop the rest.
 */
export async function pruneAllSites(deps: Deps, now = new Date()): Promise<(PruneResult & { error?: string })[]> {
  // A superset: anything retention removes is older than this (a day of margin for daylight saving).
  const before = new Date(now.getTime() - (deps.config.versions.retention.keepAllDays - 1) * 86_400_000);
  const out: (PruneResult & { error?: string })[] = [];
  for (const siteId of await deps.repo.sitesWithVersionsBefore(before)) {
    try {
      out.push(await pruneSite(deps, siteId, now));
    } catch (e) {
      const error = (e as Error).message.slice(0, 300);
      await deps.repo.addEvent({ siteId, stage: "retention", level: "error", message: `Retention failed: ${error}` }).catch(() => undefined);
      out.push({ siteId, removed: [], bytes: 0, files: [], error });
    }
  }
  for (const siteId of await deps.repo.allSiteIds()) {
    try {
      const files = await sweepOrphanPictures(deps, siteId);
      if (!files.length) continue;
      const r = out.find((x) => x.siteId === siteId);
      if (r) r.files = [...r.files, ...files];
      else out.push({ siteId, removed: [], bytes: 0, files });
    } catch (e) {
      await deps.repo.addEvent({ siteId, stage: "retention", level: "error", message: `Picture sweep failed: ${(e as Error).message.slice(0, 300)}` }).catch(() => undefined);
    }
  }
  return out;
}

const GENERATED = /\/generated\/(img_g\d+)\.jpg$/;

/**
 * Generated pictures no version uses: a generation that failed before it saved a version (spend cap,
 * content retries exhausted, a crash) leaves its 2-3 pictures and their variants behind, and since ids are
 * never reissued nothing ever overwrites them. Removed (the original and every media variant of that id)
 * when no stored version references the id, only while no job or publish runs on the site; a version whose
 * assets can't be read keeps everything. Returns the removed keys.
 */
export async function sweepOrphanPictures(deps: Deps, siteId: string): Promise<string[]> {
  const { repo, storage } = deps;
  const busy = async () => {
    const s = await repo.getSite(siteId);
    return !s || BUSY.has(s.status) || !!s.publishing_since;
  };
  if (await busy()) return [];
  const generated = new Map<string, string>();
  for (const key of await storage.list(`sites/${siteId}/generated/`)) {
    const id = GENERATED.exec(key)?.[1];
    if (id) generated.set(id, key);
  }
  if (generated.size === 0) return [];
  const used = new Set<string>();
  for (const v of await repo.versionAssets(siteId)) {
    const images = (v.assets as { images?: unknown } | null)?.images;
    if (!Array.isArray(images)) return [];
    for (const img of images) if (img && typeof (img as { id?: unknown }).id === "string") used.add((img as { id: string }).id);
  }
  const orphans = [...generated.keys()].filter((id) => !used.has(id));
  if (orphans.length === 0) return [];
  const media = await storage.list(`sites/${siteId}/media/`);
  const files = orphans.flatMap((id) => [generated.get(id)!, ...media.filter((k) => k.slice(k.lastIndexOf("/") + 1).startsWith(`${id}-`))]).sort();
  // A job may have started meanwhile: then the files wait for the next night.
  if (await busy()) return [];
  await storage.delete(files);
  await repo.deleteAssetsByKey(siteId, files);
  await repo.addEvent({ siteId, stage: "retention", message: `Removed ${orphans.length} generated picture(s) no version uses`, data: { pictures: orphans, files: files.length } });
  return files;
}

/** Storage keys a version's assets point to (originals and media variants), or null when they can't be read. */
export function assetKeys(siteId: string, assets: unknown, widths: number[]): Set<string> | null {
  try {
    const a = assets as SiteSpec["assets"];
    const images = a.images ?? [];
    const keys = new Set<string>();
    for (const img of images) if (typeof img.src === "string") keys.add(img.src);
    if (a.logo && typeof a.logo.src === "string") keys.add(a.logo.src);
    // mediaFiles reads only the assets.
    const spec = { assets: { images, ...(a.logo ? { logo: a.logo } : {}) } } as SiteSpec;
    for (const f of mediaFiles(spec, widths)) keys.add(mediaKey(siteId, f));
    return keys;
  } catch {
    return null;
  }
}

async function unusedFiles(deps: Deps, site: SiteRow, pruned: PrunedVersion[]): Promise<string[]> {
  const { repo, config } = deps;
  const widths = config.images.widths;
  const own = `sites/${site.id}/`;
  const candidates = new Set<string>();
  for (const p of pruned) for (const k of assetKeys(site.id, p.assets, widths) ?? []) if (k.startsWith(own)) candidates.add(k);
  if (candidates.size === 0) return [];

  const kept = await repo.versionAssets(site.id);
  const used = new Set<string>();
  for (const k of kept) {
    const keys = assetKeys(site.id, k.assets, widths);
    // A kept version we can't read might use anything: leave every file.
    if (!keys) return [];
    for (const key of keys) used.add(key);
  }
  const intake = new Set([...(site.intake.photoAssetIds ?? []), ...(site.intake.logoAssetId ? [site.intake.logoAssetId] : [])]);
  for (const a of await repo.listAssets(site.id)) if (intake.has(a.id)) used.add(a.storage_key);
  return [...candidates].filter((k) => !used.has(k)).sort();
}
