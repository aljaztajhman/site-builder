import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { ImageGenerator, ModelClient, ReplayTransport, StandInImageTransport, generateSite, launchCheckBrowser, loadMedia, type CallRecord, type CheckBrowser, type Recording } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
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

async function run(id: string, photos: number, heroImage: string | null) {
  const golden = migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${id}.json`), "utf8"))) as SiteSpec;
  const storage = createFsStorage(path.join(dir, id));
  const site = await repo.createSite({ name: id, slug: id, intake: { description: loadFixture(id).brief.description, photoAssetIds: [], scope: "home" } });
  if (photos) {
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
  const stand = new StandInImageTransport();
  const images = new ImageGenerator({ config, transport: stand, spentToday: async () => 0, onCall });
  await generateSite({ config, repo, storage, client, browser, lighthouse: false, images }, site.id, null);
  const spec = (await repo.getSpec(site.id))!.spec;
  return { spec, calls, stand, storage, site };
}

describe("generated images for sites with too few photos", () => {
  it("generates up to fillUpTo labelled pictures for a site without photos and uses one as the hero", async () => {
    const { spec, calls, stand, storage, site } = await run("instalacije-rebernik", 0, "img_g1");
    expect(config.imageGen.pipeline.fillUpTo).toBe(2);
    expect(stand.calls).toBe(2);
    const generated = spec.assets.images.filter((i) => i.origin === "generated");
    expect(generated.map((g) => [g.id, g.alt])).toEqual(IDEAS.map((idea, i) => [`img_g${i + 1}`, idea.alt]));
    expect(validateSite(spec).ok).toBe(true);
    // Each image is logged with its € so it counts against the daily cap.
    const imageCalls = calls.filter((c) => c.stage === "imageGen");
    expect(imageCalls).toHaveLength(2);
    expect(imageCalls.every((c) => c.ok && c.costEur > 0)).toBe(true);
    // Stored and processed like an upload; the page labels it.
    expect(await storage.get(`sites/${site.id}/generated/img_g1.jpg`)).not.toBeNull();
    const media = await loadMedia(storage, site.id, spec, config.images.widths);
    expect([...media.keys()]).toEqual(expect.arrayContaining(["img_g1-360.avif", "img_g1-360.webp"]));
    const html = renderPage(spec, spec.pages[0]!, { imageWidths: config.images.widths });
    expect(html).toContain('class="media media--ai hero-split__media" data-ai-label="Ustvarjeno z UI"');
    expect(html).toContain("(slika je ustvarjena z umetno inteligenco)");
  }, 180_000);

  it("generates nothing when the owner gave enough photos, even with ideas in the brief", async () => {
    const { spec, calls, stand } = await run("pekarna-kvas", 3, null);
    expect(stand.calls).toBe(0);
    expect(calls.some((c) => c.stage === "imageGen")).toBe(false);
    expect(spec.assets.images.every((i) => i.origin === undefined)).toBe(true);
  }, 180_000);
});
