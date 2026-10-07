import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { ModelClient, ReplayTransport, generateSite, keyOf, launchCheckBrowser, sameLook, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { FAMILIES, validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { homeRecordings } from "../src/home-recordings.ts";

/**
 * The variety engine in the pipeline (config variety.families on; synthetic answers built from the accountant's golden,
 * whose design step picks the racun template; no photos, so the generations stay quick): the next accountant in the same
 * town sees the earlier ones as neighbours (repo.neighbourLooks) and gets another look; the switch off leaves the
 * template's own look.
 */
const base = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let browser: CheckBrowser;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-variety-pipeline-"));
  browser = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

async function accountant(slug: string, families: boolean): Promise<{ id: string; spec: SiteSpec }> {
  const config = { ...base, variety: { ...base.variety, families } };
  const fixture = loadFixture("racunovodstvo-seliskar");
  const storage = createFsStorage(path.join(dir, slug));
  const site = await repo.createSite({ name: slug, slug, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "home" } });
  const ids: string[] = [];
  for (const [i, p] of fixture.photos.entries()) {
    const key = `sites/${site.id}/uploads/p${i}.jpg`;
    const data = new Uint8Array(await readFile(p.path));
    await storage.put(key, data, "image/jpeg");
    ids.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  await db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [site.id, JSON.stringify(ids)]);
  const client = new ModelClient({ config, transport: new ReplayTransport(homeRecordings(fixture)), spentToday: async () => 0, onCall: async () => undefined });
  await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
  return { id: site.id, spec: (await repo.getSpec(site.id))!.spec };
}

const heroOf = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!.sections[0]!;

describe("the variety engine in the pipeline", () => {
  it("off: the template's own palette and fonts", async () => {
    const { spec } = await accountant("racun-off", false);
    expect(spec.design.direction).toBe("racun");
    expect(spec.design.colors.primary).toBe(FAMILIES.racun!.palettes[0]!.colors.primary);
    expect(spec.design.fontPair).toBe(FAMILIES.racun!.fontPairs[0]);
  }, 180_000);

  it("on: the next accountant in town sees the earlier ones and gets a look none of them has", async () => {
    const first = await accountant("racun-one", true);
    const second = await accountant("racun-two", true);
    const valid = validateSite(second.spec);
    expect(valid.ok ? [] : valid.issues).toEqual([]);
    // Both earlier accountants (this test's and the switch-off one) are the second's neighbours, from the database.
    const neighbours = await repo.neighbourLooks(second.id, "accountant", "Murska Sobota", 50);
    expect(neighbours).toHaveLength(2);
    expect(neighbours.map((n) => n.hero)).toEqual([{ type: heroOf(first.spec).type, variant: heroOf(first.spec).variant }, expect.anything()]);
    const events = await db.query<{ data: { neighbours: number; hero: string | null } }>("select data from site_events where site_id = $1 and message = 'Variety engine'", [second.id]);
    expect(events.rows[0]!.data.neighbours).toBe(2);
    // The family picked a look (palette, fonts, hero) no neighbour has; the content step got its hero.
    const picked = events.rows[0]!.data.hero!;
    const pickedKey = keyOf(second.spec.design, { type: picked.split(":")[0]!, variant: picked.split(":")[1]! });
    for (const n of neighbours) expect(sameLook(pickedKey, keyOf(n.design, n.hero))).toBe(false);
  }, 360_000);
});
