import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Db, type Storage } from "@sb/platform";
import { publishBlockers, validateSite, type SiteSpec } from "@sb/spec";
import { ModelClient, PhotoError, addPhotos, describePhotos, imageUses, nextImageIds, type ModelTransport } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let storage: Storage;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-photos-"));
  storage = createFsStorage(dir);
}, 60_000);
afterAll(async () => {
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

const jpeg = async (w = 1200, h = 800) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#a07850" } }).jpeg().toBuffer());

/**
 * pekarna-kvas as the site's current version. `generatedFirst` marks img_01 as generated (pekarna also
 * shows it in products, where that isn't allowed, so only a replace can make such a spec valid again).
 */
async function site(slug: string, generatedFirst = false) {
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  spec.slug = slug;
  if (generatedFirst) spec.assets.images[0] = { ...spec.assets.images[0]!, origin: "generated" };
  const s = await repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
  await repo.saveSpec(s.id, spec, "generate");
  return s.id;
}

describe("photos added in the editor", () => {
  it("adds photos as new images with variants, alt text empty until described", async () => {
    const id = await site("photos-add");
    const r = await addPhotos({ repo, storage, config }, id, [{ data: await jpeg(), mime: "image/jpeg", name: "pec.jpg" }]);
    expect(r.added).toEqual(["img_04"]);
    const spec = (await repo.getSpec(id))!.spec;
    expect(spec.assets.images.at(-1)).toMatchObject({ id: "img_04", width: 1200, height: 800, alt: "" });
    expect(await storage.get(spec.assets.images.at(-1)!.src)).not.toBeNull();
    expect(await storage.get(`sites/${id}/media/img_04-360.webp`)).not.toBeNull();
    expect(validateSite(spec).ok).toBe(true);
    // Not shown anywhere yet, so it doesn't block publishing.
    expect(publishBlockers(spec).some((b) => b.includes("img_04"))).toBe(false);
  });

  it("puts the owner's photo in place of a generated picture everywhere, and the AI label goes with it", async () => {
    const id = await site("photos-replace", true);
    const before = (await repo.getSpec(id))!.spec;
    const uses = imageUses(before, "img_01");
    expect(uses.length).toBeGreaterThan(0);
    const r = await addPhotos({ repo, storage, config }, id, [{ data: await jpeg(), mime: "image/jpeg", name: "kruh.jpg" }], { replace: "img_01" });
    expect(r).toMatchObject({ added: ["img_04"], replaced: "img_01" });
    const spec = (await repo.getSpec(id))!.spec;
    expect(spec.assets.images.some((i) => i.id === "img_01")).toBe(false);
    expect(imageUses(spec, "img_04")).toEqual(uses);
    expect(spec.assets.images.find((i) => i.id === "img_04")!.origin).toBeUndefined();
    // Shown without a description: publishing waits for one.
    expect(publishBlockers(spec)).toContain(`/assets/images/${spec.assets.images.length - 1}/alt: photo img_04 has no description`);
  });

  it("refuses what it can't use, in words the owner can act on", async () => {
    const id = await site("photos-refuse");
    const call = (files: { data: Uint8Array; mime: string; name: string }[], opts = {}) => addPhotos({ repo, storage, config }, id, files, opts);
    await expect(call([])).rejects.toThrow(PhotoError);
    await expect(call([{ data: await jpeg(), mime: "image/gif", name: "a.gif" }])).rejects.toThrow(/Nepodprta vrsta slike/);
    await expect(call([{ data: new Uint8Array([1, 2, 3]), mime: "image/jpeg", name: "b.jpg" }])).rejects.toThrow(/ni mogoče prebrati/);
    await expect(call([{ data: await jpeg(), mime: "image/jpeg", name: "c.jpg" }], { replace: "img_99" })).rejects.toThrow(/Te slike na strani ni več/);
    const many = await Promise.all(Array.from({ length: config.limits.maxPhotos }, async (_, i) => ({ data: await jpeg(40, 30), mime: "image/jpeg", name: `${i}.jpg` })));
    await expect(call(many)).rejects.toThrow(new RegExp(`največ ${config.limits.maxPhotos} fotografij`));
    await expect(call([{ data: await jpeg(), mime: "image/jpeg", name: "d.jpg" }], { baseVersion: 0 })).rejects.toThrow(/changed since version/);
  });

  it("numbers new images after the highest img_NN, skipping generated ids", () => {
    const spec = { assets: { images: [{ id: "img_01" }, { id: "img_g1" }, { id: "img_07" }] } } as unknown as SiteSpec;
    expect(nextImageIds(spec, 2)).toEqual(["img_08", "img_09"]);
  });

  it("writes the vision model's descriptions, never over one the owner typed meanwhile", async () => {
    const id = await site("photos-describe");
    const r = await addPhotos({ repo, storage, config }, id, [
      { data: await jpeg(), mime: "image/jpeg", name: "a.jpg" },
      { data: await jpeg(), mime: "image/jpeg", name: "b.jpg" },
    ]);
    // The owner types the second description before the job runs.
    const typed = (await repo.getSpec(id))!;
    const k = typed.spec.assets.images.findIndex((i) => i.id === r.added[1]);
    typed.spec.assets.images[k] = { ...typed.spec.assets.images[k]!, alt: "Peč, ki jo je opisal lastnik" };
    await repo.saveSpec(id, typed.spec, "manual", "opis", undefined, typed.version);

    const answer = { images: [{ index: 0, alt: "Pek vzame hlebce iz krušne peči", focalX: 0.4, focalY: 0.5, heroSuitable: true }, { index: 1, alt: "Drug opis", focalX: 0.5, focalY: 0.5, heroSuitable: false }] };
    const transport: ModelTransport = { send: async () => ({ text: JSON.stringify(answer), stopReason: "end_turn", model: config.models.altText.model, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }) };
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
    const version = await describePhotos({ repo, storage, client }, id, r.added);
    expect(version).not.toBeNull();
    const imgs = (await repo.getSpec(id))!.spec.assets.images;
    // Only the still-empty one was sent and described.
    expect(imgs.find((i) => i.id === r.added[0])!).toMatchObject({ alt: "Pek vzame hlebce iz krušne peči", focal: { x: 0.4, y: 0.5 } });
    expect(imgs.find((i) => i.id === r.added[1])!.alt).toBe("Peč, ki jo je opisal lastnik");
    expect(await describePhotos({ repo, storage, client }, id, r.added)).toBeNull();
  });
});
