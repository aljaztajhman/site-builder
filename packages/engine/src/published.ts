import { contentType, type Storage } from "@sb/platform";

/**
 * Where published sites live in storage. Each publish writes a complete new release next to the live
 * one and then switches a one-line pointer, so visitors never see a half-uploaded or missing site:
 *
 *   published/_sites/{slug}/{release}/index.html, media/…   one directory per publish
 *   published/_live/{slug}                                   the live release id (written last)
 *   published/_shared/{hash}/…                               CSS, JS and fonts shared by all sites
 *
 * Sites published before releases existed sit at published/{slug}/…; they are served from there until
 * their next publish, which removes that layout. Slugs never start with "_", so these can't collide.
 */
export const publishedPrefix = "published";
export const releasesPrefix = (slug: string) => `${publishedPrefix}/_sites/${slug}/`;
export const livePointerKey = (slug: string) => `${publishedPrefix}/_live/${slug}`;
const legacyPrefix = (slug: string) => `${publishedPrefix}/${slug}/`;
const RELEASE_ID = /^[a-z0-9-]{1,64}$/;

/** The release visitors see, or null when the site was never published with releases. */
export async function liveRelease(storage: Storage, slug: string): Promise<string | null> {
  const data = await storage.get(livePointerKey(slug));
  const id = data ? new TextDecoder().decode(data).trim() : "";
  return RELEASE_ID.test(id) ? id : null;
}

/** Storage prefix the public site is served from (ends with "/"). */
export async function publishedBase(storage: Storage, slug: string): Promise<string> {
  const release = await liveRelease(storage, slug);
  return release ? `${releasesPrefix(slug)}${release}/` : legacyPrefix(slug);
}

/** A new release id: version first so a listing reads in order, then something unique per publish. */
export function newReleaseId(version: number, now = Date.now()): string {
  return `v${version}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Writes `files` (keys "{slug}/…" and "_shared/{hash}/…", as siteFiles returns them) as a new release,
 * switches the live pointer to it, then removes releases older than the one it replaced and the
 * pre-release layout. The replaced release stays until the next publish, for pages already loading.
 */
export async function writeRelease(storage: Storage, slug: string, release: string, files: Map<string, Uint8Array>): Promise<{ previous: string | null }> {
  if (!RELEASE_ID.test(release)) throw new Error(`Bad release id ${release}`);
  const base = `${releasesPrefix(slug)}${release}/`;
  const sharedKeys = new Map<string, Set<string>>();
  for (const [rel, data] of files) {
    if (rel.startsWith("_shared/")) {
      // Content-addressed: a file already in storage is identical, so it is written once. Checked per
      // file, not per bundle, so a publish that died half-way through a bundle gets it completed.
      const dir = rel.split("/").slice(0, 2).join("/");
      let stored = sharedKeys.get(dir);
      if (!stored) sharedKeys.set(dir, (stored = new Set(await storage.list(`${publishedPrefix}/${dir}/`))));
      if (!stored.has(`${publishedPrefix}/${rel}`)) await storage.put(`${publishedPrefix}/${rel}`, data, contentType(rel));
      continue;
    }
    if (!rel.startsWith(`${slug}/`)) throw new Error(`File ${rel} is outside site ${slug}`);
    await storage.put(`${base}${rel.slice(slug.length + 1)}`, data, contentType(rel));
  }
  const previous = await liveRelease(storage, slug);
  // The switch: one small object, written after every file of the release is in place.
  await storage.put(livePointerKey(slug), new TextEncoder().encode(release), "text/plain; charset=utf-8");
  // Clean up. Read the pointer again: a publish that finished meanwhile must keep its release.
  const keep = new Set([release, previous, await liveRelease(storage, slug)].filter((r): r is string => r !== null));
  const prefix = releasesPrefix(slug);
  const releases = new Set((await storage.list(prefix)).map((k) => k.slice(prefix.length).split("/")[0]!));
  for (const r of releases) if (!keep.has(r)) await storage.deletePrefix(`${prefix}${r}/`);
  await storage.deletePrefix(legacyPrefix(slug));
  return { previous };
}
