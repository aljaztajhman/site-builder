import type { Repo } from "@sb/platform";

/**
 * Image ids are never issued twice on a site. An image's files are named by its id (`media/{id}-…`,
 * `generated/{id}.jpg`), so a reissued id overwrote the pictures older versions show: restoring a version
 * from before "Ustvari znova" showed the new pictures. The owner's photos are img_NN (the pipeline numbers
 * the intake photos img_01..N, always the same uploads), generated pictures img_gN; each kind has its own
 * counter on the site row (Repo.claimImageNumbers).
 */

export type ImageKind = "photo" | "generated";

const NUMBERED: Record<ImageKind, RegExp> = { photo: /^img_(\d+)$/, generated: /^img_g(\d+)$/ };

export const imageIdFor = (kind: ImageKind, n: number): string => (kind === "photo" ? `img_${String(n).padStart(2, "0")}` : `img_g${n}`);

/** The highest number among the images' ids of that kind (0 when none). */
export function highestImageNumber(images: readonly { id: string }[], kind: ImageKind): number {
  return Math.max(0, ...images.map((i) => Number(NUMBERED[kind].exec(i.id)?.[1] ?? 0)));
}

/**
 * `count` new image ids never issued on the site before. `images`: the current version's, in case it holds
 * numbers the counter doesn't know of (a spec saved without claiming).
 */
export async function claimImageIds(repo: Repo, siteId: string, kind: ImageKind, count: number, images: readonly { id: string }[] = []): Promise<string[]> {
  let floor = highestImageNumber(images, kind);
  if (kind === "photo") floor = Math.max(floor, (await repo.getSite(siteId))?.intake.photoAssetIds?.length ?? 0);
  return (await repo.claimImageNumbers(siteId, kind, count, floor)).map((n) => imageIdFor(kind, n));
}
