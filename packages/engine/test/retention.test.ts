import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Db, type Storage } from "@sb/platform";
import { mediaFiles } from "@sb/render";
import type { SiteSpec } from "@sb/spec";
import { addPhotos, checkFacts, clientCorpus, livePointerKey, mediaKey, newReleaseId, pruneAllSites, pruneSite, writeRelease } from "../src/index.ts";

/** Retention with files: what goes with the pruned versions, and what never does. */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const widths = config.images.widths;
/** The nightly run on 2026-10-01 (03:30 in Ljubljana): 2026-09-15 is long past the 7 days kept in full. */
const NOW = new Date("2026-10-01T01:30:00Z");
const OLD_DAY = "2026-09-15T08:00:00Z";
const RECENT = "2026-09-30T08:00:00Z";
let db: Db;
let repo: Repo;
let dir: string;
let storage: Storage;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-retention-"));
  storage = createFsStorage(dir);
}, 60_000);
afterAll(async () => {
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

const deps = () => ({ repo, storage, config });
const jpeg = async () => new Uint8Array(await sharp({ create: { width: 800, height: 600, channels: 3, background: "#a07850" } }).jpeg().toBuffer());
const golden = async (slug: string) => ({ ...(JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec), slug });
const exists = async (key: string) => (await storage.get(key)) !== null;
/** Puts the site's versions from `from` on one instant (versions are saved "now"). */
const age = (siteId: string, at: string, from = 1) => db.query("update spec_versions set created_at = $2 where site_id = $1 and version >= $3", [siteId, at, from]);
/** Storage keys of an image's variants. */
const variants = (siteId: string, image: SiteSpec["assets"]["images"][number]) => mediaFiles({ assets: { images: [image] } } as SiteSpec, widths).map((f) => mediaKey(siteId, f));
const versions = async (siteId: string) => (await repo.listVersions(siteId)).map((v) => v.version).sort((a, b) => a - b);

async function newSite(slug: string, description = "x") {
  return repo.createSite({ name: slug, slug, intake: { description, photoAssetIds: [], scope: "home" } });
}

/** Stores the media variants (and logo) a spec's images need, as generation and uploads do. */
async function putMedia(siteId: string, spec: SiteSpec) {
  for (const f of mediaFiles(spec, widths)) await storage.put(mediaKey(siteId, f), new Uint8Array([1]), "image/webp");
}

describe("retention removes files only pruned versions used", () => {
  it("removes replaced photos' files, keeps intake uploads, files kept versions use, and the published release", async () => {
    const site = await newSite("ret-files");
    const id = site.id;
    // The intake photo: "Ustvari znova" builds from it again, so it stays even when no kept version shows it.
    const intakeKey = `sites/${id}/uploads/asset_intake.jpg`;
    await storage.put(intakeKey, await jpeg(), "image/jpeg");
    await repo.addAsset({ id: "asset_intake", site_id: id, kind: "photo", storage_key: intakeKey, mime: "image/jpeg", width: 800, height: 600, bytes: 1, original_name: "a.jpg" });
    await db.query("update sites set intake = $2 where id = $1", [id, JSON.stringify({ description: "x", photoAssetIds: ["asset_intake"], scope: "home" })]);

    const spec = await golden("ret-files");
    spec.assets.images[1] = { ...spec.assets.images[1]!, src: intakeKey };
    await putMedia(id, spec);
    await repo.saveSpec(id, spec, "generate"); // v1: img_01, img_02 (intake), img_03
    const first = await addPhotos(deps(), id, [{ data: await jpeg(), mime: "image/jpeg", name: "a.jpg" }], { replace: "img_02" }); // v2: img_04
    const uploadA = (await repo.getSpec(id))!.spec.assets.images.find((i) => i.id === "img_04")!.src;
    await addPhotos(deps(), id, [{ data: await jpeg(), mime: "image/jpeg", name: "b.jpg" }], { replace: "img_04" }); // v3: img_05
    const v3 = (await repo.getSpec(id))!;
    const uploadB = v3.spec.assets.images.find((i) => i.id === "img_05")!.src;
    await repo.saveSpec(id, v3.spec, "manual", "urejen razdelek hero"); // v4: last of the old day
    await age(id, OLD_DAY);
    await repo.saveSpec(id, v3.spec, "manual", "urejen razdelek hero"); // v5: current
    await age(id, RECENT, 5);
    expect(first.added).toEqual(["img_04"]);
    const img02 = spec.assets.images[1]!;
    const img04 = (await repo.getSpec(id, 2))!.spec.assets.images.find((i) => i.id === "img_04")!;
    const img05 = v3.spec.assets.images.find((i) => i.id === "img_05")!;

    // v4 is live: a complete release written by publish.
    const release = newReleaseId(4);
    await writeRelease(storage, "ret-files", release, new Map([["ret-files/index.html", new TextEncoder().encode("objavljeno")]]));
    await repo.markPublished(id, 4, release);
    const publishedBefore = (await storage.list("published/")).sort();

    const r = await pruneSite(deps(), id, NOW);
    expect(r.removed).toEqual([1, 2, 3]);
    expect(await versions(id)).toEqual([4, 5]);
    // Gone: img_02's variants (only v1 showed it), and the first replacement photo (only v2).
    expect(r.files).toEqual([...variants(id, img02), ...variants(id, img04), uploadA].sort());
    for (const k of r.files) expect(await exists(k), k).toBe(false);
    expect((await repo.listAssets(id)).map((a) => a.storage_key).sort()).toEqual([intakeKey, uploadB].sort());
    // Kept: the intake original, everything v4/v5 show, the logo, and every published file.
    expect(await exists(intakeKey)).toBe(true);
    expect(await exists(uploadB)).toBe(true);
    for (const k of [...variants(id, img05), mediaKey(id, "img_01-360.webp"), mediaKey(id, "img_03-720.avif"), mediaKey(id, "logo.svg")]) expect(await exists(k), k).toBe(true);
    expect((await storage.list("published/")).sort()).toEqual(publishedBefore);
    expect(new TextDecoder().decode((await storage.get(livePointerKey("ret-files")))!)).toBe(release);
    // The removal is in the site's log.
    expect((await repo.listEvents(id)).filter((e) => e.stage === "retention")).toMatchObject([{ data: { versions: [1, 2, 3], files: r.files.length } }]);

    // Twice: nothing more.
    expect(await pruneSite(deps(), id, NOW)).toMatchObject({ removed: [], files: [] });
  });

  it("keeps the variants of an image id the next upload may take (an upload writes them before it saves)", async () => {
    const site = await newSite("ret-reissue");
    const spec = await golden("ret-reissue");
    const withSeven = { ...spec, assets: { ...spec.assets, images: [...spec.assets.images, { id: "img_07", src: `sites/${site.id}/uploads/asset_seven.jpg`, width: 800, height: 600, alt: "" }] } };
    await storage.put(`sites/${site.id}/uploads/asset_seven.jpg`, new Uint8Array([1]), "image/jpeg");
    await putMedia(site.id, withSeven);
    await repo.saveSpec(site.id, withSeven, "manual"); // v1: img_07 (removed later; current's highest is img_03)
    await repo.saveSpec(site.id, spec, "manual"); // v2
    await age(site.id, OLD_DAY);
    await repo.saveSpec(site.id, spec, "manual"); // v3
    const r = await pruneSite(deps(), site.id, NOW);
    expect(r.removed).toEqual([1]);
    // The original's name is unique per upload, so it goes; img_07-* could be the next upload's.
    expect(r.files).toEqual([`sites/${site.id}/uploads/asset_seven.jpg`]);
    expect(await exists(mediaKey(site.id, "img_07-360.webp"))).toBe(true);
  });

  it("waits while a job runs on the site", async () => {
    const site = await newSite("ret-busy");
    const spec = await golden("ret-busy");
    for (let i = 0; i < 3; i++) await repo.saveSpec(site.id, spec, "manual");
    await age(site.id, OLD_DAY);
    await repo.setStatus(site.id, "generating");
    expect(await pruneSite(deps(), site.id, NOW)).toMatchObject({ removed: [], skipped: "a job is running (generating)" });
    expect(await versions(site.id)).toEqual([1, 2, 3]);
    await repo.setStatus(site.id, "ready");
    expect((await pruneSite(deps(), site.id, NOW)).removed).toEqual([1, 2]);
  });
});

describe("pruneAllSites", () => {
  it("runs every site with old versions and leaves recent ones alone", async () => {
    const spec = await golden("ret-all");
    const ids: string[] = [];
    for (const slug of ["ret-all-a", "ret-all-b", "ret-all-new"]) {
      const s = await newSite(slug);
      for (let i = 0; i < 3; i++) await repo.saveSpec(s.id, { ...spec, slug }, "manual");
      if (slug !== "ret-all-new") await age(s.id, OLD_DAY);
      ids.push(s.id);
    }
    const results = await pruneAllSites(deps(), NOW);
    const byId = new Map(results.map((r) => [r.siteId, r]));
    expect(byId.get(ids[0]!)?.removed).toEqual([1, 2]);
    expect(byId.get(ids[1]!)?.removed).toEqual([1, 2]);
    expect(byId.has(ids[2]!)).toBe(false);
    expect(await versions(ids[2]!)).toEqual([1, 2, 3]);
    expect((await pruneAllSites(deps(), NOW)).every((r) => r.removed.length === 0)).toBe(true);
  });
});

describe("the fact check after a prune", () => {
  it("still counts a phone number the owner typed in a pruned version as theirs", async () => {
    const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/pekarna-kvas/brief.json"), "utf8")) as { description: string };
    const site = await newSite("ret-facts", brief.description);
    const spec = await golden("ret-facts");
    await repo.saveSpec(site.id, spec, "generate"); // v1
    const ops = [{ op: "replace", path: "/business/phone", value: "041 222 333" }];
    const typed = { ...spec, business: { ...spec.business, phone: "041 222 333" } };
    await repo.saveSpec(site.id, typed, "manual", "podatki", ops); // v2: typed in the editor
    await repo.saveSpec(site.id, typed, "manual", "urejen razdelek hero"); // v3
    await age(site.id, OLD_DAY);
    await repo.saveSpec(site.id, typed, "manual", "urejen razdelek hero"); // v4
    const phone = (corpus: string) => checkFacts(typed, corpus).filter((f) => f.kind === "phone");
    // Without the typed text the number would count as invented.
    expect(phone(brief.description)).toHaveLength(1);
    expect(phone(await clientCorpus(repo, site.id))).toEqual([]);
    expect((await pruneSite(deps(), site.id, NOW)).removed).toEqual([1, 2]);
    expect(phone(await clientCorpus(repo, site.id))).toEqual([]);
  });
});
