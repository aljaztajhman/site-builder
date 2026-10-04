import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { ImageGenerator, ModelClient, ReplayTransport, StandInImageTransport, generateSite, launchCheckBrowser, loadMedia, type CallRecord, type CheckBrowser, type Recording } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db, type SiteRow } from "@sb/platform";
import { renderPage } from "@sb/render";
import { migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let browser: CheckBrowser;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-genimg-"));
  browser = await launchCheckBrowser();
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

const IDEAS = [
  { subject: "Copper pipes and brass fittings laid out on a workbench", alt: "Bakrene cevi in medeninasti priključki na delovni mizi" },
  { subject: "A modern heat pump unit beside a house wall on a sunny day", alt: "Toplotna črpalka ob steni hiše" },
  { subject: "A neatly insulated boiler room with valves and copper pipes", alt: "Urejena kotlovnica z ventili" },
];

/** The fixture's synthetic answers, with image ideas in the brief and a hero that uses the first generated picture. */
function recordings(id: string, golden: SiteSpec, heroImage: string | null): Recording[] {
  return syntheticRecordings(loadFixture(id), golden).map((r) => {
    const body = JSON.parse(r.response.text) as Record<string, unknown>;
    if (r.stage === "brief") body.imageIdeas = IDEAS;
    if (r.stage === "content" && heroImage) {
      const pages = body.pages as { sections: Record<string, unknown>[] }[];
      pages[0]!.sections[0] = {
        id: "s_hero",
        type: "hero-split",
        variant: "image-right",
        props: { eyebrow: "Inštalater, Ptuj", headline: "Vodovod, ogrevanje in toplotne črpalke", intro: "Za vsako delo najprej pridemo na ogled.", primary: { label: "Pokličite", target: { action: "call" } }, image: heroImage },
      };
    }
    return { ...r, response: { ...r.response, text: JSON.stringify(body) } };
  });
}

async function run(id: string, photos: number, heroImage: string | null, opts: { slug?: string; again?: { site: SiteRow; stand: StandInImageTransport }; pictures?: { max?: number; note?: string } } = {}) {
  const again = opts.again;
  const golden = migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${id}.json`), "utf8"))) as SiteSpec;
  const storage = createFsStorage(path.join(dir, id));
  const site = again?.site ?? (await repo.createSite({ name: id, slug: opts.slug ?? id, intake: { description: loadFixture(id).brief.description, photoAssetIds: [], scope: "home" } }));
  if (photos && !again) {
    const ids: string[] = [];
    for (const [i, p] of loadFixture(id).photos.slice(0, photos).entries()) {
      const key = `sites/${site.id}/uploads/p${i}.jpg`;
      await storage.put(key, new Uint8Array(await readFile(p.path)), "image/jpeg");
      ids.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: 1, original_name: null })).id);
    }
    await db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [site.id, JSON.stringify(ids)]);
  }
  const calls: CallRecord[] = [];
  const onCall = async (r: CallRecord) => void calls.push(r);
  const client = new ModelClient({ config, transport: new ReplayTransport(recordings(id, golden, heroImage)), spentToday: async () => 0, onCall });
  const stand = again?.stand ?? new StandInImageTransport();
  const images = new ImageGenerator({ config, transport: stand, spentToday: async () => 0, onCall });
  await generateSite({ config, repo, storage, client, browser, lighthouse: false, images, ...(opts.pictures ? { pictures: opts.pictures } : {}) }, site.id, null);
  const spec = (await repo.getSpec(site.id))!.spec;
  return { spec, calls, stand, storage, site };
}

describe("generated images for sites with too few photos", () => {
  it("generates up to fillUpTo labelled pictures for a site without photos and uses one as the hero", async () => {
    const { spec, calls, stand, storage, site } = await run("instalacije-rebernik", 0, "img_g1");
    // The run is a homepage preview: its fill count, not the full site's.
    const fill = config.imageGen.pipeline.fillUpTo.home;
    expect(fill).toBe(2);
    expect(stand.calls).toBe(fill);
    const generated = spec.assets.images.filter((i) => i.origin === "generated");
    expect(generated.map((g) => [g.id, g.alt])).toEqual(IDEAS.slice(0, fill).map((idea, i) => [`img_g${i + 1}`, idea.alt]));
    expect(validateSite(spec).ok).toBe(true);
    // Each image is logged with its € so it counts against the daily cap.
    const imageCalls = calls.filter((c) => c.stage === "imageGen");
    expect(imageCalls).toHaveLength(fill);
    expect(imageCalls.every((c) => c.ok && c.costEur > 0)).toBe(true);
    // Stored and processed like an upload; the page labels it.
    expect(await storage.get(`sites/${site.id}/generated/img_g1.jpg`)).not.toBeNull();
    const media = await loadMedia(storage, site.id, spec, config.images.widths);
    expect([...media.keys()]).toEqual(expect.arrayContaining(["img_g1-360.avif", "img_g1-360.webp"]));
    const html = renderPage(spec, spec.pages[0]!, { imageWidths: config.images.widths });
    expect(html).toContain('class="media media--ai hero-split__media" data-ai-label="Ustvarjeno z UI"');
    expect(html).toContain("(slika je ustvarjena z umetno inteligenco)");
  }, 180_000);

  it("gives a regeneration's pictures new ids, so restoring the version before it brings its own pictures back", async () => {
    const first = await run("instalacije-rebernik", 0, "img_g1", { slug: "regen-restore" });
    const before = await repo.getSpec(first.site.id);
    const generatedIds = (spec: SiteSpec) => spec.assets.images.filter((i) => i.origin === "generated").map((i) => i.id);
    expect(generatedIds(before!.spec)).toEqual(["img_g1", "img_g2"]);
    const oldMedia = await loadMedia(first.storage, first.site.id, before!.spec, config.images.widths);
    const oldOriginal = await first.storage.get(`sites/${first.site.id}/generated/img_g1.jpg`);

    // "Ustvari znova": the same site, the same stand-in (so its pictures differ from the first run's).
    const again = await run("instalacije-rebernik", 0, "img_g3", { again: { site: first.site, stand: first.stand } });
    expect(first.stand.calls).toBe(4);
    expect(generatedIds(again.spec)).toEqual(["img_g3", "img_g4"]);
    const newMedia = await loadMedia(again.storage, first.site.id, again.spec, config.images.widths);
    expect(Buffer.from(newMedia.get("img_g3-360.webp")!).equals(Buffer.from(oldMedia.get("img_g1-360.webp")!))).toBe(false);

    // Restore (as POST /api/sites/:id/revert does): the old version's pictures, byte for byte.
    await repo.saveSpec(first.site.id, before!.spec, "revert", `povrnjeno na različico ${before!.version}`);
    const restored = (await repo.getSpec(first.site.id))!.spec;
    const restoredMedia = await loadMedia(again.storage, first.site.id, restored, config.images.widths);
    expect([...restoredMedia.keys()].sort()).toEqual([...oldMedia.keys()].sort());
    for (const [file, data] of oldMedia) expect(Buffer.from(restoredMedia.get(file)!).equals(Buffer.from(data)), file).toBe(true);
    expect(Buffer.from((await again.storage.get(`sites/${first.site.id}/generated/img_g1.jpg`))!).equals(Buffer.from(oldOriginal!))).toBe(true);
    // Preview and published site render from the same files: the restored page shows img_g1, not img_g3.
    const html = renderPage(restored, restored.pages[0]!, { imageWidths: config.images.widths });
    expect(html).toContain("media/img_g1-");
    expect(html).not.toContain("img_g3");
  }, 300_000);

  it("reuses the replaced version's generated pictures when this month's are used up, instead of leaving none", async () => {
    const first = await run("instalacije-rebernik", 0, "img_g1", { slug: "regen-reuse" });
    expect(first.stand.calls).toBe(2);
    // "Ustvari znova" with the plan's pictures for the month used up (plan-limits pictureBudget: max 0).
    const again = await run("instalacije-rebernik", 0, "img_g1", { again: { site: first.site, stand: first.stand }, pictures: { max: 0, note: "Ta mesec ste porabili vse ustvarjene slike." } });
    expect(first.stand.calls).toBe(2);
    expect(again.calls.some((c) => c.stage === "imageGen")).toBe(false);
    const generated = again.spec.assets.images.filter((i) => i.origin === "generated");
    expect(generated.map((i) => i.id)).toEqual(["img_g1", "img_g2"]);
    expect(generated).toEqual(first.spec.assets.images.filter((i) => i.origin === "generated"));
    expect(validateSite(again.spec).ok).toBe(true);
    // Still labelled, and the files are the ones the first run stored.
    const html = renderPage(again.spec, again.spec.pages[0]!, { imageWidths: config.images.widths });
    expect(html).toContain('data-ai-label="Ustvarjeno z UI"');
    expect(html).toContain("media/img_g1-");
    const events = await db.query<{ message: string }>("select message from site_events where site_id = $1", [first.site.id]);
    expect(events.rows.map((e) => e.message)).toContain("Reused 2 generated picture(s) of the previous version (this month's pictures are used up)");
  }, 300_000);

  it("generates nothing when the owner gave enough photos, even with ideas in the brief", async () => {
    const { spec, calls, stand } = await run("pekarna-kvas", 3, null);
    expect(stand.calls).toBe(0);
    expect(calls.some((c) => c.stage === "imageGen")).toBe(false);
    expect(spec.assets.images.every((i) => i.origin === undefined)).toBe(true);
  }, 180_000);
});
